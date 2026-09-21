
-- ========== BOOKS ==========
CREATE TABLE public.books (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  author TEXT,
  publisher TEXT,
  publication_year INTEGER,
  isbn TEXT,
  language TEXT NOT NULL DEFAULT 'ar',
  subject_id UUID REFERENCES public.subjects(id) ON DELETE SET NULL,
  stage_id UUID REFERENCES public.stages(id) ON DELETE SET NULL,
  tags TEXT[],
  book_type TEXT NOT NULL CHECK (book_type IN ('digital','physical')),
  price_piastres INTEGER NOT NULL CHECK (price_piastres > 0),
  discount_price_piastres INTEGER CHECK (discount_price_piastres IS NULL OR discount_price_piastres >= 0),
  discount_expires_at TIMESTAMPTZ,
  cover_image_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  -- Digital
  digital_file_url TEXT,
  download_limit INTEGER CHECK (download_limit IS NULL OR download_limit >= 0),
  is_drm_protected BOOLEAN NOT NULL DEFAULT true,
  -- Physical
  stock_quantity INTEGER CHECK (stock_quantity IS NULL OR stock_quantity >= 0),
  weight_grams INTEGER CHECK (weight_grams IS NULL OR weight_grams >= 0),
  length_cm NUMERIC,
  width_cm NUMERIC,
  height_cm NUMERIC,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT discount_lt_price CHECK (
    discount_price_piastres IS NULL OR discount_price_piastres < price_piastres
  ),
  CONSTRAINT type_fields_consistent CHECK (
    (book_type = 'digital'
      AND stock_quantity IS NULL AND weight_grams IS NULL
      AND length_cm IS NULL AND width_cm IS NULL AND height_cm IS NULL)
    OR
    (book_type = 'physical'
      AND digital_file_url IS NULL AND download_limit IS NULL)
  )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.books TO authenticated;
GRANT SELECT ON public.books TO anon;
GRANT ALL ON public.books TO service_role;

ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;

CREATE POLICY "books_select_published" ON public.books
  FOR SELECT TO anon, authenticated
  USING (status = 'published');
CREATE POLICY "books_select_admin" ON public.books
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "books_insert_admin" ON public.books
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "books_update_admin" ON public.books
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "books_delete_admin" ON public.books
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_books_subject ON public.books(subject_id);
CREATE INDEX idx_books_stage ON public.books(stage_id);
CREATE INDEX idx_books_type ON public.books(book_type);
CREATE INDEX idx_books_status ON public.books(status);

CREATE TRIGGER update_books_updated_at BEFORE UPDATE ON public.books
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ========== BOOK IMAGES ==========
CREATE TABLE public.book_images (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.book_images TO authenticated;
GRANT SELECT ON public.book_images TO anon;
GRANT ALL ON public.book_images TO service_role;

ALTER TABLE public.book_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "book_images_select_visible" ON public.book_images
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.books b
    WHERE b.id = book_images.book_id AND b.status = 'published'
  ));
CREATE POLICY "book_images_select_admin" ON public.book_images
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "book_images_write_admin" ON public.book_images
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_book_images_book ON public.book_images(book_id, order_index);

-- ========== STORAGE: book-assets ==========
CREATE POLICY "book_assets_admin_all" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'book-assets' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'book-assets' AND public.has_role(auth.uid(), 'admin'));
