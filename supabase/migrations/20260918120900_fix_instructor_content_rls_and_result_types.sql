-- Instructor content safety and RPC result-shape fixes.

ALTER TABLE public.instructor_earnings
  ADD COLUMN IF NOT EXISTS bundle_id uuid REFERENCES public.bundles(id) ON DELETE SET NULL;

-- Units: allow an instructor to manage units only for courses they own.
DROP POLICY IF EXISTS units_select_instructor ON public.units;
DROP POLICY IF EXISTS units_insert_instructor ON public.units;
DROP POLICY IF EXISTS units_update_instructor ON public.units;
DROP POLICY IF EXISTS units_delete_instructor ON public.units;

CREATE POLICY units_select_instructor ON public.units FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public._instructor_owns_course(course_id, auth.uid())
  );

CREATE POLICY units_insert_instructor ON public.units FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR (
      public.has_role(auth.uid(), 'instructor')
      AND public._instructor_owns_course(course_id, auth.uid())
    )
  );

CREATE POLICY units_update_instructor ON public.units FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR (
      public.has_role(auth.uid(), 'instructor')
      AND public._instructor_owns_course(course_id, auth.uid())
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR (
      public.has_role(auth.uid(), 'instructor')
      AND public._instructor_owns_course(course_id, auth.uid())
    )
  );

CREATE POLICY units_delete_instructor ON public.units FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR (
      public.has_role(auth.uid(), 'instructor')
      AND public._instructor_owns_course(course_id, auth.uid())
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.units TO authenticated;

-- Instructor students list: explicit projection avoids RETURNS TABLE name collisions.
CREATE OR REPLACE FUNCTION public.instructor_list_students(
  _search text DEFAULT NULL,
  _limit int DEFAULT 100,
  _offset int DEFAULT 0
)
RETURNS TABLE (
  user_id uuid, full_name text, avatar_url text, phone_number text,
  student_id text, is_banned boolean, enrolled_courses bigint,
  created_at timestamptz, total_count bigint
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
  IF NOT COALESCE((SELECT ip.can_manage_students FROM public.instructor_permissions ip WHERE ip.instructor_id = v_user), false) THEN
    RAISE EXCEPTION 'غير مصرح لك بإدارة الطلاب' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      p.id AS user_id,
      p.full_name,
      p.avatar_url,
      p.phone_number,
      p.student_id,
      p.is_banned,
      COUNT(DISTINCT e.course_id)::bigint AS enrolled_courses,
      p.created_at
    FROM public.enrollments e
    JOIN public.courses c ON c.id = e.course_id AND c.created_by = v_user
    JOIN public.profiles p ON p.id = e.user_id
    WHERE v_search IS NULL
       OR p.full_name ILIKE '%' || v_search || '%'
       OR p.phone_number ILIKE '%' || v_search || '%'
       OR p.student_id ILIKE '%' || v_search || '%'
    GROUP BY p.id, p.full_name, p.avatar_url, p.phone_number, p.student_id, p.is_banned, p.created_at
  ),
  counted AS (
    SELECT b.*, COUNT(*) OVER ()::bigint AS total_count
    FROM base b
  )
  SELECT
    c.user_id, c.full_name, c.avatar_url, c.phone_number, c.student_id,
    c.is_banned, c.enrolled_courses, c.created_at, c.total_count
  FROM counted c
  ORDER BY c.created_at DESC
  LIMIT GREATEST(COALESCE(_limit, 100), 1)
  OFFSET GREATEST(COALESCE(_offset, 0), 0);
END;
$$;

-- Instructor earnings list: explicit projection avoids result-type mismatches.
CREATE OR REPLACE FUNCTION public.instructor_earnings_list(
  _status text DEFAULT NULL,
  _limit int DEFAULT 100,
  _offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid, product_type text, course_id uuid, book_id uuid,
  bundle_id uuid,
  course_title text, book_title text, gross_piastres integer,
  expenses_piastres integer, net_piastres integer, instructor_percent numeric,
  instructor_amount integer, admin_amount integer, status text,
  available_at timestamptz, created_at timestamptz, total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL OR NOT public.is_instructor(v_user) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      e.id, e.product_type, e.course_id, e.book_id, e.bundle_id,
      c.title AS course_title, b.title AS book_title,
      e.gross_piastres, e.expenses_piastres, e.net_piastres,
      e.instructor_percent, e.instructor_amount, e.admin_amount,
      e.status, e.available_at, e.created_at
    FROM public.instructor_earnings e
    LEFT JOIN public.courses c ON c.id = e.course_id
    LEFT JOIN public.books b ON b.id = e.book_id
    WHERE e.instructor_id = v_user
      AND (_status IS NULL OR e.status = _status)
  ),
  counted AS (
    SELECT b.*, COUNT(*) OVER ()::bigint AS total_count
    FROM base b
  )
  SELECT
    x.id, x.product_type, x.course_id, x.book_id, x.bundle_id, x.course_title, x.book_title,
    x.gross_piastres, x.expenses_piastres, x.net_piastres, x.instructor_percent,
    x.instructor_amount, x.admin_amount, x.status, x.available_at,
    x.created_at, x.total_count
  FROM counted x
  ORDER BY x.created_at DESC
  LIMIT GREATEST(COALESCE(_limit, 100), 1)
  OFFSET GREATEST(COALESCE(_offset, 0), 0);
END;
$$;

REVOKE ALL ON FUNCTION public.instructor_list_students(text, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.instructor_list_students(text, int, int) TO authenticated;
REVOKE ALL ON FUNCTION public.instructor_earnings_list(text, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.instructor_earnings_list(text, int, int) TO authenticated;