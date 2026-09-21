
-- Helper: is the assignment window currently open?
CREATE OR REPLACE FUNCTION public.assignment_window_open(_assignment_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.assignments
    WHERE id = _assignment_id
      AND now() >= start_at
      AND now() <= end_at
  );
$$;

-- assignment_submissions
CREATE TABLE public.assignment_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  text_content jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted')),
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assignment_id, user_id)
);
CREATE INDEX assignment_submissions_assignment_idx ON public.assignment_submissions(assignment_id);
CREATE INDEX assignment_submissions_user_idx ON public.assignment_submissions(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.assignment_submissions TO authenticated;
GRANT ALL ON public.assignment_submissions TO service_role;

ALTER TABLE public.assignment_submissions ENABLE ROW LEVEL SECURITY;

-- Students can always read their own submission (needed for read-only view after deadline)
CREATE POLICY "Own or admin read submissions"
  ON public.assignment_submissions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Students may INSERT their own row only while the window is open
CREATE POLICY "Own insert within window"
  ON public.assignment_submissions FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.assignment_window_open(assignment_id)
  );

-- Students may UPDATE their own row only while the window is open (blocks post-deadline edits at DB level)
CREATE POLICY "Own update within window"
  ON public.assignment_submissions FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    AND public.assignment_window_open(assignment_id)
  )
  WITH CHECK (
    user_id = auth.uid()
    AND public.assignment_window_open(assignment_id)
  );

CREATE TRIGGER assignment_submissions_set_updated_at
  BEFORE UPDATE ON public.assignment_submissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- assignment_submission_files
CREATE TABLE public.assignment_submission_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.assignment_submissions(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_size_bytes bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX assignment_submission_files_submission_idx ON public.assignment_submission_files(submission_id);

GRANT SELECT, INSERT, DELETE ON public.assignment_submission_files TO authenticated;
GRANT ALL ON public.assignment_submission_files TO service_role;

ALTER TABLE public.assignment_submission_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own or admin read submission files"
  ON public.assignment_submission_files FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.assignment_submissions s
      WHERE s.id = submission_id
        AND (s.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    )
  );

CREATE POLICY "Own insert submission files within window"
  ON public.assignment_submission_files FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.assignment_submissions s
      WHERE s.id = submission_id
        AND s.user_id = auth.uid()
        AND public.assignment_window_open(s.assignment_id)
    )
  );

CREATE POLICY "Own delete submission files within window"
  ON public.assignment_submission_files FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.assignment_submissions s
      WHERE s.id = submission_id
        AND s.user_id = auth.uid()
        AND public.assignment_window_open(s.assignment_id)
    )
  );

-- Storage RLS on assignment-submissions bucket
-- Files stored under: <user_id>/<submission_id>/<uuid>-<name>
-- First path segment must equal the user's id.

CREATE POLICY "Read own or admin submission storage"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'assignment-submissions'
    AND (
      public.has_role(auth.uid(), 'admin')
      OR auth.uid()::text = (storage.foldername(name))[1]
    )
  );

CREATE POLICY "Insert own submission storage within window"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'assignment-submissions'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Delete own submission storage"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'assignment-submissions'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
