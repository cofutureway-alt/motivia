-- Phase 39: Academic Performance — Assignment Analytics

-- 1) Most-problematic assignments (ranked by count of students whose outcome is 'failed' OR 'not_submitted')
CREATE OR REPLACE FUNCTION public.get_most_failed_assignments(_limit integer DEFAULT 10)
RETURNS TABLE(
  assignment_id uuid,
  assignment_title text,
  course_id uuid,
  course_title text,
  stage_id uuid,
  stage_name text,
  subject_id uuid,
  subject_name text,
  failed_count bigint,
  total_evaluated bigint,
  failure_rate numeric
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH per_student AS (
    SELECT DISTINCT ON (s.assignment_id, s.user_id)
      s.assignment_id, s.user_id, s.outcome
    FROM public.assignment_submissions s
    WHERE s.outcome IS NOT NULL
    ORDER BY s.assignment_id, s.user_id, s.graded_at DESC NULLS LAST
  ),
  agg AS (
    SELECT
      ps.assignment_id,
      COUNT(*) FILTER (WHERE ps.outcome IN ('failed','not_submitted')) AS failed_count,
      COUNT(*) AS total_evaluated
    FROM per_student ps
    GROUP BY ps.assignment_id
    HAVING COUNT(*) FILTER (WHERE ps.outcome IN ('failed','not_submitted')) > 0
  )
  SELECT
    a.id, a.title,
    c.id, c.title,
    st.id, st.name,
    subj.id, subj.name,
    ag.failed_count,
    ag.total_evaluated,
    ROUND((ag.failed_count::numeric / NULLIF(ag.total_evaluated,0)) * 100, 1) AS failure_rate
  FROM agg ag
  JOIN public.assignments a ON a.id = ag.assignment_id
  JOIN public.courses c     ON c.id = a.course_id
  LEFT JOIN public.stages   st   ON st.id   = c.stage_id
  LEFT JOIN public.subjects subj ON subj.id = c.subject_id
  ORDER BY ag.failed_count DESC, ag.total_evaluated DESC
  LIMIT GREATEST(COALESCE(_limit, 10), 1);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_most_failed_assignments(integer) TO authenticated;

-- 2) Platform-wide submission-rate and response-time averages
CREATE OR REPLACE FUNCTION public.get_assignment_platform_metrics()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_avg_rate numeric;
  v_avg_seconds numeric;
  v_rate_count int;
  v_time_count int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Per-assignment submission rate = submitted count / enrolled count.
  WITH per_asg AS (
    SELECT
      a.id AS assignment_id,
      (SELECT COUNT(*) FROM public.enrollments e WHERE e.course_id = a.course_id) AS enrolled,
      (SELECT COUNT(DISTINCT s.user_id)
         FROM public.assignment_submissions s
         WHERE s.assignment_id = a.id AND s.status = 'submitted') AS submitted
    FROM public.assignments a
  ),
  rates AS (
    SELECT (submitted::numeric / enrolled) * 100 AS rate
    FROM per_asg
    WHERE enrolled > 0
  )
  SELECT ROUND(AVG(rate), 1), COUNT(*) INTO v_avg_rate, v_rate_count FROM rates;

  -- Per-assignment average response time = avg(submitted_at - a.start_at) across submitted rows.
  WITH per_asg AS (
    SELECT AVG(EXTRACT(EPOCH FROM (s.submitted_at - a.start_at))) AS avg_secs
    FROM public.assignment_submissions s
    JOIN public.assignments a ON a.id = s.assignment_id
    WHERE s.status = 'submitted' AND s.submitted_at IS NOT NULL AND a.start_at IS NOT NULL
    GROUP BY a.id
    HAVING AVG(EXTRACT(EPOCH FROM (s.submitted_at - a.start_at))) IS NOT NULL
  )
  SELECT ROUND(AVG(avg_secs)), COUNT(*) INTO v_avg_seconds, v_time_count FROM per_asg;

  RETURN jsonb_build_object(
    'avg_submission_rate', v_avg_rate,
    'rate_sample_size', COALESCE(v_rate_count, 0),
    'avg_response_seconds', v_avg_seconds,
    'time_sample_size', COALESCE(v_time_count, 0)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_assignment_platform_metrics() TO authenticated;

-- 3) Add assignment-level filter to list_assignment_submissions (mirrors Phase 19 quiz filter addition)
CREATE OR REPLACE FUNCTION public.list_assignment_submissions(
  _user_search text DEFAULT NULL::text,
  _course_id uuid DEFAULT NULL::uuid,
  _stage_id uuid DEFAULT NULL::uuid,
  _subject_id uuid DEFAULT NULL::uuid,
  _ungraded_only boolean DEFAULT false,
  _assignment_id uuid DEFAULT NULL::uuid,
  _limit integer DEFAULT 100,
  _offset integer DEFAULT 0
)
RETURNS TABLE(
  submission_id uuid, assignment_id uuid, user_id uuid,
  student_name text, student_email text, student_phone text, student_student_id text,
  course_id uuid, course_title text,
  subject_id uuid, subject_name text,
  stage_id uuid, stage_name text,
  assignment_title text,
  total_grade numeric, pass_grade numeric, end_at timestamp with time zone,
  status text, submitted_at timestamp with time zone,
  grade numeric, outcome text, computed_outcome text,
  has_feedback boolean, feedback_given_at timestamp with time zone,
  graded_at timestamp with time zone, total_count bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_is_admin boolean := public.has_role(v_user, 'admin');
  v_search text := NULLIF(trim(COALESCE(_user_search,'')), '');
  v_is_digit_id boolean := v_search IS NOT NULL AND v_search ~ '^[0-9]{1,6}$';
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth required' USING ERRCODE='42501'; END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      s.id AS submission_id,
      s.assignment_id,
      s.user_id,
      COALESCE(p.full_name, '') AS student_name,
      u.email::text AS student_email,
      p.phone_number AS student_phone,
      p.student_id  AS student_student_id,
      c.id AS course_id, c.title AS course_title,
      subj.id AS subject_id, subj.name AS subject_name,
      st.id AS stage_id, st.name AS stage_name,
      a.title AS assignment_title,
      a.total_grade, a.pass_grade, a.end_at,
      s.status, s.submitted_at,
      s.grade, s.outcome,
      CASE
        WHEN s.outcome IS NOT NULL THEN s.outcome
        WHEN s.status = 'submitted' THEN NULL
        WHEN s.status = 'draft' AND now() > a.end_at THEN 'not_submitted'
        ELSE NULL
      END AS computed_outcome,
      (s.feedback_given_at IS NOT NULL) AS has_feedback,
      s.feedback_given_at, s.graded_at
    FROM public.assignment_submissions s
    JOIN public.assignments a ON a.id = s.assignment_id
    JOIN public.courses c     ON c.id = a.course_id
    LEFT JOIN public.subjects subj ON subj.id = c.subject_id
    LEFT JOIN public.stages   st   ON st.id   = c.stage_id
    LEFT JOIN public.profiles p    ON p.id    = s.user_id
    LEFT JOIN auth.users u         ON u.id    = s.user_id
    WHERE
      (s.status = 'submitted' OR now() > a.end_at)
      AND (v_is_admin OR s.user_id = v_user)
      AND (_course_id     IS NULL OR c.id = _course_id)
      AND (_assignment_id IS NULL OR a.id = _assignment_id)
      AND (NOT v_is_admin OR _stage_id   IS NULL OR c.stage_id   = _stage_id)
      AND (NOT v_is_admin OR _subject_id IS NULL OR c.subject_id = _subject_id)
      AND (NOT v_is_admin OR NOT _ungraded_only OR s.outcome IS NULL)
      AND (
        NOT v_is_admin OR v_search IS NULL
        OR p.full_name    ILIKE '%'||v_search||'%'
        OR u.email        ILIKE '%'||v_search||'%'
        OR p.phone_number ILIKE '%'||v_search||'%'
        OR p.student_id   ILIKE '%'||v_search||'%'
        OR (v_is_digit_id AND p.student_id = lpad(v_search, 6, '0'))
      )
  ),
  counted AS (SELECT b.*, COUNT(*) OVER () AS total_count FROM base b)
  SELECT * FROM counted
  ORDER BY submitted_at DESC NULLS LAST, submission_id DESC
  LIMIT GREATEST(COALESCE(_limit, 100), 1)
  OFFSET GREATEST(COALESCE(_offset, 0), 0);
END;
$$;