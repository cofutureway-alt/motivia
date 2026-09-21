-- Final fix for PL/pgSQL output-column ambiguity in instructor admin RPCs.

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
      p.id AS instructor_id,
      p.full_name,
      p.avatar_url,
      p.phone_number,
      p.created_at,
      p.is_banned,
      (SELECT COUNT(*) FROM public.courses c
        WHERE c.created_by = p.id)::bigint AS courses_count,
      (SELECT COUNT(*)
         FROM public.enrollments e
         JOIN public.courses ec ON ec.id = e.course_id
        WHERE ec.created_by = p.id)::bigint AS enrollments_count,
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
      AND (v_search IS NULL
        OR p.full_name ILIKE '%' || v_search || '%'
        OR p.phone_number ILIKE '%' || v_search || '%')
  ),
  counted AS (
    SELECT b.*, COUNT(*) OVER ()::bigint AS total_count
    FROM base b
  )
  SELECT
    c.instructor_id,
    c.full_name,
    c.avatar_url,
    c.phone_number,
    c.created_at,
    c.is_banned,
    c.courses_count,
    c.enrollments_count,
    c.book_sales_count,
    c.earnings_pending_piastres,
    c.earnings_available_piastres,
    c.earnings_withdrawn_piastres,
    c.pending_withdrawals,
    c.can_create_courses,
    c.can_create_bundles,
    c.can_create_books,
    c.can_manage_locations,
    c.can_manage_students,
    c.courses_percent_override,
    c.books_percent_override,
    c.total_count
  FROM counted c
  ORDER BY c.created_at DESC
  LIMIT GREATEST(COALESCE(_limit, 100), 1)
  OFFSET GREATEST(COALESCE(_offset, 0), 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_withdrawals(
  _status text DEFAULT NULL,
  _instructor_id uuid DEFAULT NULL,
  _limit int DEFAULT 100,
  _offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid, instructor_id uuid, instructor_name text, avatar_url text,
  amount_piastres integer, method_key text, payout_method_id uuid,
  payout_details jsonb, status text, admin_note text,
  rejection_reason text, proof_url text,
  processed_by uuid, processed_at timestamptz, created_at timestamptz,
  total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL OR NOT public.has_role(v_caller, 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      w.id,
      w.instructor_id,
      p.full_name AS instructor_name,
      p.avatar_url,
      w.amount_piastres,
      w.method_key,
      w.payout_method_id,
      w.payout_details,
      w.status,
      w.admin_note,
      w.rejection_reason,
      w.proof_url,
      w.processed_by,
      w.processed_at,
      w.created_at
    FROM public.instructor_withdrawals w
    LEFT JOIN public.profiles p ON p.id = w.instructor_id
    WHERE (_status IS NULL OR w.status = _status)
      AND (_instructor_id IS NULL OR w.instructor_id = _instructor_id)
  ),
  counted AS (
    SELECT b.*, COUNT(*) OVER ()::bigint AS total_count
    FROM base b
  )
  SELECT
    c.id,
    c.instructor_id,
    c.instructor_name,
    c.avatar_url,
    c.amount_piastres,
    c.method_key,
    c.payout_method_id,
    c.payout_details,
    c.status,
    c.admin_note,
    c.rejection_reason,
    c.proof_url,
    c.processed_by,
    c.processed_at,
    c.created_at,
    c.total_count
  FROM counted c
  ORDER BY c.created_at DESC
  LIMIT GREATEST(COALESCE(_limit, 100), 1)
  OFFSET GREATEST(COALESCE(_offset, 0), 0);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_instructors(text, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_instructors(text, int, int) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_list_withdrawals(text, uuid, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_withdrawals(text, uuid, int, int) TO authenticated;