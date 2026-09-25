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

const asPositiveInt = (v: any, fallback: number): number => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

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
      const {
        provider_name, base_url, api_key, model,
        site_url, rate_limit_messages, rate_limit_hours,
        rate_limit_guest_messages, rate_limit_guest_hours,
      } = body;

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
      if (site_url !== undefined) {
        updates.site_url = normalizeBaseUrl(String(site_url) || "https://motivai-edu.online");
      }
      if (rate_limit_messages !== undefined) updates.rate_limit_messages = asPositiveInt(rate_limit_messages, 50);
      if (rate_limit_hours !== undefined) updates.rate_limit_hours = asPositiveInt(rate_limit_hours, 3);
      if (rate_limit_guest_messages !== undefined) updates.rate_limit_guest_messages = asPositiveInt(rate_limit_guest_messages, 50);
      if (rate_limit_guest_hours !== undefined) updates.rate_limit_guest_hours = asPositiveInt(rate_limit_guest_hours, 3);

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
        .select("provider_name,base_url,api_key,model,site_url,rate_limit_messages,rate_limit_hours,rate_limit_guest_messages,rate_limit_guest_hours,updated_at")
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
                site_url: data.site_url ?? "https://motivai-edu.online",
                rate_limit_messages: data.rate_limit_messages ?? 50,
                rate_limit_hours: data.rate_limit_hours ?? 3,
                rate_limit_guest_messages: data.rate_limit_guest_messages ?? 50,
                rate_limit_guest_hours: data.rate_limit_guest_hours ?? 3,
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

    // ---- usage stats for the analytics tab -----------------------------------
    if (action === "stats") {
      const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

      const [totalsRes, recentRes] = await Promise.all([
        serviceClient
          .from("chat_usage_log")
          .select("total_tokens,success,user_id,guest_ip,created_at")
          .gte("created_at", since),
        serviceClient
          .from("chat_messages")
          .select("role,content,created_at")
          .eq("role", "user")
          .order("created_at", { ascending: false })
          .limit(60),
      ]);

      const rows: any[] = totalsRes?.data ?? [];
      const totals = {
        requests: rows.length,
        success: rows.filter((r) => r.success).length,
        tokens: rows.reduce((s, r) => s + (Number(r.total_tokens) || 0), 0),
        users: new Set(rows.filter((r) => r.user_id).map((r) => r.user_id)).size,
        guests: new Set(rows.filter((r) => !r.user_id && r.guest_ip).map((r) => r.guest_ip)).size,
      };

      // Daily series (last 14 days) computed from rows when no RPC exists
      const dailyMap = new Map<string, { requests: number; tokens: number }>();
      for (let i = 13; i >= 0; i--) {
        const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
        dailyMap.set(d.toISOString().slice(0, 10), { requests: 0, tokens: 0 });
      }
      for (const r of rows) {
        const day = String(r.created_at).slice(0, 10);
        const entry = dailyMap.get(day);
        if (entry) {
          entry.requests += 1;
          entry.tokens += Number(r.total_tokens) || 0;
        }
      }
      const daily = [...dailyMap.entries()].map(([day, v]) => ({ day, ...v }));

      return new Response(
        JSON.stringify({
          totals,
          daily,
          recent_questions: (recentRes?.data ?? []).map((r: any) => ({
            content: r.content,
            created_at: r.created_at,
          })),
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ---- LLM analysis of saved conversations ---------------------------------
    if (action === "analyze" || action === "admin_chat") {
      const { data: saved } = await serviceClient
        .from("chatbot_settings")
        .select("provider_name,base_url,api_key,model")
        .eq("id", 1)
        .maybeSingle();

      if (!saved?.base_url || !saved?.api_key || !saved?.model) {
        return new Response(JSON.stringify({ error: "احفظ إعدادات المزود الأول." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: msgs } = await serviceClient
        .from("chat_messages")
        .select("role,content,created_at,user_id,guest_ip")
        .order("created_at", { ascending: false })
        .limit(900);

      const userMsgs = (msgs ?? []).filter((m: any) => m.role === "user");
      const uniqueMsgs: string[] = [];
      const seen = new Set<string>();
      for (const m of userMsgs) {
        const t = String(m.content).replace(/\s+/g, " ").trim().slice(0, 300);
        if (!t || seen.has(t.toLowerCase())) continue;
        seen.add(t.toLowerCase());
        uniqueMsgs.push(t);
        if (uniqueMsgs.length >= 500) break;
      }
      const convCount = new Set((msgs ?? []).map((m: any) => m.user_id ?? `g:${m.guest_ip ?? "?"}`)).size;

      const dataBlock = `عدد المحادثات (مستخدمين + زوار فريدين): ${convCount}
عدد رسائل الطلاب المتاحة للتحليل: ${uniqueMsgs.length}
أسئلة الطلاب (أحدث أولاً):
${uniqueMsgs.slice(0, 400).map((t, i) => `${i + 1}. ${t}`).join("\n")}`;

      let messages: any[];
      if (action === "analyze") {
        messages = [
          {
            role: "system",
            content: `أنت محلل بيانات منصة موتيفيا التعليمية. حلل أسئلة الطلاب المحفوظة من الشات بوت وأخرج تقريرًا بالعربية بصيغة ماركداون:
## أهم 5-8 مشكلات يتكرر الشكوى منها (مع عدد مرات تكرارها تقريبًا)
## أهم 8-12 سؤالًا متكررًا (مرتبة بالأكثر تكرارًا)
## ملاحظات سريعة للإدارة (2-4 نقاط عملية)
اعتمد فقط على الأسئلة المعطاة، ولا تخترع. اجعل العناوين مختصرة وواضحة.`,
          },
          { role: "user", content: dataBlock },
        ];
      } else {
        const question = String(body?.question ?? "").trim().slice(0, 2000);
        if (!question) {
          return new Response(JSON.stringify({ error: "اكتب سؤالك الأول." }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        messages = [
          {
            role: "system",
            content: `أنت مساعد تحليلي للإدارة في منصة موتيفيا. بيانات أسئلة الطلاب من الشات بوت معطاة أدناه. أجب على سؤال الإدارة بالعربية من واقع البيانات فقط ولا تخترع. استخدم ماركداون: عناوين ## ، قوائم، وأرقام تكرار تقريبية. عند الحاجة اعرض النتائج كرسم بياني بصيغة:
\`\`\`chart
{"type":"bar","title":"عنوان الرسم","data":[{"label":"بند","value":عدد}]}
\`\`\`
بحد أقصى رسم أو رسمين عند الحاجة فقط، وقيم رقمية حقيقية مستنتجة من البيانات.`,
          },
          { role: "user", content: `${dataBlock}\n\nسؤال الإدارة: ${question}` },
        ];
      }

      const aiRes = await fetch(`${saved.base_url.replace(/\/+$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${saved.api_key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model: saved.model, temperature: 0.2, max_tokens: 2500, messages }),
        signal: AbortSignal.timeout(120000),
      });
      const aiData = await aiRes.json().catch(() => null);

      if (!aiRes.ok || !aiData) {
        const detail = aiData?.error?.message || `رمز الخطأ ${aiRes.status}`;
        return new Response(JSON.stringify({ error: `فشل التحليل (${detail}).` }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const report: string = aiData?.choices?.[0]?.message?.content?.trim() || "";
      if (!report) {
        return new Response(JSON.stringify({ error: "لم يصل رد التحليل، جرب تاني." }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const usage = aiData?.usage ?? {};
      if (action === "analyze") {
        await serviceClient.from("chat_usage_log").insert({
          user_id: user.id,
          guest_ip: null,
          model: saved.model,
          prompt_tokens: Number(usage.prompt_tokens) || 0,
          completion_tokens: Number(usage.completion_tokens) || 0,
          total_tokens: Number(usage.total_tokens) || 0,
          success: true,
        });
      }

      return new Response(JSON.stringify({ report }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
