// Shared weak-area classification used across student and admin surfaces.
// A group (subject or course) is classified only once it has at least
// MIN_CERTIFIED_QUIZZES certified (graded) official attempts.
//
// pass_rate < 0.5           → weak
// 0.5 <= pass_rate < 0.7    → needs focus
// pass_rate >= 0.7          → strong

export const MIN_CERTIFIED_QUIZZES_FOR_SUBJECT_STATS = 3;
export const WEAK_THRESHOLD = 0.5;
export const FOCUS_THRESHOLD = 0.7;

export type WeakLevel = "weak" | "focus" | "strong";

export interface OfficialAttempt {
  quiz_id: string;
  passed: boolean | null;
  percentage: number | null;
  attempt_number: number;
  status: string;
}

export interface QuizForAnalysis {
  id: string;
  course_id: string;
  subject_id?: string | null;
  subject_name?: string | null;
  course_title?: string | null;
  attempt_result_policy?: string | null;
}

export interface GroupClassification {
  key: string;
  label: string;
  certified_count: number;
  passed_count: number;
  pass_rate: number;
  level: WeakLevel | "insufficient";
}

// Pick the ONE "official" attempt per quiz following the quiz's policy.
export function pickOfficialAttempts(
  attempts: OfficialAttempt[],
  quizzes: QuizForAnalysis[],
): Map<string, OfficialAttempt> {
  const byQuiz = new Map<string, OfficialAttempt[]>();
  attempts
    .filter((a) => a.status === "graded")
    .forEach((a) => {
      if (!byQuiz.has(a.quiz_id)) byQuiz.set(a.quiz_id, []);
      byQuiz.get(a.quiz_id)!.push(a);
    });

  const policyById = new Map(quizzes.map((q) => [q.id, q.attempt_result_policy ?? "highest"]));
  const out = new Map<string, OfficialAttempt>();
  byQuiz.forEach((arr, quizId) => {
    const policy = policyById.get(quizId) ?? "highest";
    let chosen: OfficialAttempt;
    if (policy === "first") {
      chosen = [...arr].sort((a, b) => a.attempt_number - b.attempt_number)[0];
    } else if (policy === "last") {
      chosen = [...arr].sort((a, b) => b.attempt_number - a.attempt_number)[0];
    } else {
      chosen = [...arr].sort((a, b) => {
        const pb = b.percentage ?? -1;
        const pa = a.percentage ?? -1;
        if (pb !== pa) return pb - pa;
        return a.attempt_number - b.attempt_number;
      })[0];
    }
    out.set(quizId, chosen);
  });
  return out;
}

export function classify(passRate: number, certifiedCount: number): WeakLevel | "insufficient" {
  if (certifiedCount < MIN_CERTIFIED_QUIZZES_FOR_SUBJECT_STATS) return "insufficient";
  if (passRate < WEAK_THRESHOLD) return "weak";
  if (passRate < FOCUS_THRESHOLD) return "focus";
  return "strong";
}

// Group by an arbitrary key (subject_id or course_id) and classify.
export function classifyGroups(
  quizzes: QuizForAnalysis[],
  attempts: OfficialAttempt[],
  groupBy: "subject_id" | "course_id",
  labelFor: (key: string, quiz: QuizForAnalysis) => string,
): GroupClassification[] {
  return classifyCombinedGroups(quizzes, attempts, [], groupBy, (k, ctx) =>
    labelFor(k, (ctx.quiz ?? {}) as QuizForAnalysis),
  );
}

// Assignment evaluations that participate in the combined weak-area pool.
// Only outcomes 'passed' or 'failed' count toward the pool; 'not_submitted'
// and ungraded submissions are excluded from BOTH numerator and denominator,
// exactly analogous to how only `graded`-status quiz attempts count.
export interface AssignmentEval {
  assignment_id: string;
  course_id: string;
  subject_id?: string | null;
  subject_name?: string | null;
  course_title?: string | null;
  outcome: "passed" | "failed" | "not_submitted" | null;
}

export interface GroupContext {
  quiz?: QuizForAnalysis;
  assignment?: AssignmentEval;
}

// Phase 32: combined pool of quizzes + assignments as one shared set of
// "academic evaluations" per subject/course, gated by the SAME
// MIN_CERTIFIED_QUIZZES_FOR_SUBJECT_STATS threshold against the combined
// count (not separately per source).
export function classifyCombinedGroups(
  quizzes: QuizForAnalysis[],
  attempts: OfficialAttempt[],
  assignmentEvals: AssignmentEval[],
  groupBy: "subject_id" | "course_id",
  labelFor: (key: string, ctx: GroupContext) => string,
): GroupClassification[] {
  const official = pickOfficialAttempts(attempts, quizzes);
  const groups = new Map<string, { label: string; certified: number; passed: number }>();

  for (const q of quizzes) {
    const key = (q as any)[groupBy] as string | null | undefined;
    if (!key) continue;
    const att = official.get(q.id);
    if (!att) continue;
    const g = groups.get(key) ?? { label: labelFor(key, { quiz: q }), certified: 0, passed: 0 };
    g.certified += 1;
    if (att.passed === true) g.passed += 1;
    groups.set(key, g);
  }

  for (const a of assignmentEvals) {
    if (a.outcome !== "passed" && a.outcome !== "failed") continue;
    const key = (a as any)[groupBy] as string | null | undefined;
    if (!key) continue;
    const g = groups.get(key) ?? { label: labelFor(key, { assignment: a }), certified: 0, passed: 0 };
    g.certified += 1;
    if (a.outcome === "passed") g.passed += 1;
    groups.set(key, g);
  }

  const out: GroupClassification[] = [];
  groups.forEach((g, key) => {
    const rate = g.certified > 0 ? g.passed / g.certified : 0;
    out.push({
      key,
      label: g.label,
      certified_count: g.certified,
      passed_count: g.passed,
      pass_rate: rate,
      level: classify(rate, g.certified),
    });
  });
  return out.sort((a, b) => a.pass_rate - b.pass_rate);
}


export const LEVEL_META: Record<WeakLevel | "insufficient", { label: string; className: string }> = {
  weak: { label: "ضعيف", className: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30" },
  focus: { label: "يحتاج تركيز", className: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30" },
  strong: { label: "قوي", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30" },
  insufficient: { label: "بيانات غير كافية", className: "bg-muted text-muted-foreground border-border" },
};
