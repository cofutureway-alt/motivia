
CREATE POLICY "Signed-in users can read quiz images"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'quiz-images');

CREATE POLICY "Admins can upload quiz images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'quiz-images' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update quiz images"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'quiz-images' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete quiz images"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'quiz-images' AND public.has_role(auth.uid(), 'admin'));
