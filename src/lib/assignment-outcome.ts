/** Shared outcome display logic for assignment submissions. */
export type Outcome = "passed" | "failed" | "not_submitted" | null;

export interface OutcomeDisplay {
  label: string;
  badgeClass: string;
  tone: "green" | "red" | "gray";
}

export function outcomeDisplay(outcome: Outcome): OutcomeDisplay {
  if (outcome === "passed") {
    return {
      label: "ناجح",
      tone: "green",
      badgeClass:
        "bg-emerald-500/15 text-emerald-700 border border-emerald-500/30 dark:text-emerald-300",
    };
  }
  if (outcome === "failed") {
    return {
      label: "راسب",
      tone: "red",
      badgeClass: "bg-red-500/15 text-red-700 border border-red-500/30 dark:text-red-300",
    };
  }
  if (outcome === "not_submitted") {
    return {
      label: "لم يتم التسليم",
      tone: "red",
      badgeClass: "bg-red-500/10 text-red-700 border border-red-500/25 dark:text-red-300",
    };
  }
  return {
    label: "لم يتم التقييم بعد",
    tone: "gray",
    badgeClass:
      "bg-muted text-muted-foreground border border-border",
  };
}
