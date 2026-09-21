import { supabase } from "@/integrations/supabase/client";
import { isValidEgPhone, normalizeEgPhone, syntheticAuthEmail } from "@/lib/phone";

// ── Row type returned by admin_list_all_users ─────────────────────────────────
export interface AdminUserRow {
  id: string;
  full_name: string | null;
  phone_number: string | null;
  email: string | null;
  auth_email: string | null;
  avatar_url: string | null;
  user_role: "admin" | "student" | "parent";
  is_banned: boolean;
  is_primary_admin: boolean;
  created_at: string;
  student_id: string | null;
  linked_children_count: number;
  total_count: number;
}

// ── List all users with optional role filter and search ───────────────────────
export async function listAllUsers(opts: {
  search?: string;
  role?: string | null;
  limit?: number;
  offset?: number;
}): Promise<AdminUserRow[]> {
  const { data, error } = await (supabase as any).rpc("admin_list_all_users", {
    _search: opts.search?.trim() || null,
    _role: opts.role?.trim() || null,
    _limit: opts.limit ?? 50,
    _offset: opts.offset ?? 0,
  });
  if (error) throw error;
  return (data ?? []) as AdminUserRow[];
}

// ── Create a new admin account ────────────────────────────────────────────────
export interface CreateAdminPayload {
  full_name: string;
  phone_number: string;
  password: string;
  real_email?: string;
}

export async function adminCreateAdmin(payload: CreateAdminPayload): Promise<{ user_id: string }> {
  if (!isValidEgPhone(payload.phone_number)) {
    throw new Error("رقم الهاتف غير صالح — يجب أن يكون رقمًا مصريًا صحيحًا");
  }
  const normalized = normalizeEgPhone(payload.phone_number);
  const auth_email = syntheticAuthEmail(normalized);

  const { data, error } = await supabase.functions.invoke("admin-create-admin", {
    body: {
      auth_email,
      password: payload.password,
      full_name: payload.full_name,
      phone_number: normalized,
      real_email: payload.real_email || null,
    },
  });
  if (error) throw error;
  if ((data as any)?.error) {
    const msg = (data as any).error;
    if (msg === "phone_taken") throw new Error("رقم الهاتف مستخدم بالفعل");
    throw new Error(msg);
  }
  return data as { user_id: string };
}

// ── Delete any user (primary admin guard is enforced server-side) ─────────────
export async function adminDeleteUser(user_id: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke("admin-delete-student", {
    body: { user_id },
  });
  if (error) throw error;
  if ((data as any)?.error) {
    const msg = (data as any).error;
    if (msg === "cannot_delete_primary_admin") throw new Error("لا يمكن حذف الأدمن الرئيسي");
    if (msg === "cannot_delete_self") throw new Error("لا يمكنك حذف حسابك الخاص");
    throw new Error(msg);
  }
}

// ── Ban / unban any user (students and parents only) ─────────────────────────
export async function adminSetUserBanned(user_id: string, banned: boolean): Promise<void> {
  const { error } = await (supabase as any)
    .from("profiles")
    .update({ is_banned: banned })
    .eq("id", user_id);
  if (error) throw error;
}
