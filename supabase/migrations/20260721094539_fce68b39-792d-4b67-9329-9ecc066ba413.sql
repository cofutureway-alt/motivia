
CREATE POLICY "assignment-files admin read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'assignment-files' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "assignment-files enrolled read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'assignment-files'
    AND EXISTS (
      SELECT 1
      FROM public.assignment_files af
      JOIN public.assignments a ON a.id = af.assignment_id
      JOIN public.enrollments e ON e.course_id = a.course_id
      WHERE af.file_url = storage.objects.name
        AND e.user_id = auth.uid()
    )
  );

CREATE POLICY "assignment-files admin insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'assignment-files' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "assignment-files admin update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'assignment-files' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'assignment-files' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "assignment-files admin delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'assignment-files' AND public.has_role(auth.uid(), 'admin'));
