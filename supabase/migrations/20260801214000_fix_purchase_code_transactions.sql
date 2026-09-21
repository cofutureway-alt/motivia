-- Fix Purchase Code Transactions & Revenue Tracking
-- Ensures redeeming a purchase code creates a payment_transactions record
-- to update Total Revenue, Sales Analytics, and Financial Requests list.

-- 1. Ensure 'purchase_code' gateway exists in payment_gateways
INSERT INTO public.payment_gateways (id, gateway_key, display_name, is_enabled)
VALUES ('b8971f11-37d4-4a25-87d2-7c385bbf1e01', 'purchase_code', 'كود شراء', true)
ON CONFLICT (gateway_key) DO UPDATE SET display_name = 'كود شراء', is_enabled = true;

-- 2. Update redeem_purchase_code RPC to record payment_transactions
CREATE OR REPLACE FUNCTION public.redeem_purchase_code(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_clean_code text := trim(p_code);
  v_code RECORD;
  v_already_redeemed boolean;
  v_already_owned boolean;
  v_target_title text;
  v_target_price integer := 0;
  v_courses_count integer := 0;
  v_gateway_id uuid;
  v_txn_ref text;
BEGIN
  -- Caller must be authenticated
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'يجب تسجيل الدخول أولاً لاستخدام الكود.');
  END IF;

  IF v_clean_code IS NULL OR v_clean_code = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'يرجى إدخال كود الشراء.');
  END IF;

  -- 1. Look up code (case insensitive comparison)
  SELECT * INTO v_code
  FROM public.purchase_codes
  WHERE UPPER(code) = UPPER(v_clean_code);

  IF v_code IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'الكود غير صحيح.');
  END IF;

  -- 2. Check max uses
  IF v_code.use_count >= v_code.max_uses THEN
    RETURN jsonb_build_object('success', false, 'error', 'تم استخدام هذا الكود بالكامل.');
  END IF;

  -- 3. Check expiry date
  IF v_code.expires_at IS NOT NULL AND v_code.expires_at < now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'انتهت صلاحية هذا الكود.');
  END IF;

  -- 4. Check if user has already redeemed this exact code
  SELECT EXISTS (
    SELECT 1 FROM public.purchase_code_redemptions
    WHERE purchase_code_id = v_code.id AND user_id = v_user_id
  ) INTO v_already_redeemed;

  IF v_already_redeemed THEN
    RETURN jsonb_build_object('success', false, 'error', 'لقد استخدمت هذا الكود من قبل.');
  END IF;

  -- 5. Check if user already owns the target and fetch price
  IF v_code.target_type = 'course' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.enrollments
      WHERE user_id = v_user_id AND course_id = v_code.target_id
    ) INTO v_already_owned;

    SELECT title, COALESCE(price_piastres, 0) INTO v_target_title, v_target_price
    FROM public.courses WHERE id = v_code.target_id;
  ELSIF v_code.target_type = 'bundle' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.bundle_purchases
      WHERE user_id = v_user_id AND bundle_id = v_code.target_id
    ) INTO v_already_owned;

    SELECT title, COALESCE(price_piastres, 0) INTO v_target_title, v_target_price
    FROM public.bundles WHERE id = v_code.target_id;
  END IF;

  IF v_already_owned THEN
    RETURN jsonb_build_object('success', false, 'error', 'أنت مسجل بالفعل في هذا الكورس/الباقة');
  END IF;

  -- 6. Grant access
  IF v_code.target_type = 'course' THEN
    INSERT INTO public.enrollments (user_id, course_id)
    VALUES (v_user_id, v_code.target_id)
    ON CONFLICT DO NOTHING;
  ELSIF v_code.target_type = 'bundle' THEN
    v_courses_count := public._enroll_user_in_bundle(v_user_id, v_code.target_id);
    INSERT INTO public.bundle_purchases
      (user_id, bundle_id, amount_piastres, courses_included, original_price_piastres, discount_amount_piastres)
      VALUES (v_user_id, v_code.target_id, v_target_price, v_courses_count, v_target_price, 0)
      ON CONFLICT DO NOTHING;
  END IF;

  -- 7. Record redemption and increment use_count
  INSERT INTO public.purchase_code_redemptions (purchase_code_id, user_id)
  VALUES (v_code.id, v_user_id);

  UPDATE public.purchase_codes
  SET
    use_count = use_count + 1,
    updated_at = now()
  WHERE id = v_code.id;

  -- 8. Record payment_transaction for revenue tracking & analytics & payment requests queue
  SELECT id INTO v_gateway_id FROM public.payment_gateways WHERE gateway_key = 'purchase_code' LIMIT 1;
  IF v_gateway_id IS NULL THEN
    SELECT id INTO v_gateway_id FROM public.payment_gateways LIMIT 1;
  END IF;

  v_txn_ref := 'CODE-' || UPPER(v_clean_code);
  IF EXISTS (SELECT 1 FROM public.payment_transactions WHERE reference_number = v_txn_ref) THEN
    v_txn_ref := 'CODE-' || UPPER(v_clean_code) || '-' || substr(gen_random_uuid()::text, 1, 4);
  END IF;

  INSERT INTO public.payment_transactions (
    reference_number,
    user_id,
    course_id,
    bundle_id,
    gateway_id,
    amount_piastres,
    status,
    purpose,
    requires_manual_review,
    created_at
  ) VALUES (
    v_txn_ref,
    v_user_id,
    CASE WHEN v_code.target_type = 'course' THEN v_code.target_id ELSE NULL END,
    CASE WHEN v_code.target_type = 'bundle' THEN v_code.target_id ELSE NULL END,
    v_gateway_id,
    v_target_price,
    'success',
    CASE WHEN v_code.target_type = 'bundle' THEN 'bundle_purchase' ELSE 'course_purchase' END,
    false,
    now()
  ) ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object(
    'success', true,
    'target_type', v_code.target_type,
    'target_id', v_code.target_id,
    'target_title', COALESCE(v_target_title, 'الدورة/الباقة'),
    'message', 'تم تفعيل الكود بنجاح!'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.redeem_purchase_code(text) TO authenticated;

-- 3. Retroactively backfill payment_transactions for existing redemptions
DO $$
DECLARE
  r RECORD;
  v_gw_id uuid;
  v_ref text;
  v_price integer;
BEGIN
  SELECT id INTO v_gw_id FROM public.payment_gateways WHERE gateway_key = 'purchase_code' LIMIT 1;

  FOR r IN 
    SELECT pcr.id AS redemption_id, pcr.user_id, pcr.redeemed_at, pc.code, pc.target_type, pc.target_id
    FROM public.purchase_code_redemptions pcr
    JOIN public.purchase_codes pc ON pc.id = pcr.purchase_code_id
  LOOP
    v_ref := 'CODE-' || UPPER(r.code);
    IF NOT EXISTS (SELECT 1 FROM public.payment_transactions WHERE reference_number LIKE 'CODE-' || UPPER(r.code) || '%') THEN
      v_price := 0;
      IF r.target_type = 'course' THEN
        SELECT COALESCE(price_piastres, 0) INTO v_price FROM public.courses WHERE id = r.target_id;
      ELSIF r.target_type = 'bundle' THEN
        SELECT COALESCE(price_piastres, 0) INTO v_price FROM public.bundles WHERE id = r.target_id;
      END IF;

      INSERT INTO public.payment_transactions (
        reference_number,
        user_id,
        course_id,
        bundle_id,
        gateway_id,
        amount_piastres,
        status,
        purpose,
        requires_manual_review,
        created_at
      ) VALUES (
        v_ref,
        r.user_id,
        CASE WHEN r.target_type = 'course' THEN r.target_id ELSE NULL END,
        CASE WHEN r.target_type = 'bundle' THEN r.target_id ELSE NULL END,
        v_gw_id,
        v_price,
        'success',
        CASE WHEN r.target_type = 'bundle' THEN 'bundle_purchase' ELSE 'course_purchase' END,
        false,
        r.redeemed_at
      ) ON CONFLICT (reference_number) DO NOTHING;
    END IF;
  END LOOP;
END;
$$;
