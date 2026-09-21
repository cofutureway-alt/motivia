
-- Admin UPDATE policies
CREATE POLICY "Admins update all attempts" ON public.quiz_attempts
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update all answers" ON public.quiz_answers
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Grading save RPC
CREATE OR REPLACE FUNCTION public.admin_save_grading(_attempt_id uuid, _updates jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  a RECORD;
  quiz RECORD;
  upd jsonb;
  q_id uuid;
  new_correct boolean;
  q_points numeric;
  earned numeric;
  pct numeric;
  has_ungraded_fb boolean;
BEGIN
  IF NOT public.has_role(v_user, 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO a FROM public.quiz_attempts WHERE id = _attempt_id FOR UPDATE;
  IF a IS NULL THEN RAISE EXCEPTION 'attempt not found'; END IF;
  SELECT * INTO quiz FROM public.quizzes WHERE id = a.quiz_id;

  FOR upd IN SELECT * FROM jsonb_array_elements(COALESCE(_updates, '[]'::jsonb))
  LOOP
    q_id := (upd->>'question_id')::uuid;
    IF (upd->'is_correct') IS NULL OR jsonb_typeof(upd->'is_correct') = 'null' THEN
      new_correct := NULL;
    ELSE
      new_correct := (upd->>'is_correct')::boolean;
    END IF;
    SELECT points INTO q_points FROM public.quiz_questions WHERE id = q_id;
    UPDATE public.quiz_answers
       SET is_correct = new_correct,
           points_earned = CASE WHEN new_correct IS TRUE THEN COALESCE(q_points, 0) ELSE 0 END
     WHERE attempt_id = _attempt_id AND question_id = q_id;
  END LOOP;

  SELECT COALESCE(SUM(points_earned), 0) INTO earned
    FROM public.quiz_answers WHERE attempt_id = _attempt_id;

  SELECT EXISTS (
    SELECT 1 FROM public.quiz_answers ans
    JOIN public.quiz_questions q ON q.id = ans.question_id
    WHERE ans.attempt_id = _attempt_id
      AND q.type = 'fill_blank'
      AND ans.is_correct IS NULL
  ) INTO has_ungraded_fb;

  IF has_ungraded_fb THEN
    UPDATE public.quiz_attempts
      SET status = 'needs_review',
          earned_points = earned
      WHERE id = _attempt_id;
  ELSE
    pct := CASE WHEN a.total_points > 0 THEN round((earned / a.total_points) * 100) ELSE 0 END;
    UPDATE public.quiz_attempts
      SET status = 'graded',
          earned_points = earned,
          percentage = pct,
          passed = pct >= quiz.pass_percentage,
          submitted_at = COALESCE(submitted_at, now())
      WHERE id = _attempt_id;
  END IF;

  RETURN (SELECT to_jsonb(x) FROM public.quiz_attempts x WHERE x.id = _attempt_id);
END;
$$;

-- Feedback save RPC
CREATE OR REPLACE FUNCTION public.admin_save_feedback(_attempt_id uuid, _feedback text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  UPDATE public.quiz_attempts
    SET feedback = _feedback,
        feedback_given_at = now()
    WHERE id = _attempt_id;
  RETURN (SELECT to_jsonb(x) FROM public.quiz_attempts x WHERE x.id = _attempt_id);
END;
$$;

-- Official result RPC — always computed live against current quiz settings
CREATE OR REPLACE FUNCTION public.get_official_result(_quiz_id uuid, _user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  policy text;
  a RECORD;
BEGIN
  IF auth.uid() <> _user_id AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT COALESCE(attempt_result_policy, 'highest') INTO policy
    FROM public.quizzes WHERE id = _quiz_id;
  IF policy IS NULL THEN RETURN NULL; END IF;

  IF policy = 'first' THEN
    SELECT * INTO a FROM public.quiz_attempts
      WHERE quiz_id = _quiz_id AND user_id = _user_id AND status = 'graded'
      ORDER BY attempt_number ASC LIMIT 1;
  ELSIF policy = 'last' THEN
    SELECT * INTO a FROM public.quiz_attempts
      WHERE quiz_id = _quiz_id AND user_id = _user_id AND status = 'graded'
      ORDER BY attempt_number DESC LIMIT 1;
  ELSE
    SELECT * INTO a FROM public.quiz_attempts
      WHERE quiz_id = _quiz_id AND user_id = _user_id AND status = 'graded'
      ORDER BY percentage DESC NULLS LAST, attempt_number ASC LIMIT 1;
  END IF;

  IF a IS NULL THEN RETURN NULL; END IF;
  RETURN to_jsonb(a);
END;
$$;
