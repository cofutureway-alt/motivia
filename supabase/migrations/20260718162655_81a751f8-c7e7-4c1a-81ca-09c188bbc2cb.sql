
CREATE OR REPLACE FUNCTION public.list_quiz_attempts(
  _user_search text DEFAULT NULL,
  _course_id uuid DEFAULT NULL,
  _stage_id uuid DEFAULT NULL,
  _subject_id uuid DEFAULT NULL,
  _needs_review_only boolean DEFAULT false,
  _limit int DEFAULT 100,
  _offset int DEFAULT 0
)
RETURNS TABLE (
  attempt_id uuid,
  quiz_id uuid,
  user_id uuid,
  student_name text,
  student_email text,
  course_id uuid,
  course_title text,
  subject_id uuid,
  subject_name text,
  stage_id uuid,
  stage_name text,
  quiz_title text,
  form_number int,
  attempt_number int,
  status text,
  percentage numeric,
  passed boolean,
  earned_points numeric,
  total_points numeric,
  pass_percentage int,
  submitted_at timestamptz,
  has_feedback boolean,
  feedback_given_at timestamptz,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_is_admin boolean := public.has_role(v_user, 'admin');
  v_search text := NULLIF(trim(COALESCE(_user_search, '')), '');
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth required' USING ERRCODE='42501'; END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      qa.id AS attempt_id,
      qa.quiz_id,
      qa.user_id,
      COALESCE(p.full_name, '') AS student_name,
      u.email::text AS student_email,
      c.id AS course_id,
      c.title AS course_title,
      s.id AS subject_id,
      s.name AS subject_name,
      st.id AS stage_id,
      st.name AS stage_name,
      q.title AS quiz_title,
      qa.form_number,
      qa.attempt_number,
      qa.status,
      qa.percentage,
      qa.passed,
      qa.earned_points,
      qa.total_points,
      q.pass_percentage,
      qa.submitted_at,
      (qa.feedback_given_at IS NOT NULL) AS has_feedback,
      qa.feedback_given_at
    FROM public.quiz_attempts qa
    JOIN public.quizzes q ON q.id = qa.quiz_id
    JOIN public.courses c ON c.id = q.course_id
    LEFT JOIN public.subjects s ON s.id = c.subject_id
    LEFT JOIN public.stages st ON st.id = c.stage_id
    LEFT JOIN public.profiles p ON p.id = qa.user_id
    LEFT JOIN auth.users u ON u.id = qa.user_id
    WHERE qa.status <> 'in_progress'
      AND (v_is_admin OR qa.user_id = v_user)
      AND (_course_id IS NULL OR c.id = _course_id)
      AND (NOT v_is_admin OR _stage_id IS NULL OR c.stage_id = _stage_id)
      AND (NOT v_is_admin OR _subject_id IS NULL OR c.subject_id = _subject_id)
      AND (NOT v_is_admin OR NOT _needs_review_only OR qa.status = 'needs_review')
      AND (
        NOT v_is_admin
        OR v_search IS NULL
        OR p.full_name ILIKE '%' || v_search || '%'
        OR u.email ILIKE '%' || v_search || '%'
      )
  ),
  counted AS (
    SELECT b.*, COUNT(*) OVER () AS total_count FROM base b
  )
  SELECT * FROM counted
  ORDER BY submitted_at DESC NULLS LAST, attempt_id DESC
  LIMIT GREATEST(COALESCE(_limit, 100), 1)
  OFFSET GREATEST(COALESCE(_offset, 0), 0);
END;
$$;
