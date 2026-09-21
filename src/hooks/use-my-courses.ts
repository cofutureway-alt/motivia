import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { listUnitQuizzes } from "@/lib/quiz-api";

export interface MyCourse {
  id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  stage_name: string | null;
  enrolled_at: string;
  units_count: number;
  lessons_count: number;
  completed_count: number;
  percent: number;
  instructor_name: string | null;
  instructor_avatar_url: string | null;
}

export function useMyCourses() {
  const { user } = useAuth();
  const [courses, setCourses] = useState<MyCourse[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setCourses([]);
      return;
    }
    (async () => {
      const { data: enrollments } = await supabase
        .from("enrollments")
        .select(
          "enrolled_at, course_id, courses(id, title, description, thumbnail_url, created_by, stages(name))",
        )
        .eq("user_id", user.id)
        .order("enrolled_at", { ascending: false });

      const rows = (enrollments ?? []).filter((e: any) => e.courses);
      const courseIds = rows.map((e: any) => e.course_id);
      if (!courseIds.length) {
        if (!cancelled) setCourses([]);
        return;
      }

      // Instructors (الناشرون) — الأسماء والصور عبر RPC عام مثل باقي الصفحات
      const creatorIds = [...new Set(rows.map((e: any) => (e.courses as any)?.created_by).filter(Boolean))] as string[];
      let creators: Array<{ id: string; full_name: string | null; avatar_url: string | null }> = [];
      if (creatorIds.length) {
        const { data: creatorsData, error: creatorsErr } = await (supabase as any).rpc(
          "get_public_content_publishers",
          { _user_ids: creatorIds },
        );
        if (!creatorsErr) creators = (creatorsData ?? []) as typeof creators;
      }
      const creatorMap = new Map<string, { full_name: string | null; avatar_url: string | null }>(
        creators.map((p) => [p.id, p]),
      );

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

      const unitsCount: Record<string, number> = {};
      (units ?? []).forEach((u: any) => {
        unitsCount[u.course_id] = (unitsCount[u.course_id] ?? 0) + 1;
      });

      const lessonsCount: Record<string, number> = {};
      const quizzesCount: Record<string, number> = {};
      const assignmentsCount: Record<string, number> = {};
      const quizToCourse: Record<string, string> = {};
      const assignmentToCourse: Record<string, string> = {};
      if (unitIds.length) {
        const { data: lessons } = await supabase
          .from("lessons_public")
          .select("unit_id")
          .in("unit_id", unitIds);
        (lessons ?? []).forEach((l: any) => {
          const cId = unitToCourse[l.unit_id];
          if (cId) lessonsCount[cId] = (lessonsCount[cId] ?? 0) + 1;
        });

        const quizzesByUnit = await Promise.all(
          unitIds.map((unitId) => listUnitQuizzes(unitId).catch(() => [])),
        );
        quizzesByUnit.forEach((quizzes, index) => {
          const unitId = unitIds[index];
          quizzes.forEach((q: any) => {
            const cId = unitToCourse[unitId];
            if (cId) {
              quizzesCount[cId] = (quizzesCount[cId] ?? 0) + 1;
              quizToCourse[q.id] = cId;
            }
          });
        });

        const { data: assignments } = await (supabase as any)
          .from("assignments")
          .select("id, unit_id")
          .in("unit_id", unitIds);
        (assignments ?? []).forEach((a: any) => {
          const cId = unitToCourse[a.unit_id];
          if (cId) {
            assignmentsCount[cId] = (assignmentsCount[cId] ?? 0) + 1;
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

      const doneQuizzes: Record<string, Set<string>> = {};
      const allQuizIds = Object.keys(quizToCourse);
      if (allQuizIds.length) {
        const { data: attempts } = await (supabase as any)
          .from("quiz_attempts")
          .select("quiz_id")
          .eq("user_id", user.id)
          .in("quiz_id", allQuizIds);
        (attempts ?? []).forEach((a: any) => {
          const cId = quizToCourse[a.quiz_id];
          if (!cId) return;
          if (!doneQuizzes[cId]) doneQuizzes[cId] = new Set();
          doneQuizzes[cId].add(a.quiz_id);
        });
      }

      const doneAssignments: Record<string, Set<string>> = {};
      const allAssignmentIds = Object.keys(assignmentToCourse);
      if (allAssignmentIds.length) {
        const { data: subs } = await (supabase as any)
          .from("assignment_submissions")
          .select("assignment_id, outcome")
          .eq("user_id", user.id)
          .in("assignment_id", allAssignmentIds);
        (subs ?? [])
          .filter((s: any) => s.outcome === "passed" || s.outcome === "failed")
          .forEach((s: any) => {
            const cId = assignmentToCourse[s.assignment_id];
            if (!cId) return;
            if (!doneAssignments[cId]) doneAssignments[cId] = new Set();
            doneAssignments[cId].add(s.assignment_id);
          });
      }

      if (cancelled) return;
      setCourses(
        rows.map((e: any) => {
          const c = e.courses;
          const totalLessons = lessonsCount[c.id] ?? 0;
          const totalQuizzes = quizzesCount[c.id] ?? 0;
          const totalAssignments = assignmentsCount[c.id] ?? 0;
          const total = totalLessons + totalQuizzes + totalAssignments;
          const completed =
            (doneLessons[c.id] ?? 0) +
            (doneQuizzes[c.id]?.size ?? 0) +
            (doneAssignments[c.id]?.size ?? 0);
          return {
            id: c.id,
            title: c.title,
            description: c.description,
            thumbnail_url: c.thumbnail_url,
            stage_name: c.stages?.name ?? null,
            enrolled_at: e.enrolled_at,
            units_count: unitsCount[c.id] ?? 0,
            lessons_count: total,
            completed_count: completed,
            percent: total ? Math.round((completed / total) * 100) : 0,
            instructor_name: creatorMap.get(c.created_by)?.full_name ?? null,
            instructor_avatar_url: creatorMap.get(c.created_by)?.avatar_url ?? null,
          } as MyCourse;
        }),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  return courses;
}
