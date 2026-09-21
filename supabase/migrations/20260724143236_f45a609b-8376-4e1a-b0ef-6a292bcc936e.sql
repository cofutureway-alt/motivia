
-- 1) Extend book_order_refund_requests
ALTER TABLE public.book_order_refund_requests
  DROP CONSTRAINT IF EXISTS book_order_refund_requests_status_check;
ALTER TABLE public.book_order_refund_requests
  ADD CONSTRAINT book_order_refund_requests_status_check
  CHECK (status IN ('pending','approved','rejected','processing','completed'));

ALTER TABLE public.book_order_refund_requests
  ADD COLUMN IF NOT EXISTS refund_method text
    CHECK (refund_method IS NULL OR refund_method IN
      ('wallet_credit','kashier_api','paymob_api','fawaterak_manual','manual_external'));
ALTER TABLE public.book_order_refund_requests
  ADD COLUMN IF NOT EXISTS processed_at timestamptz;
ALTER TABLE public.book_order_refund_requests
  ADD COLUMN IF NOT EXISTS gateway_refund_reference text;
ALTER TABLE public.book_order_refund_requests
  ADD COLUMN IF NOT EXISTS processing_error text;

-- 2) Add classic_api_key possibility to paymob config (jsonb column, no schema change needed).
--    Documented for PayMob refund calls which authenticate via classic /api/auth/tokens.

-- 3) Admin list of refund requests (all statuses, with filters)
CREATE OR REPLACE FUNCTION public.admin_list_refund_requests(
  p_status text DEFAULT NULL,
  p_search text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_actor uuid := auth.uid(); v_rows jsonb; v_counts jsonb;
BEGIN
  IF NOT public.has_role(v_actor, 'admin') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;

  SELECT COALESCE(jsonb_agg(row ORDER BY (row->>'requested_at') DESC), '[]'::jsonb) INTO v_rows FROM (
    SELECT jsonb_build_object(
      'id', r.id, 'order_id', o.id, 'order_number', o.order_number,
      'status', r.status, 'refund_method', r.refund_method,
      'reason', r.reason, 'requested_at', r.requested_at,
      'reviewed_at', r.reviewed_at, 'reviewed_by_name', rp.full_name,
      'review_notes', r.review_notes,
      'processed_at', r.processed_at,
      'gateway_refund_reference', r.gateway_refund_reference,
      'processing_error', r.processing_error,
      'total_piastres', o.total_piastres,
      'order_status', o.status,
      'gateway_key', g.gateway_key,
      'gateway_display_name', g.display_name,
      'student_id', p.id, 'student_name', p.full_name,
      'student_phone', p.phone_number, 'student_id_code', p.student_id
    ) AS row
    FROM public.book_order_refund_requests r
    JOIN public.book_orders o ON o.id = r.order_id
    JOIN public.profiles p ON p.id = r.user_id
    JOIN public.payment_gateways g ON g.id = o.payment_gateway_id
    LEFT JOIN public.profiles rp ON rp.id = r.reviewed_by
    WHERE (p_status IS NULL OR r.status = p_status)
      AND (
        p_search IS NULL OR length(trim(p_search)) = 0
        OR o.order_number ILIKE '%' || p_search || '%'
        OR p.full_name ILIKE '%' || p_search || '%'
        OR COALESCE(p.phone_number,'') ILIKE '%' || p_search || '%'
      )
  ) s;

  SELECT jsonb_build_object(
    'pending',    COUNT(*) FILTER (WHERE status='pending'),
    'approved',   COUNT(*) FILTER (WHERE status='approved'),
    'processing', COUNT(*) FILTER (WHERE status='processing'),
    'completed',  COUNT(*) FILTER (WHERE status='completed'),
    'rejected',   COUNT(*) FILTER (WHERE status='rejected'),
    'total',      COUNT(*)
  ) INTO v_counts FROM public.book_order_refund_requests;

  RETURN jsonb_build_object('rows', v_rows, 'counts', v_counts);
END; $$;

REVOKE EXECUTE ON FUNCTION public.admin_list_refund_requests(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_refund_requests(text, text) TO authenticated;

-- 4) Reject a refund request
CREATE OR REPLACE FUNCTION public.admin_reject_refund_request(
  p_request_id uuid,
  p_notes text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_actor uuid := auth.uid(); v_r RECORD;
BEGIN
  IF NOT public.has_role(v_actor,'admin') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  IF p_notes IS NULL OR length(trim(p_notes)) < 3 THEN
    RAISE EXCEPTION 'الرجاء توضيح سبب الرفض';
  END IF;
  SELECT * INTO v_r FROM public.book_order_refund_requests WHERE id = p_request_id FOR UPDATE;
  IF v_r IS NULL THEN RAISE EXCEPTION 'طلب الاسترجاع غير موجود'; END IF;
  IF v_r.status NOT IN ('pending') THEN
    RAISE EXCEPTION 'لا يمكن رفض طلب في حالته الحالية';
  END IF;

  UPDATE public.book_order_refund_requests
     SET status='rejected', reviewed_by=v_actor, reviewed_at=now(),
         review_notes=trim(p_notes)
   WHERE id = p_request_id;

  -- Revert order status back to delivered
  UPDATE public.book_orders SET status='delivered', updated_at=now()
    WHERE id = v_r.order_id AND status='refund_requested';

  INSERT INTO public.book_order_status_history(order_id, from_status, to_status, changed_by, notes, notify_student)
  VALUES (v_r.order_id, 'refund_requested', 'delivered', v_actor,
          'رفض طلب الاسترجاع: ' || trim(p_notes), true);

  RETURN jsonb_build_object('success', true);
END; $$;
REVOKE EXECUTE ON FUNCTION public.admin_reject_refund_request(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reject_refund_request(uuid, text) TO authenticated;

-- 5) Approve refund request: sets refund_method by gateway.
--    For 'wallet': performs the wallet credit atomically & marks completed.
--    For 'cod'/'manual': marks 'approved' — admin must click "manually done" to complete.
--    For 'fawaterak': marks 'processing' — waits for their refund webhook.
--    For 'kashier'/'paymob': marks 'processing' — edge fn will call API & complete/error.
CREATE OR REPLACE FUNCTION public.admin_approve_refund_request(
  p_request_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_r RECORD; v_o RECORD; v_gw RECORD;
  v_method text; v_wallet RECORD; v_new_balance integer; v_wref text;
BEGIN
  IF NOT public.has_role(v_actor,'admin') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_r FROM public.book_order_refund_requests WHERE id=p_request_id FOR UPDATE;
  IF v_r IS NULL THEN RAISE EXCEPTION 'طلب الاسترجاع غير موجود'; END IF;
  IF v_r.status <> 'pending' THEN RAISE EXCEPTION 'لا يمكن اعتماد طلب في حالته الحالية'; END IF;

  SELECT * INTO v_o FROM public.book_orders WHERE id = v_r.order_id FOR UPDATE;
  IF v_o IS NULL THEN RAISE EXCEPTION 'الطلب غير موجود'; END IF;
  SELECT * INTO v_gw FROM public.payment_gateways WHERE id = v_o.payment_gateway_id;

  v_method := CASE v_gw.gateway_key
    WHEN 'wallet' THEN 'wallet_credit'
    WHEN 'kashier' THEN 'kashier_api'
    WHEN 'paymob' THEN 'paymob_api'
    WHEN 'fawaterak' THEN 'fawaterak_manual'
    WHEN 'manual' THEN 'manual_external'
    WHEN 'cod' THEN 'manual_external'
    ELSE 'manual_external' END;

  IF v_gw.gateway_key = 'wallet' THEN
    -- Instant wallet refund
    SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_o.user_id FOR UPDATE;
    IF v_wallet IS NULL THEN
      INSERT INTO public.wallets(user_id, balance_piastres) VALUES (v_o.user_id, 0)
        RETURNING * INTO v_wallet;
    END IF;
    v_new_balance := v_wallet.balance_piastres + v_o.total_piastres;
    UPDATE public.wallets SET balance_piastres=v_new_balance, updated_at=now() WHERE id=v_wallet.id;
    v_wref := public._gen_txn_reference();
    INSERT INTO public.wallet_transactions
      (reference_number, wallet_id, type, amount_piastres, balance_after_piastres, performed_by, notes)
    VALUES
      (v_wref, v_wallet.id, 'refund', v_o.total_piastres, v_new_balance, v_actor,
       'استرداد قيمة الطلب ' || v_o.order_number);

    UPDATE public.book_order_refund_requests
      SET status='completed', refund_method=v_method,
          reviewed_by=v_actor, reviewed_at=now(),
          processed_at=now(), gateway_refund_reference=v_wref,
          processing_error=NULL
     WHERE id=p_request_id;
    UPDATE public.book_orders SET status='refunded', updated_at=now() WHERE id=v_o.id;
    INSERT INTO public.book_order_status_history(order_id, from_status, to_status, changed_by, notes, notify_student)
    VALUES (v_o.id, 'refund_requested', 'refunded', v_actor, 'استرداد فوري إلى محفظة الطالب', true);
    RETURN jsonb_build_object('success', true, 'method', v_method, 'completed', true);

  ELSIF v_gw.gateway_key IN ('cod','manual') THEN
    UPDATE public.book_order_refund_requests
      SET status='approved', refund_method=v_method,
          reviewed_by=v_actor, reviewed_at=now(),
          processing_error=NULL
     WHERE id=p_request_id;
    RETURN jsonb_build_object('success', true, 'method', v_method, 'needs_manual_confirm', true);

  ELSIF v_gw.gateway_key = 'fawaterak' THEN
    UPDATE public.book_order_refund_requests
      SET status='processing', refund_method=v_method,
          reviewed_by=v_actor, reviewed_at=now(),
          processing_error=NULL
     WHERE id=p_request_id;
    RETURN jsonb_build_object('success', true, 'method', v_method, 'needs_dashboard_action', true);

  ELSE
    -- kashier / paymob: mark processing, edge function will call API next
    UPDATE public.book_order_refund_requests
      SET status='processing', refund_method=v_method,
          reviewed_by=v_actor, reviewed_at=now(),
          processing_error=NULL
     WHERE id=p_request_id;
    RETURN jsonb_build_object('success', true, 'method', v_method, 'needs_gateway_call', true,
                              'gateway_key', v_gw.gateway_key);
  END IF;
END; $$;
REVOKE EXECUTE ON FUNCTION public.admin_approve_refund_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_approve_refund_request(uuid) TO authenticated;

-- 6) Finalize completion after external gateway success or manual/fawaterak confirmation
CREATE OR REPLACE FUNCTION public.admin_complete_refund_request(
  p_request_id uuid,
  p_gateway_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_actor uuid := auth.uid(); v_r RECORD; v_o RECORD; v_admin boolean;
BEGIN
  v_admin := (v_actor IS NOT NULL AND public.has_role(v_actor,'admin'));
  -- Also allow service_role (used by fawaterak webhook). service_role bypasses RLS
  -- but this is SECURITY DEFINER, so allow when auth.uid() is null (service context).
  IF v_actor IS NOT NULL AND NOT v_admin THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;

  SELECT * INTO v_r FROM public.book_order_refund_requests WHERE id=p_request_id FOR UPDATE;
  IF v_r IS NULL THEN RAISE EXCEPTION 'طلب الاسترجاع غير موجود'; END IF;
  IF v_r.status IN ('completed','rejected') THEN
    RAISE EXCEPTION 'الطلب سبق إنهاؤه';
  END IF;

  SELECT * INTO v_o FROM public.book_orders WHERE id=v_r.order_id FOR UPDATE;
  IF v_o IS NULL THEN RAISE EXCEPTION 'الطلب غير موجود'; END IF;

  UPDATE public.book_order_refund_requests
    SET status='completed', processed_at=now(),
        gateway_refund_reference = COALESCE(p_gateway_reference, gateway_refund_reference),
        review_notes = COALESCE(NULLIF(trim(coalesce(p_notes,'')),''), review_notes),
        processing_error = NULL
   WHERE id=p_request_id;

  IF v_o.status <> 'refunded' THEN
    UPDATE public.book_orders SET status='refunded', updated_at=now() WHERE id=v_o.id;
    INSERT INTO public.book_order_status_history(order_id, from_status, to_status, changed_by, notes, notify_student)
    VALUES (v_o.id, v_o.status, 'refunded', v_actor,
            COALESCE(p_notes, 'تم إتمام الاسترجاع'), true);
  END IF;

  RETURN jsonb_build_object('success', true);
END; $$;
REVOKE EXECUTE ON FUNCTION public.admin_complete_refund_request(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_complete_refund_request(uuid, text, text) TO authenticated, service_role;

-- 7) Record processing error (retry path stays available)
CREATE OR REPLACE FUNCTION public.admin_mark_refund_error(
  p_request_id uuid,
  p_error text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NOT NULL AND NOT public.has_role(v_actor,'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  UPDATE public.book_order_refund_requests
    SET status='processing', processing_error=COALESCE(p_error,'خطأ غير معروف')
   WHERE id=p_request_id AND status IN ('processing','approved');
  RETURN jsonb_build_object('success', true);
END; $$;
REVOKE EXECUTE ON FUNCTION public.admin_mark_refund_error(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_mark_refund_error(uuid, text) TO authenticated, service_role;

-- 8) Fetch details for edge-function processing (transaction IDs, config)
CREATE OR REPLACE FUNCTION public.admin_get_refund_processing_context(
  p_request_id uuid
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_actor uuid := auth.uid(); v_r RECORD; v_o RECORD; v_gw RECORD; v_txn RECORD;
BEGIN
  IF NOT public.has_role(v_actor,'admin') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_r FROM public.book_order_refund_requests WHERE id=p_request_id;
  IF v_r IS NULL THEN RAISE EXCEPTION 'طلب الاسترجاع غير موجود'; END IF;
  SELECT * INTO v_o FROM public.book_orders WHERE id=v_r.order_id;
  SELECT * INTO v_gw FROM public.payment_gateways WHERE id=v_o.payment_gateway_id;
  SELECT * INTO v_txn FROM public.payment_transactions
    WHERE book_order_id = v_o.id AND status='success'
    ORDER BY created_at DESC LIMIT 1;

  RETURN jsonb_build_object(
    'request_id', v_r.id,
    'request_status', v_r.status,
    'refund_method', v_r.refund_method,
    'order_id', v_o.id,
    'order_number', v_o.order_number,
    'order_total_piastres', v_o.total_piastres,
    'gateway_key', v_gw.gateway_key,
    'transaction_reference', v_txn.reference_number,
    'transaction_metadata', COALESCE(v_txn.gateway_metadata, '{}'::jsonb)
  );
END; $$;
REVOKE EXECUTE ON FUNCTION public.admin_get_refund_processing_context(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_refund_processing_context(uuid) TO authenticated;

-- 9) Extend get_book_order_full to include refund_method / processed_at
CREATE OR REPLACE FUNCTION public.get_book_order_full(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
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
    'id', p.id, 'full_name', p.full_name, 'phone', p.phone_number, 'email', p.email,
    'student_id_code', p.student_id
  ) INTO v_student FROM public.profiles p WHERE p.id = v_o.user_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', r.id, 'reason', r.reason, 'status', r.status,
    'requested_at', r.requested_at, 'reviewed_at', r.reviewed_at,
    'review_notes', r.review_notes,
    'refund_method', r.refund_method,
    'processed_at', r.processed_at,
    'gateway_refund_reference', r.gateway_refund_reference,
    'processing_error', r.processing_error
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

-- 10) Extend list_my_book_orders to include refund status info per order (for chip)
--     (function exists; ensure it returns latest refund status)
CREATE OR REPLACE FUNCTION public.list_my_book_orders()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth required' USING ERRCODE='42501'; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(row ORDER BY (row->>'created_at') DESC) FROM (
      SELECT jsonb_build_object(
        'id', o.id, 'order_number', o.order_number, 'status', o.status,
        'total_piastres', o.total_piastres, 'has_physical_items', o.has_physical_items,
        'created_at', o.created_at,
        'gateway_key', g.gateway_key, 'gateway_display_name', g.display_name,
        'items_count', (SELECT COALESCE(SUM(oi.quantity),0) FROM public.book_order_items oi WHERE oi.order_id=o.id),
        'items_preview', (
          SELECT COALESCE(jsonb_agg(jsonb_build_object('title', b.title, 'quantity', oi.quantity)), '[]'::jsonb)
          FROM public.book_order_items oi JOIN public.books b ON b.id=oi.book_id
          WHERE oi.order_id=o.id
        ),
        'latest_refund_status', (
          SELECT r.status FROM public.book_order_refund_requests r
          WHERE r.order_id=o.id ORDER BY r.requested_at DESC LIMIT 1
        ),
        'latest_refund_notes', (
          SELECT r.review_notes FROM public.book_order_refund_requests r
          WHERE r.order_id=o.id ORDER BY r.requested_at DESC LIMIT 1
        )
      ) AS row
      FROM public.book_orders o
      JOIN public.payment_gateways g ON g.id=o.payment_gateway_id
      WHERE o.user_id = v_user
    ) s
  ), '[]'::jsonb);
END; $$;
REVOKE EXECUTE ON FUNCTION public.list_my_book_orders() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_book_orders() TO authenticated;
