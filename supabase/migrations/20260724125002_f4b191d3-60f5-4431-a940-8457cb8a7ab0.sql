
-- Reusable updated_at trigger (already exists in project as update_updated_at_column)

-- SHIPPING SETTINGS (singleton)
CREATE TABLE public.shipping_settings (
  id integer PRIMARY KEY CHECK (id = 1),
  default_shipping_price_piastres integer NOT NULL DEFAULT 5000 CHECK (default_shipping_price_piastres >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.shipping_settings TO anon, authenticated;
GRANT ALL ON public.shipping_settings TO service_role;
GRANT UPDATE ON public.shipping_settings TO authenticated;
ALTER TABLE public.shipping_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shipping_settings_public_read" ON public.shipping_settings FOR SELECT USING (true);
CREATE POLICY "shipping_settings_admin_update" ON public.shipping_settings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_shipping_settings_updated BEFORE UPDATE ON public.shipping_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
INSERT INTO public.shipping_settings (id) VALUES (1);

-- SHIPPING ZONES
CREATE TABLE public.shipping_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  is_governorate boolean NOT NULL DEFAULT false,
  shipping_price_piastres integer CHECK (shipping_price_piastres IS NULL OR shipping_price_piastres >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX shipping_zones_gov_idx ON public.shipping_zones(is_governorate);
GRANT SELECT ON public.shipping_zones TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.shipping_zones TO authenticated;
GRANT ALL ON public.shipping_zones TO service_role;
ALTER TABLE public.shipping_zones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shipping_zones_public_read" ON public.shipping_zones FOR SELECT USING (true);
CREATE POLICY "shipping_zones_admin_write" ON public.shipping_zones FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_shipping_zones_updated BEFORE UPDATE ON public.shipping_zones
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed 27 Egyptian governorates (matches registration_form_fields governorate options)
INSERT INTO public.shipping_zones (name, is_governorate, shipping_price_piastres) VALUES
  ('القاهرة', true, NULL), ('الجيزة', true, NULL), ('الإسكندرية', true, NULL),
  ('القليوبية', true, NULL), ('الشرقية', true, NULL), ('الدقهلية', true, NULL),
  ('البحيرة', true, NULL), ('الغربية', true, NULL), ('المنوفية', true, NULL),
  ('كفر الشيخ', true, NULL), ('دمياط', true, NULL), ('بورسعيد', true, NULL),
  ('الإسماعيلية', true, NULL), ('السويس', true, NULL), ('شمال سيناء', true, NULL),
  ('جنوب سيناء', true, NULL), ('بني سويف', true, NULL), ('الفيوم', true, NULL),
  ('المنيا', true, NULL), ('أسيوط', true, NULL), ('سوهاج', true, NULL),
  ('قنا', true, NULL), ('الأقصر', true, NULL), ('أسوان', true, NULL),
  ('البحر الأحمر', true, NULL), ('الوادي الجديد', true, NULL), ('مطروح', true, NULL);

-- BOOK CART ITEMS
CREATE TABLE public.book_cart_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  added_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, book_id)
);
CREATE INDEX book_cart_items_user_idx ON public.book_cart_items(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.book_cart_items TO authenticated;
GRANT ALL ON public.book_cart_items TO service_role;
ALTER TABLE public.book_cart_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "book_cart_items_own_all" ON public.book_cart_items FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Trigger enforcing digital books limited to quantity 1
CREATE OR REPLACE FUNCTION public.enforce_digital_cart_quantity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE bt text;
BEGIN
  SELECT book_type INTO bt FROM public.books WHERE id = NEW.book_id;
  IF bt = 'digital' AND NEW.quantity <> 1 THEN
    RAISE EXCEPTION 'Digital books are limited to quantity 1';
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.enforce_digital_cart_quantity() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_book_cart_digital_qty
  BEFORE INSERT OR UPDATE ON public.book_cart_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_digital_cart_quantity();
