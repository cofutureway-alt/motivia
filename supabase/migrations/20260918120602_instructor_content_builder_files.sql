-- ============================================================================
-- Phase 71o (3/4): instructor content-builder policies — assignments + files
-- ============================================================================

-- ─── 6. Assignments (course_id direct) ───
DROP POLICY IF EXISTS assignments_select_instructor ON public.assignments;
CREATE POLICY assignments_select_instructor ON public.assignments FOR SELECT TO authenticated
  USING (public._instructor_owns_course(course_id, auth.uid()));
DROP POLICY IF EXISTS assignments_insert_instructor ON public.assignments;
CREATE POLICY assignments_insert_instructor ON public.assignments FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'instructor') AND public._instructor_owns_course(course_id, auth.uid()));
DROP POLICY IF EXISTS assignments_update_instructor ON public.assignments;
CREATE POLICY assignments_update_instructor ON public.assignments FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'instructor') AND public._instructor_owns_course(course_id, auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'instructor') AND public._instructor_owns_course(course_id, auth.uid()));
DROP POLICY IF EXISTS assignments_delete_instructor ON public.assignments;
CREATE POLICY assignments_delete_instructor ON public.assignments FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'instructor') AND public._instructor_owns_course(course_id, auth.uid()));

-- ─── 7. Assignment files (via assignment_id) ───
DROP POLICY IF EXISTS assignment_files_select_instructor ON public.assignment_files;
CREATE POLICY assignment_files_select_instructor ON public.assignment_files FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.assignments a WHERE a.id = assignment_id AND public._instructor_owns_course(a.course_id, auth.uid())));
DROP POLICY IF EXISTS assignment_files_insert_instructor ON public.assignment_files;
CREATE POLICY assignment_files_insert_instructor ON public.assignment_files FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'instructor') AND EXISTS (SELECT 1 FROM public.assignments a WHERE a.id = assignment_id AND public._instructor_owns_course(a.course_id, auth.uid())));
DROP POLICY IF EXISTS assignment_files_update_instructor ON public.assignment_files;
CREATE POLICY assignment_files_update_instructor ON public.assignment_files FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'instructor') AND EXISTS (SELECT 1 FROM public.assignments a WHERE a.id = assignment_id AND public._instructor_owns_course(a.course_id, auth.uid())))
  WITH CHECK (public.has_role(auth.uid(), 'instructor') AND EXISTS (SELECT 1 FROM public.assignments a WHERE a.id = assignment_id AND public._instructor_owns_course(a.course_id, auth.uid())));
DROP POLICY IF EXISTS assignment_files_delete_instructor ON public.assignment_files;
CREATE POLICY assignment_files_delete_instructor ON public.assignment_files FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'instructor') AND EXISTS (SELECT 1 FROM public.assignments a WHERE a.id = assignment_id AND public._instructor_owns_course(a.course_id, auth.uid())));

-- ─── 8. Lesson files (via lesson_id → unit) ───
DROP POLICY IF EXISTS lesson_files_select_instructor ON public.lesson_files;
CREATE POLICY lesson_files_select_instructor ON public.lesson_files FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.lessons l JOIN public.units u ON u.id = l.unit_id WHERE l.id = lesson_id AND public._instructor_owns_course(u.course_id, auth.uid())));
DROP POLICY IF EXISTS lesson_files_insert_instructor ON public.lesson_files;
CREATE POLICY lesson_files_insert_instructor ON public.lesson_files FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'instructor') AND EXISTS (SELECT 1 FROM public.lessons l JOIN public.units u ON u.id = l.unit_id WHERE l.id = lesson_id AND public._instructor_owns_course(u.course_id, auth.uid())));
DROP POLICY IF EXISTS lesson_files_update_instructor ON public.lesson_files;
CREATE POLICY lesson_files_update_instructor ON public.lesson_files FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'instructor') AND EXISTS (SELECT 1 FROM public.lessons l JOIN public.units u ON u.id = l.unit_id WHERE l.id = lesson_id AND public._instructor_owns_course(u.course_id, auth.uid())))
  WITH CHECK (public.has_role(auth.uid(), 'instructor') AND EXISTS (SELECT 1 FROM public.lessons l JOIN public.units u ON u.id = l.unit_id WHERE l.id = lesson_id AND public._instructor_owns_course(u.course_id, auth.uid())));
DROP POLICY IF EXISTS lesson_files_delete_instructor ON public.lesson_files;
CREATE POLICY lesson_files_delete_instructor ON public.lesson_files FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'instructor') AND EXISTS (SELECT 1 FROM public.lessons l JOIN public.units u ON u.id = l.unit_id WHERE l.id = lesson_id AND public._instructor_owns_course(u.course_id, auth.uid())));