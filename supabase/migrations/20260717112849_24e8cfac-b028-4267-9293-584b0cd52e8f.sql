
-- ============ SUBJECTS (Phase 9) ============
CREATE TABLE public.subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  thumbnail_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.subjects TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subjects TO authenticated;
GRANT ALL ON public.subjects TO service_role;

ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Subjects readable by everyone"
  ON public.subjects FOR SELECT
  USING (true);

CREATE POLICY "Admins insert subjects"
  ON public.subjects FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update subjects"
  ON public.subjects FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete subjects"
  ON public.subjects FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_subjects_updated_at
  BEFORE UPDATE ON public.subjects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ courses.subject_id ============
ALTER TABLE public.courses
  ADD COLUMN subject_id uuid REFERENCES public.subjects(id) ON DELETE SET NULL;

CREATE INDEX idx_courses_subject_id ON public.courses(subject_id);

-- ============ LESSON FILES PERMISSIONS (Phase 10) ============
ALTER TABLE public.lesson_files
  ADD COLUMN allow_download boolean NOT NULL DEFAULT true,
  ADD COLUMN download_limit integer;

-- ============ LESSON FILE DOWNLOADS ============
CREATE TABLE public.lesson_file_downloads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  lesson_file_id uuid NOT NULL REFERENCES public.lesson_files(id) ON DELETE CASCADE,
  download_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, lesson_file_id)
);

GRANT SELECT ON public.lesson_file_downloads TO authenticated;
GRANT ALL ON public.lesson_file_downloads TO service_role;

ALTER TABLE public.lesson_file_downloads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see their own download counts"
  ON public.lesson_file_downloads FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins see all download counts"
  ON public.lesson_file_downloads FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_lesson_file_downloads_updated_at
  BEFORE UPDATE ON public.lesson_file_downloads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ increment_file_download RPC ============
CREATE OR REPLACE FUNCTION public.increment_file_download(p_lesson_file_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_lesson uuid;
  v_course uuid;
  v_allow boolean;
  v_limit integer;
  v_is_admin boolean;
  v_current integer;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'auth required' USING ERRCODE = '42501';
  END IF;

  SELECT lf.lesson_id, l.unit_id, lf.allow_download, lf.download_limit
    INTO v_lesson, v_course, v_allow, v_limit
  FROM public.lesson_files lf
  JOIN public.lessons l ON l.id = lf.lesson_id
  WHERE lf.id = p_lesson_file_id;

  IF v_lesson IS NULL THEN
    RAISE EXCEPTION 'file not found' USING ERRCODE = '02000';
  END IF;

  IF NOT v_allow THEN
    RAISE EXCEPTION 'download disabled' USING ERRCODE = '42501';
  END IF;

  SELECT u.course_id INTO v_course FROM public.units u WHERE u.id = v_course;

  v_is_admin := public.has_role(v_user, 'admin');

  IF NOT v_is_admin THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.enrollments e
      WHERE e.user_id = v_user AND e.course_id = v_course
    ) THEN
      RAISE EXCEPTION 'not enrolled' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Get current count
  SELECT download_count INTO v_current
  FROM public.lesson_file_downloads
  WHERE user_id = v_user AND lesson_file_id = p_lesson_file_id;
  v_current := COALESCE(v_current, 0);

  IF v_limit IS NOT NULL AND v_current >= v_limit THEN
    RAISE EXCEPTION 'download limit reached' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.lesson_file_downloads (user_id, lesson_file_id, download_count)
  VALUES (v_user, p_lesson_file_id, 1)
  ON CONFLICT (user_id, lesson_file_id)
  DO UPDATE SET download_count = public.lesson_file_downloads.download_count + 1,
                updated_at = now()
  RETURNING download_count INTO v_current;

  RETURN v_current;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_file_download(uuid) TO authenticated;
