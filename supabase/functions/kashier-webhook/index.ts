import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

// Kashier webhook: verifies HMAC-SHA256 of the signatureKeys payload using the
// Payment API Key, then finalizes the transaction via the SECURITY DEFINER RPC.

function hex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, "0");
  return out;
}

async function hmacSha256Hex(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
  return hex(sig);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const rawBody = await req.text();
    let payload: any;
    try { payload = JSON.parse(rawBody); } catch { return json({ error: "Invalid JSON" }, 400); }

    const data = payload?.data ?? {};
    const signatureKeys: string[] = Array.isArray(data?.signatureKeys) ? data.signatureKeys : [];
    if (signatureKeys.length === 0) return json({ error: "Missing signatureKeys" }, 400);

    const sortedKeys = [...signatureKeys].sort();
    const queryPayload = sortedKeys
      .map((k) => `${k}=${data[k] === undefined || data[k] === null ? "" : String(data[k])}`)
      .join("&");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const service = createClient(supabaseUrl, serviceKey);

    const { data: gw } = await service.from("payment_gateways").select("id")
      .eq("gateway_key", "kashier").maybeSingle();
    if (!gw) return json({ error: "Gateway not configured" }, 500);

    const { data: sec } = await service.from("payment_gateway_secrets").select("config")
      .eq("gateway_id", gw.id).maybeSingle();
    if (!sec?.config) return json({ error: "Gateway config missing" }, 500);

    const apiKey = String((sec.config as any).api_key || "").trim();
    if (!apiKey) return json({ error: "API key missing" }, 500);

    const expected = await hmacSha256Hex(apiKey, queryPayload);
    const provided = String(
      req.headers.get("x-kashier-signature") ?? req.headers.get("X-Kashier-Signature") ?? "",
    ).trim().toLowerCase();
    if (!provided || !timingSafeEqual(expected.toLowerCase(), provided)) {
      return json({ error: "Invalid signature" }, 401);
    }

    const merchantOrderId = String(data.merchantOrderId || data.orderReference || "").trim();
    const status = String(data.status || "").toUpperCase();
    if (!merchantOrderId) return json({ error: "Missing merchantOrderId" }, 400);

    const success = status === "SUCCESS" || status === "SUCCESSFUL" || status === "CAPTURED";
    const failureReason = success ? null
      : `Kashier status: ${status}${data.reason ? ` — ${data.reason}` : ""}`;

    // Persist identifiers we need for refunds later (best-effort).
    const kashierOrderId = String(data.kashierOrderId || data.orderId || "").trim();
    const transactionId = String(data.transactionId || data.transaction_id || "").trim();
    try {
      const { data: txn } = await service.from("payment_transactions")
        .select("gateway_metadata").eq("reference_number", merchantOrderId).maybeSingle();
      const mergedMeta = {
        ...((txn?.gateway_metadata as any) ?? {}),
        kashier_order_id: kashierOrderId || (txn?.gateway_metadata as any)?.kashier_order_id || null,
        kashier_transaction_id: transactionId || (txn?.gateway_metadata as any)?.kashier_transaction_id || null,
        kashier_merchant_order_id: merchantOrderId,
      };
      await service.from("payment_transactions")
        .update({ gateway_metadata: mergedMeta })
        .eq("reference_number", merchantOrderId);
    } catch (e) {
      console.warn("kashier-webhook: failed to persist gateway_metadata", e);
    }

    const { data: finalizeResult, error: finalizeErr } = await service.rpc(
      "finalize_gateway_transaction",
      { p_reference: merchantOrderId, p_success: success, p_failure_reason: failureReason },
    );
    if (finalizeErr) {
      console.error("finalize_gateway_transaction error", finalizeErr);
      return json({ error: finalizeErr.message }, 500);
    }

    return json({ ok: true, result: finalizeResult });
  } catch (e) {
    console.error("kashier-webhook error", e);
    return json({ error: (e as Error).message ?? "internal error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
