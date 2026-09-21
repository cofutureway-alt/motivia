
-- ============ top_up_cards ============
CREATE TABLE public.top_up_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (code ~ '^[0-9]{6}$'),
  value_piastres integer NOT NULL CHECK (value_piastres > 0),
  expires_at timestamptz,
  is_redeemed boolean NOT NULL DEFAULT false,
  redeemed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  redeemed_at timestamptz,
  batch_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.top_up_cards TO authenticated;
GRANT ALL ON public.top_up_cards TO service_role;
ALTER TABLE public.top_up_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view top-up cards"
  ON public.top_up_cards FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert top-up cards"
  ON public.top_up_cards FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update top-up cards"
  ON public.top_up_cards FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete top-up cards"
  ON public.top_up_cards FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_top_up_cards_code ON public.top_up_cards(code);
CREATE INDEX idx_top_up_cards_batch ON public.top_up_cards(batch_id);

-- ============ wallet_transactions ============
CREATE TABLE public.wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_number text NOT NULL UNIQUE,
  wallet_id uuid NOT NULL REFERENCES public.wallets(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('card_redemption','admin_charge','admin_deduct','bulk_charge','bulk_deduct','purchase','admin_reset')),
  amount_piastres integer NOT NULL CHECK (amount_piastres >= 0),
  balance_after_piastres integer NOT NULL,
  related_card_id uuid REFERENCES public.top_up_cards(id) ON DELETE SET NULL,
  performed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wallet_transactions TO authenticated;
GRANT ALL ON public.wallet_transactions TO service_role;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students view own wallet transactions"
  ON public.wallet_transactions FOR SELECT
  TO authenticated
  USING (
    wallet_id IN (SELECT id FROM public.wallets WHERE user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE INDEX idx_wallet_tx_wallet ON public.wallet_transactions(wallet_id);
CREATE INDEX idx_wallet_tx_created ON public.wallet_transactions(created_at DESC);

-- ============ helper: generate reference number ============
CREATE OR REPLACE FUNCTION public._gen_txn_reference()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  suffix text;
  attempts int := 0;
  candidate text;
BEGIN
  LOOP
    suffix := '';
    FOR i IN 1..8 LOOP
      suffix := suffix || substr(chars, 1 + floor(random() * length(chars))::int, 1);
    END LOOP;
    candidate := 'TXN-' || suffix;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.wallet_transactions WHERE reference_number = candidate);
    attempts := attempts + 1;
    IF attempts > 20 THEN
      candidate := 'TXN-' || substr(replace(gen_random_uuid()::text,'-',''),1,10);
      EXIT;
    END IF;
  END LOOP;
  RETURN candidate;
END;
$$;

-- ============ redeem_top_up_card ============
CREATE OR REPLACE FUNCTION public.redeem_top_up_card(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Phase 34 placeholder: replace with settings-table lookup in Phase 36
  MAX_WALLET_BALANCE_PIASTRES CONSTANT integer := 200000;
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

  IF v_wallet.balance_piastres + v_card.value_piastres > MAX_WALLET_BALANCE_PIASTRES THEN
    v_max_egp := (MAX_WALLET_BALANCE_PIASTRES / 100)::text;
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
$$;

GRANT EXECUTE ON FUNCTION public.redeem_top_up_card(text) TO authenticated;

-- ============ seed 5 sample cards ============
INSERT INTO public.top_up_cards (code, value_piastres, expires_at) VALUES
  ('100001', 5000, NULL),   -- 50 EGP
  ('100002', 10000, NULL),  -- 100 EGP
  ('100003', 20000, NULL),  -- 200 EGP
  ('100004', 2500, NULL),   -- 25 EGP
  ('100005', 50000, NULL);  -- 500 EGP
