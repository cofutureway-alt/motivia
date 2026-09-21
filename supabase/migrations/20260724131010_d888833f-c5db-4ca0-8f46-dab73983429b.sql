
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
      'student_phone', p.phone_number,
      'student_id_code', p.student_id,
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
        OR COALESCE(p.phone_number, '') ILIKE '%' || p_search || '%'
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
    'id', p.id, 'full_name', p.full_name, 'phone', p.phone_number, 'email', p.email,
    'student_id_code', p.student_id
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
