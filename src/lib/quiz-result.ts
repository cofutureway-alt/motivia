import type { QuizAttempt } from "./quiz-api";

// Yellow "near-miss" band: fails within this many percentage points of the pass line.
// Tune here to adjust or set to 0 for strict green/red only.
export const NEAR_MISS_THRESHOLD = 10;

export type ResultTone = "blue" | "green" | "yellow" | "red" | "neutral";

export interface ResultDisplay {
  tone: ResultTone;
  label: string;
  showPercentage: boolean;
  percentage: number | null;
  /** Tailwind classes for a solid badge/chip. */
  badgeClass: string;
  /** Tailwind classes for softer surfaces (cards, banners). */
  softClass: string;
}

const TONE_BADGE: Record<ResultTone, string> = {
  blue: "bg-blue-500 text-white border-0",
  green: "bg-emerald-500 text-white border-0",
  yellow: "bg-amber-500 text-white border-0",
  red: "bg-red-500 text-white border-0",
  neutral: "bg-muted text-foreground border-0",
};

const TONE_SOFT: Record<ResultTone, string> = {
  blue: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30",
  green: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  yellow: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
  red: "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30",
  neutral: "bg-muted text-muted-foreground border-border",
};

const wrap = (tone: ResultTone, label: string, pct: number | null, showPct: boolean): ResultDisplay => ({
  tone,
  label,
  showPercentage: showPct,
  percentage: pct,
  badgeClass: TONE_BADGE[tone],
  softClass: TONE_SOFT[tone],
});

/**
 * Given an attempt and its quiz pass threshold, return the display tone,
 * label, and percent-visibility used everywhere a final result is shown.
 */
export function getResultDisplay(
  attempt: Pick<QuizAttempt, "status" | "percentage" | "passed"> | null | undefined,
  passPercentage: number,
): ResultDisplay {
  if (!attempt) return wrap("neutral", "غير متاح", null, false);
  if (attempt.status === "in_progress") return wrap("neutral", "قيد التقدّم", null, false);
  if (attempt.status === "needs_review") return wrap("blue", "قيد المراجعة", null, false);
  // graded / submitted
  const pct = attempt.percentage ?? 0;
  if (pct >= passPercentage) return wrap("green", "ناجح", pct, true);
  const gap = passPercentage - pct;
  if (gap <= NEAR_MISS_THRESHOLD) return wrap("yellow", "راسب (قريب من النجاح)", pct, true);
  return wrap("red", "راسب", pct, true);
}
