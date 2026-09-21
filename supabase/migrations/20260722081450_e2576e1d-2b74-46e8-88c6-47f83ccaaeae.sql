
-- 1) Extend payment_transactions status
ALTER TABLE public.payment_transactions DROP CONSTRAINT IF EXISTS payment_transactions_status_check;
ALTER TABLE public.payment_transactions ADD CONSTRAINT payment_transactions_status_check
  CHECK (status = ANY (ARRAY['success'::text, 'failed'::text, 'pending_review'::text, 'pending_gateway'::text]));

-- 2) Admin-only secrets table (isolated from public gateway metadata)
CREATE TABLE IF NOT EXISTS public.payment_gateway_secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway_id uuid NOT NULL UNIQUE REFERENCES public.payment_gateways(id) ON DELETE CASCADE,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_gateway_secrets TO authenticated;
GRANT ALL ON public.payment_gateway_secrets TO service_role;
ALTER TABLE public.payment_gateway_secrets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read gateway secrets" ON public.payment_gateway_secrets
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins insert gateway secrets" ON public.payment_gateway_secrets
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins update gateway secrets" ON public.payment_gateway_secrets
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins delete gateway secrets" ON public.payment_gateway_secrets
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_payment_gateway_secrets_updated_at
  BEFORE UPDATE ON public.payment_gateway_secrets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Move any existing config values into the new secrets table before dropping
INSERT INTO public.payment_gateway_secrets (gateway_id, config)
SELECT id, COALESCE(config, '{}'::jsonb) FROM public.payment_gateways
ON CONFLICT (gateway_id) DO NOTHING;

ALTER TABLE public.payment_gateways DROP COLUMN IF EXISTS config;

-- 4) Register Kashier gateway (disabled by default)
INSERT INTO public.payment_gateways (gateway_key, display_name, type, is_enabled)
VALUES ('kashier', 'Kashier', 'automatic', false)
ON CONFLICT (gateway_key) DO NOTHING;

INSERT INTO public.payment_gateway_secrets (gateway_id, config)
SELECT id, jsonb_build_object('merchant_id','','api_key','','secret_key','','mode','test')
FROM public.payment_gateways WHERE gateway_key='kashier'
ON CONFLICT (gateway_id) DO NOTHING;

-- 5) Create pending gateway transaction (called by student initiating an automatic gateway payment)
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
    ELSE
      v_amount := v_course.price_piastres;
    END IF;
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
    (reference_number, user_id, course_id, gateway_id, amount_piastres, status, purpose, topup_amount_piastres, requires_manual_review)
  VALUES
    (v_ref, v_user,
     CASE WHEN p_purpose='course_purchase' THEN p_course_id ELSE NULL END,
     v_gateway.id, v_amount, 'pending_gateway', p_purpose,
     CASE WHEN p_purpose='wallet_topup' THEN p_topup_amount_piastres ELSE NULL END,
     false);

  RETURN jsonb_build_object('reference_number', v_ref, 'amount_piastres', v_amount);
END;
$fn$;

REVOKE ALL ON FUNCTION public.create_pending_gateway_transaction(text,text,uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_pending_gateway_transaction(text,text,uuid,integer) TO authenticated;

-- 6) Finalize kashier transaction — called from webhook via service role
CREATE OR REPLACE FUNCTION public.finalize_gateway_transaction(
  p_reference text,
  p_success boolean,
  p_failure_reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_txn RECORD;
  v_max integer;
  v_wallet RECORD;
  v_new_balance integer;
  v_wref text;
  v_wtx_id uuid;
BEGIN
  SELECT * INTO v_txn FROM public.payment_transactions WHERE reference_number = p_reference FOR UPDATE;
  IF v_txn IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'transaction not found'); END IF;
  IF v_txn.status <> 'pending_gateway' THEN
    RETURN jsonb_build_object('ok', true, 'already_finalized', true, 'status', v_txn.status);
  END IF;

  IF NOT p_success THEN
    UPDATE public.payment_transactions
      SET status='failed', failure_reason=COALESCE(p_failure_reason,'gateway declined')
      WHERE id = v_txn.id;
    RETURN jsonb_build_object('ok', true, 'status', 'failed');
  END IF;

  IF v_txn.purpose = 'course_purchase' THEN
    IF v_txn.course_id IS NULL THEN
      UPDATE public.payment_transactions SET status='failed', failure_reason='course missing' WHERE id=v_txn.id;
      RETURN jsonb_build_object('ok', true, 'status', 'failed');
    END IF;
    INSERT INTO public.enrollments (user_id, course_id) VALUES (v_txn.user_id, v_txn.course_id)
      ON CONFLICT DO NOTHING;
    UPDATE public.payment_transactions SET status='success' WHERE id=v_txn.id;
    RETURN jsonb_build_object('ok', true, 'status', 'success', 'purpose', 'course_purchase');

  ELSIF v_txn.purpose = 'wallet_topup' THEN
    SELECT max_wallet_balance_piastres INTO v_max FROM public.wallet_gateway_settings WHERE id=1;
    IF v_max IS NULL THEN v_max := 200000; END IF;

    SELECT * INTO v_wallet FROM public.wallets WHERE user_id=v_txn.user_id FOR UPDATE;
    IF v_wallet IS NULL THEN
      INSERT INTO public.wallets(user_id, balance_piastres) VALUES (v_txn.user_id, 0) RETURNING * INTO v_wallet;
    END IF;

    IF v_wallet.balance_piastres + COALESCE(v_txn.topup_amount_piastres,0) > v_max THEN
      -- Do NOT silently truncate. Mark failed, flag for admin reconciliation.
      UPDATE public.payment_transactions
        SET status='failed',
            failure_reason='تم الدفع بنجاح ولكن الرصيد سيتجاوز الحد الأقصى (' || (v_max/100)::text || ' ج.م). يستوجب مراجعة إدارية.',
            requires_manual_review = true
        WHERE id = v_txn.id;
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

    UPDATE public.payment_transactions
      SET status='success', wallet_transaction_id=v_wtx_id
      WHERE id=v_txn.id;

    RETURN jsonb_build_object('ok', true, 'status', 'success', 'purpose', 'wallet_topup', 'new_balance_piastres', v_new_balance);
  END IF;

  RETURN jsonb_build_object('ok', false, 'error', 'unsupported purpose');
END;
$fn$;

REVOKE ALL ON FUNCTION public.finalize_gateway_transaction(text,boolean,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_gateway_transaction(text,boolean,text) TO service_role;

-- 7) Student polls transaction status by reference number
CREATE OR REPLACE FUNCTION public.get_own_payment_transaction_status(p_reference text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_user uuid := auth.uid();
  v_txn RECORD;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth required' USING ERRCODE='42501'; END IF;
  SELECT id, reference_number, status, purpose, course_id, amount_piastres, topup_amount_piastres, failure_reason
    INTO v_txn FROM public.payment_transactions
    WHERE reference_number = p_reference AND user_id = v_user;
  IF v_txn IS NULL THEN RETURN NULL; END IF;
  RETURN to_jsonb(v_txn);
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.get_own_payment_transaction_status(text) TO authenticated;

-- 8) Update admin payment-requests queue to also surface failed automatic-gateway rows needing reconciliation
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
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
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
      mm.method_type::text, mm.account_number AS method_account_number,
      mm.account_holder_name AS method_account_holder, mm.support_whatsapp_number AS method_whatsapp,
      pr.sender_number, pr.proof_image_url,
      t.review_notes, t.failure_reason, t.reviewed_at, t.created_at
    FROM public.payment_transactions t
    JOIN public.profiles p ON p.id = t.user_id
    LEFT JOIN public.courses c ON c.id = t.course_id
    LEFT JOIN public.payment_gateways g ON g.id = t.gateway_id
    LEFT JOIN public.manual_payment_proofs pr ON pr.payment_transaction_id = t.id
    LEFT JOIN public.manual_payment_methods mm ON mm.id = pr.manual_payment_method_id
    WHERE
      (
        (_status IS NULL AND (t.status = 'pending_review' OR (t.requires_manual_review AND t.status = 'failed')))
        OR (_status IS NOT NULL AND t.status = _status)
        OR (_status = 'pending_review' AND t.requires_manual_review AND t.status = 'failed')
      )
      AND (_purpose IS NULL OR t.purpose = _purpose)
  ),
  counted AS (SELECT b.*, COUNT(*) OVER () AS total_count FROM base b)
  SELECT * FROM counted
  ORDER BY created_at DESC
  LIMIT GREATEST(COALESCE(_limit,100),1)
  OFFSET GREATEST(COALESCE(_offset,0),0);
END;
$fn$;
