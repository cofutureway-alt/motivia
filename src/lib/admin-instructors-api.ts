// Admin instructors API — list, promote, permissions, taxonomy, withdrawals, revenue settings
import { supabase } from "@/integrations/supabase/client";
import { isValidEgPhone, normalizeEgPhone, syntheticAuthEmail } from "@/lib/phone";

export interface AdminInstructorRow {
  instructor_id: string;
  full_name: string | null;
  avatar_url: string | null;
  phone_number: string | null;
  created_at: string;
  is_banned: boolean;
  courses_count: number;
  enrollments_count: number;
  book_sales_count: number;
  earnings_pending_piastres: number;
  earnings_available_piastres: number;
  earnings_withdrawn_piastres: number;
  pending_withdrawals: number;
  can_create_courses: boolean;
  can_create_bundles: boolean;
  can_create_books: boolean;
  can_manage_locations: boolean;
  can_manage_students: boolean;
  courses_percent_override: number | null;
  books_percent_override: number | null;
  total_count: number;
}

export async function adminListInstructors(search?: string | null): Promise<AdminInstructorRow[]> {
  const { data, error } = await (supabase as any).rpc("admin_list_instructors", {
    _search: search?.trim() || null,
    _limit: 200,
    _offset: 0,
  });
  if (error) throw error;
  return (data ?? []) as AdminInstructorRow[];
}

export async function adminPromoteToInstructor(user_id: string): Promise<void> {
  const { data, error } = await (supabase as any).rpc("admin_promote_to_instructor", { p_user_id: user_id });
  if (error) throw error;
  return data;
}

export async function adminSaveInstructorPermissions(instructorId: string, perms: Record<string, any>) {
  const { data, error } = await (supabase as any).rpc("admin_save_instructor_permissions", {
    p_instructor_id: instructorId,
    p_permissions: perms,
  });
  if (error) throw error;
  return data;
}

export async function adminSetInstructorTaxonomy(
  instructorId: string,
  subjectIds: string[] | null,
  stageIds: string[] | null
) {
  const { data, error } = await (supabase as any).rpc("admin_set_instructor_taxonomy", {
    p_instructor_id: instructorId,
    p_subject_ids: subjectIds,
    p_stage_ids: stageIds,
  });
  if (error) throw error;
  return data;
}
// ── Create instructor account via Edge Function ──────────────────────────────
export interface CreateInstructorPayload {
  full_name: string;
  phone_number: string;
  password: string;
  real_email?: string;
  permissions?: Record<string, any>;
}

export async function adminCreateInstructor(payload: CreateInstructorPayload): Promise<{ user_id: string }> {
  if (!isValidEgPhone(payload.phone_number)) {
    throw new Error("رقم الهاتف غير صالح — يجب أن يكون رقمًا مصريًا صحيحًا");
  }
  const normalized = normalizeEgPhone(payload.phone_number);
  const auth_email = syntheticAuthEmail(normalized);

  const { data, error } = await supabase.functions.invoke("admin-create-instructor", {
    body: {
      auth_email,
      password: payload.password,
      full_name: payload.full_name,
      phone_number: normalized,
      real_email: payload.real_email || null,
      permissions: payload.permissions,
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

// ── Withdrawals (admin) ──────────────────────────────────────────────────────
export interface AdminWithdrawalRow {
  id: string;
  instructor_id: string;
  instructor_name: string | null;
  avatar_url: string | null;
  amount_piastres: number;
  method_key: string;
  payout_details: Record<string, any>;
  status: "pending" | "approved" | "rejected" | "paid";
  admin_note: string | null;
  rejection_reason: string | null;
  proof_url: string | null;
  processed_at: string | null;
  created_at: string;
  total_count: number;
}

export async function adminListWithdrawals(
  status?: string | null,
  instructorId?: string | null
): Promise<AdminWithdrawalRow[]> {
  const { data, error } = await (supabase as any).rpc("admin_list_withdrawals", {
    _status: status ?? null,
    _instructor_id: instructorId ?? null,
    _limit: 200,
    _offset: 0,
  });
  if (error) throw error;
  return (data ?? []) as AdminWithdrawalRow[];
}

export async function adminProcessWithdrawal(
  withdrawalId: string,
  action: "approve" | "reject" | "paid",
  opts: { rejectionReason?: string | null; proofUrl?: string | null; adminNote?: string | null } = {}
) {
  const { data, error } = await (supabase as any).rpc("admin_process_withdrawal", {
    p_withdrawal_id: withdrawalId,
    p_action: action,
    p_rejection_reason: opts.rejectionReason ?? null,
    p_proof_url: opts.proofUrl ?? null,
    p_admin_note: opts.adminNote ?? null,
  });
  if (error) throw error;
  return data;
}

// ── Revenue split settings (admin save) ──────────────────────────────────────
export async function adminSaveRevenueSplitSettings(settings: Record<string, any>) {
  const { data, error } = await (supabase as any).rpc("admin_save_revenue_split_settings", {
    p_settings: settings,
  });
  if (error) throw error;
  return data;
}

// ── Withdrawal methods CRUD (direct table — admin RLS) ───────────────────────
export interface AdminWithdrawalMethodRow {
  id: string;
  method_key: "instapay" | "ewallet" | "bank";
  display_name: string;
  is_enabled: boolean;
  order_index: number;
}

export async function adminListWithdrawalMethods(): Promise<AdminWithdrawalMethodRow[]> {
  const { data, error } = await (supabase as any)
    .from("withdrawal_methods")
    .select("id, method_key, display_name, is_enabled, order_index")
    .order("order_index");
  if (error) throw error;
  return (data ?? []) as AdminWithdrawalMethodRow[];
}

export async function adminUpdateWithdrawalMethod(
  id: string,
  patch: { display_name?: string; is_enabled?: boolean; order_index?: number }
) {
  const { error } = await (supabase as any).from("withdrawal_methods").update(patch).eq("id", id);
  if (error) throw error;
}
