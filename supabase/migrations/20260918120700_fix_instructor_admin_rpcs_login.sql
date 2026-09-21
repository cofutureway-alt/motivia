-- Fix instructor admin listing ambiguity and phone-login RPC permissions.

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
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
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
      p.id AS instructor_id,
      p.full_name,
      p.avatar_url,
      p.phone_number,
      p.created_at,
      p.is_banned,
      (SELECT COUNT(*)
         FROM public.courses c
        WHERE c.created_by = p.id)::bigint AS courses_count,
      (SELECT COUNT(*)
         FROM public.enrollments e
         JOIN public.courses c ON c.id = e.course_id
        WHERE c.created_by = p.id)::bigint AS enrollments_count,
      (SELECT COUNT(*)
         FROM public.book_order_items oi
         JOIN public.books b ON b.id = oi.book_id
         JOIN public.book_orders bo ON bo.id = oi.order_id
        WHERE b.created_by = p.id
          AND bo.status NOT IN ('pending_payment', 'cancelled'))::bigint AS book_sales_count,
      COALESCE((SELECT SUM(ie.instructor_amount)
                  FROM public.instructor_earnings ie
                 WHERE ie.instructor_id = p.id
                   AND ie.status = 'pending'), 0)::numeric AS earnings_pending_piastres,
      COALESCE((SELECT SUM(ie.instructor_amount)
                  FROM public.instructor_earnings ie
                 WHERE ie.instructor_id = p.id
                   AND ie.status = 'available'), 0)::numeric
        - COALESCE((SELECT SUM(iw.amount_piastres)
                      FROM public.instructor_withdrawals iw
                     WHERE iw.instructor_id = p.id
                       AND iw.status IN ('pending', 'approved')), 0)::numeric
        AS earnings_available_piastres,
      COALESCE((SELECT SUM(iw.amount_piastres)
                  FROM public.instructor_withdrawals iw
                 WHERE iw.instructor_id = p.id
                   AND iw.status IN ('approved', 'paid')), 0)::numeric AS earnings_withdrawn_piastres,
      (SELECT COUNT(*)
         FROM public.instructor_withdrawals iw
        WHERE iw.instructor_id = p.id
          AND iw.status = 'pending')::bigint AS pending_withdrawals,
      COALESCE(ip.can_create_courses, true) AS can_create_courses,
      COALESCE(ip.can_create_bundles, false) AS can_create_bundles,
      COALESCE(ip.can_create_books, false) AS can_create_books,
      COALESCE(ip.can_manage_locations, true) AS can_manage_locations,
      COALESCE(ip.can_manage_students, true) AS can_manage_students,
      ip.courses_percent_override,
      ip.books_percent_override
    FROM public.profiles p
    LEFT JOIN public.instructor_permissions ip ON ip.instructor_id = p.id
    WHERE p.role = 'instructor'
      AND (
        v_search IS NULL
        OR p.full_name ILIKE '%' || v_search || '%'
        OR p.phone_number ILIKE '%' || v_search || '%'
      )
  ),
  counted AS (
    SELECT base.*, COUNT(*) OVER () AS total_count
    FROM base
  )
  SELECT counted.*
    FROM counted
   ORDER BY counted.created_at DESC
   LIMIT GREATEST(COALESCE(_limit, 100), 1)
  OFFSET GREATEST(COALESCE(_offset, 0), 0);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_instructors(text, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_instructors(text, int, int) TO authenticated;

CREATE OR REPLACE FUNCTION public.resolve_login_email(_identifier text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id text := trim(COALESCE(_identifier, ''));
  v_email text;
BEGIN
  IF v_id ~ '^201[0125][0-9]{8}$' THEN
    SELECT p.auth_email
      INTO v_email
      FROM public.profiles p
     WHERE p.phone_number = v_id
     LIMIT 1;

    -- Existing accounts may have a real email or the canonical synthetic email.
    -- Unknown phone numbers still resolve deterministically without leaking data.
    RETURN COALESCE(v_email, v_id || '@phone.noemail.invalid');
  END IF;

  RETURN lower(v_id);
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_login_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_login_email(text) TO anon, authenticated;