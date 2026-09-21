import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

// Fawaterak invoice initialization (step 2). Server-side only:
// - api_token is never exposed to the client.
// - We create a pending_gateway transaction first and use its reference_number as invoice_number.
// - Amounts on the wire are EGP decimal strings; we convert only at this boundary.

interface InitiateBody {
  purpose: "course_purchase" | "wallet_topup";
  course_id?: string | null;
  topup_amount_piastres?: number | null;
  payment_method_id: number;
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
    if (!body?.purpose || !body.return_url || !body.payment_method_id) {
      return json({ error: "Missing fields" }, 400);
    }
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
      .eq("gateway_key", "fawaterak")
      .maybeSingle();
    if (!gw) return json({ error: "Fawaterak gateway not configured" }, 500);
    if (!gw.is_enabled) return json({ error: "بوابة فواتيرك غير مفعّلة حاليًا" }, 400);

    // Phase 45: verify the requested payment_method_id is currently enabled
    // on this platform AND was seen in the last Fawaterak sync (fresh window).
    const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data: methodRow } = await service
      .from("payment_gateway_methods")
      .select("id, is_enabled, last_seen_at")
      .eq("gateway_id", gw.id)
      .eq("method_key", String(body.payment_method_id))
      .maybeSingle();
    if (
      !methodRow ||
      !methodRow.is_enabled ||
      !methodRow.last_seen_at ||
      methodRow.last_seen_at < cutoff
    ) {
      return json(
        { error: "طريقة الدفع المختارة غير متاحة حاليًا. حدّث الصفحة وحاول مرة أخرى." },
        400,
      );
    }

    const { data: sec } = await service
      .from("payment_gateway_secrets")
      .select("config")
      .eq("gateway_id", gw.id)
      .maybeSingle();
    const cfg = (sec?.config ?? {}) as { api_token?: string; mode?: string };
    const apiToken = String(cfg.api_token || "").trim();
    if (!apiToken) return json({ error: "بوابة فواتيرك غير مكتملة الإعداد" }, 400);
    const baseUrl = cfg.mode === "production"
      ? "https://app.fawaterak.com"
      : "https://staging.fawaterk.com";

    // Create the pending transaction (validates enrollment, amount, wallet cap, etc.).
    const { data: created, error: rpcErr } = await userClient.rpc(
      "create_pending_gateway_transaction",
      {
        p_gateway_key: "fawaterak",
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

    const amountEgp = (amountPiastres / 100).toFixed(2);

    // Load student profile for the required customer block.
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

    const returnBase = body.return_url;
    const withMarker = (m: string) => {
      const sep = returnBase.includes("?") ? "&" : "?";
      return `${returnBase}${sep}result=${m}&reference=${encodeURIComponent(reference)}`;
    };

    const invoiceRes = await fetch(`${baseUrl}/api/v2/invoiceInitPay`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        payment_method_id: Number(body.payment_method_id),
        cartTotal: amountEgp,
        currency: "EGP",
        invoice_number: reference,
        customer: {
          first_name: firstName,
          last_name: lastName,
          email,
          phone,
          address: "NA",
        },
        redirectionUrls: {
          successUrl: withMarker("success"),
          failUrl: withMarker("fail"),
          pendingUrl: withMarker("pending"),
        },
        cartItems: [{ name: itemName, price: amountEgp, quantity: "1" }],
      }),
    });

    const invoiceJson = await invoiceRes.json().catch(() => ({}));
    if (!invoiceRes.ok) {
      console.error("fawaterak invoiceInitPay error", invoiceRes.status, invoiceJson);
      return json(
        { error: (invoiceJson as any)?.message || "تعذّر إنشاء فاتورة فواتيرك" },
        400,
      );
    }

    const data = (invoiceJson as any)?.data ?? {};
    const paymentData = data.payment_data ?? {};
    const invoiceId = data.invoice_id ?? data.invoiceId ?? null;
    const invoiceKey = data.invoice_key ?? data.invoiceKey ?? null;
    const redirectTo = String(paymentData.redirectTo ?? paymentData.redirect_url ?? "").trim();

    // Persist Fawaterak identifiers so the webhook can match even if only
    // invoice_id/invoice_key come back — a documented correlation fallback.
    await service
      .from("payment_transactions")
      .update({
        gateway_metadata: {
          fawaterak_invoice_id: invoiceId,
          fawaterak_invoice_key: invoiceKey,
          fawaterak_payment_method_id: Number(body.payment_method_id),
        },
      })
      .eq("reference_number", reference);

    if (redirectTo) {
      return json({
        redirect_url: redirectTo,
        reference_number: reference,
        amount_piastres: amountPiastres,
      });
    }

    // Non-redirect method (Fawry/Meeza etc.) — surface the code/instructions inline.
    return json({
      redirect_url: null,
      reference_number: reference,
      amount_piastres: amountPiastres,
      inline: {
        code:
          paymentData.numericInvoiceCode ??
          paymentData.paymentCode ??
          paymentData.code ??
          null,
        expire_at: paymentData.expireDate ?? paymentData.expire_at ?? null,
        raw: paymentData,
      },
    });
  } catch (e) {
    console.error("fawaterak-initiate error", e);
    return json({ error: (e as Error).message ?? "internal error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
