-- ============================================================================
-- Phase 71l: Admin RPCs for instructors (list + promote + permissions)
-- ============================================================================

-- 1) List instructors with their stats
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
      p.id AS instructor_id, p.full_name, p.avatar_url, p.phone_number,
      p.created_at, p.is_banned,
      (SELECT COUNT(*) FROM public.courses  WHERE created_by = p.id)::bigint AS courses_count,
      (SELECT COUNT(*) FROM public.enrollments e JOIN public.courses c ON c.id = e.course_id
        WHERE c.created_by = p.id)::bigint AS enrollments_count,
      (SELECT COUNT(*) FROM public.book_order_items oi
        JOIN public.books b ON b.id = oi.book_id
        JOIN public.book_orders o ON o.id = oi.order_id
        WHERE b.created_by = p.id AND o.status NOT IN ('pending_payment','cancelled'))::bigint AS book_sales_count,
      COALESCE((SELECT SUM(instructor_amount) FROM public.instructor_earnings
                 WHERE instructor_id = p.id AND status = 'pending'), 0)::numeric AS earnings_pending_piastres,
      COALESCE((SELECT SUM(instructor_amount) FROM public.instructor_earnings
                 WHERE instructor_id = p.id AND status = 'available'), 0)::numeric
        - COALESCE((SELECT SUM(amount_piastres) FROM public.instructor_withdrawals
                     WHERE instructor_id = p.id AND status IN ('pending','approved')), 0)::numeric
        AS earnings_available_piastres,
      COALESCE((SELECT SUM(amount_piastres) FROM public.instructor_withdrawals
                 WHERE instructor_id = p.id AND status IN ('approved','paid')), 0)::numeric AS earnings_withdrawn_piastres,
      (SELECT COUNT(*) FROM public.instructor_withdrawals
        WHERE instructor_id = p.id AND status = 'pending')::bigint AS pending_withdrawals,
      COALESCE(ip.can_create_courses, true) AS can_create_courses,
      COALESCE(ip.can_create_bundles, false) AS can_create_bundles,
      COALESCE(ip.can_create_books, false) AS can_create_books,
      COALESCE(ip.can_manage_locations, true) AS can_manage_locations,
      COALESCE(ip.can_manage_students, true) AS can_manage_students,
      ip.courses_percent_override, ip.books_percent_override
    FROM public.profiles p
    LEFT JOIN public.instructor_permissions ip ON ip.instructor_id = p.id
    WHERE p.role = 'instructor'
      AND (v_search IS NULL
           OR p.full_name ILIKE '%' || v_search || '%'
           OR p.phone_number ILIKE '%' || v_search || '%')
  ),
  counted AS (SELECT b.*, COUNT(*) OVER () AS total_count FROM base b)
  SELECT * FROM counted
  ORDER BY created_at DESC
  LIMIT GREATEST(COALESCE(_limit, 100), 1)
  OFFSET GREATEST(COALESCE(_offset, 0), 0);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_list_instructors(text, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_instructors(text, int, int) TO authenticated;

-- 2) Promote an existing profile to instructor + seed permissions
CREATE OR REPLACE FUNCTION public.admin_promote_to_instructor(
  p_user_id uuid,
  p_permissions jsonb DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL OR NOT public.has_role(v_user, 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'المستخدم غير موجود';
  END IF;
  IF p_user_id = v_user THEN
    RAISE EXCEPTION 'لا يمكنك ترقية نفسك';
  END IF;

  UPDATE public.profiles SET role = 'instructor' WHERE id = p_user_id;

  INSERT INTO public.instructor_permissions (instructor_id, updated_by)
  VALUES (p_user_id, v_user)
  ON CONFLICT (instructor_id) DO NOTHING;

  RETURN jsonb_build_object('success', true, 'instructor_id', p_user_id);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_promote_to_instructor(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_promote_to_instructor(uuid, jsonb) TO authenticated;
