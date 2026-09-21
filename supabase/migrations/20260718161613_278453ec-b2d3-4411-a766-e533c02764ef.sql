
-- ============ quiz_attempts ============
CREATE TABLE public.quiz_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  form_number integer NOT NULL,
  attempt_number integer NOT NULL,
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','submitted','needs_review','graded')),
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  submitted_at timestamptz,
  question_order jsonb NOT NULL,
  total_points numeric NOT NULL DEFAULT 0,
  earned_points numeric NOT NULL DEFAULT 0,
  percentage numeric,
  passed boolean,
  feedback text,
  feedback_given_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.quiz_attempts TO authenticated;
GRANT ALL ON public.quiz_attempts TO service_role;

ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students view own attempts" ON public.quiz_attempts
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins view all attempts" ON public.quiz_attempts
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Students insert own attempts" ON public.quiz_attempts
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Students update own in-progress attempts" ON public.quiz_attempts
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND status = 'in_progress')
  WITH CHECK (user_id = auth.uid() AND status = 'in_progress');

CREATE INDEX idx_quiz_attempts_quiz_user ON public.quiz_attempts(quiz_id, user_id);
CREATE INDEX idx_quiz_attempts_status ON public.quiz_attempts(status);

CREATE TRIGGER trg_quiz_attempts_updated_at
  BEFORE UPDATE ON public.quiz_attempts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ quiz_answers ============
CREATE TABLE public.quiz_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES public.quiz_attempts(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.quiz_questions(id) ON DELETE CASCADE,
  option_order jsonb NOT NULL DEFAULT '[]'::jsonb,
  selected_option_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  fill_blank_text text,
  is_correct boolean,
  points_earned numeric NOT NULL DEFAULT 0,
  time_spent_seconds numeric NOT NULL DEFAULT 0,
  answered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (attempt_id, question_id)
);

GRANT SELECT, INSERT, UPDATE ON public.quiz_answers TO authenticated;
GRANT ALL ON public.quiz_answers TO service_role;

ALTER TABLE public.quiz_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students view own answers" ON public.quiz_answers
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.quiz_attempts a
    WHERE a.id = quiz_answers.attempt_id AND a.user_id = auth.uid()
  ));

CREATE POLICY "Admins view all answers" ON public.quiz_answers
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Students update own in-progress answers" ON public.quiz_answers
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.quiz_attempts a
    WHERE a.id = quiz_answers.attempt_id
      AND a.user_id = auth.uid()
      AND a.status = 'in_progress'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.quiz_attempts a
    WHERE a.id = quiz_answers.attempt_id
      AND a.user_id = auth.uid()
      AND a.status = 'in_progress'
  ));

CREATE TRIGGER trg_quiz_answers_updated_at
  BEFORE UPDATE ON public.quiz_answers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ Helper: recompute a single answer's correctness/points ============
CREATE OR REPLACE FUNCTION public._grade_answer(_answer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a RECORD;
  q RECORD;
  correct_ids uuid[];
  selected_ids uuid[];
BEGIN
  SELECT * INTO a FROM public.quiz_answers WHERE id = _answer_id;
  IF a IS NULL THEN RETURN; END IF;
  SELECT * INTO q FROM public.quiz_questions WHERE id = a.question_id;

  IF q.type = 'fill_blank' THEN
    -- Manual grading; leave nulls until admin grades
    UPDATE public.quiz_answers
      SET is_correct = NULL, points_earned = 0
      WHERE id = _answer_id;
    RETURN;
  END IF;

  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO correct_ids
    FROM public.quiz_question_options
    WHERE question_id = q.id AND is_correct = true;

  SELECT COALESCE(array_agg((elem)::uuid), ARRAY[]::uuid[]) INTO selected_ids
    FROM jsonb_array_elements_text(a.selected_option_ids) AS elem;

  IF (SELECT count(*) FROM unnest(selected_ids) s WHERE s = ANY(correct_ids)) = array_length(correct_ids,1)
     AND array_length(selected_ids,1) = array_length(correct_ids,1) THEN
    UPDATE public.quiz_answers
      SET is_correct = true, points_earned = q.points
      WHERE id = _answer_id;
  ELSE
    UPDATE public.quiz_answers
      SET is_correct = false, points_earned = 0
      WHERE id = _answer_id;
  END IF;
END;
$$;

-- ============ Finalize an attempt (internal) ============
CREATE OR REPLACE FUNCTION public._finalize_attempt(_attempt_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a RECORD;
  quiz RECORD;
  has_fill_blank boolean;
  earned numeric;
  pct numeric;
BEGIN
  SELECT * INTO a FROM public.quiz_attempts WHERE id = _attempt_id FOR UPDATE;
  IF a IS NULL OR a.status <> 'in_progress' THEN RETURN; END IF;

  SELECT * INTO quiz FROM public.quizzes WHERE id = a.quiz_id;

  -- Any answered auto-gradable answers should already be graded; unanswered auto-gradable → 0
  -- (points_earned default is 0, so nothing to update for unanswered.)

  SELECT EXISTS (
    SELECT 1 FROM public.quiz_questions
    WHERE quiz_id = a.quiz_id AND form_number = a.form_number AND type = 'fill_blank'
  ) INTO has_fill_blank;

  SELECT COALESCE(SUM(points_earned), 0) INTO earned
    FROM public.quiz_answers WHERE attempt_id = _attempt_id;

  IF has_fill_blank THEN
    UPDATE public.quiz_attempts
      SET status = 'needs_review',
          earned_points = earned,
          percentage = NULL,
          passed = NULL,
          submitted_at = COALESCE(submitted_at, now())
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
END;
$$;

-- ============ Start attempt (atomic) ============
CREATE OR REPLACE FUNCTION public.start_quiz_attempt(_quiz_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_quiz RECORD;
  v_enrolled boolean;
  v_existing uuid;
  v_form int;
  v_attempt_no int;
  v_finished_count int;
  v_expires timestamptz;
  v_started timestamptz := now();
  v_qorder jsonb;
  v_total numeric;
  v_attempt_id uuid;
  q RECORD;
  v_opt_order jsonb;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth required' USING ERRCODE='42501'; END IF;

  SELECT * INTO v_quiz FROM public.quizzes WHERE id = _quiz_id;
  IF v_quiz IS NULL THEN RAISE EXCEPTION 'quiz not found'; END IF;

  -- Enrollment check (admins bypass)
  IF NOT public.has_role(v_user, 'admin') THEN
    SELECT EXISTS (SELECT 1 FROM public.enrollments WHERE user_id = v_user AND course_id = v_quiz.course_id) INTO v_enrolled;
    IF NOT v_enrolled THEN RAISE EXCEPTION 'not enrolled' USING ERRCODE='42501'; END IF;
  END IF;

  -- Date window
  IF v_quiz.start_at IS NOT NULL AND now() < v_quiz.start_at THEN
    RAISE EXCEPTION 'quiz not started yet';
  END IF;
  IF v_quiz.end_at IS NOT NULL AND now() > v_quiz.end_at THEN
    RAISE EXCEPTION 'quiz window closed';
  END IF;

  -- Resume existing in-progress
  SELECT id INTO v_existing FROM public.quiz_attempts
    WHERE quiz_id = _quiz_id AND user_id = v_user AND status = 'in_progress'
    ORDER BY started_at DESC LIMIT 1;
  IF v_existing IS NOT NULL THEN
    -- Check if expired → finalize then continue to a new attempt if allowed
    IF (SELECT expires_at FROM public.quiz_attempts WHERE id = v_existing) < now() THEN
      PERFORM public._finalize_attempt(v_existing);
    ELSE
      RETURN v_existing;
    END IF;
  END IF;

  -- Attempt count limit (finished attempts)
  SELECT count(*) INTO v_finished_count FROM public.quiz_attempts
    WHERE quiz_id = _quiz_id AND user_id = v_user AND status IN ('submitted','needs_review','graded');
  IF v_finished_count >= v_quiz.max_attempts THEN
    RAISE EXCEPTION 'max attempts reached';
  END IF;

  v_form := 1 + floor(random() * v_quiz.forms_count)::int;
  SELECT count(*) + 1 INTO v_attempt_no FROM public.quiz_attempts WHERE quiz_id = _quiz_id AND user_id = v_user;

  -- Build question order (server-side shuffle)
  IF v_quiz.randomize_enabled THEN
    SELECT COALESCE(jsonb_agg(id ORDER BY random()), '[]'::jsonb) INTO v_qorder
      FROM public.quiz_questions WHERE quiz_id = _quiz_id AND form_number = v_form;
  ELSE
    SELECT COALESCE(jsonb_agg(id ORDER BY order_index, id), '[]'::jsonb) INTO v_qorder
      FROM public.quiz_questions WHERE quiz_id = _quiz_id AND form_number = v_form;
  END IF;

  IF jsonb_array_length(v_qorder) = 0 THEN
    RAISE EXCEPTION 'quiz form has no questions';
  END IF;

  SELECT COALESCE(SUM(points), 0) INTO v_total
    FROM public.quiz_questions WHERE quiz_id = _quiz_id AND form_number = v_form;

  v_expires := v_started + (v_quiz.duration_minutes * INTERVAL '1 minute');
  IF v_quiz.end_at IS NOT NULL AND v_expires > v_quiz.end_at THEN
    v_expires := v_quiz.end_at;
  END IF;

  INSERT INTO public.quiz_attempts (quiz_id, user_id, form_number, attempt_number, started_at, expires_at, question_order, total_points)
    VALUES (_quiz_id, v_user, v_form, v_attempt_no, v_started, v_expires, v_qorder, v_total)
    RETURNING id INTO v_attempt_id;

  -- Pre-create answer rows with per-question shuffled option orders
  FOR q IN
    SELECT * FROM public.quiz_questions WHERE quiz_id = _quiz_id AND form_number = v_form
  LOOP
    IF q.type = 'fill_blank' THEN
      v_opt_order := '[]'::jsonb;
    ELSIF v_quiz.randomize_enabled THEN
      SELECT COALESCE(jsonb_agg(id ORDER BY random()), '[]'::jsonb) INTO v_opt_order
        FROM public.quiz_question_options WHERE question_id = q.id;
    ELSE
      SELECT COALESCE(jsonb_agg(id ORDER BY order_index, id), '[]'::jsonb) INTO v_opt_order
        FROM public.quiz_question_options WHERE question_id = q.id;
    END IF;

    INSERT INTO public.quiz_answers (attempt_id, question_id, option_order)
      VALUES (v_attempt_id, q.id, v_opt_order);
  END LOOP;

  RETURN v_attempt_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_quiz_attempt(uuid) TO authenticated;

-- ============ Get or finalize attempt (lazy) ============
CREATE OR REPLACE FUNCTION public.get_or_finalize_attempt(_attempt_id uuid)
RETURNS SETOF public.quiz_attempts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  a RECORD;
BEGIN
  SELECT * INTO a FROM public.quiz_attempts WHERE id = _attempt_id;
  IF a IS NULL THEN RETURN; END IF;
  IF a.user_id <> v_user AND NOT public.has_role(v_user, 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  IF a.status = 'in_progress' AND now() > a.expires_at THEN
    PERFORM public._finalize_attempt(_attempt_id);
  END IF;
  RETURN QUERY SELECT * FROM public.quiz_attempts WHERE id = _attempt_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_or_finalize_attempt(uuid) TO authenticated;

-- ============ Get attempt questions with options (student view — no is_correct) ============
CREATE OR REPLACE FUNCTION public.get_attempt_questions(_attempt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  a RECORD;
  result jsonb;
BEGIN
  -- Ensure finalization if expired
  PERFORM public.get_or_finalize_attempt(_attempt_id);
  SELECT * INTO a FROM public.quiz_attempts WHERE id = _attempt_id;
  IF a IS NULL THEN RAISE EXCEPTION 'not found'; END IF;
  IF a.user_id <> v_user AND NOT public.has_role(v_user, 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;

  SELECT jsonb_agg(row_to_json(q_row) ORDER BY q_row.pos)
  INTO result
  FROM (
    SELECT
      ans.question_id AS id,
      q.type,
      q.content,
      q.image_url,
      q.points,
      ans.option_order,
      ans.selected_option_ids,
      ans.fill_blank_text,
      ans.answered_at,
      ans.time_spent_seconds,
      (
        SELECT COALESCE(jsonb_object_agg(o.id, jsonb_build_object('id', o.id, 'content', o.content)), '{}'::jsonb)
        FROM public.quiz_question_options o
        WHERE o.question_id = ans.question_id
      ) AS options_by_id,
      COALESCE((SELECT pos_idx FROM jsonb_array_elements_text(a.question_order) WITH ORDINALITY t(qid, pos_idx) WHERE qid = ans.question_id::text LIMIT 1), 0) AS pos
    FROM public.quiz_answers ans
    JOIN public.quiz_questions q ON q.id = ans.question_id
    WHERE ans.attempt_id = _attempt_id
  ) q_row;

  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_attempt_questions(uuid) TO authenticated;

-- ============ Save answer ============
CREATE OR REPLACE FUNCTION public.save_quiz_answer(
  _attempt_id uuid,
  _question_id uuid,
  _selected_option_ids jsonb,
  _fill_blank_text text,
  _time_delta_seconds numeric DEFAULT 0
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  a RECORD;
  ans_id uuid;
  q_type text;
BEGIN
  SELECT * INTO a FROM public.quiz_attempts WHERE id = _attempt_id;
  IF a IS NULL OR a.user_id <> v_user THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  IF a.status <> 'in_progress' THEN RAISE EXCEPTION 'attempt not in progress'; END IF;
  IF now() > a.expires_at THEN
    PERFORM public._finalize_attempt(_attempt_id);
    RAISE EXCEPTION 'attempt expired';
  END IF;

  SELECT id INTO ans_id FROM public.quiz_answers WHERE attempt_id = _attempt_id AND question_id = _question_id;
  IF ans_id IS NULL THEN RAISE EXCEPTION 'answer row missing'; END IF;

  SELECT type INTO q_type FROM public.quiz_questions WHERE id = _question_id;

  UPDATE public.quiz_answers
    SET selected_option_ids = COALESCE(_selected_option_ids, '[]'::jsonb),
        fill_blank_text = _fill_blank_text,
        time_spent_seconds = time_spent_seconds + GREATEST(COALESCE(_time_delta_seconds, 0), 0),
        answered_at = COALESCE(answered_at,
          CASE
            WHEN q_type = 'fill_blank' AND _fill_blank_text IS NOT NULL AND length(trim(_fill_blank_text)) > 0 THEN now()
            WHEN q_type <> 'fill_blank' AND jsonb_array_length(COALESCE(_selected_option_ids, '[]'::jsonb)) > 0 THEN now()
            ELSE NULL
          END)
    WHERE id = ans_id;

  -- Auto-grade for auto types
  IF q_type <> 'fill_blank' THEN
    PERFORM public._grade_answer(ans_id);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_quiz_answer(uuid, uuid, jsonb, text, numeric) TO authenticated;

-- ============ Add time only (for question navigation without answer change) ============
CREATE OR REPLACE FUNCTION public.add_answer_time(_attempt_id uuid, _question_id uuid, _delta numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  a RECORD;
BEGIN
  SELECT * INTO a FROM public.quiz_attempts WHERE id = _attempt_id;
  IF a IS NULL OR a.user_id <> v_user THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF a.status <> 'in_progress' THEN RETURN; END IF;
  UPDATE public.quiz_answers
    SET time_spent_seconds = time_spent_seconds + GREATEST(COALESCE(_delta,0), 0)
    WHERE attempt_id = _attempt_id AND question_id = _question_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_answer_time(uuid, uuid, numeric) TO authenticated;

-- ============ Submit ============
CREATE OR REPLACE FUNCTION public.submit_quiz_attempt(_attempt_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  a RECORD;
BEGIN
  SELECT * INTO a FROM public.quiz_attempts WHERE id = _attempt_id;
  IF a IS NULL OR a.user_id <> v_user THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  IF a.status <> 'in_progress' THEN RETURN; END IF;
  PERFORM public._finalize_attempt(_attempt_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_quiz_attempt(uuid) TO authenticated;

-- ============ Heartbeat ============
CREATE OR REPLACE FUNCTION public.heartbeat_quiz_attempt(_attempt_id uuid)
RETURNS boolean  -- true = still in progress, false = finalized/expired
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a RECORD;
BEGIN
  SELECT * INTO a FROM public.quiz_attempts WHERE id = _attempt_id;
  IF a IS NULL THEN RETURN false; END IF;
  IF a.user_id <> auth.uid() AND NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF a.status = 'in_progress' AND now() > a.expires_at THEN
    PERFORM public._finalize_attempt(_attempt_id);
    RETURN false;
  END IF;
  RETURN a.status = 'in_progress';
END;
$$;

GRANT EXECUTE ON FUNCTION public.heartbeat_quiz_attempt(uuid) TO authenticated;

-- ============ List my attempts for a quiz ============
CREATE OR REPLACE FUNCTION public.list_my_quiz_attempts(_quiz_id uuid)
RETURNS SETOF public.quiz_attempts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  r RECORD;
BEGIN
  -- Lazy finalize any expired in-progress
  FOR r IN SELECT id FROM public.quiz_attempts
    WHERE quiz_id = _quiz_id AND user_id = v_user
      AND status = 'in_progress' AND now() > expires_at
  LOOP
    PERFORM public._finalize_attempt(r.id);
  END LOOP;

  RETURN QUERY
    SELECT * FROM public.quiz_attempts
    WHERE quiz_id = _quiz_id AND user_id = v_user
    ORDER BY attempt_number DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_my_quiz_attempts(uuid) TO authenticated;

-- ============ Attempt details (with correct answers for review) ============
CREATE OR REPLACE FUNCTION public.get_attempt_details(_attempt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  a RECORD;
  attempt_json jsonb;
  qs jsonb;
BEGIN
  PERFORM public.get_or_finalize_attempt(_attempt_id);
  SELECT * INTO a FROM public.quiz_attempts WHERE id = _attempt_id;
  IF a IS NULL THEN RAISE EXCEPTION 'not found'; END IF;
  IF a.user_id <> v_user AND NOT public.has_role(v_user, 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;

  SELECT to_jsonb(a) INTO attempt_json;

  SELECT jsonb_agg(row_to_json(x) ORDER BY x.pos)
  INTO qs
  FROM (
    SELECT
      ans.question_id AS id,
      q.type,
      q.content,
      q.image_url,
      q.points,
      q.model_answer_text,
      ans.option_order,
      ans.selected_option_ids,
      ans.fill_blank_text,
      ans.is_correct,
      ans.points_earned,
      ans.time_spent_seconds,
      ans.answered_at,
      (
        SELECT COALESCE(jsonb_agg(jsonb_build_object('id', o.id, 'content', o.content, 'is_correct', o.is_correct) ORDER BY o.order_index), '[]'::jsonb)
        FROM public.quiz_question_options o WHERE o.question_id = ans.question_id
      ) AS options,
      COALESCE((SELECT pos_idx FROM jsonb_array_elements_text(a.question_order) WITH ORDINALITY t(qid, pos_idx) WHERE qid = ans.question_id::text LIMIT 1), 0) AS pos
    FROM public.quiz_answers ans
    JOIN public.quiz_questions q ON q.id = ans.question_id
    WHERE ans.attempt_id = _attempt_id
  ) x;

  RETURN jsonb_build_object('attempt', attempt_json, 'questions', COALESCE(qs, '[]'::jsonb));
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_attempt_details(uuid) TO authenticated;

-- ============ Quiz meta for student (bypasses need to expose more tables) ============
CREATE OR REPLACE FUNCTION public.get_quiz_for_student(_quiz_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  q RECORD;
  enrolled boolean;
BEGIN
  SELECT * INTO q FROM public.quizzes WHERE id = _quiz_id;
  IF q IS NULL THEN RETURN NULL; END IF;
  IF NOT public.has_role(v_user, 'admin') THEN
    SELECT EXISTS (SELECT 1 FROM public.enrollments WHERE user_id = v_user AND course_id = q.course_id) INTO enrolled;
    IF NOT enrolled THEN RAISE EXCEPTION 'not enrolled' USING ERRCODE='42501'; END IF;
  END IF;
  RETURN to_jsonb(q);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_quiz_for_student(uuid) TO authenticated;

-- ============ List quizzes for a unit (student-safe view) ============
CREATE OR REPLACE FUNCTION public.get_unit_quizzes(_unit_id uuid)
RETURNS TABLE(id uuid, unit_id uuid, title text, order_index int, duration_minutes int, pass_percentage int, max_attempts int, start_at timestamptz, end_at timestamptz)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT q.id, q.unit_id, q.title, q.order_index, q.duration_minutes, q.pass_percentage, q.max_attempts, q.start_at, q.end_at
  FROM public.quizzes q
  JOIN public.units u ON u.id = q.unit_id
  JOIN public.courses c ON c.id = u.course_id
  WHERE q.unit_id = _unit_id
    AND (c.status = 'published' OR public.has_role(auth.uid(), 'admin'));
$$;

GRANT EXECUTE ON FUNCTION public.get_unit_quizzes(uuid) TO authenticated, anon;
