import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

// Two modes:
//  - sync: admin-only. Hits Fawaterak's getPaymentmethods and upserts rows
//    into payment_gateway_methods with last_seen_at = now(). Returns count.
//  - list (default): returns methods for the student picker. Reads from
//    payment_gateway_methods where is_enabled = true AND last_seen_at is
//    within the fresh window, so we never offer a method Fawaterak no longer
//    provides even if it was enabled here.

const FRESH_HOURS = 24;

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

    const service = createClient(supabaseUrl, serviceKey);
    const { data: gw } = await service
      .from("payment_gateways")
      .select("id, is_enabled")
      .eq("gateway_key", "fawaterak")
      .maybeSingle();
    if (!gw) return json({ error: "Fawaterak gateway not configured" }, 500);

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }
    const wantSync = body?.sync === true;

    if (wantSync) {
      // Admin-only sync
      const { data: prof } = await service
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .maybeSingle();
      if (prof?.role !== "admin") return json({ error: "forbidden" }, 403);

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

      const res = await fetch(`${baseUrl}/api/v2/getPaymentmethods`, {
        headers: { Authorization: `Bearer ${apiToken}`, Accept: "application/json" },
      });
      const raw = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error("fawaterak getPaymentmethods error", res.status, raw);
        return json({ error: (raw as any)?.message || "تعذّر جلب طرق دفع فواتيرك" }, 400);
      }
      const list = Array.isArray((raw as any)?.data) ? (raw as any).data : [];
      const now = new Date().toISOString();
      let synced = 0;
      let order = 0;
      for (const m of list) {
        const pid = Number(m.paymentId ?? m.payment_id ?? 0);
        if (!pid || pid <= 0) continue;
        const nameAr = String(m.name_ar ?? m.nameAr ?? m.name ?? `طريقة ${pid}`);
        const key = String(pid);
        // Upsert (unique on gateway_id, method_key). Preserve is_enabled if row exists;
        // new rows default to true per column default.
        const { data: existing } = await service
          .from("payment_gateway_methods")
          .select("id, order_index")
          .eq("gateway_id", gw.id)
          .eq("method_key", key)
          .maybeSingle();
        if (existing) {
          await service
            .from("payment_gateway_methods")
            .update({ display_name: nameAr, last_seen_at: now })
            .eq("id", existing.id);
        } else {
          await service.from("payment_gateway_methods").insert({
            gateway_id: gw.id,
            method_key: key,
            display_name: nameAr,
            is_enabled: true,
            order_index: order++,
            last_seen_at: now,
          });
        }
        synced++;
      }
      return json({ synced, total: list.length });
    }

    // Default: return the platform-side list for the student picker.
    if (!gw.is_enabled) return json({ error: "بوابة فواتيرك غير مفعّلة حاليًا" }, 400);
    const cutoff = new Date(Date.now() - FRESH_HOURS * 3600 * 1000).toISOString();
    const { data: rows } = await service
      .from("payment_gateway_methods")
      .select("method_key, display_name, order_index, last_seen_at")
      .eq("gateway_id", gw.id)
      .eq("is_enabled", true)
      .gte("last_seen_at", cutoff)
      .order("order_index", { ascending: true });

    const methods = (rows ?? []).map((r: any) => ({
      payment_id: Number(r.method_key),
      name_ar: String(r.display_name),
      name_en: String(r.display_name),
      logo: "",
      redirect: true,
    })).filter((m: any) => m.payment_id > 0);

    return json({ methods });
  } catch (e) {
    console.error("fawaterak-methods error", e);
    return json({ error: (e as Error).message ?? "internal error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
