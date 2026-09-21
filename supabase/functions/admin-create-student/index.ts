// Admin-only endpoint to create a student account without swapping the admin's session.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";

    // Verify caller is admin using their own JWT
    const user = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes } = await user.auth.getUser();
    if (!userRes.user) return json({ error: "unauthenticated" }, 401);
    const { data: isAdmin } = await user.rpc("has_role", {
      _user_id: userRes.user.id,
      _role: "admin",
    });
    if (!isAdmin) return json({ error: "forbidden" }, 403);

    const body = await req.json();
    const {
      auth_email,
      password,
      full_name,
      phone_number,
      guardian_phone,
      real_email,
      governorate,
      registration_type,
      gender,
      stage_id,
      custom_fields,
    } = body ?? {};

    if (!auth_email || !password || !phone_number) {
      return json({ error: "missing_fields" }, 400);
    }

    const admin = createClient(url, service, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Enforce phone uniqueness
    const { data: existing } = await admin
      .from("profiles")
      .select("id")
      .eq("phone_number", phone_number)
      .maybeSingle();
    if (existing) return json({ error: "phone_taken" }, 409);

    const { data: created, error } = await admin.auth.admin.createUser({
      email: auth_email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: full_name ?? "",
        role: "student",
        phone_number,
        guardian_phone: guardian_phone ?? null,
        real_email: real_email ?? null,
        governorate: governorate ?? null,
        registration_type: registration_type ?? null,
        gender: gender ?? null,
        stage_id: stage_id ?? null,
        custom_fields: custom_fields ?? {},
      },
    });
    if (error) return json({ error: error.message }, 400);

    // Read back generated student_id (trigger runs on profile insert)
    let student_id: string | null = null;
    for (let i = 0; i < 5; i++) {
      const { data: p } = await admin
        .from("profiles")
        .select("student_id")
        .eq("id", created.user!.id)
        .maybeSingle();
      if (p?.student_id) {
        student_id = p.student_id;
        break;
      }
      await new Promise((r) => setTimeout(r, 150));
    }

    return json({ user_id: created.user!.id, student_id });
  } catch (e) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
