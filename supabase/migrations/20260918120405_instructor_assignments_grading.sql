-- ============================================================================
-- Phase 71k: Instructor assignment finalize + grading
-- ============================================================================

-- 1) Finalize a never-submitted submission (instructor-scoped)
CREATE OR REPLACE FUNCTION public.instructor_finalize_not_submitted(_submission_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  s RECORD;
  a RECORD;
  v_course_id uuid;
BEGIN
  SELECT a.course_id INTO v_course_id
    FROM public.assignment_submissions s
    JOIN public.assignments a ON a.id = s.assignment_id
   WHERE s.id = _submission_id;
  IF NOT public._instructor_can_manage(v_course_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO s FROM public.assignment_submissions WHERE id = _submission_id FOR UPDATE;
  IF s IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO a FROM public.assignments WHERE id = s.assignment_id;
  IF a IS NULL THEN RETURN NULL; END IF;

  IF s.outcome IS NULL AND s.status = 'draft' AND now() > a.end_at THEN
    UPDATE public.assignment_submissions
       SET outcome = 'not_submitted', grade = 0,
           graded_at = now(), graded_by = auth.uid()
     WHERE id = _submission_id;
    SELECT * INTO s FROM public.assignment_submissions WHERE id = _submission_id;
  END IF;

  RETURN to_jsonb(s);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.instructor_finalize_not_submitted(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.instructor_finalize_not_submitted(uuid) TO authenticated;

-- 2) Grade an assignment submission
CREATE OR REPLACE FUNCTION public.instructor_grade_assignment(
  _submission_id uuid,
  _grade numeric,
  _outcome text,          -- 'passed' | 'failed' | NULL (auto from pass_grade)
  _feedback text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_course_id uuid;
  a RECORD;
  v_outcome text;
BEGIN
  SELECT a.course_id INTO v_course_id
    FROM public.assignment_submissions s
    JOIN public.assignments a ON a.id = s.assignment_id
   WHERE s.id = _submission_id;
  IF NOT public._instructor_can_manage(v_course_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO a FROM public.assignments WHERE id = (
    SELECT assignment_id FROM public.assignment_submissions WHERE id = _submission_id);
  IF a IS NULL THEN RAISE EXCEPTION 'assignment not found'; END IF;

  v_outcome := _outcome;
  IF v_outcome IS NULL THEN
    v_outcome := CASE WHEN _grade >= COALESCE(a.pass_grade, 0) THEN 'passed' ELSE 'failed' END;
  END IF;

  UPDATE public.assignment_submissions
     SET grade = _grade,
         outcome = v_outcome,
         feedback = COALESCE(_feedback, feedback),
         feedback_given_at = CASE WHEN _feedback IS NOT NULL THEN now() ELSE feedback_given_at END,
         graded_at = now(),
         graded_by = auth.uid()
   WHERE id = _submission_id;

  RETURN (SELECT to_jsonb(x) FROM public.assignment_submissions x WHERE x.id = _submission_id);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.instructor_grade_assignment(uuid, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.instructor_grade_assignment(uuid, numeric, text, text) TO authenticated;
