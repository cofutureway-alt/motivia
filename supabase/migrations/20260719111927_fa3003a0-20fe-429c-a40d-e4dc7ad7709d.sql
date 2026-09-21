
DROP FUNCTION IF EXISTS public.get_question_analysis(uuid, int);
CREATE OR REPLACE FUNCTION public.get_question_analysis(_quiz_id uuid, _form int)
RETURNS TABLE (
  question_id uuid,
  content jsonb,
  type text,
  points numeric,
  order_index int,
  correct_count bigint,
  incorrect_count bigint,
  unanswered_count bigint,
  total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH ranked AS (
    SELECT qa.*,
      ROW_NUMBER() OVER (
        PARTITION BY qa.user_id
        ORDER BY
          CASE WHEN q.attempt_result_policy = 'first' THEN qa.attempt_number END ASC NULLS LAST,
          CASE WHEN q.attempt_result_policy = 'last'  THEN qa.attempt_number END DESC NULLS LAST,
          CASE WHEN q.attempt_result_policy NOT IN ('first','last') THEN qa.percentage END DESC NULLS LAST,
          CASE WHEN q.attempt_result_policy NOT IN ('first','last') THEN qa.attempt_number END ASC
      ) AS rn
    FROM public.quiz_attempts qa
    JOIN public.quizzes q ON q.id = qa.quiz_id
    WHERE qa.quiz_id = _quiz_id AND qa.status = 'graded'
  ),
  official AS (SELECT * FROM ranked WHERE rn = 1 AND form_number = _form)
  SELECT
    qq.id,
    qq.content,
    qq.type::text,
    qq.points::numeric,
    qq.order_index,
    COUNT(*) FILTER (WHERE ans.is_correct IS TRUE) AS correct_count,
    COUNT(*) FILTER (WHERE ans.is_correct IS FALSE) AS incorrect_count,
    COUNT(*) FILTER (WHERE ans.is_correct IS NULL) AS unanswered_count,
    COUNT(ans.id) AS total_count
  FROM public.quiz_questions qq
  LEFT JOIN public.quiz_answers ans
    ON ans.question_id = qq.id
   AND ans.attempt_id IN (SELECT id FROM official)
  WHERE qq.quiz_id = _quiz_id AND qq.form_number = _form
  GROUP BY qq.id, qq.content, qq.type, qq.points, qq.order_index
  ORDER BY qq.order_index;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_question_analysis(uuid, int) TO authenticated;
