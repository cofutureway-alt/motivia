import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const HMAC_FIELDS: string[] = [
  "amount_cents","created_at","currency","error_occured","has_parent_transaction",
  "id","integration_id","is_3d_secure","is_auth","is_capture","is_refunded",
  "is_standalone_payment","is_voided","order.id","owner","pending",
  "source_data.pan","source_data.sub_type","source_data.type","success",
];

function readPath(obj: any, path: string): unknown {
  const parts = path.split(".");
  let cur: any = obj;
  for (const p of parts) { if (cur == null) return ""; cur = cur[p]; }
  return cur == null ? "" : cur;
}
function stringifyForHmac(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "true" : "false";
  return String(v);
}
function hex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, "0");
  return out;
}
async function hmacSha512Hex(key: string, msg: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey("raw", enc.encode(key),
    { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(msg));
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
    const url = new URL(req.url);
    const rawBody = await req.text();
    let payload: any = {};
    try { payload = JSON.parse(rawBody); } catch { return json({ error: "Invalid JSON" }, 400); }

    const obj = payload?.obj ?? payload;
    if (!obj || typeof obj !== "object") return json({ error: "Missing transaction data" }, 400);

    const providedHmac = String(url.searchParams.get("hmac") ?? payload?.hmac ?? "")
      .trim().toLowerCase();
    if (!providedHmac) return json({ error: "Missing hmac" }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const service = createClient(supabaseUrl, serviceKey);

    const { data: gw } = await service.from("payment_gateways").select("id")
      .eq("gateway_key", "paymob").maybeSingle();
    if (!gw) return json({ error: "Gateway not configured" }, 500);

    const { data: sec } = await service.from("payment_gateway_secrets").select("config")
      .eq("gateway_id", gw.id).maybeSingle();
    const hmacSecret = String((sec?.config as any)?.hmac_secret || "").trim();
    if (!hmacSecret) return json({ error: "HMAC secret missing" }, 500);

    const concatenated = HMAC_FIELDS.map((f) => stringifyForHmac(readPath(obj, f))).join("");
    const expected = (await hmacSha512Hex(hmacSecret, concatenated)).toLowerCase();
    if (!timingSafeEqual(expected, providedHmac)) return json({ error: "Invalid signature" }, 401);

    const specialReference =
      readPath(obj, "order.merchant_order_id") ||
      readPath(obj, "payment_key_claims.extra.special_reference") ||
      readPath(obj, "order.shipping_data.extra_description") ||
      "";
    const reference = String(specialReference || "").trim();
    if (!reference) return json({ error: "Missing special_reference" }, 400);

    const success = obj.success === true && obj.pending === false;
    const failureReason = success ? null
      : `PayMob: success=${obj.success} pending=${obj.pending}${obj?.data?.message ? ` — ${obj.data.message}` : ""}`;

    // Persist transaction id for future refund calls (best effort).
    try {
      const txnId = obj?.id ? String(obj.id) : null;
      const paymobOrderId = obj?.order?.id ? String(obj.order.id) : null;
      const { data: existing } = await service.from("payment_transactions")
        .select("gateway_metadata").eq("reference_number", reference).maybeSingle();
      const mergedMeta = {
        ...((existing?.gateway_metadata as any) ?? {}),
        paymob_transaction_id: txnId || (existing?.gateway_metadata as any)?.paymob_transaction_id || null,
        paymob_order_id: paymobOrderId || (existing?.gateway_metadata as any)?.paymob_order_id || null,
      };
      await service.from("payment_transactions")
        .update({ gateway_metadata: mergedMeta })
        .eq("reference_number", reference);
    } catch (e) {
      console.warn("paymob-webhook: failed to persist metadata", e);
    }

    const { data: finalizeResult, error: finalizeErr } = await service.rpc(
      "finalize_gateway_transaction",
      { p_reference: reference, p_success: success, p_failure_reason: failureReason },
    );
    if (finalizeErr) return json({ error: finalizeErr.message }, 500);

    return json({ ok: true, result: finalizeResult });
  } catch (e) {
    console.error("paymob-webhook error", e);
    return json({ error: (e as Error).message ?? "internal error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
