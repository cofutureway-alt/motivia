// Admin-only endpoint to permanently delete any user account.
// Guards: cannot delete self, cannot delete the primary admin.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const url     = Deno.env.get("SUPABASE_URL")!;
    const anon    = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";

    // ── Verify caller is an admin ──────────────────────────────────────────
    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes } = await userClient.auth.getUser();
    if (!userRes.user) return json({ error: "unauthenticated" }, 401);

    const { data: isAdmin } = await userClient.rpc("has_role", {
      _user_id: userRes.user.id,
      _role: "admin",
    });
    if (!isAdmin) return json({ error: "forbidden" }, 403);

    // ── Parse and validate target ──────────────────────────────────────────
    const { user_id } = await req.json();
    if (!user_id) return json({ error: "missing_user_id" }, 400);
    if (user_id === userRes.user.id) return json({ error: "cannot_delete_self" }, 400);

    // ── Primary admin guard (DB-level check, cannot be bypassed by UI) ────
    const admin = createClient(url, service, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: targetProfile } = await admin
      .from("profiles")
      .select("is_primary_admin")
      .eq("id", user_id)
      .maybeSingle();

    if (targetProfile?.is_primary_admin === true) {
      return json({ error: "cannot_delete_primary_admin" }, 403);
    }

    // ── Delete via service role ────────────────────────────────────────────
    const { error } = await admin.auth.admin.deleteUser(user_id);
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  } catch (e) {
    return json({ error: String((e as any)?.message ?? e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
