
-- Phase 35: Admin Wallet & Cards RPCs

CREATE OR REPLACE FUNCTION public.admin_generate_top_up_cards(
  p_quantity integer,
  p_value_piastres integer,
  p_expires_at timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch uuid := gen_random_uuid();
  v_code text;
  v_attempts int;
  v_i int;
  v_ids uuid[] := ARRAY[]::uuid[];
  v_row_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_quantity IS NULL OR p_quantity < 1 OR p_quantity > 50 THEN
    RAISE EXCEPTION 'الكمية يجب أن تكون بين 1 و 50';
  END IF;
  IF p_value_piastres IS NULL OR p_value_piastres <= 0 THEN
    RAISE EXCEPTION 'قيمة الكارت غير صحيحة';
  END IF;

  FOR v_i IN 1..p_quantity LOOP
    v_attempts := 0;
    LOOP
      v_code := lpad(floor(random() * 1000000)::int::text, 6, '0');
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.top_up_cards WHERE code = v_code);
      v_attempts := v_attempts + 1;
      IF v_attempts > 40 THEN
        RAISE EXCEPTION 'تعذر توليد كود فريد';
      END IF;
    END LOOP;
    INSERT INTO public.top_up_cards (code, value_piastres, expires_at, batch_id)
      VALUES (v_code, p_value_piastres, p_expires_at, v_batch)
      RETURNING id INTO v_row_id;
    v_ids := array_append(v_ids, v_row_id);
  END LOOP;

  RETURN jsonb_build_object(
    'batch_id', v_batch,
    'count', p_quantity,
    'ids', to_jsonb(v_ids)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_adjust_wallet(
  p_user_id uuid,
  p_amount_piastres integer,
  p_type text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  MAX_BAL constant integer := 200000;
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

  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = p_user_id FOR UPDATE;
  IF v_wallet IS NULL THEN
    INSERT INTO public.wallets(user_id, balance_piastres) VALUES (p_user_id, 0)
      RETURNING * INTO v_wallet;
  END IF;

  IF p_type = 'admin_charge' THEN
    v_new_balance := v_wallet.balance_piastres + p_amount_piastres;
    IF v_new_balance > MAX_BAL THEN
      RAISE EXCEPTION 'العملية ستتجاوز الحد الأقصى للرصيد (% ج.م)', (MAX_BAL/100)::text;
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
$$;

CREATE OR REPLACE FUNCTION public.admin_bulk_adjust_wallets(
  p_amount_piastres integer,
  p_type text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  MAX_BAL constant integer := 200000;
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
      IF v_new_balance > MAX_BAL THEN
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
$$;

CREATE OR REPLACE FUNCTION public.admin_list_wallet_transactions(
  _user_search text DEFAULT NULL,
  _type text DEFAULT NULL,
  _limit integer DEFAULT 100,
  _offset integer DEFAULT 0
) RETURNS TABLE(
  id uuid,
  reference_number text,
  wallet_id uuid,
  user_id uuid,
  student_name text,
  student_phone text,
  student_id_code text,
  type text,
  amount_piastres integer,
  balance_after_piastres integer,
  performed_by uuid,
  performed_by_name text,
  notes text,
  created_at timestamptz,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_search text := NULLIF(trim(COALESCE(_user_search,'')),'');
  v_is_digit boolean := v_search IS NOT NULL AND v_search ~ '^[0-9]{1,6}$';
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      t.id, t.reference_number, t.wallet_id,
      p.id AS user_id, p.full_name AS student_name,
      p.phone_number AS student_phone, p.student_id AS student_id_code,
      t.type, t.amount_piastres, t.balance_after_piastres,
      t.performed_by, pa.full_name AS performed_by_name,
      t.notes, t.created_at
    FROM public.wallet_transactions t
    JOIN public.wallets w ON w.id = t.wallet_id
    JOIN public.profiles p ON p.id = w.user_id
    LEFT JOIN public.profiles pa ON pa.id = t.performed_by
    WHERE
      (_type IS NULL OR t.type = _type)
      AND (
        v_search IS NULL
        OR p.full_name ILIKE '%'||v_search||'%'
        OR p.phone_number ILIKE '%'||v_search||'%'
        OR p.student_id ILIKE '%'||v_search||'%'
        OR (v_is_digit AND p.student_id = lpad(v_search,6,'0'))
      )
  ),
  counted AS (SELECT b.*, COUNT(*) OVER () AS total_count FROM base b)
  SELECT * FROM counted
  ORDER BY created_at DESC
  LIMIT GREATEST(COALESCE(_limit,100),1)
  OFFSET GREATEST(COALESCE(_offset,0),0);
END;
$$;
