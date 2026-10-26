-- Fix: "column reference instructor_id is ambiguous" in admin_list_instructors.
-- The RETURNS TABLE output columns (instructor_id, earnings_*, pending_withdrawals ...)
-- collide with real column names used inside the scalar subqueries. Qualify every
-- inner reference with an explicit table alias and give the CTE columns distinct
-- internal names, then cast the final projection to the declared output columns.

CREATE OR REPLACE FUNCTION public.admin_list_instructors(
  _search text DEFAULT NULL,
  _limit int DEFAULT 100,
  _offset int DEFAULT 0
)
RETURNS TABLE (
  instructor_id uuid, full_name text, avatar_url text, phone_number text,
  created_at timestamptz, is_banned boolean,
  courses_count bigint, enrollments_count bigint, book_sales_count bigint,
  earnings_pending_piastres numeric, earnings_available_piastres numeric,
  earnings_withdrawn_piastres numeric, pending_withdrawals bigint,
  can_create_courses boolean, can_create_bundles boolean, can_create_books boolean,
  can_manage_locations boolean, can_manage_students boolean,
  courses_percent_override numeric, books_percent_override numeric,
  total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_search text := NULLIF(trim(COALESCE(_search, '')), '');
BEGIN
  IF v_user IS NULL OR NOT public.has_role(v_user, 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      p.id                     AS out_instructor_id,
      p.full_name              AS out_full_name,
      p.avatar_url             AS out_avatar_url,
      p.phone_number           AS out_phone_number,
      p.created_at             AS out_created_at,
      p.is_banned              AS out_is_banned,
      (SELECT COUNT(*) FROM public.courses co
        WHERE co.created_by = p.id)::bigint AS out_courses_count,
      (SELECT COUNT(*) FROM public.enrollments en
        JOIN public.courses co2 ON co2.id = en.course_id
        WHERE co2.created_by = p.id)::bigint AS out_enrollments_count,
      (SELECT COUNT(*) FROM public.book_order_items oi
        JOIN public.books bo ON bo.id = oi.book_id
        JOIN public.book_orders ord ON ord.id = oi.order_id
        WHERE bo.created_by = p.id
          AND ord.status NOT IN ('pending_payment','cancelled'))::bigint AS out_book_sales_count,
      COALESCE((SELECT SUM(ie.instructor_amount) FROM public.instructor_earnings ie
                 WHERE ie.instructor_id = p.id AND ie.status = 'pending'), 0)::numeric
        AS out_earnings_pending,
      (COALESCE((SELECT SUM(ie2.instructor_amount) FROM public.instructor_earnings ie2
                  WHERE ie2.instructor_id = p.id AND ie2.status = 'available'), 0)
        - COALESCE((SELECT SUM(iw.amount_piastres) FROM public.instructor_withdrawals iw
                     WHERE iw.instructor_id = p.id AND iw.status IN ('pending','approved')), 0))::numeric
        AS out_earnings_available,
      COALESCE((SELECT SUM(iw2.amount_piastres) FROM public.instructor_withdrawals iw2
                 WHERE iw2.instructor_id = p.id AND iw2.status IN ('approved','paid')), 0)::numeric
        AS out_earnings_withdrawn,
      (SELECT COUNT(*) FROM public.instructor_withdrawals iw3
        WHERE iw3.instructor_id = p.id AND iw3.status = 'pending')::bigint AS out_pending_withdrawals,
      COALESCE(ip.can_create_courses, true)  AS out_can_create_courses,
      COALESCE(ip.can_create_bundles, false) AS out_can_create_bundles,
      COALESCE(ip.can_create_books, false)   AS out_can_create_books,
      COALESCE(ip.can_manage_locations, true) AS out_can_manage_locations,
      COALESCE(ip.can_manage_students, true)  AS out_can_manage_students,
      ip.courses_percent_override AS out_courses_percent_override,
      ip.books_percent_override   AS out_books_percent_override
    FROM public.profiles p
    LEFT JOIN public.instructor_permissions ip ON ip.instructor_id = p.id
    WHERE p.role = 'instructor'
      AND (v_search IS NULL
           OR p.full_name ILIKE '%' || v_search || '%'
           OR p.phone_number ILIKE '%' || v_search || '%')
  ),
  counted AS (
    SELECT b.*, COUNT(*) OVER () AS out_total_count FROM base b
  )
  SELECT
    c.out_instructor_id,
    c.out_full_name,
    c.out_avatar_url,
    c.out_phone_number,
    c.out_created_at,
    c.out_is_banned,
    c.out_courses_count,
    c.out_enrollments_count,
    c.out_book_sales_count,
    c.out_earnings_pending,
    c.out_earnings_available,
    c.out_earnings_withdrawn,
    c.out_pending_withdrawals,
    c.out_can_create_courses,
    c.out_can_create_bundles,
    c.out_can_create_books,
    c.out_can_manage_locations,
    c.out_can_manage_students,
    c.out_courses_percent_override,
    c.out_books_percent_override,
    c.out_total_count
  FROM counted c
  ORDER BY c.out_created_at DESC
  LIMIT GREATEST(COALESCE(_limit, 100), 1)
  OFFSET GREATEST(COALESCE(_offset, 0), 0);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_list_instructors(text, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_instructors(text, int, int) TO authenticated;
