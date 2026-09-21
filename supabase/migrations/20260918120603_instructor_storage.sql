-- ============================================================================
-- Phase 71o (4/4): instructor storage policies — uploads for own content assets
-- ============================================================================

-- ─── thumbnails (course covers / bundle covers) ───
DROP POLICY IF EXISTS "Instructors can upload thumbnails" ON storage.objects;
CREATE POLICY "Instructors can upload thumbnails" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'thumbnails' AND public.has_role(auth.uid(), 'instructor') AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "Instructors can update thumbnails" ON storage.objects;
CREATE POLICY "Instructors can update thumbnails" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'thumbnails' AND public.has_role(auth.uid(), 'instructor') AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'thumbnails' AND public.has_role(auth.uid(), 'instructor') AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "Instructors can delete thumbnails" ON storage.objects;
CREATE POLICY "Instructors can delete thumbnails" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'thumbnails' AND public.has_role(auth.uid(), 'instructor') AND (storage.foldername(name))[1] = auth.uid()::text);

-- ─── book-assets (covers / digital files / extra images) ───
DROP POLICY IF EXISTS "Instructors can read book-assets" ON storage.objects;
CREATE POLICY "Instructors can read book-assets" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'book-assets' AND public.has_role(auth.uid(), 'instructor') AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "Instructors can upload book-assets" ON storage.objects;
CREATE POLICY "Instructors can upload book-assets" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'book-assets' AND public.has_role(auth.uid(), 'instructor') AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "Instructors can update book-assets" ON storage.objects;
CREATE POLICY "Instructors can update book-assets" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'book-assets' AND public.has_role(auth.uid(), 'instructor') AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'book-assets' AND public.has_role(auth.uid(), 'instructor') AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "Instructors can delete book-assets" ON storage.objects;
CREATE POLICY "Instructors can delete book-assets" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'book-assets' AND public.has_role(auth.uid(), 'instructor') AND (storage.foldername(name))[1] = auth.uid()::text);

-- ─── quiz-images (question illustrations) ───
DROP POLICY IF EXISTS "Instructors can upload quiz-images" ON storage.objects;
CREATE POLICY "Instructors can upload quiz-images" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'quiz-images' AND public.has_role(auth.uid(), 'instructor') AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "Instructors can update quiz-images" ON storage.objects;
CREATE POLICY "Instructors can update quiz-images" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'quiz-images' AND public.has_role(auth.uid(), 'instructor') AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'quiz-images' AND public.has_role(auth.uid(), 'instructor') AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "Instructors can delete quiz-images" ON storage.objects;
CREATE POLICY "Instructors can delete quiz-images" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'quiz-images' AND public.has_role(auth.uid(), 'instructor') AND (storage.foldername(name))[1] = auth.uid()::text);

-- ─── lesson-files ───
DROP POLICY IF EXISTS "Instructors can read lesson-files" ON storage.objects;
CREATE POLICY "Instructors can read lesson-files" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'lesson-files' AND public.has_role(auth.uid(), 'instructor') AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "Instructors can upload lesson-files" ON storage.objects;
CREATE POLICY "Instructors can upload lesson-files" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'lesson-files' AND public.has_role(auth.uid(), 'instructor') AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "Instructors can update lesson-files" ON storage.objects;
CREATE POLICY "Instructors can update lesson-files" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'lesson-files' AND public.has_role(auth.uid(), 'instructor') AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'lesson-files' AND public.has_role(auth.uid(), 'instructor') AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "Instructors can delete lesson-files" ON storage.objects;
CREATE POLICY "Instructors can delete lesson-files" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'lesson-files' AND public.has_role(auth.uid(), 'instructor') AND (storage.foldername(name))[1] = auth.uid()::text);

-- ─── assignment-files ───
DROP POLICY IF EXISTS "Instructors can read assignment-files" ON storage.objects;
CREATE POLICY "Instructors can read assignment-files" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'assignment-files' AND public.has_role(auth.uid(), 'instructor') AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "Instructors can upload assignment-files" ON storage.objects;
CREATE POLICY "Instructors can upload assignment-files" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'assignment-files' AND public.has_role(auth.uid(), 'instructor') AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "Instructors can update assignment-files" ON storage.objects;
CREATE POLICY "Instructors can update assignment-files" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'assignment-files' AND public.has_role(auth.uid(), 'instructor') AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'assignment-files' AND public.has_role(auth.uid(), 'instructor') AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "Instructors can delete assignment-files" ON storage.objects;
CREATE POLICY "Instructors can delete assignment-files" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'assignment-files' AND public.has_role(auth.uid(), 'instructor') AND (storage.foldername(name))[1] = auth.uid()::text);