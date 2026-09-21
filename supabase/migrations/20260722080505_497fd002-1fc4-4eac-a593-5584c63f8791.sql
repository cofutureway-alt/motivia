
-- 1. Extend payment_gateways
ALTER TABLE public.payment_gateways
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'automatic',
  ADD COLUMN IF NOT EXISTS config jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.payment_gateways DROP CONSTRAINT IF EXISTS payment_gateways_type_check;
ALTER TABLE public.payment_gateways
  ADD CONSTRAINT payment_gateways_type_check CHECK (type IN ('automatic','manual'));

-- 2. Extend payment_transactions
ALTER TABLE public.payment_transactions
  ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'course_purchase',
  ADD COLUMN IF NOT EXISTS topup_amount_piastres integer,
  ADD COLUMN IF NOT EXISTS requires_manual_review boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_notes text;

ALTER TABLE public.payment_transactions ALTER COLUMN course_id DROP NOT NULL;

ALTER TABLE public.payment_transactions DROP CONSTRAINT IF EXISTS payment_transactions_purpose_check;
ALTER TABLE public.payment_transactions
  ADD CONSTRAINT payment_transactions_purpose_check CHECK (purpose IN ('course_purchase','wallet_topup'));

ALTER TABLE public.payment_transactions DROP CONSTRAINT IF EXISTS payment_transactions_status_check;
ALTER TABLE public.payment_transactions
  ADD CONSTRAINT payment_transactions_status_check CHECK (status IN ('success','failed','pending_review'));

-- 3. Extend wallet_transactions.type to allow 'gateway_topup'
ALTER TABLE public.wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_type_check;
ALTER TABLE public.wallet_transactions
  ADD CONSTRAINT wallet_transactions_type_check CHECK (type IN (
    'card_redemption','admin_charge','admin_deduct','bulk_charge','bulk_deduct',
    'purchase','admin_reset','gateway_topup'
  ));

-- 4. Insert manual payment gateway (disabled by default)
INSERT INTO public.payment_gateways (gateway_key, display_name, is_enabled, type)
VALUES ('manual','الدفع اليدوي', false, 'manual')
ON CONFLICT (gateway_key) DO UPDATE SET type='manual';

-- 5. manual_payment_methods
CREATE TABLE IF NOT EXISTS public.manual_payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  method_type text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  account_number text NOT NULL,
  account_holder_name text NOT NULL,
  support_whatsapp_number text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT manual_payment_methods_type_check CHECK (method_type IN ('vodafone_cash','instapay'))
);

GRANT SELECT ON public.manual_payment_methods TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.manual_payment_methods TO authenticated;
GRANT ALL ON public.manual_payment_methods TO service_role;

ALTER TABLE public.manual_payment_methods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "manual methods readable" ON public.manual_payment_methods;
CREATE POLICY "manual methods readable" ON public.manual_payment_methods FOR SELECT USING (true);

DROP POLICY IF EXISTS "admins manage manual methods insert" ON public.manual_payment_methods;
CREATE POLICY "admins manage manual methods insert" ON public.manual_payment_methods
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "admins manage manual methods update" ON public.manual_payment_methods;
CREATE POLICY "admins manage manual methods update" ON public.manual_payment_methods
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "admins manage manual methods delete" ON public.manual_payment_methods;
CREATE POLICY "admins manage manual methods delete" ON public.manual_payment_methods
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

DROP TRIGGER IF EXISTS update_manual_payment_methods_updated_at ON public.manual_payment_methods;
CREATE TRIGGER update_manual_payment_methods_updated_at
  BEFORE UPDATE ON public.manual_payment_methods
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. manual_payment_proofs
CREATE TABLE IF NOT EXISTS public.manual_payment_proofs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_transaction_id uuid NOT NULL REFERENCES public.payment_transactions(id) ON DELETE CASCADE,
  manual_payment_method_id uuid NOT NULL REFERENCES public.manual_payment_methods(id) ON DELETE RESTRICT,
  sender_number text NOT NULL,
  proof_image_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_manual_proofs_txn ON public.manual_payment_proofs(payment_transaction_id);

GRANT SELECT, INSERT ON public.manual_payment_proofs TO authenticated;
GRANT ALL ON public.manual_payment_proofs TO service_role;

ALTER TABLE public.manual_payment_proofs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "proofs owner or admin select" ON public.manual_payment_proofs;
CREATE POLICY "proofs owner or admin select" ON public.manual_payment_proofs FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR EXISTS (SELECT 1 FROM public.payment_transactions t
               WHERE t.id = payment_transaction_id AND t.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "proofs owner insert" ON public.manual_payment_proofs;
CREATE POLICY "proofs owner insert" ON public.manual_payment_proofs FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.payment_transactions t
            WHERE t.id = payment_transaction_id AND t.user_id = auth.uid())
  );

-- 7. RPC: submit manual payment (course purchase)
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
  ELSIF v_course.discount_price_piastres IS NOT NULL
        AND (v_course.discount_expires_at IS NULL OR now() < v_course.discount_expires_at) THEN
    v_price := v_course.discount_price_piastres;
  ELSE
    v_price := v_course.price_piastres;
  END IF;

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
    (reference_number, user_id, course_id, gateway_id, amount_piastres, status, purpose, requires_manual_review)
    VALUES (v_ref, v_user, p_course_id, v_gw.id, v_price, 'pending_review', 'course_purchase', true)
    RETURNING id INTO v_txn_id;

  INSERT INTO public.manual_payment_proofs
    (payment_transaction_id, manual_payment_method_id, sender_number, proof_image_url)
    VALUES (v_txn_id, p_method_id, trim(p_sender_number), p_proof_image_url);

  RETURN jsonb_build_object('success', true, 'transaction_id', v_txn_id, 'reference_number', v_ref);
END; $$;

-- 8. RPC: submit manual payment (wallet top-up)
CREATE OR REPLACE FUNCTION public.submit_manual_wallet_topup(
  p_amount_piastres integer,
  p_method_id uuid,
  p_sender_number text,
  p_proof_image_url text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_max integer;
  v_wallet RECORD;
  v_gw RECORD;
  v_method RECORD;
  v_ref text;
  v_txn_id uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'يجب تسجيل الدخول أولاً' USING ERRCODE='42501'; END IF;
  IF p_amount_piastres IS NULL OR p_amount_piastres <= 0 THEN
    RAISE EXCEPTION 'قيمة الشحن غير صحيحة';
  END IF;
  IF p_sender_number IS NULL OR length(trim(p_sender_number)) < 4 THEN
    RAISE EXCEPTION 'رقم المُحوِّل غير صحيح';
  END IF;
  IF p_proof_image_url IS NULL OR length(trim(p_proof_image_url)) = 0 THEN
    RAISE EXCEPTION 'يجب رفع صورة إثبات التحويل';
  END IF;

  SELECT max_wallet_balance_piastres INTO v_max FROM public.wallet_gateway_settings WHERE id=1;
  IF v_max IS NULL THEN v_max := 200000; END IF;

  SELECT * INTO v_wallet FROM public.wallets WHERE user_id=v_user;
  IF v_wallet IS NULL THEN
    INSERT INTO public.wallets(user_id, balance_piastres) VALUES (v_user, 0) RETURNING * INTO v_wallet;
  END IF;

  IF v_wallet.balance_piastres + p_amount_piastres > v_max THEN
    RAISE EXCEPTION 'المبلغ سيتجاوز الحد الأقصى للرصيد (% ج.م)', (v_max/100)::text;
  END IF;

  SELECT * INTO v_gw FROM public.payment_gateways WHERE gateway_key='manual';
  IF v_gw IS NULL OR NOT v_gw.is_enabled THEN RAISE EXCEPTION 'بوابة الدفع اليدوي غير مفعلة'; END IF;

  SELECT * INTO v_method FROM public.manual_payment_methods WHERE id=p_method_id;
  IF v_method IS NULL OR NOT v_method.is_enabled THEN RAISE EXCEPTION 'طريقة الدفع غير متاحة'; END IF;

  v_ref := public._gen_payment_reference();
  INSERT INTO public.payment_transactions
    (reference_number, user_id, course_id, gateway_id, amount_piastres, status, purpose,
     topup_amount_piastres, requires_manual_review)
    VALUES (v_ref, v_user, NULL, v_gw.id, p_amount_piastres, 'pending_review', 'wallet_topup',
            p_amount_piastres, true)
    RETURNING id INTO v_txn_id;

  INSERT INTO public.manual_payment_proofs
    (payment_transaction_id, manual_payment_method_id, sender_number, proof_image_url)
    VALUES (v_txn_id, p_method_id, trim(p_sender_number), p_proof_image_url);

  RETURN jsonb_build_object('success', true, 'transaction_id', v_txn_id, 'reference_number', v_ref);
END; $$;

-- 9. RPC: admin approve
CREATE OR REPLACE FUNCTION public.admin_approve_payment_request(
  p_transaction_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
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

-- 10. RPC: admin reject
CREATE OR REPLACE FUNCTION public.admin_reject_payment_request(
  p_transaction_id uuid,
  p_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_txn RECORD;
BEGIN
  IF NOT public.has_role(v_admin, 'admin') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN RAISE EXCEPTION 'يجب إدخال سبب واضح للرفض'; END IF;

  SELECT * INTO v_txn FROM public.payment_transactions WHERE id=p_transaction_id FOR UPDATE;
  IF v_txn IS NULL THEN RAISE EXCEPTION 'الطلب غير موجود'; END IF;
  IF v_txn.status <> 'pending_review' THEN RAISE EXCEPTION 'هذا الطلب لم يعد قابلاً للمراجعة'; END IF;

  UPDATE public.payment_transactions
    SET status='failed', failure_reason=trim(p_reason), review_notes=trim(p_reason),
        reviewed_by=v_admin, reviewed_at=now()
    WHERE id=p_transaction_id;

  RETURN jsonb_build_object('success', true);
END; $$;

-- 11. RPC: admin list payment requests (with joined info)
CREATE OR REPLACE FUNCTION public.admin_list_payment_requests(
  _status text DEFAULT 'pending_review',
  _purpose text DEFAULT NULL,
  _limit integer DEFAULT 100,
  _offset integer DEFAULT 0
) RETURNS TABLE(
  transaction_id uuid, reference_number text, purpose text, status text,
  user_id uuid, student_name text, student_phone text, student_student_id text,
  course_id uuid, course_title text,
  amount_piastres integer, topup_amount_piastres integer,
  gateway_display_name text, method_type text, method_account_number text,
  method_account_holder text, method_whatsapp text,
  sender_number text, proof_image_url text,
  review_notes text, failure_reason text,
  reviewed_at timestamptz, created_at timestamptz, total_count bigint
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  RETURN QUERY
  WITH base AS (
    SELECT t.id AS transaction_id, t.reference_number, t.purpose, t.status,
      p.id AS user_id, p.full_name AS student_name, p.phone_number AS student_phone, p.student_id AS student_student_id,
      c.id AS course_id, c.title AS course_title,
      t.amount_piastres, t.topup_amount_piastres,
      g.display_name AS gateway_display_name,
      mm.method_type, mm.account_number AS method_account_number,
      mm.account_holder_name AS method_account_holder, mm.support_whatsapp_number AS method_whatsapp,
      pr.sender_number, pr.proof_image_url,
      t.review_notes, t.failure_reason, t.reviewed_at, t.created_at
    FROM public.payment_transactions t
    JOIN public.profiles p ON p.id = t.user_id
    JOIN public.payment_gateways g ON g.id = t.gateway_id
    LEFT JOIN public.courses c ON c.id = t.course_id
    LEFT JOIN public.manual_payment_proofs pr ON pr.payment_transaction_id = t.id
    LEFT JOIN public.manual_payment_methods mm ON mm.id = pr.manual_payment_method_id
    WHERE (_status IS NULL OR t.status = _status)
      AND (_purpose IS NULL OR t.purpose = _purpose)
  ),
  counted AS (SELECT b.*, COUNT(*) OVER () AS total_count FROM base b)
  SELECT * FROM counted
  ORDER BY created_at DESC
  LIMIT GREATEST(COALESCE(_limit,100),1) OFFSET GREATEST(COALESCE(_offset,0),0);
END; $$;

-- 12. RPC: student list own payment requests
CREATE OR REPLACE FUNCTION public.student_list_own_payment_requests()
RETURNS TABLE(
  transaction_id uuid, reference_number text, purpose text, status text,
  course_id uuid, course_title text,
  amount_piastres integer, topup_amount_piastres integer,
  gateway_display_name text, method_type text,
  method_account_number text, method_whatsapp text,
  sender_number text, proof_image_url text,
  review_notes text, failure_reason text,
  reviewed_at timestamptz, created_at timestamptz
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth required' USING ERRCODE='42501'; END IF;
  RETURN QUERY
  SELECT t.id, t.reference_number, t.purpose, t.status,
    c.id, c.title,
    t.amount_piastres, t.topup_amount_piastres,
    g.display_name, mm.method_type,
    mm.account_number, mm.support_whatsapp_number,
    pr.sender_number, pr.proof_image_url,
    t.review_notes, t.failure_reason, t.reviewed_at, t.created_at
  FROM public.payment_transactions t
  JOIN public.payment_gateways g ON g.id = t.gateway_id
  LEFT JOIN public.courses c ON c.id = t.course_id
  LEFT JOIN public.manual_payment_proofs pr ON pr.payment_transaction_id = t.id
  LEFT JOIN public.manual_payment_methods mm ON mm.id = pr.manual_payment_method_id
  WHERE t.user_id = v_user
  ORDER BY t.created_at DESC;
END; $$;

-- 13. Ensure the gateway enable trigger: manual gateway needs at least one enabled method
CREATE OR REPLACE FUNCTION public.validate_manual_gateway_enable()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.gateway_key='manual' AND NEW.is_enabled = true THEN
    IF NOT EXISTS (SELECT 1 FROM public.manual_payment_methods WHERE is_enabled=true) THEN
      RAISE EXCEPTION 'لا يمكن تفعيل بوابة الدفع اليدوي بدون وجود طريقة دفع مفعلة واحدة على الأقل';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_validate_manual_gateway_enable ON public.payment_gateways;
CREATE TRIGGER trg_validate_manual_gateway_enable
  BEFORE UPDATE OR INSERT ON public.payment_gateways
  FOR EACH ROW EXECUTE FUNCTION public.validate_manual_gateway_enable();

GRANT EXECUTE ON FUNCTION public.submit_manual_course_payment(uuid,uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_manual_wallet_topup(integer,uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_approve_payment_request(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reject_payment_request(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_payment_requests(text,text,integer,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.student_list_own_payment_requests() TO authenticated;
