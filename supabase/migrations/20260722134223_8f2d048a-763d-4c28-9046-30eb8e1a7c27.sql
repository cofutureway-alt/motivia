
-- =========================================================================
-- PHASE 49 — Featured flag on courses & bundles + discount analytics
-- =========================================================================

-- 1. FEATURED FLAG on courses
ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS featured_at timestamptz;

-- 2. FEATURED FLAG on bundles
ALTER TABLE public.bundles
  ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS featured_at timestamptz;

-- 3. Auto-maintain featured_at on transitions
CREATE OR REPLACE FUNCTION public._maintain_featured_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.is_featured IS TRUE THEN
      NEW.featured_at := COALESCE(NEW.featured_at, now());
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.is_featured IS DISTINCT FROM OLD.is_featured THEN
    IF NEW.is_featured IS TRUE THEN
      NEW.featured_at := now();
    ELSE
      NEW.featured_at := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_courses_featured_at ON public.courses;
CREATE TRIGGER trg_courses_featured_at
  BEFORE INSERT OR UPDATE OF is_featured ON public.courses
  FOR EACH ROW EXECUTE FUNCTION public._maintain_featured_at();

DROP TRIGGER IF EXISTS trg_bundles_featured_at ON public.bundles;
CREATE TRIGGER trg_bundles_featured_at
  BEFORE INSERT OR UPDATE OF is_featured ON public.bundles
  FOR EACH ROW EXECUTE FUNCTION public._maintain_featured_at();

CREATE INDEX IF NOT EXISTS idx_courses_featured    ON public.courses(is_featured, featured_at DESC) WHERE is_featured = true;
CREATE INDEX IF NOT EXISTS idx_bundles_featured    ON public.bundles(is_featured, featured_at DESC) WHERE is_featured = true;

-- 4. DISCOUNT COLUMNS on payment_transactions (course + bundle purchases share this table)
ALTER TABLE public.payment_transactions
  ADD COLUMN IF NOT EXISTS original_price_piastres integer,
  ADD COLUMN IF NOT EXISTS discount_amount_piastres integer NOT NULL DEFAULT 0;

ALTER TABLE public.payment_transactions
  DROP CONSTRAINT IF EXISTS payment_transactions_discount_nonneg_check;
ALTER TABLE public.payment_transactions
  ADD CONSTRAINT payment_transactions_discount_nonneg_check
    CHECK (discount_amount_piastres >= 0);

-- 5. DISCOUNT COLUMNS on bundle_purchases (parallel audit trail)
ALTER TABLE public.bundle_purchases
  ADD COLUMN IF NOT EXISTS original_price_piastres integer,
  ADD COLUMN IF NOT EXISTS discount_amount_piastres integer NOT NULL DEFAULT 0;

ALTER TABLE public.bundle_purchases
  DROP CONSTRAINT IF EXISTS bundle_purchases_discount_nonneg_check;
ALTER TABLE public.bundle_purchases
  ADD CONSTRAINT bundle_purchases_discount_nonneg_check
    CHECK (discount_amount_piastres >= 0);

-- 6. VIEW: discount_savings_summary (single source of truth for the KPI)
--    Successful, discounted purchases only. Refunded/failed drop out.
CREATE OR REPLACE VIEW public.discount_savings_summary AS
  SELECT
    'course'::text AS kind,
    pt.created_at,
    pt.discount_amount_piastres
  FROM public.payment_transactions pt
  WHERE pt.status = 'success'
    AND pt.purpose = 'course_purchase'
    AND COALESCE(pt.discount_amount_piastres, 0) > 0
  UNION ALL
  SELECT
    'bundle'::text AS kind,
    bp.created_at,
    bp.discount_amount_piastres
  FROM public.bundle_purchases bp
  WHERE COALESCE(bp.discount_amount_piastres, 0) > 0;

GRANT SELECT ON public.discount_savings_summary TO authenticated;
GRANT SELECT ON public.discount_savings_summary TO service_role;

-- 7. UPDATE purchase_course to record discount at insert time
CREATE OR REPLACE FUNCTION public.purchase_course(p_course_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_course RECORD;
  v_price integer;
  v_original integer;
  v_discount integer;
  v_gw RECORD;
  v_wallet RECORD;
  v_new_balance integer;
  v_wallet_ref text;
  v_wallet_txn_id uuid;
  v_pay_ref text;
  v_pay_id uuid;
  v_failure text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'يجب تسجيل الدخول أولاً' USING ERRCODE='42501'; END IF;

  SELECT id, is_paid, price_piastres, discount_price_piastres, discount_expires_at, status
    INTO v_course FROM public.courses WHERE id = p_course_id;
  IF v_course IS NULL THEN RAISE EXCEPTION 'الدورة غير موجودة'; END IF;
  IF v_course.status <> 'published' THEN
    RAISE EXCEPTION 'لا يمكن التسجيل في هذا الكورس حاليًا — سيتاح قريبًا';
  END IF;

  IF v_course.is_paid IS NOT TRUE OR v_course.price_piastres IS NULL THEN
    v_price := 0;
    v_original := NULL;
  ELSIF v_course.discount_price_piastres IS NOT NULL
        AND (v_course.discount_expires_at IS NULL OR now() < v_course.discount_expires_at) THEN
    v_price := v_course.discount_price_piastres;
    v_original := v_course.price_piastres;
  ELSE
    v_price := v_course.price_piastres;
    v_original := v_course.price_piastres;
  END IF;
  v_discount := GREATEST(0, COALESCE(v_original, v_price) - v_price);

  IF EXISTS (SELECT 1 FROM public.enrollments WHERE user_id = v_user AND course_id = p_course_id) THEN
    RETURN jsonb_build_object('success', false, 'already_enrolled', true,
                              'failure_reason','أنت مسجّل بالفعل في هذه الدورة');
  END IF;

  IF v_price = 0 THEN
    INSERT INTO public.enrollments (user_id, course_id) VALUES (v_user, p_course_id)
      ON CONFLICT DO NOTHING;
    RETURN jsonb_build_object('success', true, 'free', true);
  END IF;

  SELECT * INTO v_gw FROM public.payment_gateways WHERE gateway_key='wallet';
  IF v_gw IS NULL OR NOT v_gw.is_enabled THEN
    v_failure := 'بوابة الدفع غير متاحة حالياً';
    v_pay_ref := public._gen_payment_reference();
    INSERT INTO public.payment_transactions
      (reference_number, user_id, course_id, gateway_id, amount_piastres, status, failure_reason,
       original_price_piastres, discount_amount_piastres)
      VALUES (v_pay_ref, v_user, p_course_id,
              COALESCE(v_gw.id, (SELECT id FROM public.payment_gateways WHERE gateway_key='wallet')),
              v_price, 'failed', v_failure, v_original, v_discount);
    RETURN jsonb_build_object('success', false, 'failure_reason', v_failure, 'reference_number', v_pay_ref);
  END IF;

  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_user FOR UPDATE;
  IF v_wallet IS NULL THEN
    INSERT INTO public.wallets (user_id, balance_piastres) VALUES (v_user, 0) RETURNING * INTO v_wallet;
  END IF;

  IF v_wallet.balance_piastres < v_price THEN
    v_failure := 'رصيد غير كافٍ';
    v_pay_ref := public._gen_payment_reference();
    INSERT INTO public.payment_transactions
      (reference_number, user_id, course_id, gateway_id, amount_piastres, status, failure_reason,
       original_price_piastres, discount_amount_piastres)
      VALUES (v_pay_ref, v_user, p_course_id, v_gw.id, v_price, 'failed', v_failure, v_original, v_discount);
    RETURN jsonb_build_object('success', false, 'failure_reason', v_failure,
                              'reference_number', v_pay_ref,
                              'current_balance_piastres', v_wallet.balance_piastres,
                              'required_piastres', v_price);
  END IF;

  v_new_balance := v_wallet.balance_piastres - v_price;
  UPDATE public.wallets SET balance_piastres = v_new_balance, updated_at = now() WHERE id = v_wallet.id;

  v_wallet_ref := public._gen_txn_reference();
  INSERT INTO public.wallet_transactions
    (reference_number, wallet_id, type, amount_piastres, balance_after_piastres, performed_by, notes)
    VALUES (v_wallet_ref, v_wallet.id, 'purchase', v_price, v_new_balance, v_user,
            'شراء دورة: ' || p_course_id::text)
    RETURNING id INTO v_wallet_txn_id;

  INSERT INTO public.enrollments (user_id, course_id) VALUES (v_user, p_course_id)
    ON CONFLICT DO NOTHING;

  v_pay_ref := public._gen_payment_reference();
  INSERT INTO public.payment_transactions
    (reference_number, user_id, course_id, gateway_id, amount_piastres, status, wallet_transaction_id,
     original_price_piastres, discount_amount_piastres)
    VALUES (v_pay_ref, v_user, p_course_id, v_gw.id, v_price, 'success', v_wallet_txn_id, v_original, v_discount)
    RETURNING id INTO v_pay_id;

  RETURN jsonb_build_object(
    'success', true,
    'reference_number', v_pay_ref,
    'wallet_reference_number', v_wallet_ref,
    'new_balance_piastres', v_new_balance,
    'amount_piastres', v_price
  );
END; $$;

-- 8. UPDATE purchase_bundle to record discount at insert time (both tables)
CREATE OR REPLACE FUNCTION public.purchase_bundle(p_bundle_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
DECLARE
  v_user uuid := auth.uid();
  v_bundle RECORD;
  v_price integer;
  v_original integer;
  v_discount integer;
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
  IF v_bundle.is_paid IS NOT TRUE OR v_bundle.price_piastres IS NULL THEN
    v_original := NULL;
  ELSE
    v_original := v_bundle.price_piastres;
  END IF;
  v_discount := GREATEST(0, COALESCE(v_original, v_price) - v_price);

  SELECT COUNT(*) INTO v_count FROM public.bundle_courses WHERE bundle_id = p_bundle_id;
  IF v_count = 0 THEN RAISE EXCEPTION 'لا توجد دورات في هذه الحزمة'; END IF;

  IF v_price = 0 THEN
    PERFORM public._enroll_user_in_bundle(v_user, p_bundle_id);
    INSERT INTO public.bundle_purchases
      (user_id, bundle_id, amount_piastres, courses_included, original_price_piastres, discount_amount_piastres)
      VALUES (v_user, p_bundle_id, 0, v_count, v_original, v_discount);
    RETURN jsonb_build_object('success', true, 'free', true, 'courses_included', v_count);
  END IF;

  SELECT * INTO v_gw FROM public.payment_gateways WHERE gateway_key='wallet';
  IF v_gw IS NULL OR NOT v_gw.is_enabled THEN
    v_failure := 'بوابة الدفع غير متاحة حالياً';
    v_pay_ref := public._gen_payment_reference();
    INSERT INTO public.payment_transactions
      (reference_number, user_id, bundle_id, gateway_id, amount_piastres, status, purpose, failure_reason,
       original_price_piastres, discount_amount_piastres)
      VALUES (v_pay_ref, v_user, p_bundle_id, COALESCE(v_gw.id,(SELECT id FROM public.payment_gateways WHERE gateway_key='wallet')),
              v_price, 'failed', 'bundle_purchase', v_failure, v_original, v_discount);
    RETURN jsonb_build_object('success', false, 'failure_reason', v_failure, 'reference_number', v_pay_ref);
  END IF;

  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_user FOR UPDATE;
  IF v_wallet IS NULL THEN
    INSERT INTO public.wallets (user_id, balance_piastres) VALUES (v_user, 0) RETURNING * INTO v_wallet;
  END IF;

  IF v_wallet.balance_piastres < v_price THEN
    v_failure := 'رصيد غير كافٍ';
    v_pay_ref := public._gen_payment_reference();
    INSERT INTO public.payment_transactions
      (reference_number, user_id, bundle_id, gateway_id, amount_piastres, status, purpose, failure_reason,
       original_price_piastres, discount_amount_piastres)
      VALUES (v_pay_ref, v_user, p_bundle_id, v_gw.id, v_price, 'failed', 'bundle_purchase', v_failure, v_original, v_discount);
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
    (reference_number, user_id, bundle_id, gateway_id, amount_piastres, status, purpose, wallet_transaction_id,
     original_price_piastres, discount_amount_piastres)
    VALUES (v_pay_ref, v_user, p_bundle_id, v_gw.id, v_price, 'success', 'bundle_purchase', v_wtx_id, v_original, v_discount)
    RETURNING id INTO v_pay_id;

  INSERT INTO public.bundle_purchases
    (user_id, bundle_id, payment_transaction_id, amount_piastres, courses_included, original_price_piastres, discount_amount_piastres)
    VALUES (v_user, p_bundle_id, v_pay_id, v_price, v_count, v_original, v_discount);

  RETURN jsonb_build_object(
    'success', true, 'reference_number', v_pay_ref, 'wallet_reference_number', v_wref,
    'new_balance_piastres', v_new_balance, 'amount_piastres', v_price, 'courses_included', v_count
  );
END; $$;

-- 9. UPDATE create_pending_gateway_transaction to record discount at insert time
CREATE OR REPLACE FUNCTION public.create_pending_gateway_transaction(
  p_gateway_key text,
  p_purpose text,
  p_course_id uuid DEFAULT NULL,
  p_topup_amount_piastres integer DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_user uuid := auth.uid();
  v_gateway RECORD;
  v_course RECORD;
  v_amount integer;
  v_original integer;
  v_discount integer;
  v_ref text;
  v_max integer;
  v_wallet_balance integer;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth required' USING ERRCODE='42501'; END IF;
  IF p_purpose NOT IN ('course_purchase','wallet_topup') THEN RAISE EXCEPTION 'invalid purpose'; END IF;

  SELECT * INTO v_gateway FROM public.payment_gateways WHERE gateway_key = p_gateway_key;
  IF v_gateway IS NULL THEN RAISE EXCEPTION 'gateway not found'; END IF;
  IF NOT v_gateway.is_enabled THEN RAISE EXCEPTION 'gateway disabled'; END IF;
  IF v_gateway.type <> 'automatic' THEN RAISE EXCEPTION 'not an automatic gateway'; END IF;

  v_original := NULL;
  v_discount := 0;

  IF p_purpose = 'course_purchase' THEN
    IF p_course_id IS NULL THEN RAISE EXCEPTION 'course_id required'; END IF;
    SELECT id, is_paid, price_piastres, discount_price_piastres, discount_expires_at
      INTO v_course FROM public.courses WHERE id = p_course_id;
    IF v_course IS NULL THEN RAISE EXCEPTION 'course not found'; END IF;
    IF v_course.is_paid IS NOT TRUE OR v_course.price_piastres IS NULL THEN
      v_amount := 0;
    ELSIF v_course.discount_price_piastres IS NOT NULL
      AND (v_course.discount_expires_at IS NULL OR now() < v_course.discount_expires_at) THEN
      v_amount := v_course.discount_price_piastres;
      v_original := v_course.price_piastres;
    ELSE
      v_amount := v_course.price_piastres;
      v_original := v_course.price_piastres;
    END IF;
    v_discount := GREATEST(0, COALESCE(v_original, v_amount) - v_amount);
    IF v_amount <= 0 THEN RAISE EXCEPTION 'الدورة مجانية — لا حاجة لبوابة دفع'; END IF;
    IF EXISTS (SELECT 1 FROM public.enrollments WHERE user_id=v_user AND course_id=p_course_id) THEN
      RAISE EXCEPTION 'أنت مسجّل بالفعل في هذه الدورة';
    END IF;
  ELSE
    IF p_topup_amount_piastres IS NULL OR p_topup_amount_piastres <= 0 THEN
      RAISE EXCEPTION 'topup amount required';
    END IF;
    SELECT max_wallet_balance_piastres INTO v_max FROM public.wallet_gateway_settings WHERE id=1;
    IF v_max IS NULL THEN v_max := 200000; END IF;
    SELECT balance_piastres INTO v_wallet_balance FROM public.wallets WHERE user_id=v_user;
    IF COALESCE(v_wallet_balance,0) + p_topup_amount_piastres > v_max THEN
      RAISE EXCEPTION 'المبلغ سيتجاوز الحد الأقصى لرصيد المحفظة (% ج.م)', (v_max/100)::text;
    END IF;
    v_amount := p_topup_amount_piastres;
  END IF;

  v_ref := public._gen_payment_reference();
  INSERT INTO public.payment_transactions
    (reference_number, user_id, course_id, gateway_id, amount_piastres, status, purpose, topup_amount_piastres, requires_manual_review,
     original_price_piastres, discount_amount_piastres)
  VALUES
    (v_ref, v_user,
     CASE WHEN p_purpose='course_purchase' THEN p_course_id ELSE NULL END,
     v_gateway.id, v_amount, 'pending_gateway', p_purpose,
     CASE WHEN p_purpose='wallet_topup' THEN p_topup_amount_piastres ELSE NULL END,
     false, v_original, v_discount);

  RETURN jsonb_build_object('reference_number', v_ref, 'amount_piastres', v_amount);
END;
$fn$;
REVOKE ALL ON FUNCTION public.create_pending_gateway_transaction(text,text,uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_pending_gateway_transaction(text,text,uuid,integer) TO authenticated;

-- 10. UPDATE submit_manual_course_payment to record discount
CREATE OR REPLACE FUNCTION public.submit_manual_course_payment(
  p_course_id uuid,
  p_method_id uuid,
  p_sender_number text,
  p_proof_image_url text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_course RECORD;
  v_price integer;
  v_original integer;
  v_discount integer;
  v_gw RECORD;
  v_method RECORD;
  v_ref text;
  v_txn_id uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'يجب تسجيل الدخول أولاً' USING ERRCODE='42501'; END IF;
  IF p_sender_number IS NULL OR length(trim(p_sender_number)) < 4 THEN
    RAISE EXCEPTION 'رقم المُحوِّل غير صحيح';
  END IF;
  IF p_proof_image_url IS NULL OR length(trim(p_proof_image_url)) = 0 THEN
    RAISE EXCEPTION 'يجب رفع صورة إثبات التحويل';
  END IF;

  SELECT id, is_paid, price_piastres, discount_price_piastres, discount_expires_at
    INTO v_course FROM public.courses WHERE id = p_course_id;
  IF v_course IS NULL THEN RAISE EXCEPTION 'الدورة غير موجودة'; END IF;

  IF v_course.is_paid IS NOT TRUE OR v_course.price_piastres IS NULL THEN
    v_price := 0;
    v_original := NULL;
  ELSIF v_course.discount_price_piastres IS NOT NULL
        AND (v_course.discount_expires_at IS NULL OR now() < v_course.discount_expires_at) THEN
    v_price := v_course.discount_price_piastres;
    v_original := v_course.price_piastres;
  ELSE
    v_price := v_course.price_piastres;
    v_original := v_course.price_piastres;
  END IF;
  v_discount := GREATEST(0, COALESCE(v_original, v_price) - v_price);

  IF v_price <= 0 THEN RAISE EXCEPTION 'هذه الدورة مجانية'; END IF;

  IF EXISTS (SELECT 1 FROM public.enrollments WHERE user_id=v_user AND course_id=p_course_id) THEN
    RAISE EXCEPTION 'أنت مسجّل بالفعل في هذه الدورة';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.payment_transactions
    WHERE user_id=v_user AND course_id=p_course_id AND status='pending_review'
  ) THEN
    RAISE EXCEPTION 'لديك طلب دفع قيد المراجعة لهذه الدورة بالفعل';
  END IF;

  SELECT * INTO v_gw FROM public.payment_gateways WHERE gateway_key='manual';
  IF v_gw IS NULL OR NOT v_gw.is_enabled THEN RAISE EXCEPTION 'بوابة الدفع اليدوي غير مفعلة'; END IF;

  SELECT * INTO v_method FROM public.manual_payment_methods WHERE id=p_method_id;
  IF v_method IS NULL OR NOT v_method.is_enabled THEN RAISE EXCEPTION 'طريقة الدفع غير متاحة'; END IF;

  v_ref := public._gen_payment_reference();
  INSERT INTO public.payment_transactions
    (reference_number, user_id, course_id, gateway_id, amount_piastres, status, purpose, requires_manual_review,
     original_price_piastres, discount_amount_piastres)
    VALUES (v_ref, v_user, p_course_id, v_gw.id, v_price, 'pending_review', 'course_purchase', true, v_original, v_discount)
    RETURNING id INTO v_txn_id;

  INSERT INTO public.manual_payment_proofs
    (payment_transaction_id, manual_payment_method_id, sender_number, proof_image_url)
    VALUES (v_txn_id, p_method_id, trim(p_sender_number), p_proof_image_url);

  RETURN jsonb_build_object('success', true, 'transaction_id', v_txn_id, 'reference_number', v_ref);
END; $$;
