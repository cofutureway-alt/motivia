import { supabase } from "@/integrations/supabase/client";
import type { ContentItemType } from "@/hooks/use-unit-content-items";

export interface CourseLockRow {
  item_type: ContentItemType;
  item_id: string;
  unit_id: string;
  ord: number;
  is_completed: boolean;
  is_locked: boolean;
  reason: "ok" | "drip" | "quiz_gate";
  gate_quiz_id: string | null;
  gate_quiz_title: string | null;
}

export async function resolveCourseLockState(
  courseId: string,
  userId: string,
): Promise<CourseLockRow[]> {
  const { data, error } = await (supabase as any).rpc("resolve_course_lock_state", {
    _course_id: courseId,
    _user_id: userId,
  });
  if (error) throw error;
  return (data ?? []) as CourseLockRow[];
}

export async function effectiveMaxAttempts(
  userId: string,
  quizId: string,
): Promise<number> {
  const { data, error } = await (supabase as any).rpc(
    "student_effective_quiz_max_attempts",
    { _user_id: userId, _quiz_id: quizId },
  );
  if (error) throw error;
  return (data as number) ?? 0;
}

export async function adminGrantQuizAttempt(
  userId: string,
  quizId: string,
  extra = 1,
  note?: string,
): Promise<{ success: boolean; effective_max_attempts: number }> {
  const { data, error } = await (supabase as any).rpc("admin_grant_quiz_attempt", {
    _user_id: userId,
    _quiz_id: quizId,
    _extra: extra,
    _note: note ?? null,
  });
  if (error) throw error;
  return data as any;
}
