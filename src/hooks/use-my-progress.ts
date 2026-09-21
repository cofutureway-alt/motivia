import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface CourseProgress {
  courseId: string;
  completed: number; // completed lessons + attempted quizzes + evaluated assignments
  total: number; // total lessons + quizzes + assignments
  percent: number;
  completedLessonIds: Set<string>;
  attemptedQuizIds: Set<string>;
  evaluatedAssignmentIds: Set<string>;
  totalLessons: number;
  totalQuizzes: number;
  totalAssignments: number;
}

/**
 * Load progress for a single course. Progress now includes lessons + quizzes
 * + assignments as equally-weighted peer items (Phase 17 + Phase 32).
 * An assignment counts as done only when its outcome has been finalized
 * to `passed` or `failed` — an ungraded submission does not yet count
 * because the platform can't judge it until the admin grades it.
 */
export function useCourseProgress(courseId: string | undefined) {
  const { user } = useAuth();
  const [data, setData] = useState<CourseProgress | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!courseId || !user) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);

    const { data: units } = await supabase
      .from("units")
      .select("id")
      .eq("course_id", courseId);
    const unitIds = (units ?? []).map((u: any) => u.id);

    let totalLessons = 0;
    let quizIds: string[] = [];
    let assignmentIds: string[] = [];
    if (unitIds.length) {
      const [{ count }, { data: qz }, { data: asgn }] = await Promise.all([
        supabase
          .from("lessons_public")
          .select("id", { count: "exact", head: true })
          .in("unit_id", unitIds),
        (supabase as any).from("quizzes").select("id").in("unit_id", unitIds),
        (supabase as any).from("assignments").select("id").in("unit_id", unitIds),
      ]);
      totalLessons = count ?? 0;
      quizIds = (qz ?? []).map((q: any) => q.id);
      assignmentIds = (asgn ?? []).map((a: any) => a.id);
    }

    const [{ data: progress }, attemptsRes, subsRes] = await Promise.all([
      supabase
        .from("lesson_progress")
        .select("lesson_id")
        .eq("course_id", courseId)
        .eq("user_id", user.id),
      quizIds.length
        ? (supabase as any)
            .from("quiz_attempts")
            .select("quiz_id")
            .eq("user_id", user.id)
            .in("quiz_id", quizIds)
        : Promise.resolve({ data: [] as any[] }),
      assignmentIds.length
        ? (supabase as any)
            .from("assignment_submissions")
            .select("assignment_id, outcome")
            .eq("user_id", user.id)
            .in("assignment_id", assignmentIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const completedIds = new Set<string>((progress ?? []).map((p: any) => p.lesson_id));
    const attemptedQuizIds = new Set<string>(
      ((attemptsRes.data ?? []) as any[]).map((a: any) => a.quiz_id),
    );
    const evaluatedAssignmentIds = new Set<string>(
      ((subsRes.data ?? []) as any[])
        .filter((s: any) => s.outcome === "passed" || s.outcome === "failed")
        .map((s: any) => s.assignment_id),
    );

    const total = totalLessons + quizIds.length + assignmentIds.length;
    const completed =
      completedIds.size + attemptedQuizIds.size + evaluatedAssignmentIds.size;
    setData({
      courseId,
      completed,
      total,
      percent: total ? Math.round((completed / total) * 100) : 0,
      completedLessonIds: completedIds,
      attemptedQuizIds,
      evaluatedAssignmentIds,
      totalLessons,
      totalQuizzes: quizIds.length,
      totalAssignments: assignmentIds.length,
    });
    setLoading(false);
  }, [courseId, user]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, reload: load };
}

/**
 * Map of courseId -> percent for the courses the current user is enrolled in.
 * Includes quizzes in the calculation.
 */
export function useMyProgressMap() {
  const { user } = useAuth();
  const [map, setMap] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setMap({});
      return;
    }
    (async () => {
      const { data: enrollments } = await supabase
        .from("enrollments")
        .select("course_id")
        .eq("user_id", user.id);
      const courseIds = (enrollments ?? []).map((e: any) => e.course_id);
      if (!courseIds.length) {
        if (!cancelled) setMap({});
        return;
      }

      const { data: units } = await supabase
        .from("units")
        .select("id, course_id")
        .in("course_id", courseIds);
      const unitToCourse: Record<string, string> = {};
      const unitIds: string[] = [];
      (units ?? []).forEach((u: any) => {
        unitToCourse[u.id] = u.course_id;
        unitIds.push(u.id);
      });

      const lessonTotals: Record<string, number> = {};
      const quizTotals: Record<string, number> = {};
      const assignmentTotals: Record<string, number> = {};
      const quizToCourse: Record<string, string> = {};
      const assignmentToCourse: Record<string, string> = {};

      if (unitIds.length) {
        const [{ data: lessons }, { data: quizzes }, { data: assignments }] = await Promise.all([
          supabase.from("lessons_public").select("unit_id").in("unit_id", unitIds),
          (supabase as any).from("quizzes").select("id, unit_id").in("unit_id", unitIds),
          (supabase as any).from("assignments").select("id, unit_id").in("unit_id", unitIds),
        ]);
        (lessons ?? []).forEach((l: any) => {
          const cId = unitToCourse[l.unit_id];
          if (cId) lessonTotals[cId] = (lessonTotals[cId] ?? 0) + 1;
        });
        (quizzes ?? []).forEach((q: any) => {
          const cId = unitToCourse[q.unit_id];
          if (cId) {
            quizTotals[cId] = (quizTotals[cId] ?? 0) + 1;
            quizToCourse[q.id] = cId;
          }
        });
        (assignments ?? []).forEach((a: any) => {
          const cId = unitToCourse[a.unit_id];
          if (cId) {
            assignmentTotals[cId] = (assignmentTotals[cId] ?? 0) + 1;
            assignmentToCourse[a.id] = cId;
          }
        });
      }

      const { data: progress } = await supabase
        .from("lesson_progress")
        .select("course_id")
        .eq("user_id", user.id)
        .in("course_id", courseIds);
      const doneLessons: Record<string, number> = {};
      (progress ?? []).forEach((p: any) => {
        doneLessons[p.course_id] = (doneLessons[p.course_id] ?? 0) + 1;
      });

      const doneAttemptedQuizzes: Record<string, Set<string>> = {};
      const quizIds = Object.keys(quizToCourse);
      if (quizIds.length) {
        const { data: attempts } = await (supabase as any)
          .from("quiz_attempts")
          .select("quiz_id")
          .eq("user_id", user.id)
          .in("quiz_id", quizIds);
        (attempts ?? []).forEach((a: any) => {
          const cId = quizToCourse[a.quiz_id];
          if (!cId) return;
          if (!doneAttemptedQuizzes[cId]) doneAttemptedQuizzes[cId] = new Set();
          doneAttemptedQuizzes[cId].add(a.quiz_id);
        });
      }

      const doneEvaluatedAssignments: Record<string, Set<string>> = {};
      const assignmentIds = Object.keys(assignmentToCourse);
      if (assignmentIds.length) {
        const { data: subs } = await (supabase as any)
          .from("assignment_submissions")
          .select("assignment_id, outcome")
          .eq("user_id", user.id)
          .in("assignment_id", assignmentIds);
        (subs ?? [])
          .filter((s: any) => s.outcome === "passed" || s.outcome === "failed")
          .forEach((s: any) => {
            const cId = assignmentToCourse[s.assignment_id];
            if (!cId) return;
            if (!doneEvaluatedAssignments[cId]) doneEvaluatedAssignments[cId] = new Set();
            doneEvaluatedAssignments[cId].add(s.assignment_id);
          });
      }

      const result: Record<string, number> = {};
      courseIds.forEach((id) => {
        const t =
          (lessonTotals[id] ?? 0) + (quizTotals[id] ?? 0) + (assignmentTotals[id] ?? 0);
        const d =
          (doneLessons[id] ?? 0) +
          (doneAttemptedQuizzes[id]?.size ?? 0) +
          (doneEvaluatedAssignments[id]?.size ?? 0);
        result[id] = t ? Math.round((d / t) * 100) : 0;
      });
      if (!cancelled) setMap(result);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  return map;
}
