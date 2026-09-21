import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-rasvio-signature",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const bodyText = await req.text();
    const signature = req.headers.get("X-Rasvio-Signature") || "";

    // Fetch Webhook Signing Secret from whatsapp_secrets
    const { data: secretRow } = await supabase
      .from("whatsapp_secrets")
      .select("webhook_secret")
      .eq("id", 1)
      .maybeSingle();

    const webhookSecret = secretRow?.webhook_secret || "";

    // HMAC Signature Verification if secret is configured
    if (webhookSecret && signature) {
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(webhookSecret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["verify"]
      );

      const sigBuffer = hexToBytes(signature);
      const isValid = await crypto.subtle.verify(
        "HMAC",
        key,
        sigBuffer,
        encoder.encode(bodyText)
      );

      if (!isValid) {
        return new Response(JSON.stringify({ error: "Invalid signature" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const payload = JSON.parse(bodyText || "{}");
    const event = payload.event;
    const data = payload.data || {};

    // 1. Handle Instance Connection Status Updates
    if (event && event.startsWith("instance.")) {
      const instanceId = data.instance_id || data.instanceId;
      let connStatus: "connected" | "disconnected" | "auth_failed" | "unknown" = "unknown";

      if (event === "instance.connected") connStatus = "connected";
      else if (event === "instance.disconnected") connStatus = "disconnected";
      else if (event === "instance.auth_failed") connStatus = "auth_failed";

      if (instanceId) {
        await supabase
          .from("whatsapp_instances")
          .update({
            connection_status: connStatus,
            updated_at: new Date().toISOString(),
          })
          .eq("rasvio_instance_id", instanceId);
      }
    }

    // 2. Handle Message Status / Delivery Updates
    if (event && event.startsWith("message.")) {
      const messageUuid = data.message_uuid || data.uuid || data.id;
      const status = data.status; // e.g. 'sent', 'failed', 'delivered'

      if (messageUuid) {
        let newStatus: "sent" | "failed" | null = null;
        let failReason: string | null = null;

        if (event === "message.sent" || status === "delivered" || status === "sent") {
          newStatus = "sent";
        } else if (event === "message.failed" || status === "failed") {
          newStatus = "failed";
          failReason = data.reason || data.error || "Webhook reported message failure";
        }

        if (newStatus) {
          const updatePayload: any = { status: newStatus };
          if (newStatus === "sent") updatePayload.sent_at = new Date().toISOString();
          if (failReason) updatePayload.failed_reason = failReason;

          await supabase
            .from("whatsapp_message_queue")
            .update(updatePayload)
            .eq("rasvio_message_uuid", messageUuid);
        }
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}
