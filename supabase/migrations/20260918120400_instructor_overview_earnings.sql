-- ============================================================================
-- Phase 71f: Instructor dashboard RPCs — overview, earnings, students
-- ============================================================================

-- Helper: does this instructor own this course?
CREATE OR REPLACE FUNCTION public._instructor_owns_course(p_course uuid, p_instructor uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.courses WHERE id = p_course AND created_by = p_instructor
  );
$$;

-- 1) Overview: content + earnings + students summary
CREATE OR REPLACE FUNCTION public.instructor_overview()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF v_user IS NULL OR NOT public.is_instructor(v_user) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'courses_count',       (SELECT COUNT(*) FROM public.courses  WHERE created_by = v_user),
    'bundles_count',       (SELECT COUNT(*) FROM public.bundles  WHERE created_by = v_user),
    'books_count',         (SELECT COUNT(*) FROM public.books    WHERE created_by = v_user),
    'enrollments_count',   (SELECT COUNT(*) FROM public.enrollments e
                             JOIN public.courses c ON c.id = e.course_id
                             WHERE c.created_by = v_user),
    'book_sales_count',    (SELECT COUNT(*) FROM public.book_order_items oi
                             JOIN public.books b ON b.id = oi.book_id
                             JOIN public.book_orders o ON o.id = oi.order_id
                             WHERE b.created_by = v_user AND o.status NOT IN ('pending_payment','cancelled')),
    'earnings_pending_piastres',    COALESCE((SELECT SUM(instructor_amount) FROM public.instructor_earnings WHERE instructor_id = v_user AND status = 'pending'), 0),
    'earnings_available_piastres',  public._instructor_available_balance(v_user),
    'earnings_withdrawn_piastres',  COALESCE((SELECT SUM(amount_piastres) FROM public.instructor_withdrawals WHERE instructor_id = v_user AND status IN ('approved','paid')), 0),
    'pending_withdrawals_count',    (SELECT COUNT(*) FROM public.instructor_withdrawals WHERE instructor_id = v_user AND status = 'pending'),
    'quizzes_count',       (SELECT COUNT(*) FROM public.quizzes q JOIN public.courses c ON c.id = q.course_id WHERE c.created_by = v_user),
    'assignments_count',   (SELECT COUNT(*) FROM public.assignments a JOIN public.courses c ON c.id = a.course_id WHERE c.created_by = v_user)
  ) INTO v_result;

  RETURN v_result;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.instructor_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.instructor_overview() TO authenticated;

-- 2) Earnings ledger listing
CREATE OR REPLACE FUNCTION public.instructor_earnings_list(
  _status text DEFAULT NULL,
  _limit int DEFAULT 100,
  _offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid, product_type text, course_id uuid, book_id uuid,
  course_title text, book_title text,
  gross_piastres integer, expenses_piastres integer, net_piastres integer,
  instructor_percent numeric, instructor_amount integer, admin_amount integer,
  status text, available_at timestamptz, created_at timestamptz,
  total_count bigint
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
      e.id, e.product_type, e.course_id, e.book_id,
      c.title AS course_title, b.title AS book_title,
      e.gross_piastres, e.expenses_piastres, e.net_piastres,
      e.instructor_percent, e.instructor_amount, e.admin_amount,
      e.status, e.available_at, e.created_at
    FROM public.instructor_earnings e
    LEFT JOIN public.courses c ON c.id = e.course_id
    LEFT JOIN public.books   b ON b.id = e.book_id
    WHERE e.instructor_id = v_user
      AND (_status IS NULL OR e.status = _status)
  ),
  counted AS (SELECT x.*, COUNT(*) OVER () AS total_count FROM base x)
  SELECT * FROM counted
  ORDER BY created_at DESC
  LIMIT GREATEST(COALESCE(_limit, 100), 1)
  OFFSET GREATEST(COALESCE(_offset, 0), 0);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.instructor_earnings_list(text, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.instructor_earnings_list(text, int, int) TO authenticated;
