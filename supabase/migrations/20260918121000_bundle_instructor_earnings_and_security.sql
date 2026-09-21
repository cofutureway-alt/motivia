-- Bundle ownership/security and instructor bundle earnings.

CREATE OR REPLACE FUNCTION public.get_public_content_publishers(_user_ids uuid[])
RETURNS TABLE (id uuid, full_name text, avatar_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.id, p.full_name, p.avatar_url
  FROM public.profiles p
  WHERE p.id = ANY(COALESCE(_user_ids, ARRAY[]::uuid[]))
    AND p.role IN ('instructor'::public.app_role, 'admin'::public.app_role);
$$;

GRANT EXECUTE ON FUNCTION public.get_public_content_publishers(uuid[]) TO anon, authenticated;

ALTER TABLE public.instructor_earnings
  DROP CONSTRAINT IF EXISTS instructor_earnings_product_type_check;

ALTER TABLE public.instructor_earnings
  ADD COLUMN IF NOT EXISTS bundle_id uuid REFERENCES public.bundles(id) ON DELETE SET NULL;

ALTER TABLE public.instructor_earnings
  ADD CONSTRAINT instructor_earnings_product_type_check
  CHECK (product_type IN ('course', 'book', 'bundle'));

ALTER TABLE public.revenue_split_settings
  ADD COLUMN IF NOT EXISTS bundles_instructor_percent numeric(5,2) NOT NULL DEFAULT 50.00
  CHECK (bundles_instructor_percent >= 0 AND bundles_instructor_percent <= 100);

-- Only admins or the bundle owner can manage a bundle.
DROP POLICY IF EXISTS bundles_insert_admin ON public.bundles;
DROP POLICY IF EXISTS bundles_update_admin ON public.bundles;
DROP POLICY IF EXISTS bundles_delete_admin ON public.bundles;
DROP POLICY IF EXISTS bundles_insert_instructor ON public.bundles;
DROP POLICY IF EXISTS bundles_update_instructor ON public.bundles;
DROP POLICY IF EXISTS bundles_delete_instructor ON public.bundles;

CREATE POLICY bundles_insert_admin ON public.bundles FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY bundles_update_admin ON public.bundles FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY bundles_delete_admin ON public.bundles FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY bundles_insert_instructor ON public.bundles FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'instructor')
    AND created_by = auth.uid()
  );
CREATE POLICY bundles_update_instructor ON public.bundles FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'instructor') AND created_by = auth.uid())
  WITH CHECK (public.has_role(auth.uid(), 'instructor') AND created_by = auth.uid());
CREATE POLICY bundles_delete_instructor ON public.bundles FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'instructor') AND created_by = auth.uid());

DROP POLICY IF EXISTS bundle_courses_write_admin ON public.bundle_courses;
DROP POLICY IF EXISTS bundle_courses_write_owner ON public.bundle_courses;
CREATE POLICY bundle_courses_write_owner ON public.bundle_courses FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.bundles b
      WHERE b.id = bundle_id AND b.created_by = auth.uid()
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR (
      EXISTS (
        SELECT 1 FROM public.bundles b
        WHERE b.id = bundle_id AND b.created_by = auth.uid()
      )
      AND EXISTS (
        SELECT 1 FROM public.courses c
        WHERE c.id = course_id AND c.created_by = auth.uid()
      )
    )
  );

CREATE OR REPLACE FUNCTION public._instructor_effective_percent(
  p_instructor uuid, p_type text
) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(
    CASE
      WHEN p_type = 'course' THEN ip.courses_percent_override
      WHEN p_type = 'book' THEN ip.books_percent_override
      ELSE NULL
    END,
    CASE
      WHEN p_type = 'course' THEN rs.courses_instructor_percent
      WHEN p_type = 'book' THEN rs.books_instructor_percent
      ELSE rs.bundles_instructor_percent
    END,
    0
  )
  FROM public.revenue_split_settings rs
  LEFT JOIN public.instructor_permissions ip ON ip.instructor_id = p_instructor
  WHERE rs.id = 1;
$$;

CREATE OR REPLACE FUNCTION public._insert_instructor_bundle_earning(
  p_txn_id uuid, p_bundle_id uuid, p_instructor uuid,
  p_gross integer, p_completed timestamptz
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_pct numeric;
  v_exp integer;
  v_net integer;
  v_in_amt integer;
  v_adm_amt integer;
  v_settings RECORD;
BEGIN
  SELECT * INTO v_settings FROM public.revenue_split_settings WHERE id = 1;
  IF v_settings IS NULL OR NOT v_settings.is_enabled THEN RETURN; END IF;
  IF NOT public.is_instructor(p_instructor) THEN RETURN; END IF;
  v_pct := public._instructor_effective_percent(p_instructor, 'bundle');
  PERFORM public._compute_instructor_split(p_gross, v_pct, v_settings.expenses,
    v_exp, v_net, v_in_amt, v_adm_amt);

  INSERT INTO public.instructor_earnings (
    instructor_id, payment_txn_id, product_type, bundle_id,
    gross_piastres, expenses_piastres, net_piastres,
    instructor_percent, instructor_amount, admin_amount,
    status, available_at, created_at
  ) VALUES (
    p_instructor, p_txn_id, 'bundle', p_bundle_id,
    p_gross, v_exp, v_net, v_pct, v_in_amt, v_adm_amt,
    'pending', COALESCE(p_completed, now()) + (v_settings.hold_days || ' days')::interval,
    now()
  )
  ON CONFLICT DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_payment_txn_earnings()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_course_owner uuid;
  v_bundle_owner uuid;
  v_item RECORD;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS DISTINCT FROM 'success' THEN RETURN NEW; END IF;
  ELSE
    IF NEW.status IS DISTINCT FROM 'success' OR OLD.status IS NOT DISTINCT FROM 'success' THEN
      RETURN NEW;
    END IF;
  END IF;

  IF NEW.purpose = 'course_purchase' AND NEW.course_id IS NOT NULL THEN
    SELECT c.created_by INTO v_course_owner FROM public.courses c WHERE c.id = NEW.course_id;
    IF v_course_owner IS NOT NULL THEN
      PERFORM public._insert_instructor_earning(
        NEW.id, 'course', NEW.course_id, NULL, v_course_owner,
        COALESCE(NEW.amount_piastres, 0), now());
    END IF;
  ELSIF NEW.purpose = 'bundle_purchase' AND NEW.bundle_id IS NOT NULL THEN
    SELECT b.created_by INTO v_bundle_owner FROM public.bundles b WHERE b.id = NEW.bundle_id;
    IF v_bundle_owner IS NOT NULL THEN
      PERFORM public._insert_instructor_bundle_earning(
        NEW.id, NEW.bundle_id, v_bundle_owner,
        COALESCE(NEW.amount_piastres, 0), now());
    END IF;
  ELSIF NEW.purpose = 'book_order' AND NEW.book_order_id IS NOT NULL THEN
    FOR v_item IN
      SELECT oi.book_id, (oi.unit_price_piastres * oi.quantity)::integer AS gross,
             b.created_by
      FROM public.book_order_items oi
      JOIN public.books b ON b.id = oi.book_id
      WHERE oi.order_id = NEW.book_order_id
    LOOP
      IF v_item.created_by IS NOT NULL THEN
        PERFORM public._insert_instructor_earning(
          NEW.id, 'book', NULL, v_item.book_id, v_item.created_by,
          v_item.gross, now());
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public._insert_instructor_bundle_earning(uuid, uuid, uuid, integer, timestamptz) FROM PUBLIC;