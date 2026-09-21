import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

// Fawaterak payment webhook. Signature: HMAC-SHA256(vendor_key, msg), hex.
// msg = "InvoiceId=" + invoice_id + "&InvoiceKey=" + invoice_key + "&PaymentMethod=" + payment_method
// Fawaterak's docs state this webhook fires ONLY on successful invoice payment,
// so we treat receipt (with valid signature and invoice_status === "paid") as
// authoritative success. Failures are handled by the stale-expiration RPC.

function hex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, "0");
  return out;
}

async function hmacSha256Hex(key: string, msg: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
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
    const raw = await req.text();
    let payload: any = {};
    try {
      payload = JSON.parse(raw);
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }

    const invoiceId = payload?.invoice_id ?? payload?.invoiceId ?? "";
    const invoiceKey = payload?.invoice_key ?? payload?.invoiceKey ?? "";
    const paymentMethod = payload?.payment_method ?? payload?.paymentMethod ?? "";
    const providedHash = String(payload?.hashKey ?? payload?.hash_key ?? "").trim().toLowerCase();
    const invoiceStatus = String(payload?.invoice_status ?? payload?.invoiceStatus ?? "").toLowerCase();
    const referenceNumber = String(
      payload?.referenceNumber ?? payload?.reference_number ?? "",
    ).trim();

    if (!invoiceId || !invoiceKey || !paymentMethod || !providedHash) {
      return json({ error: "Missing required fields" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const service = createClient(supabaseUrl, serviceKey);

    const { data: gw } = await service
      .from("payment_gateways")
      .select("id")
      .eq("gateway_key", "fawaterak")
      .maybeSingle();
    if (!gw) return json({ error: "Gateway not configured" }, 500);

    const { data: sec } = await service
      .from("payment_gateway_secrets")
      .select("config")
      .eq("gateway_id", gw.id)
      .maybeSingle();
    const vendorKey = String((sec?.config as any)?.vendor_key || "").trim();
    if (!vendorKey) return json({ error: "Vendor key missing" }, 500);

    const msg =
      `InvoiceId=${String(invoiceId)}` +
      `&InvoiceKey=${String(invoiceKey)}` +
      `&PaymentMethod=${String(paymentMethod)}`;
    const expected = (await hmacSha256Hex(vendorKey, msg)).toLowerCase();

    if (!timingSafeEqual(expected, providedHash)) {
      console.warn("fawaterak webhook signature mismatch", {
        expected_prefix: expected.slice(0, 8),
        provided_prefix: providedHash.slice(0, 8),
      });
      return json({ error: "Invalid signature" }, 401);
    }

    // Correlate: prefer the echoed referenceNumber (== our reference_number),
    // fall back to Fawaterak's own invoice_id/invoice_key stored at initiation.
    let txn: { reference_number: string } | null = null;
    if (referenceNumber) {
      const { data } = await service
        .from("payment_transactions")
        .select("reference_number")
        .eq("reference_number", referenceNumber)
        .maybeSingle();
      if (data) txn = data as any;
    }
    if (!txn) {
      const { data } = await service
        .from("payment_transactions")
        .select("reference_number")
        .eq("gateway_id", gw.id)
        .contains("gateway_metadata", { fawaterak_invoice_id: invoiceId } as any)
        .maybeSingle();
      if (data) txn = data as any;
    }
    if (!txn) {
      const { data } = await service
        .from("payment_transactions")
        .select("reference_number")
        .eq("gateway_id", gw.id)
        .contains("gateway_metadata", { fawaterak_invoice_key: invoiceKey } as any)
        .maybeSingle();
      if (data) txn = data as any;
    }
    if (!txn) {
      console.error("fawaterak webhook: transaction not found", { invoiceId, invoiceKey, referenceNumber });
      return json({ error: "Transaction not found" }, 404);
    }

    // Refund events: Fawaterak fires this webhook when a merchant-initiated
    // refund settles on their dashboard. We accept any invoice_status starting
    // with "refund" and any explicit refund payload markers.
    const isRefundEvent =
      invoiceStatus.startsWith("refund") ||
      payload?.event_type === "refund" ||
      payload?.RefundStatus !== undefined;

    if (isRefundEvent) {
      const { data: txnFull } = await service
        .from("payment_transactions")
        .select("id, book_order_id")
        .eq("reference_number", txn.reference_number)
        .maybeSingle();
      if (!txnFull?.book_order_id) {
        return json({ ok: true, note: "Refund event without book order" });
      }
      const { data: pendingReq } = await service
        .from("book_order_refund_requests")
        .select("id")
        .eq("order_id", txnFull.book_order_id)
        .in("status", ["processing", "approved"])
        .order("requested_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!pendingReq) {
        return json({ ok: true, note: "No pending refund request" });
      }
      const { error: completeErr } = await service.rpc("admin_complete_refund_request", {
        p_request_id: pendingReq.id,
        p_gateway_reference: `fawaterak:${invoiceId}`,
        p_notes: "تأكيد الاسترجاع تلقائيًا من Fawaterak",
      });
      if (completeErr) return json({ error: completeErr.message }, 500);
      return json({ ok: true, refund_completed: true });
    }

    const success = invoiceStatus === "paid";
    const failureReason = success ? null : `Fawaterak status: ${invoiceStatus || "unknown"}`;

    const { data: finalizeResult, error: finalizeErr } = await service.rpc(
      "finalize_gateway_transaction",
      {
        p_reference: txn.reference_number,
        p_success: success,
        p_failure_reason: failureReason,
      },
    );
    if (finalizeErr) {
      console.error("finalize_gateway_transaction error", finalizeErr);
      return json({ error: finalizeErr.message }, 500);
    }

    return json({ ok: true, result: finalizeResult });
  } catch (e) {
    console.error("fawaterak-webhook error", e);
    return json({ error: (e as Error).message ?? "internal error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
