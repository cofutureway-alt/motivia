
-- 1. book_orders: extend status enum + add delivery_failed_at
ALTER TABLE public.book_orders DROP CONSTRAINT IF EXISTS book_orders_status_check;
ALTER TABLE public.book_orders ADD CONSTRAINT book_orders_status_check
  CHECK (status = ANY (ARRAY[
    'pending_payment','confirmed','shipped','delivered',
    'cancelled','delivery_failed','refund_requested','refunded'
  ]::text[]));
ALTER TABLE public.book_orders
  ADD COLUMN IF NOT EXISTS delivery_failed_at timestamptz;

-- 2. payment_transactions: allow 'pending'
ALTER TABLE public.payment_transactions DROP CONSTRAINT IF EXISTS payment_transactions_status_check;
ALTER TABLE public.payment_transactions ADD CONSTRAINT payment_transactions_status_check
  CHECK (status = ANY (ARRAY[
    'success','failed','pending','pending_review','pending_gateway'
  ]::text[]));

-- 3. Fix create_book_order: COD txn must be 'pending' not 'success'
CREATE OR REPLACE FUNCTION public.create_book_order(
  p_gateway_key text,
  p_shipping_zone_id uuid DEFAULT NULL::uuid,
  p_shipping_address jsonb DEFAULT NULL::jsonb,
  p_manual_method_id uuid DEFAULT NULL::uuid,
  p_manual_sender_number text DEFAULT NULL::text,
  p_manual_proof_path text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_gw RECORD;
  v_cart_rec RECORD;
  v_book RECORD;
  v_subtotal integer := 0;
  v_shipping integer := 0;
  v_total integer := 0;
  v_has_physical boolean := false;
  v_order_id uuid;
  v_order_number text;
  v_txn_id uuid;
  v_ref text;
  v_status text;
  v_txn_status text;
  v_pay_purpose constant text := 'book_order';
  v_wallet RECORD;
  v_new_balance integer;
  v_wtx_ref text;
  v_wtx_id uuid;
  v_book_ids uuid[];
  v_line_items jsonb := '[]'::jsonb;
  v_confirmed_at timestamptz;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول أولاً' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_gw FROM public.payment_gateways WHERE gateway_key = p_gateway_key;
  IF v_gw IS NULL OR NOT v_gw.is_enabled THEN
    RAISE EXCEPTION 'بوابة الدفع غير متاحة';
  END IF;
  IF v_gw.scope NOT IN ('all','books_only') THEN
    RAISE EXCEPTION 'بوابة الدفع لا تدعم شراء الكتب';
  END IF;

  SELECT array_agg(book_id ORDER BY book_id) INTO v_book_ids
  FROM public.book_cart_items WHERE user_id = v_user;

  IF v_book_ids IS NULL OR array_length(v_book_ids, 1) = 0 THEN
    RAISE EXCEPTION 'سلة الشراء فارغة';
  END IF;

  PERFORM 1 FROM public.books
   WHERE id = ANY(v_book_ids)
   ORDER BY id
   FOR UPDATE;

  FOR v_cart_rec IN
    SELECT ci.book_id, ci.quantity
      FROM public.book_cart_items ci
     WHERE ci.user_id = v_user
     ORDER BY ci.book_id
  LOOP
    SELECT * INTO v_book FROM public.books WHERE id = v_cart_rec.book_id;
    IF v_book IS NULL THEN
      RAISE EXCEPTION 'أحد الكتب لم يعد متاحًا';
    END IF;
    IF v_book.status <> 'published' THEN
      RAISE EXCEPTION 'الكتاب "%" لم يعد متاحًا للشراء', v_book.title;
    END IF;
    IF v_book.book_type = 'physical' THEN
      v_has_physical := true;
      IF COALESCE(v_book.stock_quantity, 0) < v_cart_rec.quantity THEN
        RAISE EXCEPTION 'الكتاب "%" لا يتوفر منه سوى % نسخة/نسخ',
          v_book.title, COALESCE(v_book.stock_quantity, 0)
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END LOOP;

  IF p_gateway_key = 'cod' AND NOT v_has_physical THEN
    RAISE EXCEPTION 'الدفع عند الاستلام غير متاح للكتب الرقمية فقط';
  END IF;

  IF v_has_physical THEN
    IF p_shipping_zone_id IS NULL OR p_shipping_address IS NULL THEN
      RAISE EXCEPTION 'يجب إدخال عنوان الشحن';
    END IF;
    PERFORM 1 FROM public.shipping_zones WHERE id = p_shipping_zone_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'منطقة الشحن غير صحيحة';
    END IF;
    v_shipping := public._effective_shipping_price(p_shipping_zone_id);
  END IF;

  FOR v_cart_rec IN
    SELECT ci.book_id, ci.quantity
      FROM public.book_cart_items ci
     WHERE ci.user_id = v_user
     ORDER BY ci.book_id
  LOOP
    SELECT * INTO v_book FROM public.books WHERE id = v_cart_rec.book_id;
    IF v_book.book_type = 'physical' THEN
      UPDATE public.books
         SET stock_quantity = stock_quantity - v_cart_rec.quantity,
             updated_at = now()
       WHERE id = v_book.id;
    END IF;
    v_subtotal := v_subtotal + public._book_effective_price(v_book) * v_cart_rec.quantity;
    v_line_items := v_line_items || jsonb_build_object(
      'book_id', v_book.id,
      'book_type', v_book.book_type,
      'quantity', v_cart_rec.quantity,
      'unit_price_piastres', public._book_effective_price(v_book)
    );
  END LOOP;

  v_total := v_subtotal + COALESCE(v_shipping, 0);

  IF p_gateway_key = 'manual' THEN
    IF p_manual_method_id IS NULL OR COALESCE(trim(p_manual_sender_number),'') = ''
       OR COALESCE(trim(p_manual_proof_path),'') = '' THEN
      RAISE EXCEPTION 'أدخل بيانات التحويل وصورة الإثبات';
    END IF;
    PERFORM 1 FROM public.manual_payment_methods
      WHERE id = p_manual_method_id AND is_enabled = true;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'طريقة الدفع اليدوي غير متاحة';
    END IF;
  END IF;

  IF p_gateway_key = 'wallet' THEN
    SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_user FOR UPDATE;
    IF v_wallet IS NULL THEN
      INSERT INTO public.wallets(user_id, balance_piastres)
      VALUES (v_user, 0) RETURNING * INTO v_wallet;
    END IF;
    IF v_wallet.balance_piastres < v_total THEN
      RAISE EXCEPTION 'رصيد المحفظة غير كافٍ';
    END IF;
    v_new_balance := v_wallet.balance_piastres - v_total;
    UPDATE public.wallets SET balance_piastres = v_new_balance, updated_at = now()
     WHERE id = v_wallet.id;
    v_wtx_ref := public._gen_txn_reference();
    INSERT INTO public.wallet_transactions
      (reference_number, wallet_id, type, amount_piastres, balance_after_piastres, notes)
    VALUES
      (v_wtx_ref, v_wallet.id, 'purchase', v_total, v_new_balance, 'شراء كتب من المتجر')
    RETURNING id INTO v_wtx_id;
  END IF;

  -- Decide statuses (FIX: cod payment stays 'pending' until delivery+cash collection)
  IF p_gateway_key = 'wallet' THEN
    v_status := 'confirmed';
    v_txn_status := 'success';
    v_confirmed_at := now();
  ELSIF p_gateway_key = 'cod' THEN
    v_status := 'confirmed';        -- order can be prepared/shipped
    v_txn_status := 'pending';      -- but cash not yet collected
    v_confirmed_at := now();
  ELSIF p_gateway_key = 'manual' THEN
    v_status := 'pending_payment';
    v_txn_status := 'pending_review';
    v_confirmed_at := NULL;
  ELSE
    v_status := 'pending_payment';
    v_txn_status := 'pending_gateway';
    v_confirmed_at := NULL;
  END IF;

  v_order_number := public._gen_book_order_number();
  INSERT INTO public.book_orders (
    order_number, user_id, status, payment_gateway_id,
    has_physical_items, shipping_zone_id, shipping_address,
    shipping_cost_piastres, items_subtotal_piastres, total_piastres,
    confirmed_at
  ) VALUES (
    v_order_number, v_user, v_status, v_gw.id,
    v_has_physical,
    CASE WHEN v_has_physical THEN p_shipping_zone_id ELSE NULL END,
    CASE WHEN v_has_physical THEN p_shipping_address ELSE NULL END,
    COALESCE(v_shipping, 0), v_subtotal, v_total,
    v_confirmed_at
  ) RETURNING id INTO v_order_id;

  INSERT INTO public.book_order_items (order_id, book_id, book_type, quantity, unit_price_piastres)
  SELECT v_order_id,
         (li->>'book_id')::uuid,
         li->>'book_type',
         (li->>'quantity')::int,
         (li->>'unit_price_piastres')::int
    FROM jsonb_array_elements(v_line_items) li;

  v_ref := public._gen_payment_reference();
  INSERT INTO public.payment_transactions
    (reference_number, user_id, gateway_id, amount_piastres, status, purpose,
     book_order_id, wallet_transaction_id, requires_manual_review)
  VALUES
    (v_ref, v_user, v_gw.id, v_total, v_txn_status, v_pay_purpose,
     v_order_id, v_wtx_id, (v_txn_status = 'pending_review'))
  RETURNING id INTO v_txn_id;

  IF p_gateway_key = 'manual' THEN
    INSERT INTO public.manual_payment_proofs
      (payment_transaction_id, manual_payment_method_id, sender_number, proof_image_url)
    VALUES
      (v_txn_id, p_manual_method_id, trim(p_manual_sender_number), p_manual_proof_path);
  END IF;

  DELETE FROM public.book_cart_items
   WHERE user_id = v_user AND book_id = ANY(v_book_ids);

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'order_number', v_order_number,
    'total_piastres', v_total,
    'status', v_status,
    'payment_transaction_id', v_txn_id,
    'reference_number', v_ref,
    'requires_gateway_redirect', (v_txn_status = 'pending_gateway'),
    'gateway_key', p_gateway_key,
    'new_wallet_balance_piastres', v_new_balance
  );
END; $function$;

-- 4. change_book_order_status: add delivery_failed + COD cash-collected gate
CREATE OR REPLACE FUNCTION public.change_book_order_status(
  p_order_id uuid,
  p_new_status text,
  p_notes text DEFAULT NULL::text,
  p_notify_student boolean DEFAULT true,
  p_cash_collected boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_is_admin boolean;
  v_o RECORD;
  v_gw RECORD;
  v_ok boolean := false;
  v_new_wallet_balance integer;
  v_wallet RECORD;
  v_wtx_ref text;
  v_is_cod boolean;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'auth required' USING ERRCODE='42501'; END IF;
  v_is_admin := public.has_role(v_actor, 'admin');

  SELECT * INTO v_o FROM public.book_orders WHERE id = p_order_id FOR UPDATE;
  IF v_o IS NULL THEN RAISE EXCEPTION 'الطلب غير موجود'; END IF;

  SELECT * INTO v_gw FROM public.payment_gateways WHERE id = v_o.payment_gateway_id;
  v_is_cod := (v_gw.gateway_key = 'cod');

  IF NOT v_is_admin THEN
    IF v_o.user_id <> v_actor THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
    IF p_new_status <> 'cancelled' THEN RAISE EXCEPTION 'لا يمكنك تنفيذ هذا الإجراء'; END IF;
    IF v_o.status NOT IN ('pending_payment','confirmed') THEN
      RAISE EXCEPTION 'لا يمكن إلغاء الطلب في حالته الحالية';
    END IF;
  END IF;

  IF v_o.status = p_new_status THEN
    RAISE EXCEPTION 'الطلب في هذه الحالة بالفعل';
  END IF;

  IF (v_o.status = 'confirmed'       AND p_new_status = 'shipped')
     OR (v_o.status = 'shipped'      AND p_new_status = 'delivered')
     OR (v_o.status = 'shipped'      AND p_new_status = 'delivery_failed')
     OR (v_o.status = 'shipped'      AND p_new_status = 'cancelled' AND v_is_admin)
     OR (v_o.status = 'confirmed'    AND p_new_status = 'cancelled')
     OR (v_o.status = 'pending_payment' AND p_new_status = 'cancelled') THEN
    v_ok := true;
  END IF;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'انتقال غير مسموح: من % إلى %', v_o.status, p_new_status;
  END IF;

  -- COD delivered gate: cash must be explicitly confirmed collected
  IF p_new_status = 'delivered' AND v_is_cod AND NOT COALESCE(p_cash_collected, false) THEN
    RAISE EXCEPTION 'يجب تأكيد تحصيل المبلغ نقداً قبل تحديد الطلب كمُسلَّم'
      USING ERRCODE = 'P0001';
  END IF;

  -- delivery_failed reason is mandatory
  IF p_new_status = 'delivery_failed' AND COALESCE(trim(coalesce(p_notes,'')),'') = '' THEN
    RAISE EXCEPTION 'يجب إدخال سبب فشل التسليم';
  END IF;

  -- Cancelled OR delivery_failed → restore physical stock
  IF p_new_status IN ('cancelled','delivery_failed') THEN
    UPDATE public.books b
       SET stock_quantity = COALESCE(b.stock_quantity,0) + oi.quantity,
           updated_at = now()
      FROM public.book_order_items oi
     WHERE oi.order_id = v_o.id
       AND oi.book_type = 'physical'
       AND b.id = oi.book_id;

    -- Wallet refund on cancel of an already-confirmed wallet-paid order (unchanged behavior)
    IF p_new_status = 'cancelled' AND v_o.status IN ('confirmed','shipped') THEN
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

  -- COD delivered → atomically flip pending payment_transactions to success
  IF p_new_status = 'delivered' AND v_is_cod THEN
    UPDATE public.payment_transactions
       SET status = 'success',
           reviewed_by = v_actor,
           reviewed_at = now(),
           review_notes = COALESCE(review_notes,'')
             || CASE WHEN COALESCE(review_notes,'') = '' THEN '' ELSE E'\n' END
             || 'تم تحصيل المبلغ نقداً عند التسليم'
     WHERE book_order_id = v_o.id
       AND status = 'pending';
  END IF;

  -- COD delivery_failed → flip pending payment_transactions to failed
  IF p_new_status = 'delivery_failed' AND v_is_cod THEN
    UPDATE public.payment_transactions
       SET status = 'failed',
           failure_reason = COALESCE(NULLIF(trim(coalesce(p_notes,'')),''), 'فشل التسليم'),
           reviewed_by = v_actor,
           reviewed_at = now()
     WHERE book_order_id = v_o.id
       AND status = 'pending';
  END IF;

  UPDATE public.book_orders SET
    status = p_new_status,
    confirmed_at = CASE WHEN p_new_status = 'confirmed' THEN now() ELSE confirmed_at END,
    shipped_at   = CASE WHEN p_new_status = 'shipped'   THEN now() ELSE shipped_at END,
    delivered_at = CASE WHEN p_new_status = 'delivered' THEN now() ELSE delivered_at END,
    cancelled_at = CASE WHEN p_new_status = 'cancelled' THEN now() ELSE cancelled_at END,
    delivery_failed_at = CASE WHEN p_new_status = 'delivery_failed' THEN now() ELSE delivery_failed_at END,
    updated_at = now()
  WHERE id = v_o.id;

  INSERT INTO public.book_order_status_history(order_id, from_status, to_status, changed_by, notes, notify_student)
    VALUES (v_o.id, v_o.status, p_new_status, v_actor, NULLIF(trim(coalesce(p_notes,'')),''), coalesce(p_notify_student, true));

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_o.id,
    'from', v_o.status,
    'to', p_new_status,
    'cash_collected', (p_new_status = 'delivered' AND v_is_cod AND COALESCE(p_cash_collected,false))
  );
END; $function$;

-- Lock down: only authenticated may execute (matches project rule about SECURITY DEFINER exposure)
REVOKE ALL ON FUNCTION public.change_book_order_status(uuid, text, text, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.change_book_order_status(uuid, text, text, boolean, boolean) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_book_order(text, uuid, jsonb, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_book_order(text, uuid, jsonb, uuid, text, text) TO authenticated, service_role;
