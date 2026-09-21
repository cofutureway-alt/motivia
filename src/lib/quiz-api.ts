import { supabase } from "@/integrations/supabase/client";

export interface QuizMeta {
  id: string;
  unit_id: string;
  course_id: string;
  title: string;
  description: string | null;
  duration_minutes: number;
  pass_percentage: number;
  max_attempts: number;
  start_at: string | null;
  end_at: string | null;
  forms_count: number;
  randomize_enabled: boolean;
  order_index: number;
}

export interface QuizAttempt {
  id: string;
  quiz_id: string;
  user_id: string;
  form_number: number;
  attempt_number: number;
  status: "in_progress" | "submitted" | "needs_review" | "graded";
  started_at: string;
  expires_at: string;
  submitted_at: string | null;
  question_order: string[];
  total_points: number;
  earned_points: number;
  percentage: number | null;
  passed: boolean | null;
  feedback: string | null;
  feedback_given_at: string | null;
}

export interface AttemptQuestion {
  id: string;
  type: "single_choice" | "multiple_choice" | "true_false" | "fill_blank";
  content: unknown;
  image_url: string | null;
  points: number;
  option_order: string[];
  selected_option_ids: string[];
  fill_blank_text: string | null;
  answered_at: string | null;
  time_spent_seconds: number;
  options_by_id: Record<string, { id: string; content: unknown }>;
  pos: number;
}

export interface AttemptDetailQuestion {
  id: string;
  type: AttemptQuestion["type"];
  content: unknown;
  image_url: string | null;
  points: number;
  model_answer_text: string | null;
  option_order: string[];
  selected_option_ids: string[];
  fill_blank_text: string | null;
  is_correct: boolean | null;
  points_earned: number;
  time_spent_seconds: number;
  answered_at: string | null;
  options: Array<{ id: string; content: unknown; is_correct: boolean }>;
  pos: number;
}

const sb = supabase as any;

export async function fetchQuizMeta(quizId: string): Promise<QuizMeta> {
  const { data, error } = await sb.rpc("get_quiz_for_student", { _quiz_id: quizId });
  if (error) throw error;
  return data as QuizMeta;
}

export async function listMyAttempts(quizId: string): Promise<QuizAttempt[]> {
  const { data, error } = await sb.rpc("list_my_quiz_attempts", { _quiz_id: quizId });
  if (error) throw error;
  return (data ?? []) as QuizAttempt[];
}

export async function startAttempt(quizId: string): Promise<string> {
  const { data, error } = await sb.rpc("start_quiz_attempt", { _quiz_id: quizId });
  if (error) throw error;
  return data as string;
}

export async function getOrFinalize(attemptId: string): Promise<QuizAttempt | null> {
  const { data, error } = await sb.rpc("get_or_finalize_attempt", { _attempt_id: attemptId });
  if (error) throw error;
  const rows = data as QuizAttempt[] | null;
  return rows && rows.length ? rows[0] : null;
}

export async function getAttemptQuestions(attemptId: string): Promise<AttemptQuestion[]> {
  const { data, error } = await sb.rpc("get_attempt_questions", { _attempt_id: attemptId });
  if (error) throw error;
  return ((data as AttemptQuestion[]) ?? []).sort((a, b) => a.pos - b.pos);
}

export async function saveAnswer(params: {
  attemptId: string;
  questionId: string;
  selectedOptionIds: string[];
  fillBlankText: string | null;
  timeDeltaSeconds?: number;
}): Promise<void> {
  const { error } = await sb.rpc("save_quiz_answer", {
    _attempt_id: params.attemptId,
    _question_id: params.questionId,
    _selected_option_ids: params.selectedOptionIds,
    _fill_blank_text: params.fillBlankText,
    _time_delta_seconds: params.timeDeltaSeconds ?? 0,
  });
  if (error) throw error;
}

export async function addAnswerTime(attemptId: string, questionId: string, delta: number): Promise<void> {
  if (delta <= 0) return;
  const { error } = await sb.rpc("add_answer_time", {
    _attempt_id: attemptId,
    _question_id: questionId,
    _delta: delta,
  });
  if (error) throw error;
}

export async function submitAttempt(attemptId: string): Promise<void> {
  const { error } = await sb.rpc("submit_quiz_attempt", { _attempt_id: attemptId });
  if (error) throw error;
}

export async function heartbeat(attemptId: string): Promise<boolean> {
  const { data, error } = await sb.rpc("heartbeat_quiz_attempt", { _attempt_id: attemptId });
  if (error) throw error;
  return !!data;
}

export async function getAttemptDetails(attemptId: string): Promise<{ attempt: QuizAttempt; questions: AttemptDetailQuestion[] }> {
  const { data, error } = await sb.rpc("get_attempt_details", { _attempt_id: attemptId });
  if (error) throw error;
  const raw = data as { attempt: QuizAttempt; questions: AttemptDetailQuestion[] };
  return {
    attempt: raw.attempt,
    questions: (raw.questions ?? []).sort((a, b) => a.pos - b.pos),
  };
}

export async function listUnitQuizzes(unitId: string) {
  const { data, error } = await sb.rpc("get_unit_quizzes", { _unit_id: unitId });
  if (error) throw error;
  return (data ?? []) as Array<{
    id: string;
    unit_id: string;
    title: string;
    order_index: number;
    duration_minutes: number;
    pass_percentage: number;
    max_attempts: number;
    start_at: string | null;
    end_at: string | null;
  }>;
}

export interface GradingUpdate {
  question_id: string;
  is_correct: boolean | null;
}

export async function adminSaveGrading(
  attemptId: string,
  updates: GradingUpdate[],
): Promise<QuizAttempt> {
  const { data, error } = await sb.rpc("admin_save_grading", {
    _attempt_id: attemptId,
    _updates: updates,
  });
  if (error) throw error;
  return data as QuizAttempt;
}

export async function adminSaveFeedback(
  attemptId: string,
  feedback: string,
): Promise<QuizAttempt> {
  const { data, error } = await sb.rpc("admin_save_feedback", {
    _attempt_id: attemptId,
    _feedback: feedback,
  });
  if (error) throw error;
  return data as QuizAttempt;
}

export async function getOfficialResult(
  quizId: string,
  userId: string,
): Promise<QuizAttempt | null> {
  const { data, error } = await sb.rpc("get_official_result", {
    _quiz_id: quizId,
    _user_id: userId,
  });
  if (error) throw error;
  return (data as QuizAttempt | null) ?? null;
}

export async function fetchQuizPassPercentage(quizId: string): Promise<number> {
  const { data, error } = await (supabase as any)
    .from("quizzes")
    .select("pass_percentage")
    .eq("id", quizId)
    .maybeSingle();
  if (error) throw error;
  return (data?.pass_percentage ?? 50) as number;
}

