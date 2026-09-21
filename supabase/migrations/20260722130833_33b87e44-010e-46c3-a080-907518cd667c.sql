
-- =========================================================================
-- PHASE 48 — Course Bundles: schema + purchase / finalize RPCs
-- =========================================================================

-- 1. BUNDLES
CREATE TABLE public.bundles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text UNIQUE,
  description text,
  cover_image_url text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  is_paid boolean NOT NULL DEFAULT true,
  price_piastres integer CHECK (price_piastres IS NULL OR price_piastres >= 0),
  discount_price_piastres integer CHECK (discount_price_piastres IS NULL OR discount_price_piastres >= 0),
  discount_expires_at timestamptz,
  stage_id uuid REFERENCES public.stages(id) ON DELETE SET NULL,
  subject_id uuid REFERENCES public.subjects(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.bundles TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bundles TO authenticated;
GRANT ALL ON public.bundles TO service_role;
ALTER TABLE public.bundles ENABLE ROW LEVEL SECURITY;
CREATE POLICY bundles_select_published ON public.bundles FOR SELECT USING (status='published');
CREATE POLICY bundles_select_admin    ON public.bundles FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY bundles_insert_admin    ON public.bundles FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY bundles_update_admin    ON public.bundles FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY bundles_delete_admin    ON public.bundles FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER update_bundles_updated_at BEFORE UPDATE ON public.bundles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. BUNDLE COURSES (junction, ordered)
CREATE TABLE public.bundle_courses (
  bundle_id uuid NOT NULL REFERENCES public.bundles(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (bundle_id, course_id)
);
GRANT SELECT ON public.bundle_courses TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bundle_courses TO authenticated;
GRANT ALL ON public.bundle_courses TO service_role;
ALTER TABLE public.bundle_courses ENABLE ROW LEVEL SECURITY;
CREATE POLICY bundle_courses_select_all ON public.bundle_courses FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.bundles b WHERE b.id = bundle_id AND (b.status='published' OR public.has_role(auth.uid(),'admin')))
);
CREATE POLICY bundle_courses_write_admin ON public.bundle_courses FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE INDEX idx_bundle_courses_bundle ON public.bundle_courses(bundle_id, position);
CREATE INDEX idx_bundle_courses_course ON public.bundle_courses(course_id);

-- 3. BUNDLE PURCHASES (audit trail; enrollments still created individually)
CREATE TABLE public.bundle_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  bundle_id uuid NOT NULL REFERENCES public.bundles(id) ON DELETE RESTRICT,
  payment_transaction_id uuid REFERENCES public.payment_transactions(id) ON DELETE SET NULL,
  amount_piastres integer NOT NULL,
  courses_included integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.bundle_purchases TO authenticated;
GRANT ALL ON public.bundle_purchases TO service_role;
ALTER TABLE public.bundle_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY bundle_purchases_select_own   ON public.bundle_purchases FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE INDEX idx_bundle_purchases_user ON public.bundle_purchases(user_id, created_at DESC);
CREATE INDEX idx_bundle_purchases_bundle ON public.bundle_purchases(bundle_id, created_at DESC);

-- 4. Extend payment_transactions for bundle purpose
ALTER TABLE public.payment_transactions DROP CONSTRAINT payment_transactions_purpose_check;
ALTER TABLE public.payment_transactions
  ADD CONSTRAINT payment_transactions_purpose_check
  CHECK (purpose IN ('course_purchase','wallet_topup','bundle_purchase'));
ALTER TABLE public.payment_transactions
  ADD COLUMN bundle_id uuid REFERENCES public.bundles(id) ON DELETE SET NULL;
CREATE INDEX idx_payment_txns_bundle ON public.payment_transactions(bundle_id, created_at DESC);

-- 5. Effective bundle price helper (mirrors course logic)
CREATE OR REPLACE FUNCTION public.effective_bundle_price(_bundle_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path='public' AS $$
  SELECT CASE
    WHEN b.is_paid IS NOT TRUE OR b.price_piastres IS NULL THEN 0
    WHEN b.discount_price_piastres IS NOT NULL
         AND (b.discount_expires_at IS NULL OR now() < b.discount_expires_at)
         THEN b.discount_price_piastres
    ELSE b.price_piastres
  END
  FROM public.bundles b WHERE b.id = _bundle_id;
$$;

-- 6. Internal: fan out enrollments for a bundle to a user
CREATE OR REPLACE FUNCTION public._enroll_user_in_bundle(_user_id uuid, _bundle_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
DECLARE v_count integer;
BEGIN
  INSERT INTO public.enrollments (user_id, course_id)
  SELECT _user_id, bc.course_id
  FROM public.bundle_courses bc
  WHERE bc.bundle_id = _bundle_id
  ON CONFLICT DO NOTHING;
  SELECT COUNT(*) INTO v_count FROM public.bundle_courses WHERE bundle_id = _bundle_id;
  RETURN v_count;
END; $$;

-- 7. Wallet purchase of a bundle (mirrors purchase_course pattern)
CREATE OR REPLACE FUNCTION public.purchase_bundle(p_bundle_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
DECLARE
  v_user uuid := auth.uid();
  v_bundle RECORD;
  v_price integer;
  v_gw RECORD;
  v_wallet RECORD;
  v_new_balance integer;
  v_wref text;
  v_wtx_id uuid;
  v_pay_ref text;
  v_pay_id uuid;
  v_count integer;
  v_failure text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'يجب تسجيل الدخول أولاً' USING ERRCODE='42501'; END IF;

  SELECT * INTO v_bundle FROM public.bundles WHERE id = p_bundle_id;
  IF v_bundle IS NULL THEN RAISE EXCEPTION 'الحزمة غير موجودة'; END IF;
  IF v_bundle.status <> 'published' THEN RAISE EXCEPTION 'الحزمة غير متاحة للشراء'; END IF;

  v_price := public.effective_bundle_price(p_bundle_id);
  SELECT COUNT(*) INTO v_count FROM public.bundle_courses WHERE bundle_id = p_bundle_id;
  IF v_count = 0 THEN RAISE EXCEPTION 'لا توجد دورات في هذه الحزمة'; END IF;

  IF v_price = 0 THEN
    PERFORM public._enroll_user_in_bundle(v_user, p_bundle_id);
    INSERT INTO public.bundle_purchases (user_id, bundle_id, amount_piastres, courses_included)
      VALUES (v_user, p_bundle_id, 0, v_count);
    RETURN jsonb_build_object('success', true, 'free', true, 'courses_included', v_count);
  END IF;

  SELECT * INTO v_gw FROM public.payment_gateways WHERE gateway_key='wallet';
  IF v_gw IS NULL OR NOT v_gw.is_enabled THEN
    v_failure := 'بوابة الدفع غير متاحة حالياً';
    v_pay_ref := public._gen_payment_reference();
    INSERT INTO public.payment_transactions (reference_number, user_id, bundle_id, gateway_id, amount_piastres, status, purpose, failure_reason)
      VALUES (v_pay_ref, v_user, p_bundle_id, COALESCE(v_gw.id, (SELECT id FROM public.payment_gateways WHERE gateway_key='wallet')), v_price, 'failed', 'bundle_purchase', v_failure);
    RETURN jsonb_build_object('success', false, 'failure_reason', v_failure, 'reference_number', v_pay_ref);
  END IF;

  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_user FOR UPDATE;
  IF v_wallet IS NULL THEN
    INSERT INTO public.wallets (user_id, balance_piastres) VALUES (v_user, 0) RETURNING * INTO v_wallet;
  END IF;

  IF v_wallet.balance_piastres < v_price THEN
    v_failure := 'رصيد غير كافٍ';
    v_pay_ref := public._gen_payment_reference();
    INSERT INTO public.payment_transactions (reference_number, user_id, bundle_id, gateway_id, amount_piastres, status, purpose, failure_reason)
      VALUES (v_pay_ref, v_user, p_bundle_id, v_gw.id, v_price, 'failed', 'bundle_purchase', v_failure);
    RETURN jsonb_build_object('success', false, 'failure_reason', v_failure, 'reference_number', v_pay_ref,
                              'current_balance_piastres', v_wallet.balance_piastres, 'required_piastres', v_price);
  END IF;

  v_new_balance := v_wallet.balance_piastres - v_price;
  UPDATE public.wallets SET balance_piastres = v_new_balance, updated_at=now() WHERE id = v_wallet.id;

  v_wref := public._gen_txn_reference();
  INSERT INTO public.wallet_transactions
    (reference_number, wallet_id, type, amount_piastres, balance_after_piastres, performed_by, notes)
    VALUES (v_wref, v_wallet.id, 'purchase', v_price, v_new_balance, v_user, 'شراء حزمة: ' || p_bundle_id::text)
    RETURNING id INTO v_wtx_id;

  PERFORM public._enroll_user_in_bundle(v_user, p_bundle_id);

  v_pay_ref := public._gen_payment_reference();
  INSERT INTO public.payment_transactions
    (reference_number, user_id, bundle_id, gateway_id, amount_piastres, status, purpose, wallet_transaction_id)
    VALUES (v_pay_ref, v_user, p_bundle_id, v_gw.id, v_price, 'success', 'bundle_purchase', v_wtx_id)
    RETURNING id INTO v_pay_id;

  INSERT INTO public.bundle_purchases (user_id, bundle_id, payment_transaction_id, amount_piastres, courses_included)
    VALUES (v_user, p_bundle_id, v_pay_id, v_price, v_count);

  RETURN jsonb_build_object('success', true, 'reference_number', v_pay_ref,
    'wallet_reference_number', v_wref, 'new_balance_piastres', v_new_balance,
    'amount_piastres', v_price, 'courses_included', v_count);
END; $$;

-- 8. Manual bundle payment submission (mirrors submit_manual_course_payment)
CREATE OR REPLACE FUNCTION public.submit_manual_bundle_payment(
  p_bundle_id uuid, p_method_id uuid, p_sender_number text, p_proof_image_url text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
DECLARE
  v_user uuid := auth.uid();
  v_bundle RECORD; v_price integer; v_gw RECORD; v_method RECORD;
  v_ref text; v_txn_id uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'يجب تسجيل الدخول أولاً' USING ERRCODE='42501'; END IF;
  IF p_sender_number IS NULL OR length(trim(p_sender_number)) < 4 THEN RAISE EXCEPTION 'رقم المُحوِّل غير صحيح'; END IF;
  IF p_proof_image_url IS NULL OR length(trim(p_proof_image_url)) = 0 THEN RAISE EXCEPTION 'يجب رفع صورة إثبات التحويل'; END IF;

  SELECT * INTO v_bundle FROM public.bundles WHERE id = p_bundle_id;
  IF v_bundle IS NULL THEN RAISE EXCEPTION 'الحزمة غير موجودة'; END IF;
  IF v_bundle.status <> 'published' THEN RAISE EXCEPTION 'الحزمة غير متاحة'; END IF;

  v_price := public.effective_bundle_price(p_bundle_id);
  IF v_price <= 0 THEN RAISE EXCEPTION 'هذه الحزمة مجانية'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.payment_transactions
    WHERE user_id=v_user AND bundle_id=p_bundle_id AND status='pending_review'
  ) THEN RAISE EXCEPTION 'لديك طلب دفع قيد المراجعة لهذه الحزمة'; END IF;

  SELECT * INTO v_gw FROM public.payment_gateways WHERE gateway_key='manual';
  IF v_gw IS NULL OR NOT v_gw.is_enabled THEN RAISE EXCEPTION 'بوابة الدفع اليدوي غير مفعلة'; END IF;

  SELECT * INTO v_method FROM public.manual_payment_methods WHERE id=p_method_id;
  IF v_method IS NULL OR NOT v_method.is_enabled THEN RAISE EXCEPTION 'طريقة الدفع غير متاحة'; END IF;

  v_ref := public._gen_payment_reference();
  INSERT INTO public.payment_transactions
    (reference_number, user_id, bundle_id, gateway_id, amount_piastres, status, purpose, requires_manual_review)
    VALUES (v_ref, v_user, p_bundle_id, v_gw.id, v_price, 'pending_review', 'bundle_purchase', true)
    RETURNING id INTO v_txn_id;

  INSERT INTO public.manual_payment_proofs
    (payment_transaction_id, manual_payment_method_id, sender_number, proof_image_url)
    VALUES (v_txn_id, p_method_id, trim(p_sender_number), p_proof_image_url);

  RETURN jsonb_build_object('success', true, 'transaction_id', v_txn_id, 'reference_number', v_ref);
END; $$;

-- 9. Update finalize_gateway_transaction to fan-out for bundle purchases
CREATE OR REPLACE FUNCTION public.finalize_gateway_transaction(
  p_reference text, p_success boolean, p_failure_reason text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
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
    UPDATE public.payment_transactions SET status='failed', failure_reason=COALESCE(p_failure_reason,'gateway declined') WHERE id=v_txn.id;
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

  RETURN jsonb_build_object('ok', false, 'error', 'unsupported purpose');
END; $$;

-- 10. Admin listing for bundles with course counts + purchase counts
CREATE OR REPLACE FUNCTION public.admin_list_bundles()
RETURNS TABLE(
  id uuid, title text, slug text, status text, is_paid boolean,
  price_piastres integer, discount_price_piastres integer, discount_expires_at timestamptz,
  cover_image_url text, courses_count bigint, purchases_count bigint,
  revenue_piastres bigint, created_at timestamptz
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='public' AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  RETURN QUERY
  SELECT b.id, b.title, b.slug, b.status, b.is_paid, b.price_piastres, b.discount_price_piastres,
    b.discount_expires_at, b.cover_image_url,
    (SELECT COUNT(*) FROM public.bundle_courses bc WHERE bc.bundle_id=b.id) AS courses_count,
    (SELECT COUNT(*) FROM public.bundle_purchases bp WHERE bp.bundle_id=b.id) AS purchases_count,
    COALESCE((SELECT SUM(bp.amount_piastres) FROM public.bundle_purchases bp WHERE bp.bundle_id=b.id),0)::bigint AS revenue_piastres,
    b.created_at
  FROM public.bundles b
  ORDER BY b.created_at DESC;
END; $$;
