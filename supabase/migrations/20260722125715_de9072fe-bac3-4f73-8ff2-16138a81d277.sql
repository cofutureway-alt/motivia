
-- 1) courses.content_drip_enabled
ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS content_drip_enabled boolean NOT NULL DEFAULT false;

-- 2) lessons.unlock_quiz_id (quiz gate)
ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS unlock_quiz_id uuid REFERENCES public.quizzes(id) ON DELETE SET NULL;

-- 3) student_quiz_attempt_grants
CREATE TABLE IF NOT EXISTS public.student_quiz_attempt_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quiz_id uuid NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  extra_attempts integer NOT NULL DEFAULT 1 CHECK (extra_attempts > 0),
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sqag_user_quiz ON public.student_quiz_attempt_grants(user_id, quiz_id);

GRANT SELECT ON public.student_quiz_attempt_grants TO authenticated;
GRANT ALL ON public.student_quiz_attempt_grants TO service_role;

ALTER TABLE public.student_quiz_attempt_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "students read own grants"
  ON public.student_quiz_attempt_grants
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins manage grants"
  ON public.student_quiz_attempt_grants
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 4) Effective max attempts helper
CREATE OR REPLACE FUNCTION public.student_effective_quiz_max_attempts(_user_id uuid, _quiz_id uuid)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE((SELECT max_attempts FROM public.quizzes WHERE id = _quiz_id), 0)
       + COALESCE((SELECT SUM(extra_attempts) FROM public.student_quiz_attempt_grants
                    WHERE user_id = _user_id AND quiz_id = _quiz_id), 0);
$$;

-- 5) Admin grant extra attempts
CREATE OR REPLACE FUNCTION public.admin_grant_quiz_attempt(_user_id uuid, _quiz_id uuid, _extra integer DEFAULT 1, _note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_new_total integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF _extra IS NULL OR _extra <= 0 THEN
    RAISE EXCEPTION 'invalid extra_attempts';
  END IF;
  INSERT INTO public.student_quiz_attempt_grants(user_id, quiz_id, extra_attempts, granted_by, note)
    VALUES (_user_id, _quiz_id, _extra, auth.uid(), _note);
  v_new_total := public.student_effective_quiz_max_attempts(_user_id, _quiz_id);
  RETURN jsonb_build_object('success', true, 'effective_max_attempts', v_new_total);
END;
$$;

-- 6) Course lock resolver: returns lock state per item
CREATE OR REPLACE FUNCTION public.resolve_course_lock_state(_course_id uuid, _user_id uuid)
RETURNS TABLE(
  item_type text,
  item_id uuid,
  unit_id uuid,
  ord numeric,
  is_completed boolean,
  is_locked boolean,
  reason text,
  gate_quiz_id uuid,
  gate_quiz_title text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_drip boolean;
  r RECORD;
  prev_done boolean := true;
BEGIN
  SELECT content_drip_enabled INTO v_drip FROM public.courses WHERE id = _course_id;
  v_drip := COALESCE(v_drip, false);

  FOR r IN
    WITH items AS (
      SELECT 'lesson'::text AS item_type, l.id AS item_id, l.unit_id, l.position::numeric AS ord,
             (EXISTS(SELECT 1 FROM public.lesson_progress lp WHERE lp.user_id = _user_id AND lp.lesson_id = l.id)) AS is_completed,
             l.unlock_quiz_id AS gate_quiz_id
      FROM public.lessons l
      JOIN public.units u ON u.id = l.unit_id
      WHERE u.course_id = _course_id
      UNION ALL
      SELECT 'quiz'::text, q.id, q.unit_id, q.order_index::numeric,
             (EXISTS(SELECT 1 FROM public.quiz_attempts qa WHERE qa.user_id = _user_id AND qa.quiz_id = q.id)),
             NULL::uuid
      FROM public.quizzes q
      JOIN public.units u ON u.id = q.unit_id
      WHERE u.course_id = _course_id
      UNION ALL
      SELECT 'assignment'::text, a.id, a.unit_id, a.order_index::numeric,
             (EXISTS(SELECT 1 FROM public.assignment_submissions s
                     WHERE s.user_id = _user_id AND s.assignment_id = a.id
                       AND s.outcome IN ('passed','failed'))),
             NULL::uuid
      FROM public.assignments a
      JOIN public.units u ON u.id = a.unit_id
      WHERE u.course_id = _course_id
    )
    SELECT i.*, u.position AS unit_pos
    FROM items i
    JOIN public.units u ON u.id = i.unit_id
    ORDER BY u.position, i.ord, i.item_id
  LOOP
    item_type := r.item_type;
    item_id := r.item_id;
    unit_id := r.unit_id;
    ord := r.ord;
    is_completed := r.is_completed;
    gate_quiz_id := r.gate_quiz_id;
    gate_quiz_title := NULL;
    is_locked := false;
    reason := 'ok';

    -- Quiz gate for lessons (applies regardless of drip)
    IF r.item_type = 'lesson' AND r.gate_quiz_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.quiz_attempts qa
        WHERE qa.user_id = _user_id AND qa.quiz_id = r.gate_quiz_id
          AND qa.status = 'graded' AND qa.passed IS TRUE
      ) THEN
        is_locked := true;
        reason := 'quiz_gate';
        SELECT title INTO gate_quiz_title FROM public.quizzes WHERE id = r.gate_quiz_id;
      END IF;
    END IF;

    -- Sequential drip
    IF NOT is_locked AND v_drip AND NOT prev_done THEN
      is_locked := true;
      reason := 'drip';
    END IF;

    prev_done := r.is_completed;
    RETURN NEXT;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_course_lock_state(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.student_effective_quiz_max_attempts(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_grant_quiz_attempt(uuid, uuid, integer, text) TO authenticated;

-- 7) Update start_quiz_attempt to use effective attempts + honor locks
CREATE OR REPLACE FUNCTION public.start_quiz_attempt(_quiz_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_quiz RECORD;
  v_enrolled boolean;
  v_existing uuid;
  v_form int;
  v_attempt_no int;
  v_finished_count int;
  v_effective_max int;
  v_expires timestamptz;
  v_started timestamptz := now();
  v_qorder jsonb;
  v_total numeric;
  v_attempt_id uuid;
  v_locked boolean;
  q RECORD;
  v_opt_order jsonb;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth required' USING ERRCODE='42501'; END IF;

  SELECT * INTO v_quiz FROM public.quizzes WHERE id = _quiz_id;
  IF v_quiz IS NULL THEN RAISE EXCEPTION 'quiz not found'; END IF;

  IF NOT public.has_role(v_user, 'admin') THEN
    SELECT EXISTS (SELECT 1 FROM public.enrollments WHERE user_id = v_user AND course_id = v_quiz.course_id) INTO v_enrolled;
    IF NOT v_enrolled THEN RAISE EXCEPTION 'not enrolled' USING ERRCODE='42501'; END IF;

    -- Drip lock check
    SELECT is_locked INTO v_locked
      FROM public.resolve_course_lock_state(v_quiz.course_id, v_user)
      WHERE item_type = 'quiz' AND item_id = _quiz_id
      LIMIT 1;
    IF COALESCE(v_locked, false) THEN
      RAISE EXCEPTION 'هذا الاختبار مقفل — أكمل العناصر السابقة أولاً';
    END IF;
  END IF;

  IF v_quiz.start_at IS NOT NULL AND now() < v_quiz.start_at THEN
    RAISE EXCEPTION 'quiz not started yet';
  END IF;
  IF v_quiz.end_at IS NOT NULL AND now() > v_quiz.end_at THEN
    RAISE EXCEPTION 'quiz window closed';
  END IF;

  SELECT id INTO v_existing FROM public.quiz_attempts
    WHERE quiz_id = _quiz_id AND user_id = v_user AND status = 'in_progress'
    ORDER BY started_at DESC LIMIT 1;
  IF v_existing IS NOT NULL THEN
    IF (SELECT expires_at FROM public.quiz_attempts WHERE id = v_existing) < now() THEN
      PERFORM public._finalize_attempt(v_existing);
    ELSE
      RETURN v_existing;
    END IF;
  END IF;

  SELECT count(*) INTO v_finished_count FROM public.quiz_attempts
    WHERE quiz_id = _quiz_id AND user_id = v_user AND status IN ('submitted','needs_review','graded');
  v_effective_max := public.student_effective_quiz_max_attempts(v_user, _quiz_id);
  IF v_finished_count >= v_effective_max THEN
    RAISE EXCEPTION 'max attempts reached';
  END IF;

  v_form := 1 + floor(random() * v_quiz.forms_count)::int;
  SELECT count(*) + 1 INTO v_attempt_no FROM public.quiz_attempts WHERE quiz_id = _quiz_id AND user_id = v_user;

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

  FOR q IN SELECT * FROM public.quiz_questions WHERE quiz_id = _quiz_id AND form_number = v_form
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
