-- ============================================================================
-- Phase 71h: Instructor quiz attempts listing + review + grading
-- Scoped strictly to courses owned by the calling instructor.
-- ============================================================================

-- Guard: instructor with can_manage_students may act on his own courses
CREATE OR REPLACE FUNCTION public._instructor_can_manage(p_course uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
     AND public.is_instructor(auth.uid())
     AND COALESCE((SELECT can_manage_students FROM public.instructor_permissions
                    WHERE instructor_id = auth.uid()), false)
     AND public._instructor_owns_course(p_course, auth.uid());
$$;

-- 1) List quiz attempts for his courses (same shape as admin list_quiz_attempts)
CREATE OR REPLACE FUNCTION public.instructor_list_quiz_attempts(
  _user_search text DEFAULT NULL,
  _course_id uuid DEFAULT NULL,
  _needs_review_only boolean DEFAULT false,
  _quiz_id uuid DEFAULT NULL,
  _limit int DEFAULT 100,
  _offset int DEFAULT 0
)
RETURNS TABLE(
  attempt_id uuid, quiz_id uuid, user_id uuid, student_name text, student_email text,
  course_id uuid, course_title text, quiz_title text, form_number int, attempt_number int,
  status text, percentage numeric, passed boolean, earned_points numeric, total_points numeric,
  pass_percentage int, submitted_at timestamptz, has_feedback boolean,
  feedback_given_at timestamptz, total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_search text := NULLIF(trim(COALESCE(_user_search, '')), '');
BEGIN
  IF v_user IS NULL OR NOT public.is_instructor(v_user) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  RETURN QUERY
  WITH base AS (
    SELECT
      qa.id AS attempt_id, qa.quiz_id, qa.user_id,
      COALESCE(p.full_name, '') AS student_name,
      u.email::text AS student_email,
      c.id AS course_id, c.title AS course_title,
      q.title AS quiz_title, qa.form_number, qa.attempt_number, qa.status,
      qa.percentage, qa.passed, qa.earned_points, qa.total_points,
      q.pass_percentage, qa.submitted_at,
      (qa.feedback_given_at IS NOT NULL) AS has_feedback,
      qa.feedback_given_at
    FROM public.quiz_attempts qa
    JOIN public.quizzes q ON q.id = qa.quiz_id
    JOIN public.courses c ON c.id = q.course_id AND c.created_by = v_user
    LEFT JOIN public.profiles p ON p.id = qa.user_id
    LEFT JOIN auth.users u ON u.id = qa.user_id
    WHERE qa.status <> 'in_progress'
      AND (_course_id IS NULL OR c.id = _course_id)
      AND (_quiz_id IS NULL OR q.id = _quiz_id)
      AND (NOT _needs_review_only OR qa.status = 'needs_review')
      AND (v_search IS NULL
           OR p.full_name ILIKE '%' || v_search || '%'
           OR u.email ILIKE '%' || v_search || '%')
  ),
  counted AS (SELECT b.*, COUNT(*) OVER () AS total_count FROM base b)
  SELECT * FROM counted
  ORDER BY submitted_at DESC NULLS LAST, attempt_id DESC
  LIMIT GREATEST(COALESCE(_limit, 100), 1)
  OFFSET GREATEST(COALESCE(_offset, 0), 0);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.instructor_list_quiz_attempts(text, uuid, boolean, uuid, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.instructor_list_quiz_attempts(text, uuid, boolean, uuid, int, int) TO authenticated;
