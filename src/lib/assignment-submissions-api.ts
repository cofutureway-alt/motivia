import { supabase } from "@/integrations/supabase/client";

export interface SubmissionListRow {
  submission_id: string;
  assignment_id: string;
  user_id: string;
  student_name: string;
  student_email: string | null;
  student_phone: string | null;
  student_student_id: string | null;
  course_id: string;
  course_title: string;
  subject_id: string | null;
  subject_name: string | null;
  stage_id: string | null;
  stage_name: string | null;
  assignment_title: string;
  total_grade: number;
  pass_grade: number;
  end_at: string;
  status: "draft" | "submitted";
  submitted_at: string | null;
  grade: number | null;
  outcome: "passed" | "failed" | "not_submitted" | null;
  computed_outcome: "passed" | "failed" | "not_submitted" | null;
  has_feedback: boolean;
  feedback_given_at: string | null;
  graded_at: string | null;
  total_count: number;
}

export interface ListSubmissionsParams {
  userSearch?: string;
  courseId?: string;
  stageId?: string;
  subjectId?: string;
  assignmentId?: string;
  ungradedOnly?: boolean;
  limit?: number;
  offset?: number;
}

export async function listAssignmentSubmissions(
  params: ListSubmissionsParams = {},
): Promise<SubmissionListRow[]> {
  const { data, error } = await (supabase as any).rpc("list_assignment_submissions", {
    _user_search: params.userSearch ?? null,
    _course_id: params.courseId ?? null,
    _stage_id: params.stageId ?? null,
    _subject_id: params.subjectId ?? null,
    _ungraded_only: !!params.ungradedOnly,
    _assignment_id: params.assignmentId ?? null,
    _limit: params.limit ?? 100,
    _offset: params.offset ?? 0,
  });
  if (error) throw error;
  return (data ?? []) as SubmissionListRow[];
}

export interface SubmissionDetail {
  submission: {
    id: string;
    assignment_id: string;
    user_id: string;
    text_content: unknown;
    status: "draft" | "submitted";
    submitted_at: string | null;
    grade: number | null;
    outcome: "passed" | "failed" | "not_submitted" | null;
    feedback: string | null;
    feedback_given_at: string | null;
    graded_at: string | null;
    graded_by: string | null;
  };
  assignment: {
    id: string;
    title: string;
    description: string | null;
    total_grade: number;
    pass_grade: number;
    start_at: string;
    end_at: string;
    course_id: string;
    courses?: { title: string } | null;
  };
  files: Array<{
    id: string;
    file_name: string;
    file_url: string;
    file_size_bytes: number;
  }>;
  student: {
    id: string;
    full_name: string;
    email: string | null;
    phone_number: string | null;
    student_id: string | null;
    avatar_url: string | null;
  } | null;
}

export async function getSubmissionDetail(
  submissionId: string,
  opts: { asAdmin: boolean } = { asAdmin: false },
): Promise<SubmissionDetail> {
  // If admin, first-time-open finalization for never-submitted rows.
  if (opts.asAdmin) {
    try {
      await (supabase as any).rpc("admin_finalize_not_submitted", {
        _submission_id: submissionId,
      });
    } catch {
      /* non-fatal — RLS still protects us */
    }
  }

  const { data: sub, error: subErr } = await (supabase as any)
    .from("assignment_submissions")
    .select("*, assignments(id,title,description,total_grade,pass_grade,start_at,end_at,course_id,courses(title))")
    .eq("id", submissionId)
    .maybeSingle();
  if (subErr) throw subErr;
  if (!sub) throw new Error("Submission not found");

  const { data: files } = await (supabase as any)
    .from("assignment_submission_files")
    .select("id,file_name,file_url,file_size_bytes")
    .eq("submission_id", submissionId)
    .order("created_at", { ascending: true });

  let student: SubmissionDetail["student"] = null;
  if (opts.asAdmin) {
    const { data: p } = await (supabase as any)
      .from("profiles")
      .select("id, full_name, email, auth_email, phone_number, student_id, avatar_url")
      .eq("id", sub.user_id)
      .maybeSingle();
    if (p) {
      student = {
        id: p.id,
        full_name: p.full_name,
        email: p.email ?? p.auth_email,
        phone_number: p.phone_number,
        student_id: p.student_id,
        avatar_url: p.avatar_url,
      };
    }
  }

  const { assignments, ...submission } = sub as any;
  return {
    submission,
    assignment: assignments,
    files: (files ?? []) as any,
    student,
  };
}

/** Compute the live outcome a UI should display for a row, using the same rules
 *  as the RPC. Prefer the persisted `outcome`; else derive from status + deadline. */
export function deriveOutcome(row: {
  outcome: SubmissionListRow["outcome"];
  status: string;
  end_at: string;
}): "passed" | "failed" | "not_submitted" | null {
  if (row.outcome) return row.outcome;
  if (row.status === "draft" && new Date(row.end_at).getTime() < Date.now()) return "not_submitted";
  return null;
}

export interface SaveGradeArgs {
  submissionId: string;
  grade: number;
  passGrade: number;
  status: "draft" | "submitted";
  totalGrade: number;
}

export async function adminSaveGrade(args: SaveGradeArgs) {
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes.user?.id;
  if (!uid) throw new Error("Not signed in");

  // Never-submitted → force outcome + zero grade regardless of typed value.
  const isNeverSubmitted = args.status === "draft";
  const clamped = Math.max(0, Math.min(Number(args.grade) || 0, args.totalGrade));
  const outcome: "passed" | "failed" | "not_submitted" = isNeverSubmitted
    ? "not_submitted"
    : clamped >= args.passGrade
      ? "passed"
      : "failed";
  const grade = isNeverSubmitted ? 0 : clamped;

  const { data, error } = await (supabase as any)
    .from("assignment_submissions")
    .update({
      grade,
      outcome,
      graded_at: new Date().toISOString(),
      graded_by: uid,
    })
    .eq("id", args.submissionId)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function adminSaveFeedback(submissionId: string, feedback: string) {
  const { data, error } = await (supabase as any)
    .from("assignment_submissions")
    .update({
      feedback,
      feedback_given_at: new Date().toISOString(),
    })
    .eq("id", submissionId)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getSubmissionFileSignedUrl(path: string, fileName: string) {
  const { data, error } = await supabase.storage
    .from("assignment-submissions")
    .createSignedUrl(path, 300, { download: fileName });
  if (error) throw error;
  return data.signedUrl;
}
