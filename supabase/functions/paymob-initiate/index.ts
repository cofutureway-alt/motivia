import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

// PayMob Intention Creation + Unified Checkout redirect.
// - Server-side only: secret_key is never exposed to the client.
// - Creates a pending_gateway transaction first, uses its reference_number as `special_reference`.
// - Amounts are integers in piastres/cents — directly compatible with our internal representation.

interface InitiateBody {
  purpose: "course_purchase" | "wallet_topup";
  course_id?: string;
  topup_amount_piastres?: number;
  return_url: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: authErr } = await userClient.auth.getClaims(token);
    if (authErr || !claims?.claims) return json({ error: "Unauthorized" }, 401);
    const userId = (claims.claims.sub ?? claims.claims.user_id) as string;

    const body = (await req.json()) as InitiateBody;
    if (!body?.purpose || !body.return_url) return json({ error: "Missing fields" }, 400);
    if (body.purpose !== "course_purchase" && body.purpose !== "wallet_topup") {
      return json({ error: "Invalid purpose" }, 400);
    }
    try {
      const u = new URL(body.return_url);
      if (!["http:", "https:"].includes(u.protocol)) return json({ error: "Invalid return_url" }, 400);
    } catch {
      return json({ error: "Invalid return_url" }, 400);
    }

    const service = createClient(supabaseUrl, serviceKey);
    const { data: gw } = await service
      .from("payment_gateways")
      .select("id, is_enabled")
      .eq("gateway_key", "paymob")
      .maybeSingle();
    if (!gw) return json({ error: "PayMob gateway not configured" }, 500);
    if (!gw.is_enabled) return json({ error: "بوابة PayMob غير مفعّلة حاليًا" }, 400);

    const { data: sec } = await service
      .from("payment_gateway_secrets")
      .select("config")
      .eq("gateway_id", gw.id)
      .maybeSingle();
    const cfg = (sec?.config ?? {}) as {
      secret_key?: string;
      public_key?: string;
      hmac_secret?: string;
    };
    const secretKey = String(cfg.secret_key || "").trim();
    const publicKey = String(cfg.public_key || "").trim();

    // Phase 45: PayMob payment methods now come from payment_gateway_methods (enabled rows),
    // whose method_key values are the merchant's PayMob Integration IDs.
    const { data: methodRows } = await service
      .from("payment_gateway_methods")
      .select("method_key, is_enabled")
      .eq("gateway_id", gw.id)
      .eq("is_enabled", true);
    const integrationIds = ((methodRows ?? []) as Array<{ method_key: string }>)
      .map((r) => Number(String(r.method_key).trim()))
      .filter((n) => Number.isFinite(n) && n > 0);

    if (!secretKey || !publicKey) {
      return json({ error: "بوابة PayMob غير مكتملة الإعداد. تواصل مع الإدارة." }, 400);
    }
    if (integrationIds.length === 0) {
      return json(
        { error: "لا توجد طرق دفع مفعّلة لبوابة PayMob. تواصل مع الإدارة." },
        400,
      );
    }

    // Create pending transaction as the authenticated user (RLS + validation live inside the RPC).
    const { data: created, error: rpcErr } = await userClient.rpc(
      "create_pending_gateway_transaction",
      {
        p_gateway_key: "paymob",
        p_purpose: body.purpose,
        p_course_id: body.purpose === "course_purchase" ? body.course_id ?? null : null,
        p_topup_amount_piastres:
          body.purpose === "wallet_topup" ? body.topup_amount_piastres ?? null : null,
      },
    );
    if (rpcErr) return json({ error: rpcErr.message }, 400);
    const reference = String(created?.reference_number || "");
    const amountPiastres = Number(created?.amount_piastres || 0);
    if (!reference || amountPiastres <= 0) return json({ error: "Failed to create transaction" }, 500);

    // Load a bit of student profile data for billing_data.
    const { data: profile } = await service
      .from("profiles")
      .select("full_name, phone, email")
      .eq("id", userId)
      .maybeSingle();
    const fullName = String(profile?.full_name || "").trim() || "Student";
    const parts = fullName.split(/\s+/);
    const firstName = parts[0] || "Student";
    const lastName = parts.slice(1).join(" ") || "NA";
    const phone = String(profile?.phone || "").trim() || "+201000000000";
    const email = String(profile?.email || "").trim() || `${userId}@example.com`;

    let itemName = "شحن محفظة";
    if (body.purpose === "course_purchase" && body.course_id) {
      const { data: c } = await service
        .from("courses")
        .select("title")
        .eq("id", body.course_id)
        .maybeSingle();
      itemName = String(c?.title || "Course purchase");
    }

    const webhookUrl = `${supabaseUrl}/functions/v1/paymob-webhook`;

    const intentionRes = await fetch("https://accept.paymob.com/v1/intention/", {
      method: "POST",
      headers: {
        "Authorization": `Token ${secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: amountPiastres,
        currency: "EGP",
        payment_methods: integrationIds,
        items: [{ name: itemName, amount: amountPiastres, quantity: 1 }],
        billing_data: {
          first_name: firstName,
          last_name: lastName,
          phone_number: phone,
          email,
          street: "NA",
          building: "NA",
          floor: "NA",
          apartment: "NA",
          city: "NA",
          country: "EG",
          state: "NA",
          postal_code: "NA",
        },
        special_reference: reference,
        notification_url: webhookUrl,
        redirection_url: body.return_url,
      }),
    });

    const intentionJson = await intentionRes.json().catch(() => ({}));
    if (!intentionRes.ok) {
      console.error("paymob intention error", intentionRes.status, intentionJson);
      return json(
        { error: (intentionJson as any)?.detail || "تعذّر إنشاء نية الدفع لدى PayMob" },
        400,
      );
    }
    const clientSecret = String((intentionJson as any)?.client_secret || "").trim();
    if (!clientSecret) return json({ error: "Missing client_secret from PayMob" }, 500);

    // Unified Checkout URL per PayMob's current documentation.
    const redirectUrl =
      `https://accept.paymob.com/unifiedcheckout/?publicKey=${encodeURIComponent(publicKey)}` +
      `&clientSecret=${encodeURIComponent(clientSecret)}`;

    return json({
      redirect_url: redirectUrl,
      reference_number: reference,
      amount_piastres: amountPiastres,
    });
  } catch (e) {
    console.error("paymob-initiate error", e);
    return json({ error: (e as Error).message ?? "internal error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
