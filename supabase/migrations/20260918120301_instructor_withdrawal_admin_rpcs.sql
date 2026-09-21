-- ============================================================================
-- Phase 71e: Withdrawals — admin processing
-- ============================================================================

-- 1) Admin: list withdrawal requests with filters
CREATE OR REPLACE FUNCTION public.admin_list_withdrawals(
  _status text DEFAULT NULL,
  _instructor_id uuid DEFAULT NULL,
  _limit int DEFAULT 100,
  _offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid, instructor_id uuid, instructor_name text, avatar_url text,
  amount_piastres integer, method_key text, payout_method_id uuid,
  payout_details jsonb, status text, admin_note text,
  rejection_reason text, proof_url text,
  processed_by uuid, processed_at timestamptz, created_at timestamptz,
  total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL OR NOT public.has_role(v_caller, 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH base AS (
    SELECT
      w.id, w.instructor_id,
      p.full_name AS instructor_name, p.avatar_url,
      w.amount_piastres, w.method_key, w.payout_method_id, w.payout_details,
      w.status, w.admin_note, w.rejection_reason, w.proof_url,
      w.processed_by, w.processed_at, w.created_at
    FROM public.instructor_withdrawals w
    LEFT JOIN public.profiles p ON p.id = w.instructor_id
    WHERE (_status IS NULL OR w.status = _status)
      AND (_instructor_id IS NULL OR w.instructor_id = _instructor_id)
  ),
  counted AS (SELECT b.*, COUNT(*) OVER () AS total_count FROM base b)
  SELECT * FROM counted
  ORDER BY created_at DESC
  LIMIT GREATEST(COALESCE(_limit, 100), 1)
  OFFSET GREATEST(COALESCE(_offset, 0), 0);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_list_withdrawals(text, uuid, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_withdrawals(text, uuid, int, int) TO authenticated;

-- 2) Admin: process a withdrawal (approve / reject / paid)
CREATE OR REPLACE FUNCTION public.admin_process_withdrawal(
  p_withdrawal_id uuid,
  p_action text,           -- 'approve' | 'reject' | 'paid'
  p_rejection_reason text DEFAULT NULL,
  p_proof_url text DEFAULT NULL,
  p_admin_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_w RECORD;
  v_remaining integer;
  e RECORD;
BEGIN
  IF v_caller IS NULL OR NOT public.has_role(v_caller, 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_w FROM public.instructor_withdrawals WHERE id = p_withdrawal_id FOR UPDATE;
  IF v_w IS NULL THEN RAISE EXCEPTION 'طلب السحب غير موجود'; END IF;

  IF p_action = 'reject' THEN
    IF v_w.status <> 'pending' THEN
      RAISE EXCEPTION 'لا يمكن رفض طلب تمت معالجته مسبقاً';
    END IF;
    UPDATE public.instructor_withdrawals
       SET status = 'rejected', rejection_reason = p_rejection_reason,
           admin_note = p_admin_note, processed_by = v_caller,
           processed_at = now(), updated_at = now()
     WHERE id = p_withdrawal_id;
    PERFORM public.create_notification(
      v_w.instructor_id,
      'instructor_withdrawal_rejected',
      'تم رفض طلب السحب',
      COALESCE(p_rejection_reason, 'تم رفض طلب السحب من قبل الإدارة.'),
      jsonb_build_object('withdrawal_id', p_withdrawal_id, 'amount_piastres', v_w.amount_piastres),
      '/instructor/withdrawals'
    );
    RETURN jsonb_build_object('success', true, 'status', 'rejected');

  ELSIF p_action = 'approve' THEN
    IF v_w.status <> 'pending' THEN
      RAISE EXCEPTION 'الطلب تمت معالجته مسبقاً';
    END IF;
    v_remaining := v_w.amount_piastres;
    FOR e IN
      SELECT id, instructor_amount FROM public.instructor_earnings
       WHERE instructor_id = v_w.instructor_id AND status = 'available'
       ORDER BY available_at ASC, created_at ASC
       FOR UPDATE
    LOOP
      EXIT WHEN v_remaining <= 0;
      UPDATE public.instructor_earnings SET status = 'withdrawn' WHERE id = e.id;
      v_remaining := v_remaining - e.instructor_amount;
    END LOOP;
    IF v_remaining > 0 THEN
      RAISE EXCEPTION 'الرصيد المتاح لم يعد يكفي لتغطية هذا الطلب';
    END IF;
    UPDATE public.instructor_withdrawals
       SET status = 'approved', proof_url = COALESCE(p_proof_url, proof_url),
           admin_note = p_admin_note, processed_by = v_caller,
           processed_at = now(), updated_at = now()
     WHERE id = p_withdrawal_id;
    PERFORM public.create_notification(
      v_w.instructor_id,
      'instructor_withdrawal_approved',
      'تمت الموافقة على طلب السحب',
      'سيتم تحويل مبلغ السحب عبر طريقة السحب المحددة.',
      jsonb_build_object('withdrawal_id', p_withdrawal_id, 'amount_piastres', v_w.amount_piastres),
      '/instructor/withdrawals'
    );
    RETURN jsonb_build_object('success', true, 'status', 'approved');

  ELSIF p_action = 'paid' THEN
    IF v_w.status <> 'approved' THEN
      RAISE EXCEPTION 'يجب الموافقة على الطلب أولاً';
    END IF;
    UPDATE public.instructor_withdrawals
       SET status = 'paid', proof_url = COALESCE(p_proof_url, proof_url),
           admin_note = COALESCE(p_admin_note, admin_note),
           processed_by = v_caller, processed_at = now(), updated_at = now()
     WHERE id = p_withdrawal_id;
    RETURN jsonb_build_object('success', true, 'status', 'paid');
  END IF;

  RAISE EXCEPTION 'إجراء غير معروف';
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_process_withdrawal(uuid, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_process_withdrawal(uuid, text, text, text, text) TO authenticated;
