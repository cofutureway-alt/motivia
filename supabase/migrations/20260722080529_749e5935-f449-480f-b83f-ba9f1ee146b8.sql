
DROP POLICY IF EXISTS "payment proofs owner insert" ON storage.objects;
CREATE POLICY "payment proofs owner insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'payment-proofs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "payment proofs owner or admin select" ON storage.objects;
CREATE POLICY "payment proofs owner or admin select" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'payment-proofs'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.has_role(auth.uid(), 'admin')
    )
  );

DROP POLICY IF EXISTS "payment proofs owner update" ON storage.objects;
CREATE POLICY "payment proofs owner update" ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'payment-proofs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
