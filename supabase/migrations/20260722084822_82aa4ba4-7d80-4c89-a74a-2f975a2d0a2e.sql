
CREATE TABLE public.payment_gateway_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway_id uuid NOT NULL REFERENCES public.payment_gateways(id) ON DELETE CASCADE,
  method_key text NOT NULL,
  display_name text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  order_index integer NOT NULL DEFAULT 0,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (gateway_id, method_key)
);

GRANT SELECT ON public.payment_gateway_methods TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.payment_gateway_methods TO authenticated;
GRANT ALL ON public.payment_gateway_methods TO service_role;

ALTER TABLE public.payment_gateway_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gateway_methods_select_all"
  ON public.payment_gateway_methods FOR SELECT
  USING (true);

CREATE POLICY "gateway_methods_admin_insert"
  ON public.payment_gateway_methods FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "gateway_methods_admin_update"
  ON public.payment_gateway_methods FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "gateway_methods_admin_delete"
  ON public.payment_gateway_methods FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER payment_gateway_methods_updated_at
  BEFORE UPDATE ON public.payment_gateway_methods
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX payment_gateway_methods_gateway_idx
  ON public.payment_gateway_methods (gateway_id, order_index);

-- Seed Kashier's three fixed methods
INSERT INTO public.payment_gateway_methods (gateway_id, method_key, display_name, is_enabled, order_index)
SELECT g.id, m.method_key, m.display_name, true, m.order_index
FROM public.payment_gateways g
CROSS JOIN (VALUES
  ('card', 'الدفع بالبطاقة', 0),
  ('wallet', 'المحافظ الإلكترونية', 1),
  ('bank_installments', 'أقساط بنكية', 2)
) AS m(method_key, display_name, order_index)
WHERE g.gateway_key = 'kashier'
ON CONFLICT (gateway_id, method_key) DO NOTHING;

-- Migrate PayMob integration_ids from payment_gateway_secrets.config into rows
DO $$
DECLARE
  v_gid uuid;
  v_cfg jsonb;
  v_id text;
  v_idx int := 0;
BEGIN
  SELECT g.id INTO v_gid FROM public.payment_gateways g WHERE g.gateway_key = 'paymob';
  IF v_gid IS NULL THEN RETURN; END IF;
  SELECT s.config INTO v_cfg FROM public.payment_gateway_secrets s WHERE s.gateway_id = v_gid;
  IF v_cfg IS NULL OR jsonb_typeof(v_cfg -> 'integration_ids') <> 'array' THEN RETURN; END IF;
  FOR v_id IN SELECT jsonb_array_elements_text(v_cfg -> 'integration_ids')
  LOOP
    v_idx := v_idx + 1;
    IF trim(v_id) = '' THEN CONTINUE; END IF;
    INSERT INTO public.payment_gateway_methods (gateway_id, method_key, display_name, is_enabled, order_index)
    VALUES (v_gid, trim(v_id), 'طريقة الدفع ' || v_idx::text, true, v_idx - 1)
    ON CONFLICT (gateway_id, method_key) DO NOTHING;
  END LOOP;
END $$;
