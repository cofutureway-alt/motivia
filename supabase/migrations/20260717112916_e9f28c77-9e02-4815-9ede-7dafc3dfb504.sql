
CREATE POLICY "Enrolled users read lesson files"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'lesson-files'
  AND EXISTS (
    SELECT 1
    FROM public.lesson_files lf
    JOIN public.lessons l ON l.id = lf.lesson_id
    JOIN public.units u ON u.id = l.unit_id
    JOIN public.enrollments e ON e.course_id = u.course_id
    WHERE lf.file_url = storage.objects.name
      AND e.user_id = auth.uid()
  )
);
