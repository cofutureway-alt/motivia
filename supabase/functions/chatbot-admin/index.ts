import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const maskKey = (key: string | null | undefined): string => {
  if (!key) return "";
  if (key.length <= 10) return "•".repeat(key.length);
  return `${key.slice(0, 6)}${"•".repeat(12)}${key.slice(-4)}`;
};

const normalizeBaseUrl = (url: string): string => url.trim().replace(/\/+$/, "");

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    const authHeader = req.headers.get("Authorization") || "";
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

    const serviceClient = createClient(supabaseUrl, serviceKey);
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

    const body = await req.json();
    const action: string = body?.action;

    // ---- save settings ------------------------------------------------------
    if (action === "save") {
      const { provider_name, base_url, api_key, model } = body;

      if (base_url !== undefined && (!base_url || !/^https?:\/\//i.test(String(base_url)))) {
        return new Response(JSON.stringify({ error: "Base URL لازم يبدأ بـ http:// أو https://" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (provider_name !== undefined) updates.provider_name = provider_name;
      if (base_url !== undefined) updates.base_url = normalizeBaseUrl(String(base_url));
      if (api_key) updates.api_key = api_key; // empty/omitted = keep existing key
      if (model !== undefined) updates.model = model;

      const { error: upsertError } = await serviceClient
        .from("chatbot_settings")
        .upsert({ id: 1, ...updates }, { onConflict: "id" });

      if (upsertError) {
        return new Response(JSON.stringify({ error: upsertError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- read current settings (api_key masked) ------------------------------
    if (action === "get") {
      const { data, error } = await serviceClient
        .from("chatbot_settings")
        .select("provider_name,base_url,api_key,model,updated_at")
        .eq("id", 1)
        .maybeSingle();

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({
          settings: data
            ? {
                provider_name: data.provider_name ?? "",
                base_url: data.base_url ?? "",
                api_key_masked: maskKey(data.api_key),
                has_api_key: Boolean(data.api_key),
                model: data.model ?? "",
              }
            : null,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ---- fetch models from provider ------------------------------------------
    if (action === "models") {
      let baseUrl: string = String(body?.base_url ?? "").trim();
      let apiKey: string = typeof body?.api_key === "string" ? body.api_key.trim() : "";

      // Fall back to saved values when admin didn't type them again
      if (!baseUrl || !apiKey) {
        const { data: saved } = await serviceClient
          .from("chatbot_settings")
          .select("base_url,api_key")
          .eq("id", 1)
          .maybeSingle();
        if (!baseUrl) baseUrl = saved?.base_url ?? "";
        if (!apiKey) apiKey = saved?.api_key ?? "";
      }

      if (!baseUrl || !apiKey) {
        return new Response(
          JSON.stringify({ error: "لازم تكتب الـ Base URL والـ API Key الأول (أو يكونوا محفوظين قبل كده)." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const modelsRes = await fetch(`${baseUrl.replace(/\/+$/, "")}/models`, {
        headers: { "Authorization": `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(20000),
      });
      const modelsData = await modelsRes.json().catch(() => null);

      if (!modelsRes.ok || !modelsData) {
        const detail = modelsData?.error?.message || `رمز الخطأ ${modelsRes.status}`;
        return new Response(JSON.stringify({ error: `تعذر جلب الموديلات (${detail}).` }), {
          status: modelsRes.status === 401 ? 401 : 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const ids: string[] = (modelsData?.data ?? [])
        .map((m: any) => m?.id)
        .filter((id: any) => typeof id === "string" && id);

      return new Response(JSON.stringify({ models: ids }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- test the configured model -------------------------------------------
    if (action === "test") {
      const { data: saved } = await serviceClient
        .from("chatbot_settings")
        .select("provider_name,base_url,api_key,model")
        .eq("id", 1)
        .maybeSingle();

      if (!saved?.base_url || !saved?.api_key || !saved?.model) {
        return new Response(JSON.stringify({ error: "احفظ إعدادات المزود الأول قبل التجربة." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const startedAt = Date.now();
      const testRes = await fetch(`${saved.base_url.replace(/\/+$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${saved.api_key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: saved.model,
          max_tokens: 20,
          messages: [
            { role: "system", content: "أجب بكلمة واحدة فقط." },
            { role: "user", content: "قل: شغال" },
          ],
        }),
        signal: AbortSignal.timeout(45000),
      });
      const testData = await testRes.json().catch(() => null);

      if (!testRes.ok || !testData) {
        const detail = testData?.error?.message || `رمز الخطأ ${testRes.status}`;
        return new Response(JSON.stringify({ ok: false, error: detail }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const reply = testData?.choices?.[0]?.message?.content?.trim() || "";
      return new Response(
        JSON.stringify({ ok: true, sample: reply, latency_ms: Date.now() - startedAt }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
