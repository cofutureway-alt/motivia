import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

// Admin-only edge function: processes an approved refund via Kashier's API.
// Docs: PUT {base}/api/v3/orders/{merchantId}/{merchantOrderId}
//   headers: { Authorization: <secretKey> }
//   body: { apiOperation: "REFUND", reason, transaction: { amount, currency: "EGP" } }
// On success it marks the refund request as completed; on failure it records the error.

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const asUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const service = createClient(supabaseUrl, serviceKey);

    const { data: claims, error: claimErr } = await asUser.auth.getClaims(
      authHeader.replace("Bearer ", ""),
    );
    if (claimErr || !claims?.claims) return json({ error: "Unauthorized" }, 401);

    const { request_id } = await req.json().catch(() => ({}));
    if (!request_id) return json({ error: "request_id required" }, 400);

    // Load context via admin RPC (also enforces admin role).
    const { data: ctx, error: ctxErr } = await asUser.rpc(
      "admin_get_refund_processing_context", { p_request_id: request_id },
    );
    if (ctxErr) return json({ error: ctxErr.message }, 403);
    if (!ctx) return json({ error: "Refund request not found" }, 404);
    if ((ctx as any).gateway_key !== "kashier") return json({ error: "Not a Kashier order" }, 400);

    // Load Kashier config
    const { data: gw } = await service.from("payment_gateways").select("id")
      .eq("gateway_key", "kashier").maybeSingle();
    if (!gw) return json({ error: "Gateway missing" }, 500);
    const { data: sec } = await service.from("payment_gateway_secrets").select("config")
      .eq("gateway_id", gw.id).maybeSingle();
    const cfg = (sec?.config ?? {}) as any;
    const merchantId = String(cfg.merchant_id || "").trim();
    const secretKey = String(cfg.secret_key || "").trim();
    const mode = cfg.mode === "live" ? "live" : "test";
    if (!merchantId || !secretKey) return json({ error: "Kashier config incomplete" }, 500);

    const meta = ((ctx as any).transaction_metadata ?? {}) as Record<string, any>;
    const merchantOrderId = String(
      meta.kashier_merchant_order_id || (ctx as any).transaction_reference || "",
    ).trim();
    if (!merchantOrderId) {
      await asUser.rpc("admin_mark_refund_error", {
        p_request_id: request_id,
        p_error: "لا يوجد رقم طلب Kashier مسجل لهذه العملية",
      });
      return json({ error: "Missing Kashier order reference" }, 400);
    }

    const base = mode === "live" ? "https://api.kashier.io" : "https://test-api.kashier.io";
    const url = `${base}/api/v3/orders/${encodeURIComponent(merchantId)}/${encodeURIComponent(merchantOrderId)}`;
    const amountEgp = ((ctx as any).order_total_piastres as number) / 100;

    const body = {
      apiOperation: "REFUND",
      reason: "Book order refund",
      transaction: { amount: amountEgp.toFixed(2), currency: "EGP" },
    };

    const res = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: secretKey },
      body: JSON.stringify(body),
    });
    const respText = await res.text();
    let respJson: any = {};
    try { respJson = JSON.parse(respText); } catch { /* keep text */ }

    const ok = res.ok && (respJson?.status === "SUCCESS" || respJson?.response?.status === "SUCCESS");
    if (!ok) {
      const err = respJson?.messages?.en || respJson?.response?.message || respJson?.message
        || `HTTP ${res.status}`;
      await asUser.rpc("admin_mark_refund_error", {
        p_request_id: request_id,
        p_error: `Kashier: ${err}`,
      });
      return json({ error: err, raw: respJson }, 502);
    }

    const gatewayRef = respJson?.response?.orderReference
      || respJson?.response?.transactionId
      || respJson?.orderReference
      || merchantOrderId;

    const { error: completeErr } = await asUser.rpc("admin_complete_refund_request", {
      p_request_id: request_id,
      p_gateway_reference: String(gatewayRef),
      p_notes: "استرجاع تلقائي عبر Kashier",
    });
    if (completeErr) return json({ error: completeErr.message }, 500);

    return json({ ok: true, gateway_reference: gatewayRef });
  } catch (e) {
    console.error("kashier-refund error", e);
    return json({ error: (e as Error).message ?? "internal error" }, 500);
  }
});
