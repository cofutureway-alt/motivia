
-- 1. Courses: pricing columns
ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS is_paid boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS price_piastres integer,
  ADD COLUMN IF NOT EXISTS discount_price_piastres integer,
  ADD COLUMN IF NOT EXISTS discount_expires_at timestamptz;

ALTER TABLE public.courses DROP CONSTRAINT IF EXISTS courses_pricing_check;
ALTER TABLE public.courses ADD CONSTRAINT courses_pricing_check CHECK (
  (is_paid = false AND price_piastres IS NULL AND discount_price_piastres IS NULL)
  OR (is_paid = true AND price_piastres IS NOT NULL AND price_piastres >= 0
      AND (discount_price_piastres IS NULL
           OR (discount_price_piastres >= 0 AND discount_price_piastres < price_piastres)))
);

-- 2. Wallets table
CREATE TABLE IF NOT EXISTS public.wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  balance_piastres integer NOT NULL DEFAULT 0 CHECK (balance_piastres >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.wallets TO authenticated;
GRANT ALL ON public.wallets TO service_role;

ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Students view own wallet" ON public.wallets;
CREATE POLICY "Students view own wallet" ON public.wallets
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins view all wallets" ON public.wallets;
CREATE POLICY "Admins view all wallets" ON public.wallets
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS update_wallets_updated_at ON public.wallets;
CREATE TRIGGER update_wallets_updated_at
  BEFORE UPDATE ON public.wallets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Auto-create wallet for new students
CREATE OR REPLACE FUNCTION public.ensure_student_wallet()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role = 'student' THEN
    INSERT INTO public.wallets (user_id, balance_piastres)
    VALUES (NEW.id, 0)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ensure_student_wallet_trigger ON public.profiles;
CREATE TRIGGER ensure_student_wallet_trigger
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.ensure_student_wallet();

-- 4. Backfill wallets for existing students
INSERT INTO public.wallets (user_id, balance_piastres)
SELECT p.id, 0 FROM public.profiles p
WHERE p.role = 'student'
  AND NOT EXISTS (SELECT 1 FROM public.wallets w WHERE w.user_id = p.id)
ON CONFLICT (user_id) DO NOTHING;
