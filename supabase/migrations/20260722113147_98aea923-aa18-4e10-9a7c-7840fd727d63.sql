
-- 1) Restrict manual payment method details to signed-in users
REVOKE SELECT ON public.manual_payment_methods FROM anon;
DROP POLICY IF EXISTS "manual methods readable" ON public.manual_payment_methods;
CREATE POLICY "manual methods readable authenticated" ON public.manual_payment_methods
  FOR SELECT TO authenticated USING (true);

-- 2) Hide answer key while a quiz attempt is still in progress
CREATE OR REPLACE FUNCTION public.get_attempt_details(_attempt_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  a RECORD;
  v_is_admin boolean;
  v_hide_answers boolean;
  attempt_json jsonb;
  qs jsonb;
BEGIN
  PERFORM public.get_or_finalize_attempt(_attempt_id);
  SELECT * INTO a FROM public.quiz_attempts WHERE id = _attempt_id;
  IF a IS NULL THEN RAISE EXCEPTION 'not found'; END IF;
  v_is_admin := public.has_role(v_user, 'admin');
  IF a.user_id <> v_user AND NOT v_is_admin THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;

  -- Hide correctness for students on in-progress attempts
  v_hide_answers := (a.status = 'in_progress') AND NOT v_is_admin;

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
      CASE WHEN v_hide_answers THEN NULL ELSE q.model_answer_text END AS model_answer_text,
      ans.option_order,
      ans.selected_option_ids,
      ans.fill_blank_text,
      CASE WHEN v_hide_answers THEN NULL ELSE ans.is_correct END AS is_correct,
      CASE WHEN v_hide_answers THEN 0 ELSE ans.points_earned END AS points_earned,
      ans.time_spent_seconds,
      ans.answered_at,
      (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'id', o.id,
          'content', o.content,
          'is_correct', CASE WHEN v_hide_answers THEN NULL ELSE o.is_correct END
        ) ORDER BY o.order_index), '[]'::jsonb)
        FROM public.quiz_question_options o WHERE o.question_id = ans.question_id
      ) AS options,
      COALESCE((SELECT pos_idx FROM jsonb_array_elements_text(a.question_order) WITH ORDINALITY t(qid, pos_idx) WHERE qid = ans.question_id::text LIMIT 1), 0) AS pos
    FROM public.quiz_answers ans
    JOIN public.quiz_questions q ON q.id = ans.question_id
    WHERE ans.attempt_id = _attempt_id
  ) x;

  RETURN jsonb_build_object('attempt', attempt_json, 'questions', COALESCE(qs, '[]'::jsonb));
END;
$function$;
