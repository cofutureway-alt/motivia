import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const EVENT_KEYS = [
  "lesson_completed",
  "quiz_completed",
  "quiz_passed",
  "quiz_failed",
  "assignment_passed",
  "assignment_failed",
  "course_completed",
] as const;
export type EventKey = (typeof EVENT_KEYS)[number];

export const EVENT_LABELS: Record<EventKey, { label: string; hint: string }> = {
  lesson_completed: { label: "إكمال درس", hint: "يمنح عند إكمال الطالب لأي درس لأول مرة." },
  quiz_completed: { label: "تسليم اختبار", hint: "يمنح عند تسليم أي محاولة اختبار (بغض النظر عن النتيجة)." },
  quiz_passed: { label: "النجاح في اختبار", hint: "يمنح عند اجتياز الطالب لاختبار." },
  quiz_failed: { label: "الرسوب في اختبار", hint: "يمنح (أو يخصم إذا سالب) عند رسوب الطالب." },
  assignment_passed: { label: "النجاح في واجب", hint: "يمنح عند تصحيح واجب واعتباره ناجحًا." },
  assignment_failed: { label: "الرسوب في واجب", hint: "يمنح (أو يخصم إذا سالب) عند رسوب واجب." },
  course_completed: { label: "إكمال كورس", hint: "يمنح عند إكمال كل دروس الكورس." },
};

export function usePointsConfig() {
  return useQuery({
    queryKey: ["points_config"],
    queryFn: async () => {
      const { data, error } = await supabase.from("points_config").select("*").order("event_key");
      if (error) throw error;
      return data;
    },
  });
}

export function useSavePointsConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (updates: { event_key: string; points_value: number }[]) => {
      const { error } = await supabase.rpc("save_points_config", { p_updates: updates as any });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["points_config"] }),
  });
}

export function usePurchaseThresholds(kind: "courses" | "bundles") {
  return useQuery({
    queryKey: ["purchase_thresholds", kind],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("points_purchase_thresholds")
        .select("*")
        .eq("kind", kind)
        .order("threshold_count");
      if (error) throw error;
      return data;
    },
  });
}

export function useSavePurchaseThresholds() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      kind: "courses" | "bundles";
      rows: { id: string | null; threshold_count: number; points_value: number }[];
    }) => {
      const { error } = await supabase.rpc("save_purchase_thresholds", {
        p_kind: args.kind,
        p_rows: args.rows as any,
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["purchase_thresholds", v.kind] }),
  });
}

export function useLevels() {
  return useQuery({
    queryKey: ["levels"],
    queryFn: async () => {
      const { data, error } = await supabase.from("levels").select("*").order("min_points", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

export function useLeaderboardTop(page: number, pageSize = 20) {
  return useQuery({
    queryKey: ["leaderboard_top", page, pageSize],
    queryFn: async () => {
      const [{ data: rows, error: e1 }, { data: countData, error: e2 }] = await Promise.all([
        supabase.rpc("leaderboard_top", { p_limit: pageSize, p_offset: page * pageSize }),
        supabase.rpc("leaderboard_eligible_count"),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      return { rows: rows ?? [], total: (countData as number | null) ?? 0 };
    },
  });
}

export function useResetLeaderboard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("reset_leaderboard");
      if (error) throw error;
      return data as number;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leaderboard_top"] });
      qc.invalidateQueries({ queryKey: ["points_ledger"] });
    },
  });
}
