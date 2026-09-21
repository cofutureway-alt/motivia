import { supabase } from "@/integrations/supabase/client";

export interface QuizAttemptRow {
  attempt_id: string;
  quiz_id: string;
  user_id: string;
  student_name: string;
  student_email: string;
  course_id: string;
  course_title: string;
  subject_id: string | null;
  subject_name: string | null;
  stage_id: string | null;
  stage_name: string | null;
  quiz_title: string;
  form_number: number;
  attempt_number: number;
  status: "submitted" | "needs_review" | "graded";
  percentage: number | null;
  passed: boolean | null;
  earned_points: number;
  total_points: number;
  pass_percentage: number;
  submitted_at: string | null;
  has_feedback: boolean;
  feedback_given_at: string | null;
  total_count: number;
}

export interface AttemptFilters {
  userSearch?: string;
  courseId?: string;
  stageId?: string;
  subjectId?: string;
  quizId?: string;
  needsReviewOnly?: boolean;
  limit?: number;
  offset?: number;
}

export async function listQuizAttempts(f: AttemptFilters = {}): Promise<QuizAttemptRow[]> {
  const { data, error } = await (supabase as any).rpc("list_quiz_attempts", {
    _user_search: f.userSearch ?? null,
    _course_id: f.courseId ?? null,
    _stage_id: f.stageId ?? null,
    _subject_id: f.subjectId ?? null,
    _needs_review_only: f.needsReviewOnly ?? false,
    _quiz_id: f.quizId ?? null,
    _limit: f.limit ?? 100,
    _offset: f.offset ?? 0,
  });
  if (error) throw error;
  return (data ?? []) as QuizAttemptRow[];
}
