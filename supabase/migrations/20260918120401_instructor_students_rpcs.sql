-- ============================================================================
-- Phase 71g: Instructor student-management RPCs
-- ============================================================================

-- 1) Instructor's students (enrolled in his courses)
CREATE OR REPLACE FUNCTION public.instructor_list_students(
  _search text DEFAULT NULL,
  _limit int DEFAULT 100,
  _offset int DEFAULT 0
)
RETURNS TABLE (
  user_id uuid, full_name text, avatar_url text, phone_number text,
  student_id text, is_banned boolean,
  enrolled_courses bigint, created_at timestamptz, total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_search text := NULLIF(trim(COALESCE(_search, '')), '');
BEGIN
  IF v_user IS NULL OR NOT public.is_instructor(v_user) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT COALESCE((SELECT can_manage_students FROM public.instructor_permissions WHERE instructor_id = v_user), false) THEN
    RAISE EXCEPTION 'غير مصرح لك بإدارة الطلاب' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH base AS (
    SELECT
      p.id AS user_id, p.full_name, p.avatar_url, p.phone_number,
      p.student_id, p.is_banned, p.created_at,
      COUNT(DISTINCT e.course_id) AS enrolled_courses
    FROM public.enrollments e
    JOIN public.courses c ON c.id = e.course_id AND c.created_by = v_user
    JOIN public.profiles p ON p.id = e.user_id
    WHERE (v_search IS NULL
           OR p.full_name ILIKE '%' || v_search || '%'
           OR p.phone_number ILIKE '%' || v_search || '%'
           OR p.student_id ILIKE '%' || v_search || '%')
    GROUP BY p.id
  ),
  counted AS (SELECT s.*, COUNT(*) OVER () AS total_count FROM base s)
  SELECT * FROM counted
  ORDER BY created_at DESC
  LIMIT GREATEST(COALESCE(_limit, 100), 1)
  OFFSET GREATEST(COALESCE(_offset, 0), 0);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.instructor_list_students(text, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.instructor_list_students(text, int, int) TO authenticated;

-- 2) Instructor edits a student's basic data (name/phone only, his students only)
CREATE OR REPLACE FUNCTION public.instructor_update_student(
  p_student uuid, p_full_name text DEFAULT NULL, p_phone_number text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_owned boolean;
BEGIN
  IF v_user IS NULL OR NOT public.is_instructor(v_user) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT COALESCE((SELECT can_manage_students FROM public.instructor_permissions WHERE instructor_id = v_user), false) THEN
    RAISE EXCEPTION 'غير مصرح لك بإدارة الطلاب' USING ERRCODE = '42501';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.enrollments e
    JOIN public.courses c ON c.id = e.course_id AND c.created_by = v_user
    WHERE e.user_id = p_student
  ) INTO v_owned;
  IF NOT v_owned THEN
    RAISE EXCEPTION 'هذا الطالب غير مسجل في كورساتك' USING ERRCODE = '42501';
  END IF;
  UPDATE public.profiles
     SET full_name = COALESCE(p_full_name, full_name),
         phone_number = COALESCE(p_phone_number, phone_number)
   WHERE id = p_student;
  RETURN jsonb_build_object('success', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.instructor_update_student(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.instructor_update_student(uuid, text, text) TO authenticated;

-- 3) Top students by total points (his students only)
CREATE OR REPLACE FUNCTION public.instructor_top_students(_limit int DEFAULT 10)
RETURNS TABLE (user_id uuid, full_name text, avatar_url text, total_points bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.id, p.full_name, p.avatar_url,
         COALESCE(lb.total_points, 0)::bigint AS total_points
  FROM (
    SELECT DISTINCT e.user_id
    FROM public.enrollments e
    JOIN public.courses c ON c.id = e.course_id AND c.created_by = auth.uid()
  ) mine
  JOIN public.profiles p ON p.id = mine.user_id
  LEFT JOIN LATERAL (
    SELECT GREATEST(COALESCE(SUM(points_delta), 0), 0) AS total_points
    FROM public.points_ledger WHERE student_id = p.id
  ) lb ON true
  ORDER BY total_points DESC
  LIMIT GREATEST(COALESCE(_limit, 10), 1);
$$;
REVOKE EXECUTE ON FUNCTION public.instructor_top_students(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.instructor_top_students(int) TO authenticated;
