-- ─── 8. Instructor earnings ledger ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.instructor_earnings (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  payment_txn_id      uuid NOT NULL REFERENCES public.payment_transactions(id) ON DELETE CASCADE,
  product_type        text NOT NULL CHECK (product_type IN ('course','book')),
  course_id           uuid REFERENCES public.courses(id) ON DELETE SET NULL,
  book_id             uuid REFERENCES public.books(id) ON DELETE SET NULL,
  gross_piastres      integer NOT NULL CHECK (gross_piastres >= 0),
  expenses_piastres   integer NOT NULL DEFAULT 0 CHECK (expenses_piastres >= 0),
  net_piastres        integer NOT NULL CHECK (net_piastres >= 0),
  instructor_percent  numeric(5,2) NOT NULL CHECK (instructor_percent >= 0 AND instructor_percent <= 100),
  instructor_amount   integer NOT NULL CHECK (instructor_amount >= 0),
  admin_amount        integer NOT NULL CHECK (admin_amount >= 0),
  status              text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','available','withdrawn')),
  available_at        timestamptz NOT NULL DEFAULT now(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payment_txn_id)
);
GRANT SELECT ON public.instructor_earnings TO authenticated;
GRANT ALL ON public.instructor_earnings TO service_role;
ALTER TABLE public.instructor_earnings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS earnings_read_own_or_admin ON public.instructor_earnings;
CREATE POLICY earnings_read_own_or_admin ON public.instructor_earnings FOR SELECT
  TO authenticated
  USING (instructor_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE INDEX IF NOT EXISTS earnings_instructor_status_idx ON public.instructor_earnings(instructor_id, status);
CREATE INDEX IF NOT EXISTS earnings_available_at_idx ON public.instructor_earnings(status, available_at);

-- ─── 9. Withdrawal requests ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.instructor_withdrawals (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount_piastres     integer NOT NULL CHECK (amount_piastres > 0),
  method_key          text NOT NULL REFERENCES public.withdrawal_methods(method_key) ON DELETE RESTRICT,
  payout_method_id    uuid REFERENCES public.instructor_payout_methods(id) ON DELETE SET NULL,
  payout_details      jsonb NOT NULL DEFAULT '{}'::jsonb,
  status              text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','approved','rejected','paid')),
  admin_note          text,
  rejection_reason    text,
  proof_url           text,
  processed_by        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  processed_at        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.instructor_withdrawals TO authenticated;
GRANT UPDATE ON public.instructor_withdrawals TO authenticated;
GRANT ALL ON public.instructor_withdrawals TO service_role;
ALTER TABLE public.instructor_withdrawals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS withdrawals_read_own_or_admin ON public.instructor_withdrawals;
CREATE POLICY withdrawals_read_own_or_admin ON public.instructor_withdrawals FOR SELECT
  TO authenticated
  USING (instructor_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS withdrawals_insert_own ON public.instructor_withdrawals;
CREATE POLICY withdrawals_insert_own ON public.instructor_withdrawals FOR INSERT
  TO authenticated
  WITH CHECK (instructor_id = auth.uid());
DROP POLICY IF EXISTS withdrawals_admin_update ON public.instructor_withdrawals;
CREATE POLICY withdrawals_admin_update ON public.instructor_withdrawals FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER withdrawals_updated_at BEFORE UPDATE ON public.instructor_withdrawals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS withdrawals_instructor_idx ON public.instructor_withdrawals(instructor_id, status);
CREATE INDEX IF NOT EXISTS withdrawals_status_idx ON public.instructor_withdrawals(status, created_at DESC);
