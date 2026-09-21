import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

// Admin-only edge function: processes an approved refund via PayMob's classic
// Accept API refund endpoint.
//   1. POST https://accept.paymob.com/api/auth/tokens { api_key }
//   2. POST https://accept.paymob.com/api/acceptance/void_refund/refund
//        { auth_token, transaction_id, amount_cents }
// The classic API key must be saved on the PayMob gateway config as `classic_api_key`.

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

    const { data: ctx, error: ctxErr } = await asUser.rpc(
      "admin_get_refund_processing_context", { p_request_id: request_id },
    );
    if (ctxErr) return json({ error: ctxErr.message }, 403);
    if (!ctx) return json({ error: "Refund request not found" }, 404);
    if ((ctx as any).gateway_key !== "paymob") return json({ error: "Not a PayMob order" }, 400);

    const { data: gw } = await service.from("payment_gateways").select("id")
      .eq("gateway_key", "paymob").maybeSingle();
    if (!gw) return json({ error: "Gateway missing" }, 500);
    const { data: sec } = await service.from("payment_gateway_secrets").select("config")
      .eq("gateway_id", gw.id).maybeSingle();
    const cfg = (sec?.config ?? {}) as any;
    const classicApiKey = String(cfg.classic_api_key || cfg.api_key || "").trim();
    if (!classicApiKey) {
      await asUser.rpc("admin_mark_refund_error", {
        p_request_id: request_id,
        p_error: "أضف classic_api_key في إعدادات PayMob لتنفيذ الاسترجاع",
      });
      return json({ error: "classic_api_key missing on PayMob config" }, 500);
    }

    const meta = ((ctx as any).transaction_metadata ?? {}) as Record<string, any>;
    const transactionId = String(meta.paymob_transaction_id || "").trim();
    if (!transactionId) {
      await asUser.rpc("admin_mark_refund_error", {
        p_request_id: request_id,
        p_error: "لا يوجد paymob_transaction_id مسجل لهذه العملية",
      });
      return json({ error: "Missing PayMob transaction_id" }, 400);
    }

    // 1) Auth token
    const authRes = await fetch("https://accept.paymob.com/api/auth/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: classicApiKey }),
    });
    const authJson: any = await authRes.json().catch(() => ({}));
    if (!authRes.ok || !authJson?.token) {
      const err = authJson?.detail || `HTTP ${authRes.status}`;
      await asUser.rpc("admin_mark_refund_error", {
        p_request_id: request_id, p_error: `PayMob auth: ${err}`,
      });
      return json({ error: err }, 502);
    }

    // 2) Refund
    const refundRes = await fetch(
      "https://accept.paymob.com/api/acceptance/void_refund/refund",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          auth_token: authJson.token,
          transaction_id: Number(transactionId),
          amount_cents: (ctx as any).order_total_piastres,
        }),
      },
    );
    const refundJson: any = await refundRes.json().catch(() => ({}));
    const ok = refundRes.ok && (refundJson?.success === true || refundJson?.is_refunded === true);
    if (!ok) {
      const err = refundJson?.data?.message || refundJson?.message
        || refundJson?.detail || `HTTP ${refundRes.status}`;
      await asUser.rpc("admin_mark_refund_error", {
        p_request_id: request_id, p_error: `PayMob refund: ${err}`,
      });
      return json({ error: err, raw: refundJson }, 502);
    }

    const gatewayRef = String(refundJson?.id || refundJson?.data?.id || transactionId);
    const { error: completeErr } = await asUser.rpc("admin_complete_refund_request", {
      p_request_id: request_id,
      p_gateway_reference: gatewayRef,
      p_notes: "استرجاع تلقائي عبر PayMob",
    });
    if (completeErr) return json({ error: completeErr.message }, 500);

    return json({ ok: true, gateway_reference: gatewayRef });
  } catch (e) {
    console.error("paymob-refund error", e);
    return json({ error: (e as Error).message ?? "internal error" }, 500);
  }
});
