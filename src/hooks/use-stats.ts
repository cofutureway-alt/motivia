import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { listUnitQuizzes } from "@/lib/quiz-api";

// ============ Phase 17 + 32: weighted completion incl. quizzes & assignments ============
// For each lesson: contribution = 100 if completed, else watch_percentage (0 if none)
// For each quiz: contribution = 100 if student has ANY attempt, else 0
// For each assignment: contribution = 100 if outcome is 'passed' OR 'failed', else 0
// Course percent = sum(contribution) / (count * 100) * 100

export interface StudentCourseStat {
  id: string;
  title: string;
  thumbnail_url: string | null;
  stage_name: string | null;
  subject_name: string | null;
  enrolled_at: string;
  total_lessons: number;
  completed_lessons: number;
  percent: number;
  units: {
    id: string;
    title: string;
    position: number;
    lessons: {
      id: string;
      title: string;
      position: number;
      watch_percentage: number;
      completed: boolean;
    }[];
    quizzes: {
      id: string;
      title: string;
      position: number;
      attempted: boolean;
    }[];
    assignments: {
      id: string;
      title: string;
      position: number;
      evaluated: boolean;
    }[];
  }[];
}

export interface FailedAttemptRow {
  attempt_id: string;
  quiz_id: string;
  quiz_title: string;
  course_id: string;
  course_title: string;
  subject_name: string | null;
  percentage: number | null;
  pass_percentage: number;
  submitted_at: string | null;
}

export interface StudentStats {
  enrollmentsCount: number;
  completedLessons: number;
  overallPercent: number;
  courses: StudentCourseStat[];
  quizzesTotal: number;
  quizzesCompleted: number;
  quizzesPassed: number;
  quizzesFailed: number;
  failedAttempts: FailedAttemptRow[];
  // Phase 32: assignment cards (mirror quiz card structure).
  assignmentsTotal: number;
  assignmentsCompleted: number;
  assignmentsPassed: number;
  assignmentsFailed: number; // includes 'not_submitted'
}

const EMPTY_STATS: StudentStats = {
  enrollmentsCount: 0,
  completedLessons: 0,
  overallPercent: 0,
  courses: [],
  quizzesTotal: 0,
  quizzesCompleted: 0,
  quizzesPassed: 0,
  quizzesFailed: 0,
  failedAttempts: [],
  assignmentsTotal: 0,
  assignmentsCompleted: 0,
  assignmentsPassed: 0,
  assignmentsFailed: 0,
};

export function useStudentStats() {
  const { user } = useAuth();
  const [data, setData] = useState<StudentStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setData(EMPTY_STATS);
      return;
    }
    (async () => {
      const uid = user.id;

      const { data: enrollments } = await supabase
        .from("enrollments")
        .select(
          "enrolled_at, course_id, courses(id, title, thumbnail_url, stages(name), subjects(name))",
        )
        .eq("user_id", uid)
        .order("enrolled_at", { ascending: false });

      const rows = (enrollments ?? []).filter((e: any) => e.courses);
      if (!rows.length) {
        if (!cancelled) setData(EMPTY_STATS);
        return;
      }

      const courseIds = rows.map((r: any) => r.course_id);

      const [{ data: units }, { data: lessonProgress }, { data: watchRows }] = await Promise.all([
        supabase.from("units").select("id, course_id, title, position").in("course_id", courseIds),
        supabase
          .from("lesson_progress")
          .select("lesson_id, course_id")
          .eq("user_id", uid)
          .in("course_id", courseIds),
        supabase
          .from("lesson_watch_progress")
          .select("lesson_id, watch_percentage, course_id")
          .eq("user_id", uid)
          .in("course_id", courseIds),
      ]);

      const uList = (units ?? []) as any[];
      const unitIds = uList.map((u) => u.id);
      const unitToCourse = new Map<string, string>();
      uList.forEach((u) => unitToCourse.set(u.id, u.course_id));

      const [lessonsResult, quizzesArrays, assignmentsResult] = await Promise.all([
        unitIds.length
          ? supabase
              .from("lessons_public")
              .select("id, unit_id, title, position")
              .in("unit_id", unitIds)
          : Promise.resolve({ data: [] as any[] }),
        unitIds.length
          ? Promise.all(unitIds.map((unitId) => listUnitQuizzes(unitId).catch(() => [])))
          : Promise.resolve([] as any[][]),
        unitIds.length
          ? (supabase as any)
              .from("assignments")
              .select("id, unit_id, title, order_index")
              .in("unit_id", unitIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const lessons = lessonsResult.data ?? [];
      const quizList = unitIds.flatMap((unitId, index) =>
        ((quizzesArrays[index] ?? []) as any[]).map((q) => ({
          id: q.id,
          unit_id: unitId,
          course_id: unitToCourse.get(unitId) ?? "",
          title: q.title,
          position: q.order_index ?? 0,
          pass_percentage: q.pass_percentage ?? 50,
          policy: "highest",
        })),
      );
      const quizIds = quizList.map((q) => q.id);

      const assignmentList = (assignmentsResult.data ?? []).map((a: any) => ({
        id: a.id,
        unit_id: a.unit_id,
        course_id: unitToCourse.get(a.unit_id) ?? "",
        title: a.title,
        position: a.order_index ?? 0,
      }));
      const assignmentIds = assignmentList.map((a) => a.id);

      const [{ data: attempts }, { data: quizMeta }, { data: submissions }] = await Promise.all([
        quizIds.length
          ? (supabase as any)
              .from("quiz_attempts")
              .select("id, quiz_id, status, percentage, passed, submitted_at, attempt_number")
              .eq("user_id", uid)
              .in("quiz_id", quizIds)
          : Promise.resolve({ data: [] as any[] }),
        quizIds.length
          ? (supabase as any)
              .from("quizzes")
              .select("id, title, course_id, pass_percentage, attempt_result_policy")
              .in("id", quizIds)
          : Promise.resolve({ data: [] as any[] }),
        assignmentIds.length
          ? (supabase as any)
              .from("assignment_submissions")
              .select("assignment_id, outcome")
              .eq("user_id", uid)
              .in("assignment_id", assignmentIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      const attemptedQuizSet = new Set<string>(
        ((attempts ?? []) as any[]).map((a) => a.quiz_id),
      );
      const submissionsByAssignment = new Map<string, string | null>();
      ((submissions ?? []) as any[]).forEach((s) => {
        submissionsByAssignment.set(s.assignment_id, s.outcome ?? null);
      });
      const evaluatedAssignmentSet = new Set<string>(
        ((submissions ?? []) as any[])
          .filter((s) => s.outcome === "passed" || s.outcome === "failed")
          .map((s) => s.assignment_id),
      );

      const completedByLesson = new Set<string>(
        (lessonProgress ?? []).map((p: any) => p.lesson_id),
      );
      const watchByLesson = new Map<string, number>();
      (watchRows ?? []).forEach((w: any) => {
        watchByLesson.set(w.lesson_id, Math.min(100, Math.max(0, Number(w.watch_percentage) || 0)));
      });

      let globalSum = 0;
      let globalTotal = 0;
      let completedLessonsCount = 0;

      const courseStats: StudentCourseStat[] = rows.map((r: any) => {
        const c = r.courses;
        const courseUnits = uList
          .filter((u) => u.course_id === c.id)
          .sort((a, b) => a.position - b.position)
          .map((u) => {
            const uLessons = (lessons ?? [])
              .filter((l: any) => l.unit_id === u.id)
              .sort((a: any, b: any) => a.position - b.position)
              .map((l: any) => {
                const done = completedByLesson.has(l.id);
                const wp = watchByLesson.get(l.id) ?? 0;
                return {
                  id: l.id,
                  title: l.title,
                  position: l.position,
                  watch_percentage: wp,
                  completed: done,
                };
              });
            const uQuizzes = quizList
              .filter((q) => q.unit_id === u.id)
              .sort((a, b) => a.position - b.position)
              .map((q) => ({
                id: q.id,
                title: q.title,
                position: q.position,
                attempted: attemptedQuizSet.has(q.id),
              }));
            const uAssignments = assignmentList
              .filter((a) => a.unit_id === u.id)
              .sort((a, b) => a.position - b.position)
              .map((a) => ({
                id: a.id,
                title: a.title,
                position: a.position,
                evaluated: evaluatedAssignmentSet.has(a.id),
              }));
            return {
              id: u.id,
              title: u.title,
              position: u.position,
              lessons: uLessons,
              quizzes: uQuizzes,
              assignments: uAssignments,
            };
          });

        let sum = 0;
        let total = 0;
        let done = 0;
        courseUnits.forEach((u) =>
          u.lessons.forEach((l) => {
            total += 1;
            const contribution = l.completed ? 100 : l.watch_percentage;
            sum += contribution;
            if (l.completed) done += 1;
          }),
        );
        courseUnits.forEach((u) =>
          u.quizzes.forEach((q) => {
            total += 1;
            if (q.attempted) {
              sum += 100;
              done += 1;
            }
          }),
        );
        courseUnits.forEach((u) =>
          u.assignments.forEach((a) => {
            total += 1;
            if (a.evaluated) {
              sum += 100;
              done += 1;
            }
          }),
        );

        globalSum += sum;
        globalTotal += total;
        completedLessonsCount += done;

        return {
          id: c.id,
          title: c.title,
          thumbnail_url: c.thumbnail_url,
          stage_name: c.stages?.name ?? null,
          subject_name: c.subjects?.name ?? null,
          enrolled_at: r.enrolled_at,
          total_lessons: total,
          completed_lessons: done,
          percent: total ? Math.round((sum / (total * 100)) * 100) : 0,
          units: courseUnits,
        } as StudentCourseStat;
      });

      const overall = globalTotal ? Math.round((globalSum / (globalTotal * 100)) * 100) : 0;

      // ==== Quiz stats + failed attempts ====
      const courseInfoById = new Map<string, { title: string; subject: string | null }>();
      rows.forEach((r: any) => {
        courseInfoById.set(r.course_id, {
          title: r.courses?.title ?? "",
          subject: r.courses?.subjects?.name ?? null,
        });
      });
      const quizMetaById = new Map<
        string,
        { title: string; course_id: string; pass_percentage: number; policy: string }
      >();
      quizList.forEach((q) => {
        quizMetaById.set(q.id, {
          title: q.title,
          course_id: q.course_id,
          pass_percentage: q.pass_percentage,
          policy: q.policy,
        });
      });
      ((quizMeta ?? []) as any[]).forEach((q) => {
        quizMetaById.set(q.id, {
          title: q.title,
          course_id: q.course_id,
          pass_percentage: q.pass_percentage ?? 50,
          policy: q.attempt_result_policy ?? "highest",
        });
      });

      const attemptsByQuiz = new Map<string, any[]>();
      ((attempts ?? []) as any[]).forEach((a) => {
        if (!attemptsByQuiz.has(a.quiz_id)) attemptsByQuiz.set(a.quiz_id, []);
        attemptsByQuiz.get(a.quiz_id)!.push(a);
      });

      const quizzesTotal = quizList.length;
      let quizzesCompleted = 0;
      let quizzesPassed = 0;
      let quizzesFailed = 0;
      const failedAttempts: FailedAttemptRow[] = [];

      quizList.forEach((q) => {
        const arr = attemptsByQuiz.get(q.id);
        if (!arr || arr.length === 0) return;
        quizzesCompleted += 1;
        const graded = arr.filter((a) => a.status === "graded");
        if (graded.length === 0) return;
        const meta = quizMetaById.get(q.id);
        const policy = meta?.policy ?? "highest";
        let official: any;
        if (policy === "first") {
          official = [...graded].sort((a, b) => a.attempt_number - b.attempt_number)[0];
        } else if (policy === "last") {
          official = [...graded].sort((a, b) => b.attempt_number - a.attempt_number)[0];
        } else {
          official = [...graded].sort((a, b) => {
            const pb = b.percentage ?? -1;
            const pa = a.percentage ?? -1;
            if (pb !== pa) return pb - pa;
            return a.attempt_number - b.attempt_number;
          })[0];
        }
        if (official.passed === true) {
          quizzesPassed += 1;
        } else if (official.passed === false) {
          quizzesFailed += 1;
          const info = meta ? courseInfoById.get(meta.course_id) : undefined;
          failedAttempts.push({
            attempt_id: official.id,
            quiz_id: q.id,
            quiz_title: meta?.title ?? "",
            course_id: meta?.course_id ?? "",
            course_title: info?.title ?? "",
            subject_name: info?.subject ?? null,
            percentage: official.percentage,
            pass_percentage: meta?.pass_percentage ?? 50,
            submitted_at: official.submitted_at,
          });
        }
      });

      failedAttempts.sort((a, b) => {
        const tb = b.submitted_at ? new Date(b.submitted_at).getTime() : 0;
        const ta = a.submitted_at ? new Date(a.submitted_at).getTime() : 0;
        return tb - ta;
      });

      // ==== Assignment stats (Phase 32) — mirror quiz cards ====
      const assignmentsTotal = assignmentList.length;
      let assignmentsCompleted = 0; // evaluated (passed | failed | not_submitted)
      let assignmentsPassed = 0;
      let assignmentsFailed = 0; // includes 'not_submitted'
      assignmentList.forEach((a) => {
        const outcome = submissionsByAssignment.get(a.id) ?? null;
        if (outcome === "passed") {
          assignmentsCompleted += 1;
          assignmentsPassed += 1;
        } else if (outcome === "failed" || outcome === "not_submitted") {
          assignmentsCompleted += 1;
          assignmentsFailed += 1;
        }
      });

      if (!cancelled)
        setData({
          enrollmentsCount: rows.length,
          completedLessons: completedLessonsCount,
          overallPercent: overall,
          courses: courseStats,
          quizzesTotal,
          quizzesCompleted,
          quizzesPassed,
          quizzesFailed,
          failedAttempts,
          assignmentsTotal,
          assignmentsCompleted,
          assignmentsPassed,
          assignmentsFailed,
        });
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  return data;
}

// ============ Admin Statistics ============
export interface TopCourseRow {
  id: string;
  title: string;
  thumbnail_url: string | null;
  stage_name: string | null;
  enrollment_count: number;
}

export interface MostFailedQuizRow {
  quiz_id: string;
  quiz_title: string;
  course_id: string;
  course_title: string;
  stage_id: string | null;
  stage_name: string | null;
  subject_id: string | null;
  subject_name: string | null;
  failed_count: number;
  total_official: number;
}

export interface MostFailedAssignmentRow {
  assignment_id: string;
  assignment_title: string;
  course_id: string;
  course_title: string;
  stage_id: string | null;
  stage_name: string | null;
  subject_id: string | null;
  subject_name: string | null;
  failed_count: number;
  total_evaluated: number;
  failure_rate: number;
}

export interface AssignmentPlatformMetrics {
  avg_submission_rate: number | null;
  rate_sample_size: number;
  avg_response_seconds: number | null;
  time_sample_size: number;
}

export interface AdminStats {
  publishedCourses: number;
  studentsCount: number;
  totalLessons: number;
  stagesCount: number;
  totalQuizzes: number;
  totalQuestions: number;
  totalAssignments: number;
  topCourses: TopCourseRow[];
  mostFailedQuizzes: MostFailedQuizRow[];
  mostFailedAssignments: MostFailedAssignmentRow[];
  assignmentMetrics: AssignmentPlatformMetrics;
}

export function useAdminStats() {
  const [data, setData] = useState<AdminStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [
        { count: publishedCourses },
        { count: studentsCount },
        { count: totalLessons },
        { count: stagesCount },
        { count: totalQuizzes },
        { count: totalQuestions },
        { count: totalAssignments },
        { data: enrollments },
        { data: courses },
        { data: mostFailed },
        { data: mostFailedAsg },
        { data: asgMetrics },
      ] = await Promise.all([
        supabase
          .from("courses")
          .select("id", { count: "exact", head: true })
          .eq("status", "published"),
        supabase
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("role", "student"),
        supabase.from("lessons").select("id", { count: "exact", head: true }),
        supabase.from("stages").select("id", { count: "exact", head: true }),
        (supabase as any).from("quizzes").select("id", { count: "exact", head: true }),
        (supabase as any).from("quiz_questions").select("id", { count: "exact", head: true }),
        (supabase as any).from("assignments").select("id", { count: "exact", head: true }),
        supabase.from("enrollments").select("course_id"),
        supabase.from("courses").select("id, title, thumbnail_url, created_at, stages(name)"),
        (supabase as any).rpc("get_most_failed_quizzes", { _limit: 10 }),
        (supabase as any).rpc("get_most_failed_assignments", { _limit: 10 }),
        (supabase as any).rpc("get_assignment_platform_metrics"),
      ]);

      const counts = new Map<string, number>();
      (enrollments ?? []).forEach((e: any) => {
        counts.set(e.course_id, (counts.get(e.course_id) ?? 0) + 1);
      });

      const enriched = (courses ?? [])
        .map((c: any) => ({
          id: c.id,
          title: c.title,
          thumbnail_url: c.thumbnail_url,
          created_at: c.created_at,
          stage_name: c.stages?.name ?? null,
          enrollment_count: counts.get(c.id) ?? 0,
        }))
        .filter((c) => c.enrollment_count > 0)
        .sort((a, b) => {
          if (b.enrollment_count !== a.enrollment_count)
            return b.enrollment_count - a.enrollment_count;
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        })
        .slice(0, 5)
        .map(({ created_at, ...rest }) => rest);

      const metrics = (asgMetrics ?? {}) as any;
      if (!cancelled)
        setData({
          publishedCourses: publishedCourses ?? 0,
          studentsCount: studentsCount ?? 0,
          totalLessons: totalLessons ?? 0,
          stagesCount: stagesCount ?? 0,
          totalQuizzes: totalQuizzes ?? 0,
          totalQuestions: totalQuestions ?? 0,
          totalAssignments: totalAssignments ?? 0,
          topCourses: enriched,
          mostFailedQuizzes: (mostFailed ?? []) as MostFailedQuizRow[],
          mostFailedAssignments: (mostFailedAsg ?? []) as MostFailedAssignmentRow[],
          assignmentMetrics: {
            avg_submission_rate:
              metrics.avg_submission_rate != null ? Number(metrics.avg_submission_rate) : null,
            rate_sample_size: Number(metrics.rate_sample_size ?? 0),
            avg_response_seconds:
              metrics.avg_response_seconds != null ? Number(metrics.avg_response_seconds) : null,
            time_sample_size: Number(metrics.time_sample_size ?? 0),
          },
        });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return data;
}
