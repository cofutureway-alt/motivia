
CREATE OR REPLACE FUNCTION public.prevent_assignment_self_grade()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  IF NEW.grade IS DISTINCT FROM OLD.grade
     OR NEW.outcome IS DISTINCT FROM OLD.outcome
     OR NEW.feedback IS DISTINCT FROM OLD.feedback
     OR NEW.feedback_given_at IS DISTINCT FROM OLD.feedback_given_at
     OR NEW.graded_at IS DISTINCT FROM OLD.graded_at
     OR NEW.graded_by IS DISTINCT FROM OLD.graded_by
  THEN
    RAISE EXCEPTION 'Not allowed to modify grading fields';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_assignment_self_grade ON public.assignment_submissions;
CREATE TRIGGER trg_prevent_assignment_self_grade
BEFORE UPDATE ON public.assignment_submissions
FOR EACH ROW EXECUTE FUNCTION public.prevent_assignment_self_grade();

DROP POLICY IF EXISTS lesson_progress_own ON public.lesson_progress;

CREATE POLICY lesson_progress_own_select ON public.lesson_progress
FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY lesson_progress_own_insert ON public.lesson_progress
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND public.is_enrolled_in_lesson_course(auth.uid(), lesson_id)
);

CREATE POLICY lesson_progress_own_update ON public.lesson_progress
FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND public.is_enrolled_in_lesson_course(auth.uid(), lesson_id)
);

CREATE POLICY lesson_progress_own_delete ON public.lesson_progress
FOR DELETE TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Students insert own attempts" ON public.quiz_attempts;

CREATE POLICY "Students insert own attempts" ON public.quiz_attempts
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND status = 'in_progress'
  AND passed IS NULL
  AND COALESCE(earned_points, 0) = 0
  AND COALESCE(percentage, 0) = 0
  AND submitted_at IS NULL
);

DROP POLICY IF EXISTS "Students view own answers" ON public.quiz_answers;

CREATE POLICY "Students view own answers" ON public.quiz_answers
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.quiz_attempts qa
    WHERE qa.id = quiz_answers.attempt_id
      AND qa.user_id = auth.uid()
      AND qa.status <> 'in_progress'
  )
);
