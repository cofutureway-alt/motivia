// Admin-only endpoint to create a new admin account.
// Reuses the same pattern as admin-create-student but sets role = 'admin'.
// The new admin's is_primary_admin always defaults to false.
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

    // ── Parse body ─────────────────────────────────────────────────────────
    const body = await req.json();
    const { auth_email, password, full_name, phone_number, real_email } = body ?? {};

    if (!auth_email || !password || !phone_number || !full_name) {
      return json({ error: "missing_fields" }, 400);
    }

    const admin = createClient(url, service, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // ── Enforce phone uniqueness ───────────────────────────────────────────
    const { data: existing } = await admin
      .from("profiles")
      .select("id")
      .eq("phone_number", phone_number)
      .maybeSingle();
    if (existing) return json({ error: "phone_taken" }, 409);

    // ── Create user via service role ───────────────────────────────────────
    const { data: created, error } = await admin.auth.admin.createUser({
      email: auth_email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: full_name ?? "",
        role: "admin",
        intended_role: "admin",
        phone_number,
        real_email: real_email ?? null,
      },
      app_metadata: {
        role: "admin",
      },
    });
    if (error) return json({ error: error.message }, 400);

    const newUserId = created.user!.id;

    // ── Guarantee profile role is set to 'admin' in database ────────────────
    const { error: profileErr } = await admin
      .from("profiles")
      .update({
        role: "admin",
        is_primary_admin: false,
        full_name: full_name ?? "",
        phone_number,
      })
      .eq("id", newUserId);

    if (profileErr) {
      console.error("Failed to set profile role to admin:", profileErr);
    }

    return json({ user_id: newUserId });
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
