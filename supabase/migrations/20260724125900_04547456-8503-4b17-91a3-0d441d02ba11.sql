
-- ============================================================================
-- Phase 55: Book Checkout, Orders + Payment (incl. Cash on Delivery)
-- ============================================================================

-- 1) Extend payment_gateways with scope
ALTER TABLE public.payment_gateways
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'all';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='payment_gateways_scope_check'
  ) THEN
    ALTER TABLE public.payment_gateways
      ADD CONSTRAINT payment_gateways_scope_check
      CHECK (scope IN ('all','courses_and_bundles','books_only'));
  END IF;
END$$;

-- Cash on Delivery gateway (books only, disabled by default).
-- Bypasses the Phase 41 manual-review flow: no proof, no pending review.
INSERT INTO public.payment_gateways (gateway_key, display_name, type, is_enabled, scope)
VALUES ('cod', 'الدفع عند الاستلام', 'manual', false, 'books_only')
ON CONFLICT (gateway_key) DO UPDATE
  SET scope = EXCLUDED.scope,
      display_name = EXCLUDED.display_name;

-- Allow the manual-gateway validation trigger to keep working with COD (COD needs no methods).
-- The existing trigger `validate_manual_gateway_enable` guards enabling `manual`. Confirm COD is not blocked
-- by inspecting the function body; it targets `manual` only, not `cod`, so COD enable is fine.

-- 2) Extend payment_transactions
ALTER TABLE public.payment_transactions
  DROP CONSTRAINT IF EXISTS payment_transactions_purpose_check;

ALTER TABLE public.payment_transactions
  ADD CONSTRAINT payment_transactions_purpose_check
  CHECK (purpose IN ('course_purchase','wallet_topup','bundle_purchase','book_order'));

ALTER TABLE public.payment_transactions
  ADD COLUMN IF NOT EXISTS book_order_id uuid;

-- FK added below (after book_orders exists)

-- 3) book_orders table
CREATE TABLE IF NOT EXISTS public.book_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending_payment'
    CHECK (status IN ('pending_payment','confirmed','shipped','delivered','cancelled','refund_requested','refunded')),
  payment_gateway_id uuid NOT NULL REFERENCES public.payment_gateways(id) ON DELETE RESTRICT,
  has_physical_items boolean NOT NULL,
  shipping_zone_id uuid REFERENCES public.shipping_zones(id) ON DELETE SET NULL,
  shipping_address jsonb,
  shipping_cost_piastres integer NOT NULL DEFAULT 0 CHECK (shipping_cost_piastres >= 0),
  items_subtotal_piastres integer NOT NULL CHECK (items_subtotal_piastres >= 0),
  total_piastres integer NOT NULL CHECK (total_piastres >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  shipped_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz
);

CREATE INDEX IF NOT EXISTS book_orders_user_idx ON public.book_orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS book_orders_status_idx ON public.book_orders(status, created_at DESC);

GRANT SELECT ON public.book_orders TO authenticated;
GRANT ALL ON public.book_orders TO service_role;
ALTER TABLE public.book_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "book_orders_own_select" ON public.book_orders
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "book_orders_admin_select" ON public.book_orders
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_book_orders_updated_at
  BEFORE UPDATE ON public.book_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Deferred FK from payment_transactions
ALTER TABLE public.payment_transactions
  DROP CONSTRAINT IF EXISTS payment_transactions_book_order_id_fkey;
ALTER TABLE public.payment_transactions
  ADD CONSTRAINT payment_transactions_book_order_id_fkey
  FOREIGN KEY (book_order_id) REFERENCES public.book_orders(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_payment_txns_book_order ON public.payment_transactions(book_order_id, created_at DESC);

-- 4) book_order_items table
CREATE TABLE IF NOT EXISTS public.book_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.book_orders(id) ON DELETE CASCADE,
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE RESTRICT,
  book_type text NOT NULL CHECK (book_type IN ('digital','physical')),
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price_piastres integer NOT NULL CHECK (unit_price_piastres >= 0),
  digital_downloads_used integer NOT NULL DEFAULT 0 CHECK (digital_downloads_used >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS book_order_items_order_idx ON public.book_order_items(order_id);
CREATE INDEX IF NOT EXISTS book_order_items_book_idx ON public.book_order_items(book_id);

GRANT SELECT ON public.book_order_items TO authenticated;
GRANT ALL ON public.book_order_items TO service_role;
ALTER TABLE public.book_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "book_order_items_own_select" ON public.book_order_items
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.book_orders o
    WHERE o.id = order_id AND o.user_id = auth.uid()
  ));

CREATE POLICY "book_order_items_admin_select" ON public.book_order_items
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 5) Order-number sequence + generator
CREATE SEQUENCE IF NOT EXISTS public.book_orders_seq START 1;

CREATE OR REPLACE FUNCTION public._gen_book_order_number()
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE v_n bigint;
BEGIN
  v_n := nextval('public.book_orders_seq');
  RETURN 'BK-' || LPAD(v_n::text, 6, '0');
END; $$;

REVOKE EXECUTE ON FUNCTION public._gen_book_order_number() FROM PUBLIC, anon, authenticated;

-- 6) Effective book price helper (server-side mirror of getEffectivePrice)
CREATE OR REPLACE FUNCTION public._book_effective_price(p_book public.books)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_book.discount_price_piastres IS NOT NULL
     AND (p_book.discount_expires_at IS NULL OR now() < p_book.discount_expires_at)
    THEN p_book.discount_price_piastres
    ELSE p_book.price_piastres
  END
$$;

REVOKE EXECUTE ON FUNCTION public._book_effective_price(public.books) FROM PUBLIC, anon, authenticated;

-- 7) Effective shipping helper
CREATE OR REPLACE FUNCTION public._effective_shipping_price(p_zone_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE v_default integer; v_override integer;
BEGIN
  SELECT default_shipping_price_piastres INTO v_default FROM public.shipping_settings WHERE id = 1;
  v_default := COALESCE(v_default, 0);
  IF p_zone_id IS NULL THEN RETURN v_default; END IF;
  SELECT shipping_price_piastres INTO v_override FROM public.shipping_zones WHERE id = p_zone_id;
  RETURN COALESCE(v_override, v_default);
END; $$;

REVOKE EXECUTE ON FUNCTION public._effective_shipping_price(uuid) FROM PUBLIC, anon, authenticated;

-- 8) create_book_order — atomic checkout entry point
--
-- Handles all 5 gateway flows in one place:
--   wallet   : deduct wallet, order='confirmed', txn.status='success'
--   manual   : order='pending_payment', txn.status='pending_review'
--              + inserts manual_payment_proofs (Phase 41 flow)
--   kashier / paymob / fawaterak: order='pending_payment', txn.status='pending_gateway'
--              (client then calls the respective *-initiate edge function with the reference)
--   cod      : order='confirmed' immediately, txn.status='success' (bookkeeping only)
--
-- Stock is always validated + decremented atomically for physical books BEFORE payment work.
CREATE OR REPLACE FUNCTION public.create_book_order(
  p_gateway_key         text,
  p_shipping_zone_id    uuid   DEFAULT NULL,
  p_shipping_address    jsonb  DEFAULT NULL,
  -- manual-only:
  p_manual_method_id    uuid   DEFAULT NULL,
  p_manual_sender_number text  DEFAULT NULL,
  p_manual_proof_path   text   DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- Load gateway & validate scope
  SELECT * INTO v_gw FROM public.payment_gateways WHERE gateway_key = p_gateway_key;
  IF v_gw IS NULL OR NOT v_gw.is_enabled THEN
    RAISE EXCEPTION 'بوابة الدفع غير متاحة';
  END IF;
  IF v_gw.scope NOT IN ('all','books_only') THEN
    RAISE EXCEPTION 'بوابة الدفع لا تدعم شراء الكتب';
  END IF;

  -- Collect cart book IDs (sorted for consistent lock ordering)
  SELECT array_agg(book_id ORDER BY book_id) INTO v_book_ids
  FROM public.book_cart_items WHERE user_id = v_user;

  IF v_book_ids IS NULL OR array_length(v_book_ids, 1) = 0 THEN
    RAISE EXCEPTION 'سلة الشراء فارغة';
  END IF;

  -- Lock every referenced book row in a stable order to avoid deadlocks
  PERFORM 1 FROM public.books
   WHERE id = ANY(v_book_ids)
   ORDER BY id
   FOR UPDATE;

  -- Detect physical presence + validate stock (aborts entire order if any insufficient)
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

  -- Cash on Delivery only makes sense with a physical item
  IF p_gateway_key = 'cod' AND NOT v_has_physical THEN
    RAISE EXCEPTION 'الدفع عند الاستلام غير متاح للكتب الرقمية فقط';
  END IF;

  -- Physical orders MUST provide a shipping zone + address
  IF v_has_physical THEN
    IF p_shipping_zone_id IS NULL OR p_shipping_address IS NULL THEN
      RAISE EXCEPTION 'يجب إدخال عنوان الشحن';
    END IF;
    -- validate zone exists
    PERFORM 1 FROM public.shipping_zones WHERE id = p_shipping_zone_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'منطقة الشحن غير صحيحة';
    END IF;
    v_shipping := public._effective_shipping_price(p_shipping_zone_id);
  END IF;

  -- Decrement stock + compute subtotal + build line items snapshot
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

  -- Manual-payment gate: sanity check inputs before creating order
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

  -- Wallet-payment gate: verify + lock + deduct
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

  -- Decide final statuses
  IF p_gateway_key = 'wallet' OR p_gateway_key = 'cod' THEN
    v_status := 'confirmed';
    v_txn_status := 'success';
    v_confirmed_at := now();
  ELSIF p_gateway_key = 'manual' THEN
    v_status := 'pending_payment';
    v_txn_status := 'pending_review';
    v_confirmed_at := NULL;
  ELSE
    -- kashier / paymob / fawaterak (automatic)
    v_status := 'pending_payment';
    v_txn_status := 'pending_gateway';
    v_confirmed_at := NULL;
  END IF;

  -- Create order
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

  -- Create order items from snapshot
  INSERT INTO public.book_order_items (order_id, book_id, book_type, quantity, unit_price_piastres)
  SELECT v_order_id,
         (li->>'book_id')::uuid,
         li->>'book_type',
         (li->>'quantity')::int,
         (li->>'unit_price_piastres')::int
    FROM jsonb_array_elements(v_line_items) li;

  -- Create bookkeeping payment_transactions row
  v_ref := public._gen_payment_reference();
  INSERT INTO public.payment_transactions
    (reference_number, user_id, gateway_id, amount_piastres, status, purpose,
     book_order_id, wallet_transaction_id, requires_manual_review)
  VALUES
    (v_ref, v_user, v_gw.id, v_total, v_txn_status, v_pay_purpose,
     v_order_id, v_wtx_id, (v_txn_status = 'pending_review'))
  RETURNING id INTO v_txn_id;

  -- Manual: attach proof
  IF p_gateway_key = 'manual' THEN
    INSERT INTO public.manual_payment_proofs
      (payment_transaction_id, manual_payment_method_id, sender_number, proof_image_url)
    VALUES
      (v_txn_id, p_manual_method_id, trim(p_manual_sender_number), p_manual_proof_path);
  END IF;

  -- Clear only the purchased books from the cart (leave anything added mid-checkout)
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
END; $$;

REVOKE EXECUTE ON FUNCTION public.create_book_order(text, uuid, jsonb, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_book_order(text, uuid, jsonb, uuid, text, text) TO authenticated;

-- 9) Extend admin_approve_payment_request to handle book_order
CREATE OR REPLACE FUNCTION public.admin_approve_payment_request(p_transaction_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_txn RECORD;
  v_max integer;
  v_wallet RECORD;
  v_new_balance integer;
  v_wref text;
  v_wtx_id uuid;
BEGIN
  IF NOT public.has_role(v_admin, 'admin') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;

  SELECT * INTO v_txn FROM public.payment_transactions WHERE id=p_transaction_id FOR UPDATE;
  IF v_txn IS NULL THEN RAISE EXCEPTION 'الطلب غير موجود'; END IF;
  IF v_txn.status <> 'pending_review' THEN RAISE EXCEPTION 'هذا الطلب لم يعد قابلاً للمراجعة'; END IF;

  IF v_txn.purpose = 'course_purchase' THEN
    IF v_txn.course_id IS NULL THEN RAISE EXCEPTION 'الطلب لا يحتوي على دورة'; END IF;
    INSERT INTO public.enrollments (user_id, course_id) VALUES (v_txn.user_id, v_txn.course_id)
      ON CONFLICT DO NOTHING;
    UPDATE public.payment_transactions
      SET status='success', reviewed_by=v_admin, reviewed_at=now()
      WHERE id=p_transaction_id;
    RETURN jsonb_build_object('success', true, 'purpose', 'course_purchase');

  ELSIF v_txn.purpose = 'book_order' THEN
    IF v_txn.book_order_id IS NULL THEN RAISE EXCEPTION 'الطلب لا يحتوي على كتب'; END IF;
    UPDATE public.book_orders
      SET status='confirmed', confirmed_at=now(), updated_at=now()
      WHERE id=v_txn.book_order_id AND status='pending_payment';
    UPDATE public.payment_transactions
      SET status='success', reviewed_by=v_admin, reviewed_at=now()
      WHERE id=p_transaction_id;
    RETURN jsonb_build_object('success', true, 'purpose', 'book_order');

  ELSIF v_txn.purpose = 'wallet_topup' THEN
    SELECT max_wallet_balance_piastres INTO v_max FROM public.wallet_gateway_settings WHERE id=1;
    IF v_max IS NULL THEN v_max := 200000; END IF;

    SELECT * INTO v_wallet FROM public.wallets WHERE user_id=v_txn.user_id FOR UPDATE;
    IF v_wallet IS NULL THEN
      INSERT INTO public.wallets(user_id, balance_piastres) VALUES (v_txn.user_id, 0) RETURNING * INTO v_wallet;
    END IF;

    IF v_wallet.balance_piastres + COALESCE(v_txn.topup_amount_piastres,0) > v_max THEN
      RAISE EXCEPTION 'قبول هذا الطلب سيتجاوز الحد الأقصى لرصيد الطالب (% ج.م). تواصل مع الطالب.', (v_max/100)::text;
    END IF;

    v_new_balance := v_wallet.balance_piastres + v_txn.topup_amount_piastres;
    UPDATE public.wallets SET balance_piastres=v_new_balance, updated_at=now() WHERE id=v_wallet.id;

    v_wref := public._gen_txn_reference();
    INSERT INTO public.wallet_transactions
      (reference_number, wallet_id, type, amount_piastres, balance_after_piastres, performed_by, notes)
      VALUES (v_wref, v_wallet.id, 'gateway_topup', v_txn.topup_amount_piastres, v_new_balance, v_admin,
              'شحن معتمد عبر بوابة الدفع - ' || v_txn.reference_number)
      RETURNING id INTO v_wtx_id;

    UPDATE public.payment_transactions
      SET status='success', reviewed_by=v_admin, reviewed_at=now(), wallet_transaction_id=v_wtx_id
      WHERE id=p_transaction_id;

    RETURN jsonb_build_object('success', true, 'purpose', 'wallet_topup', 'new_balance_piastres', v_new_balance);
  END IF;

  RAISE EXCEPTION 'نوع طلب غير مدعوم';
END; $$;

-- 10) Extend finalize_gateway_transaction to handle book_order
CREATE OR REPLACE FUNCTION public.finalize_gateway_transaction(
  p_reference text, p_success boolean, p_failure_reason text DEFAULT NULL::text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_txn RECORD; v_max integer; v_wallet RECORD; v_new_balance integer;
  v_wref text; v_wtx_id uuid; v_count integer;
BEGIN
  SELECT * INTO v_txn FROM public.payment_transactions WHERE reference_number = p_reference FOR UPDATE;
  IF v_txn IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'transaction not found'); END IF;
  IF v_txn.status <> 'pending_gateway' THEN
    RETURN jsonb_build_object('ok', true, 'already_finalized', true, 'status', v_txn.status);
  END IF;

  IF NOT p_success THEN
    UPDATE public.payment_transactions
       SET status='failed', failure_reason=COALESCE(p_failure_reason,'gateway declined')
     WHERE id=v_txn.id;
    RETURN jsonb_build_object('ok', true, 'status', 'failed');
  END IF;

  IF v_txn.purpose = 'course_purchase' THEN
    IF v_txn.course_id IS NULL THEN
      UPDATE public.payment_transactions SET status='failed', failure_reason='course missing' WHERE id=v_txn.id;
      RETURN jsonb_build_object('ok', true, 'status', 'failed');
    END IF;
    INSERT INTO public.enrollments (user_id, course_id) VALUES (v_txn.user_id, v_txn.course_id) ON CONFLICT DO NOTHING;
    UPDATE public.payment_transactions SET status='success' WHERE id=v_txn.id;
    RETURN jsonb_build_object('ok', true, 'status', 'success', 'purpose', 'course_purchase');

  ELSIF v_txn.purpose = 'bundle_purchase' THEN
    IF v_txn.bundle_id IS NULL THEN
      UPDATE public.payment_transactions SET status='failed', failure_reason='bundle missing' WHERE id=v_txn.id;
      RETURN jsonb_build_object('ok', true, 'status', 'failed');
    END IF;
    v_count := public._enroll_user_in_bundle(v_txn.user_id, v_txn.bundle_id);
    UPDATE public.payment_transactions SET status='success' WHERE id=v_txn.id;
    INSERT INTO public.bundle_purchases (user_id, bundle_id, payment_transaction_id, amount_piastres, courses_included)
      VALUES (v_txn.user_id, v_txn.bundle_id, v_txn.id, v_txn.amount_piastres, v_count);
    RETURN jsonb_build_object('ok', true, 'status', 'success', 'purpose', 'bundle_purchase', 'courses_included', v_count);

  ELSIF v_txn.purpose = 'book_order' THEN
    IF v_txn.book_order_id IS NULL THEN
      UPDATE public.payment_transactions SET status='failed', failure_reason='book order missing' WHERE id=v_txn.id;
      RETURN jsonb_build_object('ok', true, 'status', 'failed');
    END IF;
    UPDATE public.book_orders
       SET status='confirmed', confirmed_at=now(), updated_at=now()
     WHERE id = v_txn.book_order_id AND status='pending_payment';
    UPDATE public.payment_transactions SET status='success' WHERE id=v_txn.id;
    RETURN jsonb_build_object('ok', true, 'status', 'success', 'purpose', 'book_order');

  ELSIF v_txn.purpose = 'wallet_topup' THEN
    SELECT max_wallet_balance_piastres INTO v_max FROM public.wallet_gateway_settings WHERE id=1;
    IF v_max IS NULL THEN v_max := 200000; END IF;
    SELECT * INTO v_wallet FROM public.wallets WHERE user_id=v_txn.user_id FOR UPDATE;
    IF v_wallet IS NULL THEN INSERT INTO public.wallets(user_id, balance_piastres) VALUES (v_txn.user_id, 0) RETURNING * INTO v_wallet; END IF;
    IF v_wallet.balance_piastres + COALESCE(v_txn.topup_amount_piastres,0) > v_max THEN
      UPDATE public.payment_transactions
        SET status='failed',
            failure_reason='تم الدفع بنجاح ولكن الرصيد سيتجاوز الحد الأقصى (' || (v_max/100)::text || ' ج.م). يستوجب مراجعة إدارية.',
            requires_manual_review=true
       WHERE id=v_txn.id;
      RETURN jsonb_build_object('ok', true, 'status', 'failed', 'requires_reconciliation', true);
    END IF;
    v_new_balance := v_wallet.balance_piastres + v_txn.topup_amount_piastres;
    UPDATE public.wallets SET balance_piastres=v_new_balance, updated_at=now() WHERE id=v_wallet.id;
    v_wref := public._gen_txn_reference();
    INSERT INTO public.wallet_transactions
      (reference_number, wallet_id, type, amount_piastres, balance_after_piastres, notes)
      VALUES (v_wref, v_wallet.id, 'gateway_topup', v_txn.topup_amount_piastres, v_new_balance,
              'شحن عبر بوابة دفع - ' || v_txn.reference_number)
      RETURNING id INTO v_wtx_id;
    UPDATE public.payment_transactions SET status='success', wallet_transaction_id=v_wtx_id WHERE id=v_txn.id;
    RETURN jsonb_build_object('ok', true, 'status', 'success', 'purpose', 'wallet_topup', 'new_balance_piastres', v_new_balance);
  END IF;

  RETURN jsonb_build_object('ok', false, 'error', 'unknown purpose');
END; $$;

-- 11) Reader for a single order (student sees own; admin sees all)
CREATE OR REPLACE FUNCTION public.get_book_order_detail(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_user uuid := auth.uid(); v_o RECORD; v_gw RECORD; v_zone RECORD; v_items jsonb;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth required' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_o FROM public.book_orders WHERE id = p_order_id;
  IF v_o IS NULL THEN RETURN NULL; END IF;
  IF v_o.user_id <> v_user AND NOT public.has_role(v_user, 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  SELECT gateway_key, display_name, type INTO v_gw
    FROM public.payment_gateways WHERE id = v_o.payment_gateway_id;
  IF v_o.shipping_zone_id IS NOT NULL THEN
    SELECT name INTO v_zone FROM public.shipping_zones WHERE id = v_o.shipping_zone_id;
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', oi.id,
    'book_id', oi.book_id,
    'book_type', oi.book_type,
    'quantity', oi.quantity,
    'unit_price_piastres', oi.unit_price_piastres,
    'title', b.title,
    'author', b.author,
    'cover_image_url', b.cover_image_url
  ) ORDER BY oi.created_at), '[]'::jsonb) INTO v_items
  FROM public.book_order_items oi
  JOIN public.books b ON b.id = oi.book_id
  WHERE oi.order_id = p_order_id;

  RETURN jsonb_build_object(
    'id', v_o.id,
    'order_number', v_o.order_number,
    'status', v_o.status,
    'has_physical_items', v_o.has_physical_items,
    'shipping_address', v_o.shipping_address,
    'shipping_zone_name', v_zone.name,
    'shipping_cost_piastres', v_o.shipping_cost_piastres,
    'items_subtotal_piastres', v_o.items_subtotal_piastres,
    'total_piastres', v_o.total_piastres,
    'gateway_key', v_gw.gateway_key,
    'gateway_display_name', v_gw.display_name,
    'created_at', v_o.created_at,
    'confirmed_at', v_o.confirmed_at,
    'items', v_items
  );
END; $$;

REVOKE EXECUTE ON FUNCTION public.get_book_order_detail(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_book_order_detail(uuid) TO authenticated;
