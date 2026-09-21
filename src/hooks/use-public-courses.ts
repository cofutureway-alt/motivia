import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useGradeLock } from "@/hooks/use-grade-lock";

export interface PublicCourse {
  id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  stage_id: string | null;
  stage_name: string | null;
  subject_id: string | null;
  subject_name: string | null;
  units_count: number;
  lessons_count: number;
  quizzes_count: number;
  assignments_count: number;
  questions_count: number;
  created_at: string;
  is_paid: boolean;
  price_piastres: number | null;
  discount_price_piastres: number | null;
  discount_expires_at: string | null;
  status: "draft" | "coming_soon" | "published";
  scheduled_publish_at: string | null;
  is_featured: boolean;
  created_by: string | null;
  instructor_name: string | null;
  instructor_avatar_url: string | null;
}

interface PublicPublisher {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
}


export function usePublicCourses(limit?: number, opts?: { featuredOnly?: boolean }) {
  const [courses, setCourses] = useState<PublicCourse[] | null>(null);
  const featuredOnly = !!opts?.featuredOnly;
  const gradeLock = useGradeLock();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Lazy safety-net: flip any coming_soon courses whose scheduled_publish_at has passed.
      // Complements the pg_cron job so the transition still works if cron is paused.
      (supabase as any).rpc("auto_publish_scheduled_courses").then(() => {}, () => {});
      let q = (supabase as any)
        .from("courses")
        .select(
          "id, title, description, thumbnail_url, stage_id, subject_id, created_by, created_at, is_paid, price_piastres, discount_price_piastres, discount_expires_at, status, scheduled_publish_at, is_featured, featured_at, stages(name), subjects(name), units(id)",
        )
        .in("status", ["published", "coming_soon"]);
      if (featuredOnly) {
        q = q.eq("is_featured", true).order("featured_at", { ascending: false, nullsFirst: false });
      } else {
        q = q.order("created_at", { ascending: false });
      }
      if (limit) q = q.limit(limit);

      const { data, error } = await q;
      if (cancelled) return;
      if (error) {
        setCourses([]);
        return;
      }

      const courseIds = (data ?? []).map((c: any) => c.id);
      const creatorIds = [...new Set((data ?? []).map((c: any) => c.created_by).filter(Boolean))] as string[];
      let creators: PublicPublisher[] = [];
      if (creatorIds.length) {
        const { data: rpcData, error: rpcError } = await (supabase as any).rpc(
          "get_public_content_publishers",
          { _user_ids: creatorIds },
        );
        if (!rpcError) {
          creators = (rpcData ?? []) as PublicPublisher[];
        } else {
          // Fallback: راجع البيانات مباشرةً من profiles — إن منعتها صلاحيات RLS
          // تكتمل بدون أخطاء ويُكتفى بحذف اسم/صورة المعلم فقط.
          try {
            const { data: fbData } = await (supabase as any)
              .from("profiles")
              .select("id, full_name, avatar_url")
              .in("id", creatorIds);
            creators = ((fbData ?? []) as PublicPublisher[]) as PublicPublisher[];
          } catch {
            creators = [];
          }
          console.warn("get_public_content_publishers failed; fell back to profiles", rpcError);
        }
      }
      const creatorMap = new Map<string, PublicPublisher>(
        creators.map((p) => [p.id, p]),
      );
      const unitIds: string[] = (data ?? []).flatMap((c: any) =>
        (c.units ?? []).map((u: any) => u.id),
      );

      const lessonCounts: Record<string, number> = {};
      if (unitIds.length) {
        const { data: lessons } = await supabase
          .from("lessons_public")
          .select("unit_id")
          .in("unit_id", unitIds);
        (lessons ?? []).forEach((l: any) => {
          lessonCounts[l.unit_id] = (lessonCounts[l.unit_id] ?? 0) + 1;
        });
      }

      // Quizzes + questions per course (batched)
      const quizzesByCourse: Record<string, number> = {};
      const questionsByCourse: Record<string, number> = {};
      if (courseIds.length) {
        const { data: quizzes } = await (supabase as any)
          .from("quizzes")
          .select("id, course_id")
          .in("course_id", courseIds);
        const quizToCourse: Record<string, string> = {};
        (quizzes ?? []).forEach((q: any) => {
          quizToCourse[q.id] = q.course_id;
          quizzesByCourse[q.course_id] = (quizzesByCourse[q.course_id] ?? 0) + 1;
        });
        const quizIds = Object.keys(quizToCourse);
        if (quizIds.length) {
          const { data: questions } = await (supabase as any)
            .from("quiz_questions")
            .select("quiz_id")
            .in("quiz_id", quizIds);
          (questions ?? []).forEach((qq: any) => {
            const cId = quizToCourse[qq.quiz_id];
            if (cId) questionsByCourse[cId] = (questionsByCourse[cId] ?? 0) + 1;
          });
        }
      }

      const assignmentsByCourse: Record<string, number> = {};
      if (courseIds.length) {
        const { data: assignments } = await (supabase as any)
          .from("assignments")
          .select("course_id")
          .in("course_id", courseIds);
        (assignments ?? []).forEach((a: any) => {
          assignmentsByCourse[a.course_id] = (assignmentsByCourse[a.course_id] ?? 0) + 1;
        });
      }

      if (cancelled) return;

      // Grade lock (students only): keep courses whose stage matches the student's
      // grade. Supports the multi-grade junction when present, else falls back to
      // the single stage_id column.
      let allowedStageIds: Set<string> | null = null;
      if (gradeLock.active && gradeLock.stageId) {
        try {
          const { data: linked, error: linkErr } = await (supabase as any)
            .from("course_stages")
            .select("course_id")
            .eq("stage_id", gradeLock.stageId);
          if (!linkErr) {
            allowedStageIds = new Set((linked ?? []).map((r: any) => r.course_id));
          }
        } catch {
          // junction table not provisioned — fall back to stage_id matching below
        }
      }

      const visible = (data ?? []).filter((c: any) => {
        if (!allowedStageIds) return true;
        if (allowedStageIds.has(c.id)) return true;
        return c.stage_id === gradeLock.stageId;
      });

      setCourses(
        visible.map((c: any) => ({
          id: c.id,
          title: c.title,
          description: c.description,
          thumbnail_url: c.thumbnail_url,
          stage_id: c.stage_id,
          stage_name: c.stages?.name ?? null,
          subject_id: c.subject_id ?? null,
          subject_name: c.subjects?.name ?? null,
          units_count: c.units?.length ?? 0,
          lessons_count: (c.units ?? []).reduce(
            (acc: number, u: any) => acc + (lessonCounts[u.id] ?? 0),
            0,
          ),
          quizzes_count: quizzesByCourse[c.id] ?? 0,
          assignments_count: assignmentsByCourse[c.id] ?? 0,
          questions_count: questionsByCourse[c.id] ?? 0,
          created_at: c.created_at,
          is_paid: !!c.is_paid,
          price_piastres: c.price_piastres ?? null,
          discount_price_piastres: c.discount_price_piastres ?? null,
          discount_expires_at: c.discount_expires_at ?? null,
          status: (c.status ?? "published") as PublicCourse["status"],
          scheduled_publish_at: c.scheduled_publish_at ?? null,
          is_featured: !!c.is_featured,
          created_by: c.created_by ?? null,
          instructor_name: creatorMap.get(c.created_by)?.full_name ?? null,
          instructor_avatar_url: creatorMap.get(c.created_by)?.avatar_url ?? null,
        })),

      );
    })();
    return () => {
      cancelled = true;
    };
  }, [limit, featuredOnly, gradeLock.active, gradeLock.stageId]);

  return courses;
}
