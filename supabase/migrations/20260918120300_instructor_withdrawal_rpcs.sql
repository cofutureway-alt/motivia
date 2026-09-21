-- ============================================================================
-- Phase 71d: Withdrawals — instructor requests
-- ============================================================================

-- 1) Available balance = earnings 'available' − (pending + approved withdrawals)
CREATE OR REPLACE FUNCTION public._instructor_available_balance(p_instructor uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    COALESCE((SELECT SUM(instructor_amount) FROM public.instructor_earnings
               WHERE instructor_id = p_instructor AND status = 'available'), 0)
    -
    COALESCE((SELECT SUM(amount_piastres) FROM public.instructor_withdrawals
               WHERE instructor_id = p_instructor
                 AND status IN ('pending','approved')), 0);
$$;

REVOKE EXECUTE ON FUNCTION public._instructor_available_balance(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._instructor_available_balance(uuid) TO authenticated;

-- 2) Instructor requests a withdrawal
CREATE OR REPLACE FUNCTION public.instructor_request_withdrawal(
  p_method_key text,
  p_payout_method_id uuid DEFAULT NULL,
  p_details jsonb DEFAULT '{}'::jsonb,
  p_amount_piastres integer DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_settings RECORD;
  v_method RECORD;
  v_amount integer;
  v_available integer;
  v_id uuid;
BEGIN
  IF v_caller IS NULL OR NOT public.is_instructor(v_caller) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_settings FROM public.revenue_split_settings WHERE id = 1;

  SELECT * INTO v_method FROM public.withdrawal_methods
   WHERE method_key = p_method_key AND is_enabled = true;
  IF v_method IS NULL THEN
    RAISE EXCEPTION 'طريقة السحب غير متاحة حالياً';
  END IF;

  SELECT public._instructor_available_balance(v_caller) INTO v_available;

  IF p_amount_piastres IS NULL THEN
    v_amount := v_available; -- full available balance
  ELSE
    v_amount := p_amount_piastres;
  END IF;

  IF v_amount < COALESCE(v_settings.min_withdrawal_piastres, 10000) THEN
    RAISE EXCEPTION 'الحد الأدنى للسحب هو % جنيه',
      (COALESCE(v_settings.min_withdrawal_piastres, 10000) / 100);
  END IF;
  IF v_amount > v_available THEN
    RAISE EXCEPTION 'المبلغ المطلوب يتجاوز رصيدك المتاح للسحب';
  END IF;

  INSERT INTO public.instructor_withdrawals (
    instructor_id, amount_piastres, method_key,
    payout_method_id, payout_details, status
  ) VALUES (
    v_caller, v_amount, p_method_key,
    p_payout_method_id, COALESCE(p_details, '{}'::jsonb), 'pending'
  ) RETURNING id INTO v_id;

  PERFORM public.create_notification(
    v_caller,
    'instructor_withdrawal_submitted',
    'تم إرسال طلب السحب',
    'طلب السحب قيد المراجعة من إدارة المنصة.',
    jsonb_build_object('amount_piastres', v_amount, 'withdrawal_id', v_id),
    '/instructor/withdrawals'
  );

  RETURN jsonb_build_object('success', true, 'withdrawal_id', v_id, 'amount_piastres', v_amount);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.instructor_request_withdrawal(text, uuid, jsonb, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.instructor_request_withdrawal(text, uuid, jsonb, integer) TO authenticated;
