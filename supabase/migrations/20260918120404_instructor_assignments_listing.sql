-- ============================================================================
-- Phase 71j: Instructor assignments listing
-- ============================================================================

CREATE OR REPLACE FUNCTION public.instructor_list_assignment_submissions(
  _user_search text DEFAULT NULL,
  _course_id uuid DEFAULT NULL,
  _ungraded_only boolean DEFAULT false,
  _assignment_id uuid DEFAULT NULL,
  _limit integer DEFAULT 100,
  _offset integer DEFAULT 0
)
RETURNS TABLE(
  submission_id uuid, assignment_id uuid, user_id uuid,
  student_name text, student_email text, student_phone text, student_student_id text,
  course_id uuid, course_title text,
  subject_id uuid, subject_name text, stage_id uuid, stage_name text,
  assignment_title text,
  total_grade numeric, pass_grade numeric, end_at timestamptz,
  status text, submitted_at timestamptz,
  grade numeric, outcome text, computed_outcome text,
  has_feedback boolean, feedback_given_at timestamptz,
  graded_at timestamptz, total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_search text := NULLIF(trim(COALESCE(_user_search,'')), '');
  v_is_digit_id boolean := v_search IS NOT NULL AND v_search ~ '^[0-9]{1,6}$';
BEGIN
  IF v_user IS NULL OR NOT public.is_instructor(v_user) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  RETURN QUERY
  WITH base AS (
    SELECT
      s.id AS submission_id, s.assignment_id, s.user_id,
      COALESCE(p.full_name, '') AS student_name,
      u.email::text AS student_email,
      p.phone_number AS student_phone, p.student_id AS student_student_id,
      c.id AS course_id, c.title AS course_title,
      subj.id AS subject_id, subj.name AS subject_name,
      st.id AS stage_id, st.name AS stage_name,
      a.title AS assignment_title,
      a.total_grade, a.pass_grade, a.end_at,
      s.status, s.submitted_at, s.grade, s.outcome,
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
    JOIN public.courses c ON c.id = a.course_id AND c.created_by = v_user
    LEFT JOIN public.subjects subj ON subj.id = c.subject_id
    LEFT JOIN public.stages st ON st.id = c.stage_id
    LEFT JOIN public.profiles p ON p.id = s.user_id
    LEFT JOIN auth.users u ON u.id = s.user_id
    WHERE (_course_id IS NULL OR c.id = _course_id)
      AND (_assignment_id IS NULL OR a.id = _assignment_id)
      AND (NOT _ungraded_only OR (s.status = 'submitted' AND s.grade IS NULL))
      AND (
        v_search IS NULL
        OR p.full_name ILIKE '%' || v_search || '%'
        OR u.email ILIKE '%' || v_search || '%'
        OR (v_is_digit_id AND p.student_id = v_search)
      )
  ),
  counted AS (SELECT b.*, COUNT(*) OVER () AS total_count FROM base b)
  SELECT * FROM counted
  ORDER BY submitted_at DESC NULLS LAST, submission_id DESC
  LIMIT GREATEST(COALESCE(_limit, 100), 1)
  OFFSET GREATEST(COALESCE(_offset, 0), 0);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.instructor_list_assignment_submissions(text, uuid, boolean, uuid, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.instructor_list_assignment_submissions(text, uuid, boolean, uuid, int, int) TO authenticated;
