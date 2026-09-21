
-- ============================================================
-- payment_gateways
-- ============================================================
CREATE TABLE public.payment_gateways (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway_key text NOT NULL UNIQUE,
  display_name text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.payment_gateways TO anon, authenticated;
GRANT ALL ON public.payment_gateways TO service_role;
ALTER TABLE public.payment_gateways ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gateways readable to all" ON public.payment_gateways FOR SELECT USING (true);
CREATE POLICY "admins manage gateways insert" ON public.payment_gateways FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins manage gateways update" ON public.payment_gateways FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins manage gateways delete" ON public.payment_gateways FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER update_payment_gateways_updated_at BEFORE UPDATE ON public.payment_gateways FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
INSERT INTO public.payment_gateways (gateway_key, display_name, is_enabled) VALUES ('wallet', 'المحفظة الإلكترونية', true);

-- ============================================================
-- wallet_gateway_settings (singleton, id = 1)
-- ============================================================
CREATE TABLE public.wallet_gateway_settings (
  id integer PRIMARY KEY CHECK (id = 1),
  max_wallet_balance_piastres integer NOT NULL DEFAULT 200000 CHECK (max_wallet_balance_piastres > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.wallet_gateway_settings TO anon, authenticated;
GRANT ALL ON public.wallet_gateway_settings TO service_role;
ALTER TABLE public.wallet_gateway_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wallet settings readable to all" ON public.wallet_gateway_settings FOR SELECT USING (true);
CREATE POLICY "admins update wallet settings" ON public.wallet_gateway_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER update_wallet_gateway_settings_updated_at BEFORE UPDATE ON public.wallet_gateway_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
INSERT INTO public.wallet_gateway_settings (id, max_wallet_balance_piastres) VALUES (1, 200000);

-- ============================================================
-- payment_transactions
-- ============================================================
CREATE TABLE public.payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_number text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  gateway_id uuid NOT NULL REFERENCES public.payment_gateways(id) ON DELETE RESTRICT,
  amount_piastres integer NOT NULL CHECK (amount_piastres >= 0),
  status text NOT NULL CHECK (status IN ('success','failed')),
  failure_reason text,
  wallet_transaction_id uuid REFERENCES public.wallet_transactions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.payment_transactions TO authenticated;
GRANT ALL ON public.payment_transactions TO service_role;
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "students see own payment txns" ON public.payment_transactions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE INDEX idx_payment_txns_user ON public.payment_transactions(user_id, created_at DESC);
CREATE INDEX idx_payment_txns_course ON public.payment_transactions(course_id, created_at DESC);

-- Reference generator for payment_transactions
CREATE OR REPLACE FUNCTION public._gen_payment_reference()
RETURNS text LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  suffix text; attempts int := 0; candidate text;
BEGIN
  LOOP
    suffix := '';
    FOR i IN 1..8 LOOP
      suffix := suffix || substr(chars, 1 + floor(random() * length(chars))::int, 1);
    END LOOP;
    candidate := 'PAY-' || suffix;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.payment_transactions WHERE reference_number = candidate);
    attempts := attempts + 1;
    IF attempts > 20 THEN
      candidate := 'PAY-' || substr(replace(gen_random_uuid()::text,'-',''),1,10);
      EXIT;
    END IF;
  END LOOP;
  RETURN candidate;
END; $$;

-- ============================================================
-- purchase_course (atomic)
-- ============================================================
CREATE OR REPLACE FUNCTION public.purchase_course(p_course_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_course RECORD;
  v_price integer;
  v_gw RECORD;
  v_wallet RECORD;
  v_new_balance integer;
  v_wallet_ref text;
  v_wallet_txn_id uuid;
  v_pay_ref text;
  v_pay_id uuid;
  v_failure text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول أولاً' USING ERRCODE = '42501';
  END IF;

  SELECT id, is_paid, price_piastres, discount_price_piastres, discount_expires_at, status
    INTO v_course FROM public.courses WHERE id = p_course_id;
  IF v_course IS NULL THEN
    RAISE EXCEPTION 'الدورة غير موجودة';
  END IF;

  -- Effective price (mirrors getEffectiveCoursePrice in src/lib/money.ts exactly)
  IF v_course.is_paid IS NOT TRUE OR v_course.price_piastres IS NULL THEN
    v_price := 0;
  ELSIF v_course.discount_price_piastres IS NOT NULL
        AND (v_course.discount_expires_at IS NULL OR now() < v_course.discount_expires_at) THEN
    v_price := v_course.discount_price_piastres;
  ELSE
    v_price := v_course.price_piastres;
  END IF;

  -- Already enrolled?
  IF EXISTS (SELECT 1 FROM public.enrollments WHERE user_id = v_user AND course_id = p_course_id) THEN
    RETURN jsonb_build_object('success', false, 'already_enrolled', true,
                              'failure_reason', 'أنت مسجّل بالفعل في هذه الدورة');
  END IF;

  -- Free courses: enroll directly, no transaction record.
  IF v_price = 0 THEN
    INSERT INTO public.enrollments (user_id, course_id) VALUES (v_user, p_course_id)
      ON CONFLICT DO NOTHING;
    RETURN jsonb_build_object('success', true, 'free', true);
  END IF;

  -- Wallet gateway lookup
  SELECT * INTO v_gw FROM public.payment_gateways WHERE gateway_key = 'wallet';
  IF v_gw IS NULL OR NOT v_gw.is_enabled THEN
    v_failure := 'بوابة الدفع غير متاحة حالياً';
    v_pay_ref := public._gen_payment_reference();
    INSERT INTO public.payment_transactions
      (reference_number, user_id, course_id, gateway_id, amount_piastres, status, failure_reason)
      VALUES (v_pay_ref, v_user, p_course_id,
              COALESCE(v_gw.id, (SELECT id FROM public.payment_gateways WHERE gateway_key='wallet')),
              v_price, 'failed', v_failure);
    RETURN jsonb_build_object('success', false, 'failure_reason', v_failure, 'reference_number', v_pay_ref);
  END IF;

  -- Lock wallet row (create if missing to be safe)
  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_user FOR UPDATE;
  IF v_wallet IS NULL THEN
    INSERT INTO public.wallets (user_id, balance_piastres) VALUES (v_user, 0)
      RETURNING * INTO v_wallet;
  END IF;

  IF v_wallet.balance_piastres < v_price THEN
    v_failure := 'رصيد غير كافٍ';
    v_pay_ref := public._gen_payment_reference();
    INSERT INTO public.payment_transactions
      (reference_number, user_id, course_id, gateway_id, amount_piastres, status, failure_reason)
      VALUES (v_pay_ref, v_user, p_course_id, v_gw.id, v_price, 'failed', v_failure);
    RETURN jsonb_build_object('success', false, 'failure_reason', v_failure,
                              'reference_number', v_pay_ref,
                              'current_balance_piastres', v_wallet.balance_piastres,
                              'required_piastres', v_price);
  END IF;

  -- Charge
  v_new_balance := v_wallet.balance_piastres - v_price;
  UPDATE public.wallets SET balance_piastres = v_new_balance, updated_at = now() WHERE id = v_wallet.id;

  v_wallet_ref := public._gen_txn_reference();
  INSERT INTO public.wallet_transactions
    (reference_number, wallet_id, type, amount_piastres, balance_after_piastres, performed_by, notes)
    VALUES (v_wallet_ref, v_wallet.id, 'purchase', v_price, v_new_balance, v_user,
            'شراء دورة: ' || p_course_id::text)
    RETURNING id INTO v_wallet_txn_id;

  -- Enroll (ON CONFLICT protects against a rare race where user got enrolled between the earlier check and here)
  INSERT INTO public.enrollments (user_id, course_id) VALUES (v_user, p_course_id)
    ON CONFLICT DO NOTHING;

  v_pay_ref := public._gen_payment_reference();
  INSERT INTO public.payment_transactions
    (reference_number, user_id, course_id, gateway_id, amount_piastres, status, wallet_transaction_id)
    VALUES (v_pay_ref, v_user, p_course_id, v_gw.id, v_price, 'success', v_wallet_txn_id)
    RETURNING id INTO v_pay_id;

  RETURN jsonb_build_object(
    'success', true,
    'reference_number', v_pay_ref,
    'wallet_reference_number', v_wallet_ref,
    'new_balance_piastres', v_new_balance,
    'amount_piastres', v_price
  );
END; $$;

REVOKE ALL ON FUNCTION public.purchase_course(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.purchase_course(uuid) TO authenticated;

-- ============================================================
-- admin_reset_all_wallets
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_reset_all_wallets()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_row RECORD;
  v_ref text;
  v_count int := 0;
  v_total_piastres bigint := 0;
BEGIN
  IF NOT public.has_role(v_admin, 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  FOR v_row IN
    SELECT w.id AS wallet_id, w.balance_piastres, p.id AS user_id
    FROM public.wallets w
    JOIN public.profiles p ON p.id = w.user_id
    WHERE p.role = 'student' AND COALESCE(p.is_banned, false) = false
      AND w.balance_piastres > 0
    FOR UPDATE OF w
  LOOP
    v_ref := public._gen_txn_reference();
    INSERT INTO public.wallet_transactions
      (reference_number, wallet_id, type, amount_piastres, balance_after_piastres, performed_by, notes)
      VALUES (v_ref, v_row.wallet_id, 'admin_reset', v_row.balance_piastres, 0, v_admin,
              'تصفير جميع المحافظ');
    UPDATE public.wallets SET balance_piastres = 0, updated_at = now() WHERE id = v_row.wallet_id;
    v_count := v_count + 1;
    v_total_piastres := v_total_piastres + v_row.balance_piastres;
  END LOOP;

  RETURN jsonb_build_object(
    'success_count', v_count,
    'total_piastres_removed', v_total_piastres
  );
END; $$;

REVOKE ALL ON FUNCTION public.admin_reset_all_wallets() FROM public;
GRANT EXECUTE ON FUNCTION public.admin_reset_all_wallets() TO authenticated;

-- ============================================================
-- Update redeem_top_up_card to read max balance from settings table
-- ============================================================
CREATE OR REPLACE FUNCTION public.redeem_top_up_card(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_max_balance integer;
  v_user uuid := auth.uid();
  v_code text := trim(COALESCE(p_code, ''));
  v_card RECORD;
  v_wallet RECORD;
  v_new_balance integer;
  v_ref text;
  v_max_egp text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول أولاً' USING ERRCODE = '42501';
  END IF;

  IF v_code !~ '^[0-9]{6}$' THEN
    RAISE EXCEPTION 'الكود غير صحيح';
  END IF;

  SELECT max_wallet_balance_piastres INTO v_max_balance
    FROM public.wallet_gateway_settings WHERE id = 1;
  IF v_max_balance IS NULL THEN v_max_balance := 200000; END IF;

  SELECT * INTO v_card FROM public.top_up_cards WHERE code = v_code FOR UPDATE;
  IF v_card IS NULL THEN
    RAISE EXCEPTION 'الكود غير صحيح';
  END IF;

  IF v_card.is_redeemed THEN
    RAISE EXCEPTION 'تم استخدام هذا الكود من قبل، لا يمكن استخدامه مرة أخرى.';
  END IF;

  IF v_card.expires_at IS NOT NULL AND now() > v_card.expires_at THEN
    RAISE EXCEPTION 'انتهت صلاحية هذا الكود.';
  END IF;

  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_user FOR UPDATE;
  IF v_wallet IS NULL THEN
    INSERT INTO public.wallets(user_id, balance_piastres) VALUES (v_user, 0)
      RETURNING * INTO v_wallet;
  END IF;

  IF v_wallet.balance_piastres + v_card.value_piastres > v_max_balance THEN
    v_max_egp := (v_max_balance / 100)::text;
    RAISE EXCEPTION 'لا يمكن إتمام العملية، الحد الأقصى لرصيد المحفظة هو % جنيه.', v_max_egp;
  END IF;

  v_new_balance := v_wallet.balance_piastres + v_card.value_piastres;

  UPDATE public.top_up_cards
    SET is_redeemed = true, redeemed_by = v_user, redeemed_at = now()
    WHERE id = v_card.id;

  UPDATE public.wallets
    SET balance_piastres = v_new_balance, updated_at = now()
    WHERE id = v_wallet.id;

  v_ref := public._gen_txn_reference();

  INSERT INTO public.wallet_transactions
    (reference_number, wallet_id, type, amount_piastres, balance_after_piastres, related_card_id, performed_by)
  VALUES
    (v_ref, v_wallet.id, 'card_redemption', v_card.value_piastres, v_new_balance, v_card.id, NULL);

  RETURN jsonb_build_object(
    'success', true,
    'new_balance_piastres', v_new_balance,
    'amount_piastres', v_card.value_piastres,
    'reference_number', v_ref
  );
END;
$function$;

-- ============================================================
-- Update admin_adjust_wallet to read max balance from settings
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_adjust_wallet(p_user_id uuid, p_amount_piastres integer, p_type text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_max_balance integer;
  v_admin uuid := auth.uid();
  v_wallet RECORD;
  v_new_balance integer;
  v_ref text;
BEGIN
  IF NOT public.has_role(v_admin, 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_amount_piastres IS NULL OR p_amount_piastres <= 0 THEN
    RAISE EXCEPTION 'قيمة غير صحيحة';
  END IF;
  IF p_type NOT IN ('admin_charge','admin_deduct') THEN
    RAISE EXCEPTION 'نوع العملية غير صحيح';
  END IF;

  SELECT max_wallet_balance_piastres INTO v_max_balance
    FROM public.wallet_gateway_settings WHERE id = 1;
  IF v_max_balance IS NULL THEN v_max_balance := 200000; END IF;

  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = p_user_id FOR UPDATE;
  IF v_wallet IS NULL THEN
    INSERT INTO public.wallets(user_id, balance_piastres) VALUES (p_user_id, 0)
      RETURNING * INTO v_wallet;
  END IF;

  IF p_type = 'admin_charge' THEN
    v_new_balance := v_wallet.balance_piastres + p_amount_piastres;
    IF v_new_balance > v_max_balance THEN
      RAISE EXCEPTION 'العملية ستتجاوز الحد الأقصى للرصيد (% ج.م)', (v_max_balance/100)::text;
    END IF;
  ELSE
    v_new_balance := v_wallet.balance_piastres - p_amount_piastres;
    IF v_new_balance < 0 THEN
      RAISE EXCEPTION 'رصيد المحفظة غير كافٍ للخصم';
    END IF;
  END IF;

  UPDATE public.wallets SET balance_piastres = v_new_balance, updated_at = now() WHERE id = v_wallet.id;

  v_ref := public._gen_txn_reference();
  INSERT INTO public.wallet_transactions
    (reference_number, wallet_id, type, amount_piastres, balance_after_piastres, performed_by)
    VALUES (v_ref, v_wallet.id, p_type, p_amount_piastres, v_new_balance, v_admin);

  RETURN jsonb_build_object(
    'success', true,
    'new_balance_piastres', v_new_balance,
    'reference_number', v_ref
  );
END;
$function$;

-- ============================================================
-- Update admin_bulk_adjust_wallets to read max balance from settings
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_bulk_adjust_wallets(p_amount_piastres integer, p_type text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_max_balance integer;
  v_admin uuid := auth.uid();
  v_row RECORD;
  v_new_balance integer;
  v_ref text;
  v_success int := 0;
  v_skipped int := 0;
  v_skipped_users jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.has_role(v_admin, 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_amount_piastres IS NULL OR p_amount_piastres <= 0 THEN
    RAISE EXCEPTION 'قيمة غير صحيحة';
  END IF;
  IF p_type NOT IN ('bulk_charge','bulk_deduct') THEN
    RAISE EXCEPTION 'نوع العملية غير صحيح';
  END IF;

  SELECT max_wallet_balance_piastres INTO v_max_balance
    FROM public.wallet_gateway_settings WHERE id = 1;
  IF v_max_balance IS NULL THEN v_max_balance := 200000; END IF;

  FOR v_row IN
    SELECT w.id AS wallet_id, w.balance_piastres, p.id AS user_id, p.full_name
    FROM public.wallets w
    JOIN public.profiles p ON p.id = w.user_id
    WHERE p.role = 'student' AND COALESCE(p.is_banned, false) = false
    ORDER BY p.full_name
    FOR UPDATE OF w
  LOOP
    IF p_type = 'bulk_charge' THEN
      v_new_balance := v_row.balance_piastres + p_amount_piastres;
      IF v_new_balance > v_max_balance THEN
        v_skipped := v_skipped + 1;
        v_skipped_users := v_skipped_users || jsonb_build_object(
          'user_id', v_row.user_id, 'full_name', v_row.full_name, 'reason', 'over_max'
        );
        CONTINUE;
      END IF;
    ELSE
      v_new_balance := v_row.balance_piastres - p_amount_piastres;
      IF v_new_balance < 0 THEN
        v_skipped := v_skipped + 1;
        v_skipped_users := v_skipped_users || jsonb_build_object(
          'user_id', v_row.user_id, 'full_name', v_row.full_name, 'reason', 'insufficient'
        );
        CONTINUE;
      END IF;
    END IF;

    UPDATE public.wallets SET balance_piastres = v_new_balance, updated_at = now() WHERE id = v_row.wallet_id;
    v_ref := public._gen_txn_reference();
    INSERT INTO public.wallet_transactions
      (reference_number, wallet_id, type, amount_piastres, balance_after_piastres, performed_by)
      VALUES (v_ref, v_row.wallet_id, p_type, p_amount_piastres, v_new_balance, v_admin);
    v_success := v_success + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success_count', v_success,
    'skipped_count', v_skipped,
    'skipped_users', v_skipped_users
  );
END;
$function$;
