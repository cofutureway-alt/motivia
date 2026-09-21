import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type BadgeConditionType =
  | "points_at_least"
  | "level_at_least"
  | "has_badge"
  | "quizzes_completed_at_least"
  | "lessons_completed_at_least"
  | "assignments_completed_at_least"
  | "quizzes_passed_at_least"
  | "assignments_passed_at_least"
  | "assignments_failed_at_least"
  | "quizzes_failed_at_least";

export const CONDITION_META: Record<BadgeConditionType, { label: string; kind: "int" | "level" | "badge"; hint?: string }> = {
  points_at_least: { label: "بلوغ عدد نقاط", kind: "int", hint: "مثال: 500 نقطة على الأقل" },
  level_at_least: { label: "الوصول إلى مستوى", kind: "level" },
  has_badge: { label: "الحصول على شارة أخرى", kind: "badge" },
  quizzes_completed_at_least: { label: "إكمال عدد من الاختبارات", kind: "int" },
  lessons_completed_at_least: { label: "إكمال عدد من الدروس", kind: "int" },
  assignments_completed_at_least: { label: "إكمال عدد من الواجبات", kind: "int" },
  quizzes_passed_at_least: { label: "النجاح في عدد من الاختبارات", kind: "int" },
  quizzes_failed_at_least: { label: "الرسوب في عدد من الاختبارات", kind: "int" },
  assignments_passed_at_least: { label: "النجاح في عدد من الواجبات", kind: "int" },
  assignments_failed_at_least: { label: "الرسوب في عدد من الواجبات", kind: "int" },
};

export interface BadgeRow {
  id: string;
  name: string;
  description: string | null;
  icon_url: string;
  points_reward: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface BadgeConditionRow {
  id: string;
  badge_id: string;
  condition_type: BadgeConditionType;
  target_int: number | null;
  target_uuid: string | null;
}

export function useBadges() {
  return useQuery({
    queryKey: ["badges"],
    queryFn: async () => {
      const { data, error } = await supabase.from("badges").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as BadgeRow[];
    },
  });
}

export function useBadgeConditions(badgeId?: string) {
  return useQuery({
    queryKey: ["badge_conditions", badgeId],
    queryFn: async () => {
      if (!badgeId) return [] as BadgeConditionRow[];
      const { data, error } = await supabase.from("badge_conditions").select("*").eq("badge_id", badgeId);
      if (error) throw error;
      return (data ?? []) as BadgeConditionRow[];
    },
    enabled: !!badgeId,
  });
}

export function useAllBadgeConditions() {
  return useQuery({
    queryKey: ["badge_conditions_all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("badge_conditions").select("*");
      if (error) throw error;
      return (data ?? []) as BadgeConditionRow[];
    },
  });
}

export function useBadgeEarnedCounts() {
  return useQuery({
    queryKey: ["badge_earned_counts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("student_badges").select("badge_id");
      if (error) throw error;
      const map: Record<string, number> = {};
      (data ?? []).forEach((r: any) => {
        map[r.badge_id] = (map[r.badge_id] ?? 0) + 1;
      });
      return map;
    },
  });
}

export function useSaveBadge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      badge: Partial<BadgeRow> & { id?: string; name: string; icon_url: string; is_active: boolean };
      conditions: { condition_type: BadgeConditionType; target_int: number | null; target_uuid: string | null }[];
    }) => {
      let badgeId = payload.badge.id;
      if (badgeId) {
        const { error } = await supabase
          .from("badges")
          .update({
            name: payload.badge.name,
            description: payload.badge.description ?? null,
            icon_url: payload.badge.icon_url,
            points_reward: payload.badge.points_reward ?? null,
            is_active: payload.badge.is_active,
          })
          .eq("id", badgeId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("badges")
          .insert({
            name: payload.badge.name,
            description: payload.badge.description ?? null,
            icon_url: payload.badge.icon_url,
            points_reward: payload.badge.points_reward ?? null,
            is_active: payload.badge.is_active,
          })
          .select("id")
          .single();
        if (error) throw error;
        badgeId = data.id;
      }
      // Replace conditions
      await supabase.from("badge_conditions").delete().eq("badge_id", badgeId!);
      if (payload.conditions.length > 0) {
        const rows = payload.conditions.map((c) => ({ ...c, badge_id: badgeId! }));
        const { error } = await supabase.from("badge_conditions").insert(rows);
        if (error) throw error;
      }
      return badgeId!;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["badges"] });
      qc.invalidateQueries({ queryKey: ["badge_conditions_all"] });
    },
  });
}

export function useDeleteBadge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("badges").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["badges"] });
      qc.invalidateQueries({ queryKey: ["badge_earned_counts"] });
    },
  });
}

export function useEvaluateBadgeForAll() {
  return useMutation({
    mutationFn: async (badgeId: string) => {
      const { data, error } = await supabase.rpc("evaluate_badge_for_all_students", { p_badge_id: badgeId });
      if (error) throw error;
      return data as number;
    },
  });
}

// Student-facing
export function useMyEarnedBadges(studentId?: string) {
  return useQuery({
    queryKey: ["my_earned_badges", studentId],
    queryFn: async () => {
      if (!studentId) return [] as { badge_id: string; name: string; description: string | null; icon_url: string; awarded_at: string }[];
      const { data, error } = await supabase.rpc("student_earned_badges", { p_student: studentId });
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: !!studentId,
  });
}

export function useStudentsWhoEarnedBadge(badgeId?: string) {
  return useQuery({
    queryKey: ["students_for_badge", badgeId],
    queryFn: async () => {
      if (!badgeId) return [];
      const { data, error } = await supabase
        .from("student_badges")
        .select("awarded_at, profiles:student_id(id, full_name, avatar_url, student_id)")
        .eq("badge_id", badgeId)
        .order("awarded_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: !!badgeId,
  });
}

// Rank + level for current student
export function useMyRank(studentId?: string) {
  return useQuery({
    queryKey: ["my_rank", studentId],
    queryFn: async () => {
      if (!studentId) return null;
      const { data, error } = await supabase.rpc("leaderboard_rank_for_student", { p_student: studentId });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return row as { rank: number | null; total_students: number } | null;
    },
    enabled: !!studentId,
  });
}

export function useMyPointsTotal(studentId?: string) {
  return useQuery({
    queryKey: ["my_points_total", studentId],
    queryFn: async () => {
      if (!studentId) return 0;
      const { data, error } = await supabase.rpc("student_points_total", { p_student: studentId });
      if (error) throw error;
      return (data as number) ?? 0;
    },
    enabled: !!studentId,
  });
}

export function useMyCurrentLevel(studentId?: string) {
  return useQuery({
    queryKey: ["my_current_level", studentId],
    queryFn: async () => {
      if (!studentId) return null;
      const { data, error } = await supabase.rpc("student_current_level", { p_student: studentId });
      if (error) throw error;
      return (Array.isArray(data) ? data[0] : data) as any;
    },
    enabled: !!studentId,
  });
}

export function useMyNextLevel(studentId?: string) {
  return useQuery({
    queryKey: ["my_next_level", studentId],
    queryFn: async () => {
      if (!studentId) return null;
      const { data, error } = await supabase.rpc("student_next_level", { p_student: studentId });
      if (error) throw error;
      return (Array.isArray(data) ? data[0] : data) as any;
    },
    enabled: !!studentId,
  });
}

export function usePublicLeaderboardTop10() {
  return useQuery({
    queryKey: ["public_leaderboard_top10"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("leaderboard_public_top10");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

export function useConditionProgress(studentId: string | undefined, condition: BadgeConditionRow | null) {
  return useQuery({
    queryKey: ["cond_progress", studentId, condition?.id],
    queryFn: async () => {
      if (!studentId || !condition) return null;
      const { data, error } = await supabase.rpc("student_condition_progress", {
        p_student: studentId,
        p_condition_type: condition.condition_type,
        p_target_int: condition.target_int,
        p_target_uuid: condition.target_uuid,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return row as { current_value: number; target_value: number; satisfied: boolean };
    },
    enabled: !!studentId && !!condition,
  });
}
