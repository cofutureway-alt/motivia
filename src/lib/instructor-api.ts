// Instructor dashboard API — overview, earnings, students, top students
import { supabase } from "@/integrations/supabase/client";

export const formatEGP = (piastres: number) =>
  (Number(piastres || 0) / 100).toLocaleString("ar-EG", {
    style: "currency",
    currency: "EGP",
    maximumFractionDigits: 2,
  });

export interface InstructorOverview {
  courses_count: number;
  bundles_count: number;
  books_count: number;
  enrollments_count: number;
  book_sales_count: number;
  earnings_pending_piastres: number;
  earnings_available_piastres: number;
  earnings_withdrawn_piastres: number;
  pending_withdrawals_count: number;
  quizzes_count: number;
  assignments_count: number;
}

export async function fetchInstructorOverview(): Promise<InstructorOverview> {
  const { data, error } = await (supabase as any).rpc("instructor_overview");
  if (error) throw error;
  return data as InstructorOverview;
}

export interface InstructorEarningsRow {
  id: string;
  product_type: "course" | "book" | "bundle";
  course_id: string | null;
  book_id: string | null;
  bundle_id: string | null;
  course_title: string | null;
  book_title: string | null;
  gross_piastres: number;
  expenses_piastres: number;
  net_piastres: number;
  instructor_percent: number;
  instructor_amount: number;
  admin_amount: number;
  status: "pending" | "available" | "withdrawn";
  available_at: string;
  created_at: string;
  total_count: number;
}

export async function listInstructorEarnings(
  status?: string | null,
  limit = 100,
  offset = 0
): Promise<InstructorEarningsRow[]> {
  const { data, error } = await (supabase as any).rpc("instructor_earnings_list", {
    _status: status ?? null,
    _limit: limit,
    _offset: offset,
  });
  if (error) throw error;
  return (data ?? []) as InstructorEarningsRow[];
}

export interface InstructorStudentRow {
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  phone_number: string | null;
  student_id: string | null;
  is_banned: boolean;
  enrolled_courses: number;
  created_at: string;
  total_count: number;
}

export async function listInstructorStudents(
  search?: string | null,
  limit = 100,
  offset = 0
): Promise<InstructorStudentRow[]> {
  const { data, error } = await (supabase as any).rpc("instructor_list_students", {
    _search: search ?? null,
    _limit: limit,
    _offset: offset,
  });
  if (error) throw error;
  return (data ?? []) as InstructorStudentRow[];
}

export async function updateInstructorStudent(
  studentId: string,
  fullName?: string | null,
  phoneNumber?: string | null
) {
  const { data, error } = await (supabase as any).rpc("instructor_update_student", {
    p_student: studentId,
    p_full_name: fullName ?? null,
    p_phone_number: phoneNumber ?? null,
  });
  if (error) throw error;
  return data;
}

export async function listInstructorTopStudents(limit = 10) {
  const { data, error } = await (supabase as any).rpc("instructor_top_students", {
    _limit: limit,
  });
  if (error) throw error;
  return (data ?? []) as {
    user_id: string;
    full_name: string;
    avatar_url: string | null;
    total_points: number;
  }[];
}
// ─── Self state: permissions + taxonomy ──────────────────────────────────────
export interface InstructorSelf {
  permissions: {
    can_create_courses: boolean;
    can_create_bundles: boolean;
    can_create_books: boolean;
    can_manage_locations: boolean;
    can_manage_students: boolean;
    courses_percent_override: number | null;
    books_percent_override: number | null;
  } | null;
  subjects: { id: string; name: string }[];
  stages: { id: string; name: string }[];
}

export async function getInstructorSelf(): Promise<InstructorSelf> {
  const uid = (await supabase.auth.getUser()).data.user?.id;
  if (!uid) throw new Error("غير مسجل الدخول");

  const [permRes, subjRes, stgRes] = await Promise.all([
    (supabase as any).from("instructor_permissions").select("*").eq("instructor_id", uid).maybeSingle(),
    (supabase as any)
      .from("instructor_subjects")
      .select("subject_id, subjects(id, name)")
      .eq("instructor_id", uid),
    (supabase as any)
      .from("instructor_stages")
      .select("stage_id, stages(id, name)")
      .eq("instructor_id", uid),
  ]);
  if (subjRes.error) throw subjRes.error;
  if (stgRes.error) throw stgRes.error;

  return {
    permissions: permRes.data
      ? {
          can_create_courses: permRes.data.can_create_courses ?? true,
          can_create_bundles: permRes.data.can_create_bundles ?? false,
          can_create_books: permRes.data.can_create_books ?? false,
          can_manage_locations: permRes.data.can_manage_locations ?? true,
          can_manage_students: permRes.data.can_manage_students ?? true,
          courses_percent_override: permRes.data.courses_percent_override ?? null,
          books_percent_override: permRes.data.books_percent_override ?? null,
        }
      : null,
    subjects: (subjRes.data ?? []).map((r: any) => ({
      id: r.subjects?.id ?? r.subject_id,
      name: r.subjects?.name ?? "",
    })),
    stages: (stgRes.data ?? []).map((r: any) => ({
      id: r.stages?.id ?? r.stage_id,
      name: r.stages?.name ?? "",
    })),
  };
}

// ─── Full catalog lists (public read tables) ─────────────────────────────────
export async function listAllSubjects(): Promise<{ id: string; name: string }[]> {
  const { data, error } = await (supabase as any).from("subjects").select("id, name").order("name");
  if (error) throw error;
  return (data ?? []) as { id: string; name: string }[];
}

export async function listAllStages(): Promise<{ id: string; name: string }[]> {
  const { data, error } = await (supabase as any).from("stages").select("id, name").order("name");
  if (error) throw error;
  return (data ?? []) as { id: string; name: string }[];
}

// ─── Own taxonomy write (onboarding modal — RLS: own rows only) ──────────────
export async function setMyTaxonomy(subjectIds: string[], stageIds: string[]) {
  const uid = (await supabase.auth.getUser()).data.user?.id;
  if (!uid) throw new Error("غير مسجل الدخول");
  await (supabase as any).from("instructor_subjects").delete().eq("instructor_id", uid);
  await (supabase as any).from("instructor_stages").delete().eq("instructor_id", uid);
  if (subjectIds.length) {
    const { error } = await (supabase as any)
      .from("instructor_subjects")
      .insert(subjectIds.map((subject_id) => ({ instructor_id: uid, subject_id })));
    if (error) throw error;
  }
  if (stageIds.length) {
    const { error } = await (supabase as any)
      .from("instructor_stages")
      .insert(stageIds.map((stage_id) => ({ instructor_id: uid, stage_id })));
    if (error) throw error;
  }
}

// ─── Own content listing (RLS scopes to created_by = me) ─────────────────────
export interface MyCourseRow {
  id: string; title: string; description: string | null; status: string;
  is_paid: boolean; price_piastres: number | null; discount_price_piastres: number | null;
  subject_id: string | null; stage_id: string | null;
  subjects: { name: string } | null; stages: { name: string } | null;
  created_at: string;
  instructor_name: string | null;
  instructor_avatar_url: string | null;
}

export async function listMyCourses(): Promise<MyCourseRow[]> {
  const { data, error } = await (supabase as any)
    .from("courses")
    .select("id, title, description, status, is_paid, price_piastres, discount_price_piastres, subject_id, stage_id, subjects(name), stages(name), created_at, created_by, instructor_name, instructor_avatar_url")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as MyCourseRow[];
}

export async function upsertMyCourse(payload: Record<string, any>, id?: string | null) {
  if (id) {
    const { error } = await (supabase as any).from("courses").update(payload).eq("id", id);
    if (error) throw error;
    return id;
  }
  const { data, error } = await (supabase as any).from("courses").insert(payload).select("id").single();
  if (error) throw error;
  return data.id as string;
}

export async function deleteMyCourse(id: string) {
  const { error } = await (supabase as any).from("courses").delete().eq("id", id);
  if (error) throw error;
}

export interface MyBundleRow {
  id: string; title: string; description: string | null; status: string;
  is_paid: boolean; price_piastres: number | null; discount_price_piastres: number | null;
  created_at: string; bundle_courses: { course_id: string }[];
}

export async function listMyBundles(): Promise<MyBundleRow[]> {
  const { data, error } = await (supabase as any)
    .from("bundles")
    .select("id, title, description, status, is_paid, price_piastres, discount_price_piastres, created_at, bundle_courses(course_id)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as MyBundleRow[];
}

export async function upsertMyBundle(payload: Record<string, any>, courseIds: string[], id?: string | null) {
  let bundleId = id;
  if (bundleId) {
    const { error } = await (supabase as any).from("bundles").update(payload).eq("id", bundleId);
    if (error) throw error;
    await (supabase as any).from("bundle_courses").delete().eq("bundle_id", bundleId);
  } else {
    const { data, error } = await (supabase as any).from("bundles").insert(payload).select("id").single();
    if (error) throw error;
    bundleId = data.id as string;
  }
  if (courseIds.length) {
    const { error } = await (supabase as any)
      .from("bundle_courses")
      .insert(courseIds.map((course_id, i) => ({ bundle_id: bundleId, course_id, position: i })));
    if (error) throw error;
  }
  return bundleId!;
}

export async function deleteMyBundle(id: string) {
  await (supabase as any).from("bundle_courses").delete().eq("bundle_id", id);
  const { error } = await (supabase as any).from("bundles").delete().eq("id", id);
  if (error) throw error;
}

export interface MyBookRow {
  id: string; title: string; author: string | null; description: string | null;
  book_type: string; status: string; price_piastres: number; discount_price_piastres: number | null;
  subject_id: string | null; stage_id: string | null; stock_quantity: number | null;
  subjects: { name: string } | null; stages: { name: string } | null;
  created_at: string;
}

export async function listMyBooks(): Promise<MyBookRow[]> {
  const { data, error } = await (supabase as any)
    .from("books")
    .select("id, title, author, description, book_type, status, price_piastres, discount_price_piastres, subject_id, stage_id, stock_quantity, subjects(name), stages(name), created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as MyBookRow[];
}

export async function upsertMyBook(payload: Record<string, any>, id?: string | null) {
  if (id) {
    const { error } = await (supabase as any).from("books").update(payload).eq("id", id);
    if (error) throw error;
    return id;
  }
  const { data, error } = await (supabase as any).from("books").insert(payload).select("id").single();
  if (error) throw error;
  return data.id as string;
}

export async function deleteMyBook(id: string) {
  const { error } = await (supabase as any).from("books").delete().eq("id", id);
  if (error) throw error;
}

// ─── Locations CRUD (direct table, RLS guards ownership) ─────────────────────
export interface LocationRow {
  id: string; name: string; address: string | null; map_url: string | null;
  phone: string | null; is_active: boolean; order_index: number;
}

export async function listMyLocations(): Promise<LocationRow[]> {
  const { data, error } = await (supabase as any)
    .from("instructor_locations")
    .select("id, name, address, map_url, phone, is_active, order_index")
    .order("order_index");
  if (error) throw error;
  return (data ?? []) as LocationRow[];
}

export async function upsertMyLocation(payload: Record<string, any>, id?: string | null) {
  if (id) {
    const { error } = await (supabase as any).from("instructor_locations").update(payload).eq("id", id);
    if (error) throw error;
    return id;
  }
  const { data, error } = await (supabase as any).from("instructor_locations").insert(payload).select("id").single();
  if (error) throw error;
  return data.id as string;
}

export async function deleteMyLocation(id: string) {
  const { error } = await (supabase as any).from("instructor_locations").delete().eq("id", id);
  if (error) throw error;
}

// ─── Withdrawal methods (enabled ones for the request dialog) ────────────────
export interface WithdrawalMethodRow {
  method_key: "instapay" | "ewallet" | "bank";
  display_name: string;
  is_enabled: boolean;
}

export async function listWithdrawalMethods(enabledOnly = true): Promise<WithdrawalMethodRow[]> {
  let q = (supabase as any)
    .from("withdrawal_methods")
    .select("method_key, display_name, is_enabled")
    .order("order_index");
  if (enabledOnly) q = q.eq("is_enabled", true);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as WithdrawalMethodRow[];
}

// ─── Payout methods (saved withdrawal data) ──────────────────────────────────
export interface PayoutMethodRow {
  id: string; method_key: string; label: string | null; details: Record<string, any>;
  is_default: boolean; created_at: string;
}

export async function listMyPayoutMethods(): Promise<PayoutMethodRow[]> {
  const { data, error } = await (supabase as any)
    .from("instructor_payout_methods")
    .select("id, method_key, label, details, is_default, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as PayoutMethodRow[];
}

export async function upsertMyPayoutMethod(
  payload: { method_key: string; label: string; details: Record<string, any> },
  id?: string | null
) {
  if (id) {
    const { error } = await (supabase as any).from("instructor_payout_methods").update(payload).eq("id", id);
    if (error) throw error;
    return id;
  }
  const uid = (await supabase.auth.getUser()).data.user!.id;
  const { data, error } = await (supabase as any)
    .from("instructor_payout_methods")
    .insert({ ...payload, instructor_id: uid })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function deleteMyPayoutMethod(id: string) {
  const { error } = await (supabase as any).from("instructor_payout_methods").delete().eq("id", id);
  if (error) throw error;
}

// ─── Withdrawal requests (own) ───────────────────────────────────────────────
export interface MyWithdrawalRow {
  id: string; amount_piastres: number; method_key: string; payout_details: Record<string, any>;
  status: "pending" | "approved" | "rejected" | "paid"; rejection_reason: string | null;
  admin_note: string | null; proof_url: string | null; created_at: string; processed_at: string | null;
}

export async function listMyWithdrawals(): Promise<MyWithdrawalRow[]> {
  const { data, error } = await (supabase as any)
    .from("instructor_withdrawals")
    .select("id, amount_piastres, method_key, payout_details, status, rejection_reason, admin_note, proof_url, created_at, processed_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as MyWithdrawalRow[];
}

export async function requestMyWithdrawal(opts: {
  methodKey: string;
  payoutMethodId?: string | null;
  details?: Record<string, any>;
  amountPiastres?: number | null; // null = full available balance
}) {
  const { data, error } = await (supabase as any).rpc("instructor_request_withdrawal", {
    p_method_key: opts.methodKey,
    p_payout_method_id: opts.payoutMethodId ?? null,
    p_details: opts.details ?? {},
    p_amount_piastres: opts.amountPiastres ?? null,
  });
  if (error) throw error;
  return data;
}

// ─── Revenue split settings (read — min withdrawal & hold info) ──────────────
export interface RevenueSplitSettings {
  is_enabled: boolean;
  courses_instructor_percent: number;
  books_instructor_percent: number;
  bundles_instructor_percent: number;
  hold_days: number;
  min_withdrawal_piastres: number;
  expenses: {
    label: string;
    type: "percent" | "fixed";
    percent?: number;
    instructor_borne_percent?: number | null;
  }[];
}

export async function getRevenueSplitSettings(): Promise<RevenueSplitSettings> {
  const { data, error } = await (supabase as any)
    .from("revenue_split_settings")
    .select("*")
    .eq("id", 1)
    .single();
  if (error) throw error;
  return data as RevenueSplitSettings;
}

