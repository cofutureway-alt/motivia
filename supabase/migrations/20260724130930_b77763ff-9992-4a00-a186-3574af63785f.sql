
-- Extend wallet transaction types to allow refunds
ALTER TABLE public.wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_type_check;
ALTER TABLE public.wallet_transactions
  ADD CONSTRAINT wallet_transactions_type_check CHECK (type IN (
    'card_redemption','admin_charge','admin_deduct','bulk_charge','bulk_deduct',
    'purchase','admin_reset','gateway_topup','refund'
  ));

-- 1) book_order_status_history
CREATE TABLE IF NOT EXISTS public.book_order_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.book_orders(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  changed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes text,
  notify_student boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS book_order_status_history_order_idx
  ON public.book_order_status_history(order_id, created_at DESC);

GRANT SELECT ON public.book_order_status_history TO authenticated;
GRANT ALL ON public.book_order_status_history TO service_role;
ALTER TABLE public.book_order_status_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "book_order_history_own_select" ON public.book_order_status_history;
CREATE POLICY "book_order_history_own_select" ON public.book_order_status_history
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.book_orders o
    WHERE o.id = order_id AND o.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "book_order_history_admin_select" ON public.book_order_status_history;
CREATE POLICY "book_order_history_admin_select" ON public.book_order_status_history
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 2) book_order_refund_requests
CREATE TABLE IF NOT EXISTS public.book_order_refund_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.book_orders(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_notes text
);
CREATE INDEX IF NOT EXISTS bor_refund_order_idx ON public.book_order_refund_requests(order_id);
CREATE INDEX IF NOT EXISTS bor_refund_user_idx ON public.book_order_refund_requests(user_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS bor_refund_status_idx ON public.book_order_refund_requests(status, requested_at DESC);

GRANT SELECT ON public.book_order_refund_requests TO authenticated;
GRANT ALL ON public.book_order_refund_requests TO service_role;
ALTER TABLE public.book_order_refund_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bor_refund_own_select" ON public.book_order_refund_requests;
CREATE POLICY "bor_refund_own_select" ON public.book_order_refund_requests
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "bor_refund_admin_select" ON public.book_order_refund_requests;
CREATE POLICY "bor_refund_admin_select" ON public.book_order_refund_requests
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 3) Trigger — record initial status when order is created
CREATE OR REPLACE FUNCTION public._book_order_record_initial_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.book_order_status_history(order_id, from_status, to_status, changed_by, notes, notify_student)
  VALUES (NEW.id, NULL, NEW.status, NEW.user_id, 'إنشاء الطلب', false);
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_book_order_initial_status ON public.book_orders;
CREATE TRIGGER trg_book_order_initial_status
  AFTER INSERT ON public.book_orders
  FOR EACH ROW EXECUTE FUNCTION public._book_order_record_initial_status();

-- 4) Core status-change function (used by both admin and student cancellation)
CREATE OR REPLACE FUNCTION public.change_book_order_status(
  p_order_id uuid,
  p_new_status text,
  p_notes text DEFAULT NULL,
  p_notify_student boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_is_admin boolean;
  v_o RECORD;
  v_gw RECORD;
  v_ok boolean := false;
  v_new_wallet_balance integer;
  v_wallet RECORD;
  v_wtx_ref text;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'auth required' USING ERRCODE='42501'; END IF;
  v_is_admin := public.has_role(v_actor, 'admin');

  SELECT * INTO v_o FROM public.book_orders WHERE id = p_order_id FOR UPDATE;
  IF v_o IS NULL THEN RAISE EXCEPTION 'الطلب غير موجود'; END IF;

  -- authorization: admin can change any; student only own AND only to 'cancelled' AND only from pending_payment/confirmed
  IF NOT v_is_admin THEN
    IF v_o.user_id <> v_actor THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
    IF p_new_status <> 'cancelled' THEN RAISE EXCEPTION 'لا يمكنك تنفيذ هذا الإجراء'; END IF;
    IF v_o.status NOT IN ('pending_payment','confirmed') THEN
      RAISE EXCEPTION 'لا يمكن إلغاء الطلب في حالته الحالية';
    END IF;
  END IF;

  -- Validate transition graph (also applies to admin)
  IF v_o.status = p_new_status THEN
    RAISE EXCEPTION 'الطلب في هذه الحالة بالفعل';
  END IF;

  IF (v_o.status = 'confirmed' AND p_new_status = 'shipped')
     OR (v_o.status = 'shipped'   AND p_new_status = 'delivered')
     OR (v_o.status = 'confirmed' AND p_new_status = 'cancelled')
     OR (v_o.status = 'pending_payment' AND p_new_status = 'cancelled') THEN
    v_ok := true;
  END IF;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'انتقال غير مسموح: من % إلى %', v_o.status, p_new_status;
  END IF;

  -- If moving to cancelled: restore stock for physical items
  IF p_new_status = 'cancelled' THEN
    UPDATE public.books b
       SET stock_quantity = COALESCE(b.stock_quantity,0) + oi.quantity,
           updated_at = now()
      FROM public.book_order_items oi
     WHERE oi.order_id = v_o.id
       AND oi.book_type = 'physical'
       AND b.id = oi.book_id;

    -- If paid via wallet AND order was already 'confirmed' (money was actually deducted) → refund wallet immediately
    IF v_o.status = 'confirmed' THEN
      SELECT gateway_key INTO v_gw FROM public.payment_gateways WHERE id = v_o.payment_gateway_id;
      IF v_gw.gateway_key = 'wallet' THEN
        SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_o.user_id FOR UPDATE;
        IF v_wallet IS NULL THEN
          INSERT INTO public.wallets(user_id, balance_piastres) VALUES (v_o.user_id, 0)
            RETURNING * INTO v_wallet;
        END IF;
        v_new_wallet_balance := v_wallet.balance_piastres + v_o.total_piastres;
        UPDATE public.wallets SET balance_piastres = v_new_wallet_balance, updated_at = now()
          WHERE id = v_wallet.id;
        v_wtx_ref := public._gen_txn_reference();
        INSERT INTO public.wallet_transactions
          (reference_number, wallet_id, type, amount_piastres, balance_after_piastres, performed_by, notes)
        VALUES
          (v_wtx_ref, v_wallet.id, 'refund', v_o.total_piastres, v_new_wallet_balance, v_actor,
           'استرداد قيمة الطلب ' || v_o.order_number || ' بعد الإلغاء');
      END IF;
    END IF;
  END IF;

  -- Update order + timestamp column
  UPDATE public.book_orders SET
    status = p_new_status,
    confirmed_at = CASE WHEN p_new_status = 'confirmed' THEN now() ELSE confirmed_at END,
    shipped_at   = CASE WHEN p_new_status = 'shipped'   THEN now() ELSE shipped_at END,
    delivered_at = CASE WHEN p_new_status = 'delivered' THEN now() ELSE delivered_at END,
    cancelled_at = CASE WHEN p_new_status = 'cancelled' THEN now() ELSE cancelled_at END,
    updated_at = now()
  WHERE id = v_o.id;

  INSERT INTO public.book_order_status_history(order_id, from_status, to_status, changed_by, notes, notify_student)
    VALUES (v_o.id, v_o.status, p_new_status, v_actor, NULLIF(trim(coalesce(p_notes,'')),''), coalesce(p_notify_student, true));

  RETURN jsonb_build_object('success', true, 'order_id', v_o.id, 'from', v_o.status, 'to', p_new_status);
END; $$;

REVOKE EXECUTE ON FUNCTION public.change_book_order_status(uuid, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.change_book_order_status(uuid, text, text, boolean) TO authenticated;

-- 5) Student refund request (post-delivery only)
CREATE OR REPLACE FUNCTION public.request_book_order_refund(
  p_order_id uuid,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_user uuid := auth.uid(); v_o RECORD; v_req_id uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth required' USING ERRCODE='42501'; END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'الرجاء توضيح سبب طلب الاسترجاع';
  END IF;

  SELECT * INTO v_o FROM public.book_orders WHERE id = p_order_id FOR UPDATE;
  IF v_o IS NULL THEN RAISE EXCEPTION 'الطلب غير موجود'; END IF;
  IF v_o.user_id <> v_user THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  IF v_o.status <> 'delivered' THEN
    RAISE EXCEPTION 'يمكن طلب الاسترجاع فقط بعد تسليم الطلب';
  END IF;

  -- Prevent duplicate pending requests
  IF EXISTS (SELECT 1 FROM public.book_order_refund_requests
             WHERE order_id = p_order_id AND status = 'pending') THEN
    RAISE EXCEPTION 'يوجد طلب استرجاع قيد المراجعة بالفعل';
  END IF;

  INSERT INTO public.book_order_refund_requests(order_id, user_id, reason)
    VALUES (p_order_id, v_user, trim(p_reason))
    RETURNING id INTO v_req_id;

  UPDATE public.book_orders SET status = 'refund_requested', updated_at = now()
    WHERE id = p_order_id;
  INSERT INTO public.book_order_status_history(order_id, from_status, to_status, changed_by, notes, notify_student)
    VALUES (p_order_id, 'delivered', 'refund_requested', v_user, 'طلب استرجاع من الطالب: ' || trim(p_reason), false);

  RETURN jsonb_build_object('success', true, 'request_id', v_req_id);
END; $$;

REVOKE EXECUTE ON FUNCTION public.request_book_order_refund(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_book_order_refund(uuid, text) TO authenticated;

-- 6) Admin list function (with filters + search)
CREATE OR REPLACE FUNCTION public.admin_list_book_orders(
  p_status text DEFAULT NULL,
  p_gateway_key text DEFAULT NULL,
  p_shipping_zone_id uuid DEFAULT NULL,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_search text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_actor uuid := auth.uid(); v_rows jsonb; v_counts jsonb;
BEGIN
  IF NOT public.has_role(v_actor, 'admin') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;

  SELECT COALESCE(jsonb_agg(row ORDER BY (row->>'created_at') DESC), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT jsonb_build_object(
      'id', o.id,
      'order_number', o.order_number,
      'status', o.status,
      'total_piastres', o.total_piastres,
      'has_physical_items', o.has_physical_items,
      'created_at', o.created_at,
      'confirmed_at', o.confirmed_at,
      'shipped_at', o.shipped_at,
      'delivered_at', o.delivered_at,
      'cancelled_at', o.cancelled_at,
      'user_id', o.user_id,
      'student_name', p.full_name,
      'student_phone', p.phone,
      'student_id_code', p.student_id_code,
      'gateway_key', g.gateway_key,
      'gateway_display_name', g.display_name,
      'shipping_zone_id', o.shipping_zone_id,
      'shipping_zone_name', z.name,
      'items_count', (SELECT COALESCE(SUM(oi.quantity),0) FROM public.book_order_items oi WHERE oi.order_id = o.id)
    ) AS row
    FROM public.book_orders o
    JOIN public.profiles p ON p.id = o.user_id
    JOIN public.payment_gateways g ON g.id = o.payment_gateway_id
    LEFT JOIN public.shipping_zones z ON z.id = o.shipping_zone_id
    WHERE (p_status IS NULL OR o.status = p_status)
      AND (p_gateway_key IS NULL OR g.gateway_key = p_gateway_key)
      AND (p_shipping_zone_id IS NULL OR o.shipping_zone_id = p_shipping_zone_id)
      AND (p_from IS NULL OR o.created_at >= p_from)
      AND (p_to IS NULL OR o.created_at <= p_to)
      AND (
        p_search IS NULL OR length(trim(p_search)) = 0
        OR o.order_number ILIKE '%' || p_search || '%'
        OR p.full_name ILIKE '%' || p_search || '%'
        OR COALESCE(p.phone, '') ILIKE '%' || p_search || '%'
      )
  ) s;

  SELECT jsonb_build_object(
    'pending_payment', COUNT(*) FILTER (WHERE status='pending_payment'),
    'confirmed',      COUNT(*) FILTER (WHERE status='confirmed'),
    'shipped',        COUNT(*) FILTER (WHERE status='shipped'),
    'delivered',      COUNT(*) FILTER (WHERE status='delivered'),
    'cancelled',      COUNT(*) FILTER (WHERE status='cancelled'),
    'refund_requested', COUNT(*) FILTER (WHERE status='refund_requested'),
    'refunded',       COUNT(*) FILTER (WHERE status='refunded'),
    'total',          COUNT(*)
  ) INTO v_counts FROM public.book_orders;

  RETURN jsonb_build_object('rows', v_rows, 'counts', v_counts);
END; $$;

REVOKE EXECUTE ON FUNCTION public.admin_list_book_orders(text, text, uuid, timestamptz, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_book_orders(text, text, uuid, timestamptz, timestamptz, text) TO authenticated;

-- 7) Full detail with history + student + items (admin OR owner)
CREATE OR REPLACE FUNCTION public.get_book_order_full(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_o RECORD; v_gw RECORD; v_zone RECORD;
  v_items jsonb; v_history jsonb; v_student jsonb; v_refund jsonb;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth required' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_o FROM public.book_orders WHERE id = p_order_id;
  IF v_o IS NULL THEN RETURN NULL; END IF;
  IF v_o.user_id <> v_user AND NOT public.has_role(v_user, 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;

  SELECT gateway_key, display_name INTO v_gw FROM public.payment_gateways WHERE id = v_o.payment_gateway_id;
  IF v_o.shipping_zone_id IS NOT NULL THEN
    SELECT name INTO v_zone FROM public.shipping_zones WHERE id = v_o.shipping_zone_id;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', oi.id, 'book_id', oi.book_id, 'book_type', oi.book_type,
    'quantity', oi.quantity, 'unit_price_piastres', oi.unit_price_piastres,
    'title', b.title, 'author', b.author, 'cover_image_url', b.cover_image_url
  ) ORDER BY oi.created_at), '[]'::jsonb) INTO v_items
  FROM public.book_order_items oi
  JOIN public.books b ON b.id = oi.book_id
  WHERE oi.order_id = p_order_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', h.id, 'from_status', h.from_status, 'to_status', h.to_status,
    'notes', h.notes, 'created_at', h.created_at, 'notify_student', h.notify_student,
    'changed_by_name', p.full_name
  ) ORDER BY h.created_at), '[]'::jsonb) INTO v_history
  FROM public.book_order_status_history h
  LEFT JOIN public.profiles p ON p.id = h.changed_by
  WHERE h.order_id = p_order_id;

  SELECT jsonb_build_object(
    'id', p.id, 'full_name', p.full_name, 'phone', p.phone, 'email', p.email,
    'student_id_code', p.student_id_code
  ) INTO v_student FROM public.profiles p WHERE p.id = v_o.user_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', r.id, 'reason', r.reason, 'status', r.status,
    'requested_at', r.requested_at, 'reviewed_at', r.reviewed_at,
    'review_notes', r.review_notes
  ) ORDER BY r.requested_at DESC), '[]'::jsonb) INTO v_refund
  FROM public.book_order_refund_requests r WHERE r.order_id = p_order_id;

  RETURN jsonb_build_object(
    'id', v_o.id, 'order_number', v_o.order_number, 'status', v_o.status,
    'has_physical_items', v_o.has_physical_items,
    'shipping_address', v_o.shipping_address,
    'shipping_zone_name', v_zone.name,
    'shipping_cost_piastres', v_o.shipping_cost_piastres,
    'items_subtotal_piastres', v_o.items_subtotal_piastres,
    'total_piastres', v_o.total_piastres,
    'gateway_key', v_gw.gateway_key, 'gateway_display_name', v_gw.display_name,
    'created_at', v_o.created_at,
    'confirmed_at', v_o.confirmed_at, 'shipped_at', v_o.shipped_at,
    'delivered_at', v_o.delivered_at, 'cancelled_at', v_o.cancelled_at,
    'items', v_items, 'history', v_history, 'student', v_student,
    'refund_requests', v_refund
  );
END; $$;

REVOKE EXECUTE ON FUNCTION public.get_book_order_full(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_book_order_full(uuid) TO authenticated;

-- 8) Student list of own orders
CREATE OR REPLACE FUNCTION public.list_my_book_orders()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_user uuid := auth.uid(); v_rows jsonb;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth required' USING ERRCODE='42501'; END IF;
  SELECT COALESCE(jsonb_agg(row ORDER BY (row->>'created_at') DESC), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT jsonb_build_object(
      'id', o.id, 'order_number', o.order_number, 'status', o.status,
      'total_piastres', o.total_piastres, 'has_physical_items', o.has_physical_items,
      'created_at', o.created_at,
      'gateway_key', g.gateway_key, 'gateway_display_name', g.display_name,
      'items_count', (SELECT COALESCE(SUM(oi.quantity),0) FROM public.book_order_items oi WHERE oi.order_id = o.id),
      'items_preview', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'title', b.title, 'quantity', oi.quantity
        )), '[]'::jsonb)
        FROM public.book_order_items oi
        JOIN public.books b ON b.id = oi.book_id
        WHERE oi.order_id = o.id
      )
    ) AS row
    FROM public.book_orders o
    JOIN public.payment_gateways g ON g.id = o.payment_gateway_id
    WHERE o.user_id = v_user
  ) s;
  RETURN v_rows;
END; $$;

REVOKE EXECUTE ON FUNCTION public.list_my_book_orders() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_book_orders() TO authenticated;
