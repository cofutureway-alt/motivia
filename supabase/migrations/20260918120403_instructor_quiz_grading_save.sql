-- ============================================================================
-- Phase 71i: Instructor attempt review + quiz grading save
-- ============================================================================

-- 1) Full review of one attempt (questions + answers + correctness) for grading
CREATE OR REPLACE FUNCTION public.instructor_get_attempt_review(_attempt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  a RECORD;
  v_questions jsonb;
BEGIN
  SELECT qa.*, q.course_id INTO a
    FROM public.quiz_attempts qa
    JOIN public.quizzes q ON q.id = qa.quiz_id
   WHERE qa.id = _attempt_id;
  IF a IS NULL THEN RETURN NULL; END IF;
  IF NOT public._instructor_can_manage(a.course_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'question_id', qq.id, 'content', qq.content, 'type', qq.type,
    'points', qq.points, 'order_index', qq.order_index, 'model_answer', qq.model_answer_text,
    'options', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', qo.id, 'content', qo.content,
                                          'is_correct', qo.is_correct, 'order_index', qo.order_index)
                       ORDER BY qo.order_index)
      FROM public.quiz_question_options qo WHERE qo.question_id = qq.id
    ), '[]'::jsonb),
    'answer', (
      SELECT jsonb_build_object('answer_text', ans.answer_text, 'selected_option_id', ans.selected_option_id,
                                'is_correct', ans.is_correct, 'points_earned', ans.points_earned)
      FROM public.quiz_answers ans WHERE ans.attempt_id = _attempt_id AND ans.question_id = qq.id
    )
  ) ORDER BY qq.order_index), '[]'::jsonb)
  INTO v_questions
  FROM public.quiz_questions qq
  WHERE qq.quiz_id = a.quiz_id;

  RETURN jsonb_build_object('attempt', to_jsonb(a), 'questions', v_questions);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.instructor_get_attempt_review(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.instructor_get_attempt_review(uuid) TO authenticated;

-- 2) Save quiz grading (same logic as admin_save_grading, instructor-scoped)
CREATE OR REPLACE FUNCTION public.instructor_save_grading(_attempt_id uuid, _updates jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  a RECORD;
  quiz RECORD;
  upd jsonb;
  q_id uuid;
  new_correct boolean;
  q_points numeric;
  earned numeric;
  pct numeric;
  has_ungraded_fb boolean;
  v_course_id uuid;
BEGIN
  SELECT q.course_id INTO v_course_id
    FROM public.quiz_attempts qa JOIN public.quizzes q ON q.id = qa.quiz_id
   WHERE qa.id = _attempt_id;
  IF NOT public._instructor_can_manage(v_course_id) THEN
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
    WHERE ans.attempt_id = _attempt_id AND q.type = 'fill_blank' AND ans.is_correct IS NULL
  ) INTO has_ungraded_fb;

  IF has_ungraded_fb THEN
    UPDATE public.quiz_attempts SET status = 'needs_review', earned_points = earned WHERE id = _attempt_id;
  ELSE
    pct := CASE WHEN a.total_points > 0 THEN round((earned / a.total_points) * 100) ELSE 0 END;
    UPDATE public.quiz_attempts
      SET status = 'graded', earned_points = earned, percentage = pct,
          passed = pct >= quiz.pass_percentage,
          submitted_at = COALESCE(submitted_at, now())
      WHERE id = _attempt_id;
  END IF;

  RETURN (SELECT to_jsonb(x) FROM public.quiz_attempts x WHERE x.id = _attempt_id);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.instructor_save_grading(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.instructor_save_grading(uuid, jsonb) TO authenticated;

-- 3) Feedback for one attempt
CREATE OR REPLACE FUNCTION public.instructor_save_feedback(_attempt_id uuid, _feedback text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_course_id uuid;
BEGIN
  SELECT q.course_id INTO v_course_id
    FROM public.quiz_attempts qa JOIN public.quizzes q ON q.id = qa.quiz_id
   WHERE qa.id = _attempt_id;
  IF NOT public._instructor_can_manage(v_course_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  UPDATE public.quiz_attempts
    SET feedback = _feedback, feedback_given_at = now()
    WHERE id = _attempt_id;
  RETURN (SELECT to_jsonb(x) FROM public.quiz_attempts x WHERE x.id = _attempt_id);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.instructor_save_feedback(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.instructor_save_feedback(uuid, text) TO authenticated;
