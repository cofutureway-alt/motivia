import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Auth: verify caller is admin
    const authHeader = req.headers.get("Authorization") || "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin role
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: profile } = await serviceClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Forbidden: Admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse request body
    const body = await req.json();
    const { instance_id, recipient, message_body } = body;

    if (!instance_id || !recipient || !message_body) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: instance_id, recipient, message_body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch API key from whatsapp_secrets
    const { data: secretRow, error: secretError } = await serviceClient
      .from("whatsapp_secrets")
      .select("api_key")
      .eq("id", 1)
      .single();

    if (secretError || !secretRow?.api_key) {
      return new Response(
        JSON.stringify({ error: "لم يتم ضبط مفتاح API بعد. يرجى إدخال مفتاح API في إعدادات واتساب." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Call Rasvio API
    const rasvioRes = await fetch("https://rasvio.online/api/v1/messages/text", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${secretRow.api_key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        instance_id: instance_id,
        recipient: recipient,
        body: message_body,
      }),
    });

    const rasvioData = await rasvioRes.json();

    if (!rasvioRes.ok) {
      return new Response(
        JSON.stringify({
          error: rasvioData?.message || rasvioData?.error?.message || `Rasvio API Error (${rasvioRes.status})`,
          rasvio_error: rasvioData?.error || null,
        }),
        { status: rasvioRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, data: rasvioData.data }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
