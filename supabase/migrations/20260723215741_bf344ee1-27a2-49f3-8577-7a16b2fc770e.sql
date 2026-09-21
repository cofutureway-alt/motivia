
-- 1) manual_payment_methods: only enabled rows readable by regular auth users
DROP POLICY IF EXISTS "manual methods readable authenticated" ON public.manual_payment_methods;
CREATE POLICY "manual methods readable when enabled"
  ON public.manual_payment_methods
  FOR SELECT TO authenticated
  USING (is_enabled = true);
CREATE POLICY "admins read all manual methods"
  ON public.manual_payment_methods
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- 2) assignment_submissions: block students from writing grading columns
CREATE OR REPLACE FUNCTION public.block_student_grade_writes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;
  IF NEW.grade IS DISTINCT FROM OLD.grade
     OR NEW.outcome IS DISTINCT FROM OLD.outcome
     OR NEW.feedback IS DISTINCT FROM OLD.feedback
     OR NEW.graded_by IS DISTINCT FROM OLD.graded_by
     OR NEW.graded_at IS DISTINCT FROM OLD.graded_at
     OR NEW.feedback_given_at IS DISTINCT FROM OLD.feedback_given_at THEN
    RAISE EXCEPTION 'Not permitted to modify grading columns';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.block_student_grade_writes() FROM PUBLIC;
DROP TRIGGER IF EXISTS trg_block_student_grade_writes ON public.assignment_submissions;
CREATE TRIGGER trg_block_student_grade_writes
  BEFORE UPDATE ON public.assignment_submissions
  FOR EACH ROW EXECUTE FUNCTION public.block_student_grade_writes();

-- 3) quiz_attempts: remove direct client INSERT/UPDATE; all state via SECURITY DEFINER RPCs
DROP POLICY IF EXISTS "Students update own in-progress attempts" ON public.quiz_attempts;
DROP POLICY IF EXISTS "Students insert own attempts" ON public.quiz_attempts;

-- 4) lesson_progress: enforce enrollment on UPDATE USING clause too
DROP POLICY IF EXISTS lesson_progress_own_update ON public.lesson_progress;
CREATE POLICY lesson_progress_own_update
  ON public.lesson_progress
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND is_enrolled_in_lesson_course(auth.uid(), lesson_id))
  WITH CHECK (auth.uid() = user_id AND is_enrolled_in_lesson_course(auth.uid(), lesson_id));

-- 5) Views: switch to security_invoker
ALTER VIEW public.discount_savings_summary SET (security_invoker = on);
ALTER VIEW public.lessons_public SET (security_invoker = on);

-- 6) Function search_path hardening for helpers missing it
ALTER FUNCTION public._gen_payment_reference() SET search_path = public;
ALTER FUNCTION public._gen_txn_reference() SET search_path = public;
ALTER FUNCTION public._maintain_featured_at() SET search_path = public;
ALTER FUNCTION public._stable_uuid(text) SET search_path = public;
ALTER FUNCTION public.badge_conditions_no_self_ref() SET search_path = public;

-- 7) Tighten function EXECUTE grants
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon;
GRANT  EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- Internal / trigger-only functions: revoke from authenticated as well (triggers run as owner)
REVOKE EXECUTE ON FUNCTION public._award_points(uuid, text, text, uuid, integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public._enforce_enrollment_course_published() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public._enroll_user_in_bundle(uuid, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public._finalize_attempt(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public._gen_payment_reference() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public._gen_txn_reference() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public._grade_answer(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public._maintain_featured_at() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public._stable_uuid(text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.badge_conditions_no_self_ref() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_publish_scheduled_courses() FROM authenticated;
