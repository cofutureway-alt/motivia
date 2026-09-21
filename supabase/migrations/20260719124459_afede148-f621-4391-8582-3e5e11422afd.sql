
-- Card assets storage policies
DROP POLICY IF EXISTS "card-assets read" ON storage.objects;
CREATE POLICY "card-assets read" ON storage.objects
  FOR SELECT TO anon, authenticated USING (bucket_id = 'card-assets');

DROP POLICY IF EXISTS "card-assets admin write" ON storage.objects;
CREATE POLICY "card-assets admin write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'card-assets' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "card-assets admin update" ON storage.objects;
CREATE POLICY "card-assets admin update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'card-assets' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "card-assets admin delete" ON storage.objects;
CREATE POLICY "card-assets admin delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'card-assets' AND public.has_role(auth.uid(), 'admin'));
