-- ─── 5. Revenue split settings (singleton) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.revenue_split_settings (
  id                       integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  is_enabled               boolean NOT NULL DEFAULT true,
  courses_instructor_percent numeric(5,2) NOT NULL DEFAULT 50.00,
  books_instructor_percent   numeric(5,2) NOT NULL DEFAULT 50.00,
  hold_days                integer NOT NULL DEFAULT 5 CHECK (hold_days >= 0),
  min_withdrawal_piastres  integer NOT NULL DEFAULT 10000 CHECK (min_withdrawal_piastres >= 0),
  expenses                 jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at               timestamptz NOT NULL DEFAULT now(),
  updated_by               uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);
-- expenses jsonb item shape:
-- { "label": "ضريبة", "percent": 14, "type": "percent"|"fixed", "instructor_borne_percent": 50 }
-- instructor_borne_percent NULL = same as the instructor's profit percent (net-profit model).

GRANT SELECT ON public.revenue_split_settings TO authenticated;
GRANT INSERT, UPDATE ON public.revenue_split_settings TO authenticated;
GRANT ALL ON public.revenue_split_settings TO service_role;
ALTER TABLE public.revenue_split_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS revenue_split_read ON public.revenue_split_settings;
CREATE POLICY revenue_split_read ON public.revenue_split_settings FOR SELECT
  USING (true);
DROP POLICY IF EXISTS revenue_split_admin_write ON public.revenue_split_settings;
CREATE POLICY revenue_split_admin_write ON public.revenue_split_settings FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
INSERT INTO public.revenue_split_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ─── 6. Withdrawal methods (admin-managed) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.withdrawal_methods (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  method_key   text NOT NULL UNIQUE CHECK (method_key IN ('instapay','ewallet','bank')),
  display_name text NOT NULL,
  is_enabled   boolean NOT NULL DEFAULT true,
  order_index  integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.withdrawal_methods TO authenticated;
GRANT ALL ON public.withdrawal_methods TO service_role;
ALTER TABLE public.withdrawal_methods ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS withdrawal_methods_read ON public.withdrawal_methods;
CREATE POLICY withdrawal_methods_read ON public.withdrawal_methods FOR SELECT
  USING (true);
DROP POLICY IF EXISTS withdrawal_methods_admin_write ON public.withdrawal_methods;
CREATE POLICY withdrawal_methods_admin_write ON public.withdrawal_methods FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
INSERT INTO public.withdrawal_methods (method_key, display_name, order_index) VALUES
  ('instapay', 'إنستا باي', 0),
  ('ewallet',  'محافظ إلكترونية', 1),
  ('bank',     'تحويل بنكي', 2)
ON CONFLICT (method_key) DO NOTHING;

-- ─── 7. Instructor saved payout methods ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.instructor_payout_methods (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  method_key    text NOT NULL REFERENCES public.withdrawal_methods(method_key) ON DELETE CASCADE,
  label         text,
  details       jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_default    boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.instructor_payout_methods TO authenticated;
GRANT ALL ON public.instructor_payout_methods TO service_role;
ALTER TABLE public.instructor_payout_methods ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payout_methods_own ON public.instructor_payout_methods;
CREATE POLICY payout_methods_own ON public.instructor_payout_methods FOR ALL
  TO authenticated
  USING (instructor_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (instructor_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER payout_methods_updated_at BEFORE UPDATE ON public.instructor_payout_methods
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS payout_methods_instructor_idx ON public.instructor_payout_methods(instructor_id);
