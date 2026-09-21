-- ============================================================================
-- Phase 71o (2/4): instructor content-builder policies — quizzes + questions
-- ============================================================================

-- ─── 3. Quizzes (course_id direct) ───
DROP POLICY IF EXISTS quizzes_select_instructor ON public.quizzes;
CREATE POLICY quizzes_select_instructor ON public.quizzes FOR SELECT TO authenticated
  USING (public._instructor_owns_course(course_id, auth.uid()));
DROP POLICY IF EXISTS quizzes_insert_instructor ON public.quizzes;
CREATE POLICY quizzes_insert_instructor ON public.quizzes FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'instructor') AND public._instructor_owns_course(course_id, auth.uid()));
DROP POLICY IF EXISTS quizzes_update_instructor ON public.quizzes;
CREATE POLICY quizzes_update_instructor ON public.quizzes FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'instructor') AND public._instructor_owns_course(course_id, auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'instructor') AND public._instructor_owns_course(course_id, auth.uid()));
DROP POLICY IF EXISTS quizzes_delete_instructor ON public.quizzes;
CREATE POLICY quizzes_delete_instructor ON public.quizzes FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'instructor') AND public._instructor_owns_course(course_id, auth.uid()));

-- ─── 4. Quiz questions (via quiz_id) ───
DROP POLICY IF EXISTS quiz_questions_select_instructor ON public.quiz_questions;
CREATE POLICY quiz_questions_select_instructor ON public.quiz_questions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.quizzes q WHERE q.id = quiz_id AND public._instructor_owns_course(q.course_id, auth.uid())));
DROP POLICY IF EXISTS quiz_questions_insert_instructor ON public.quiz_questions;
CREATE POLICY quiz_questions_insert_instructor ON public.quiz_questions FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'instructor') AND EXISTS (SELECT 1 FROM public.quizzes q WHERE q.id = quiz_id AND public._instructor_owns_course(q.course_id, auth.uid())));
DROP POLICY IF EXISTS quiz_questions_update_instructor ON public.quiz_questions;
CREATE POLICY quiz_questions_update_instructor ON public.quiz_questions FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'instructor') AND EXISTS (SELECT 1 FROM public.quizzes q WHERE q.id = quiz_id AND public._instructor_owns_course(q.course_id, auth.uid())))
  WITH CHECK (public.has_role(auth.uid(), 'instructor') AND EXISTS (SELECT 1 FROM public.quizzes q WHERE q.id = quiz_id AND public._instructor_owns_course(q.course_id, auth.uid())));
DROP POLICY IF EXISTS quiz_questions_delete_instructor ON public.quiz_questions;
CREATE POLICY quiz_questions_delete_instructor ON public.quiz_questions FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'instructor') AND EXISTS (SELECT 1 FROM public.quizzes q WHERE q.id = quiz_id AND public._instructor_owns_course(q.course_id, auth.uid())));

-- ─── 5. Quiz question options (via question_id → quiz) ───
DROP POLICY IF EXISTS quiz_question_options_select_instructor ON public.quiz_question_options;
CREATE POLICY quiz_question_options_select_instructor ON public.quiz_question_options FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.quiz_questions qq JOIN public.quizzes q ON q.id = qq.quiz_id WHERE qq.id = question_id AND public._instructor_owns_course(q.course_id, auth.uid())));
DROP POLICY IF EXISTS quiz_question_options_insert_instructor ON public.quiz_question_options;
CREATE POLICY quiz_question_options_insert_instructor ON public.quiz_question_options FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'instructor') AND EXISTS (SELECT 1 FROM public.quiz_questions qq JOIN public.quizzes q ON q.id = qq.quiz_id WHERE qq.id = question_id AND public._instructor_owns_course(q.course_id, auth.uid())));
DROP POLICY IF EXISTS quiz_question_options_update_instructor ON public.quiz_question_options;
CREATE POLICY quiz_question_options_update_instructor ON public.quiz_question_options FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'instructor') AND EXISTS (SELECT 1 FROM public.quiz_questions qq JOIN public.quizzes q ON q.id = qq.quiz_id WHERE qq.id = question_id AND public._instructor_owns_course(q.course_id, auth.uid())))
  WITH CHECK (public.has_role(auth.uid(), 'instructor') AND EXISTS (SELECT 1 FROM public.quiz_questions qq JOIN public.quizzes q ON q.id = qq.quiz_id WHERE qq.id = question_id AND public._instructor_owns_course(q.course_id, auth.uid())));
DROP POLICY IF EXISTS quiz_question_options_delete_instructor ON public.quiz_question_options;
CREATE POLICY quiz_question_options_delete_instructor ON public.quiz_question_options FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'instructor') AND EXISTS (SELECT 1 FROM public.quiz_questions qq JOIN public.quizzes q ON q.id = qq.quiz_id WHERE qq.id = question_id AND public._instructor_owns_course(q.course_id, auth.uid())));