
CREATE POLICY "Admins read lesson files"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'lesson-files' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins upload lesson files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'lesson-files' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update lesson files"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'lesson-files' AND public.has_role(auth.uid(), 'admin'))
WITH CHECK (bucket_id = 'lesson-files' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete lesson files"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'lesson-files' AND public.has_role(auth.uid(), 'admin'));
