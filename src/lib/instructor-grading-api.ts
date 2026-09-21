// Instructor grading API — quiz attempts + assignment submissions
import { supabase } from "@/integrations/supabase/client";

export interface InstructorAttemptRow {
  attempt_id: string;
  quiz_id: string;
  user_id: string;
  student_name: string;
  student_email: string | null;
  course_id: string;
  course_title: string;
  quiz_title: string;
  form_number: number | null;
  attempt_number: number;
  status: string;
  percentage: number | null;
  passed: boolean | null;
  earned_points: number | null;
  total_points: number | null;
  pass_percentage: number;
  submitted_at: string | null;
  has_feedback: boolean;
  feedback_given_at: string | null;
  total_count: number;
}

export async function listInstructorQuizAttempts(
  opts: {
    userSearch?: string | null;
    courseId?: string | null;
    needsReviewOnly?: boolean;
    quizId?: string | null;
    limit?: number;
    offset?: number;
  } = {}
): Promise<InstructorAttemptRow[]> {
  const { data, error } = await (supabase as any).rpc("instructor_list_quiz_attempts", {
    _user_search: opts.userSearch ?? null,
    _course_id: opts.courseId ?? null,
    _needs_review_only: opts.needsReviewOnly ?? false,
    _quiz_id: opts.quizId ?? null,
    _limit: opts.limit ?? 100,
    _offset: opts.offset ?? 0,
  });
  if (error) throw error;
  return (data ?? []) as InstructorAttemptRow[];
}

export async function getInstructorAttemptReview(attemptId: string) {
  const { data, error } = await (supabase as any).rpc("instructor_get_attempt_review", {
    _attempt_id: attemptId,
  });
  if (error) throw error;
  return data;
}

export async function saveInstructorGrading(attemptId: string, updates: any[]) {
  const { data, error } = await (supabase as any).rpc("instructor_save_grading", {
    _attempt_id: attemptId,
    _updates: updates,
  });
  if (error) throw error;
  return data;
}

export async function saveInstructorFeedback(attemptId: string, feedback: string) {
  const { data, error } = await (supabase as any).rpc("instructor_save_feedback", {
    _attempt_id: attemptId,
    _feedback: feedback,
  });
  if (error) throw error;
  return data;
}

export interface InstructorSubmissionRow {
  submission_id: string;
  assignment_id: string;
  user_id: string;
  student_name: string;
  student_email: string | null;
  student_phone: string | null;
  student_student_id: string | null;
  course_id: string;
  course_title: string;
  assignment_title: string;
  total_grade: number | null;
  pass_grade: number | null;
  end_at: string | null;
  status: string;
  submitted_at: string | null;
  grade: number | null;
  outcome: string | null;
  computed_outcome: string | null;
  has_feedback: boolean;
  feedback_given_at: string | null;
  graded_at: string | null;
  total_count: number;
}

export async function listInstructorAssignmentSubmissions(
  opts: {
    userSearch?: string | null;
    courseId?: string | null;
    ungradedOnly?: boolean;
    assignmentId?: string | null;
    limit?: number;
    offset?: number;
  } = {}
): Promise<InstructorSubmissionRow[]> {
  const { data, error } = await (supabase as any).rpc(
    "instructor_list_assignment_submissions",
    {
      _user_search: opts.userSearch ?? null,
      _course_id: opts.courseId ?? null,
      _ungraded_only: opts.ungradedOnly ?? false,
      _assignment_id: opts.assignmentId ?? null,
      _limit: opts.limit ?? 100,
      _offset: opts.offset ?? 0,
    }
  );
  if (error) throw error;
  return (data ?? []) as InstructorSubmissionRow[];
}

export async function gradeInstructorAssignment(
  submissionId: string,
  grade: number,
  outcome?: string | null,
  feedback?: string | null
) {
  const { data, error } = await (supabase as any).rpc("instructor_grade_assignment", {
    _submission_id: submissionId,
    _grade: grade,
    _outcome: outcome ?? null,
    _feedback: feedback ?? null,
  });
  if (error) throw error;
  return data;
}

export async function finalizeInstructorSubmission(submissionId: string) {
  const { data, error } = await (supabase as any).rpc(
    "instructor_finalize_not_submitted",
    { _submission_id: submissionId }
  );
  if (error) throw error;
  return data;
}
