import { supabase } from "@/integrations/supabase/client";

export interface AdminStudentRow {
  id: string;
  full_name: string | null;
  phone_number: string | null;
  student_id: string | null;
  email: string | null;
  auth_email: string | null;
  avatar_url: string | null;
  is_banned: boolean;
  created_at: string;
  governorate: string | null;
  registration_type: string | null;
  gender: string | null;
  stage_id: string | null;
  stage_name: string | null;
  custom_fields: Record<string, any> | null;
  enrollments_count: number;
  completed_courses_count: number;
  wallet_balance_piastres: number;
  total_count: number;
  qr_token?: string | null;
}

export interface StudentsQuery {
  search?: string;
  knownFilters?: Record<string, string>;
  customFilters?: Record<string, string>;
  limit?: number;
  offset?: number;
}

export async function listStudents(q: StudentsQuery = {}): Promise<AdminStudentRow[]> {
  const { data, error } = await (supabase as any).rpc("admin_list_students", {
    _search: q.search ?? null,
    _known_filters: q.knownFilters ?? {},
    _custom_filters: q.customFilters ?? {},
    _limit: q.limit ?? 50,
    _offset: q.offset ?? 0,
  });
  if (error) throw error;
  return (data ?? []) as AdminStudentRow[];
}

export async function getStudent(uid: string) {
  const { data, error } = await (supabase as any).rpc("admin_get_student", { _uid: uid });
  if (error) throw error;
  return data as AdminStudentRow | null;
}

export async function getStudentEnrollments(uid: string) {
  const { data, error } = await (supabase as any).rpc("admin_student_enrollments", {
    _uid: uid,
  });
  if (error) throw error;
  return (data ?? []) as {
    course_id: string;
    course_title: string;
    stage_name: string | null;
    subject_name: string | null;
    enrolled_at: string;
  }[];
}

export async function setStudentBanned(uid: string, banned: boolean) {
  const { error } = await (supabase as any)
    .from("profiles")
    .update({ is_banned: banned })
    .eq("id", uid);
  if (error) throw error;
}

export async function updateStudentProfile(uid: string, patch: Record<string, any>) {
  const { error } = await (supabase as any).from("profiles").update(patch).eq("id", uid);
  if (error) throw error;
}

export async function adminCreateStudent(payload: any) {
  const { data, error } = await supabase.functions.invoke("admin-create-student", {
    body: payload,
  });
  if (error) throw error;
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as { user_id: string; student_id: string | null };
}

export async function adminDeleteStudent(user_id: string) {
  const { data, error } = await supabase.functions.invoke("admin-delete-student", {
    body: { user_id },
  });
  if (error) throw error;
  if ((data as any)?.error) throw new Error((data as any).error);
  return true;
}
