
-- Phase 47 (attempt 3): drop dependent policies on both courses and units
DROP POLICY IF EXISTS courses_select_published ON public.courses;
DROP POLICY IF EXISTS courses_admin_all ON public.courses;
DROP POLICY IF EXISTS units_select_public ON public.units;

-- Convert enum -> text
ALTER TABLE public.courses ALTER COLUMN status DROP DEFAULT;
ALTER TABLE public.courses ALTER COLUMN status TYPE text USING status::text;
ALTER TABLE public.courses ALTER COLUMN status SET DEFAULT 'draft';
DROP TYPE IF EXISTS public.course_status;
ALTER TABLE public.courses
  ADD CONSTRAINT courses_status_check
  CHECK (status IN ('draft','coming_soon','published'));

-- Recreate policies (published + coming_soon are public)
CREATE POLICY courses_select_published ON public.courses
  FOR SELECT USING (status IN ('published','coming_soon'));

CREATE POLICY courses_admin_all ON public.courses
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY units_select_public ON public.units
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.courses c
      WHERE c.id = units.course_id
        AND c.status IN ('published','coming_soon')
    )
  );

-- Scheduling columns
ALTER TABLE public.courses
  ADD COLUMN scheduled_publish_at timestamptz NULL,
  ADD COLUMN scheduled_publish_job_id text NULL;

CREATE INDEX idx_courses_scheduled_publish
  ON public.courses(scheduled_publish_at)
  WHERE scheduled_publish_at IS NOT NULL AND status = 'coming_soon';

-- Enrollment RLS guard
DROP POLICY IF EXISTS enrollments_insert_own ON public.enrollments;
CREATE POLICY enrollments_insert_own ON public.enrollments
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (
      public.has_role(auth.uid(),'admin')
      OR EXISTS (
        SELECT 1 FROM public.courses c
        WHERE c.id = enrollments.course_id AND c.status = 'published'
      )
    )
  );

-- Enrollment trigger
CREATE OR REPLACE FUNCTION public._enforce_enrollment_course_published()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_status text;
BEGIN
  SELECT status INTO v_status FROM public.courses WHERE id = NEW.course_id;
  IF v_status IS NULL THEN RAISE EXCEPTION 'الدورة غير موجودة'; END IF;
  IF v_status <> 'published' THEN
    RAISE EXCEPTION 'لا يمكن التسجيل في هذا الكورس حاليًا — سيتاح قريبًا'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_enforce_enrollment_course_published ON public.enrollments;
CREATE TRIGGER trg_enforce_enrollment_course_published
  BEFORE INSERT ON public.enrollments
  FOR EACH ROW EXECUTE FUNCTION public._enforce_enrollment_course_published();

-- purchase_course RPC
CREATE OR REPLACE FUNCTION public.purchase_course(p_course_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
  IF v_user IS NULL THEN RAISE EXCEPTION 'يجب تسجيل الدخول أولاً' USING ERRCODE='42501'; END IF;

  SELECT id, is_paid, price_piastres, discount_price_piastres, discount_expires_at, status
    INTO v_course FROM public.courses WHERE id = p_course_id;
  IF v_course IS NULL THEN RAISE EXCEPTION 'الدورة غير موجودة'; END IF;
  IF v_course.status <> 'published' THEN
    RAISE EXCEPTION 'لا يمكن التسجيل في هذا الكورس حاليًا — سيتاح قريبًا';
  END IF;

  IF v_course.is_paid IS NOT TRUE OR v_course.price_piastres IS NULL THEN
    v_price := 0;
  ELSIF v_course.discount_price_piastres IS NOT NULL
        AND (v_course.discount_expires_at IS NULL OR now() < v_course.discount_expires_at) THEN
    v_price := v_course.discount_price_piastres;
  ELSE
    v_price := v_course.price_piastres;
  END IF;

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
      (reference_number, user_id, course_id, gateway_id, amount_piastres, status, failure_reason)
      VALUES (v_pay_ref, v_user, p_course_id,
              COALESCE(v_gw.id, (SELECT id FROM public.payment_gateways WHERE gateway_key='wallet')),
              v_price, 'failed', v_failure);
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
      (reference_number, user_id, course_id, gateway_id, amount_piastres, status, failure_reason)
      VALUES (v_pay_ref, v_user, p_course_id, v_gw.id, v_price, 'failed', v_failure);
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

-- Manual course payment submission — same guard
CREATE OR REPLACE FUNCTION public.submit_manual_course_payment(
  p_course_id uuid, p_method_id uuid, p_sender_number text, p_proof_image_url text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

  SELECT id, is_paid, price_piastres, discount_price_piastres, discount_expires_at, status
    INTO v_course FROM public.courses WHERE id = p_course_id;
  IF v_course IS NULL THEN RAISE EXCEPTION 'الدورة غير موجودة'; END IF;
  IF v_course.status <> 'published' THEN
    RAISE EXCEPTION 'لا يمكن التسجيل في هذا الكورس حاليًا — سيتاح قريبًا';
  END IF;

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

-- Auto-publish worker
CREATE OR REPLACE FUNCTION public.auto_publish_scheduled_courses()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ids uuid[];
BEGIN
  WITH flipped AS (
    UPDATE public.courses
       SET status = 'published',
           scheduled_publish_at = NULL,
           scheduled_publish_job_id = NULL,
           updated_at = now()
     WHERE status = 'coming_soon'
       AND scheduled_publish_at IS NOT NULL
       AND scheduled_publish_at <= now()
    RETURNING id
  )
  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_ids FROM flipped;
  RETURN jsonb_build_object('published_count', COALESCE(array_length(v_ids,1),0), 'published_ids', v_ids);
END; $$;

-- pg_cron
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto_publish_scheduled_courses') THEN
    PERFORM cron.unschedule('auto_publish_scheduled_courses');
  END IF;
END $do$;

SELECT cron.schedule(
  'auto_publish_scheduled_courses',
  '* * * * *',
  $cron$ SELECT public.auto_publish_scheduled_courses(); $cron$
);
