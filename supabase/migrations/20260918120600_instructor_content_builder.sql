-- ============================================================================
-- Phase 71o (1/4): instructor content-builder table policies — units + lessons
-- Scoped strictly to courses owned by the calling instructor.
-- Helper (exists): public._instructor_owns_course(p_course uuid, p_instructor uuid)
-- ============================================================================

-- ─── 1. Units ───
DROP POLICY IF EXISTS units_select_instructor ON public.units;
CREATE POLICY units_select_instructor ON public.units FOR SELECT TO authenticated
  USING (public._instructor_owns_course(course_id, auth.uid()));
DROP POLICY IF EXISTS units_insert_instructor ON public.units;
CREATE POLICY units_insert_instructor ON public.units FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'instructor') AND public._instructor_owns_course(course_id, auth.uid()));
DROP POLICY IF EXISTS units_update_instructor ON public.units;
CREATE POLICY units_update_instructor ON public.units FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'instructor') AND public._instructor_owns_course(course_id, auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'instructor') AND public._instructor_owns_course(course_id, auth.uid()));
DROP POLICY IF EXISTS units_delete_instructor ON public.units;
CREATE POLICY units_delete_instructor ON public.units FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'instructor') AND public._instructor_owns_course(course_id, auth.uid()));

-- ─── 2. Lessons (course via unit_id) ───
DROP POLICY IF EXISTS lessons_select_instructor ON public.lessons;
CREATE POLICY lessons_select_instructor ON public.lessons FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.units u WHERE u.id = unit_id AND public._instructor_owns_course(u.course_id, auth.uid())));
DROP POLICY IF EXISTS lessons_insert_instructor ON public.lessons;
CREATE POLICY lessons_insert_instructor ON public.lessons FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'instructor') AND EXISTS (SELECT 1 FROM public.units u WHERE u.id = unit_id AND public._instructor_owns_course(u.course_id, auth.uid())));
DROP POLICY IF EXISTS lessons_update_instructor ON public.lessons;
CREATE POLICY lessons_update_instructor ON public.lessons FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'instructor') AND EXISTS (SELECT 1 FROM public.units u WHERE u.id = unit_id AND public._instructor_owns_course(u.course_id, auth.uid())))
  WITH CHECK (public.has_role(auth.uid(), 'instructor') AND EXISTS (SELECT 1 FROM public.units u WHERE u.id = unit_id AND public._instructor_owns_course(u.course_id, auth.uid())));
DROP POLICY IF EXISTS lessons_delete_instructor ON public.lessons;
CREATE POLICY lessons_delete_instructor ON public.lessons FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'instructor') AND EXISTS (SELECT 1 FROM public.units u WHERE u.id = unit_id AND public._instructor_owns_course(u.course_id, auth.uid())));