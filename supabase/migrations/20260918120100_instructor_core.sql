-- ============================================================================
-- Phase 71b: Instructors system — core tables, RLS, ownership columns
-- ============================================================================

-- ─── 1. Ownership columns on books & bundles ─────────────────────────────────
ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.bundles
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS books_created_by_idx ON public.books(created_by) WHERE created_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS bundles_created_by_idx ON public.bundles(created_by) WHERE created_by IS NOT NULL;

-- ─── 2. Instructor ↔ subjects / stages (multi-select) ────────────────────────
CREATE TABLE IF NOT EXISTS public.instructor_subjects (
  instructor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject_id    uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (instructor_id, subject_id)
);
GRANT SELECT, INSERT, DELETE ON public.instructor_subjects TO authenticated;
GRANT ALL ON public.instructor_subjects TO service_role;
ALTER TABLE public.instructor_subjects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS instructor_subjects_read ON public.instructor_subjects;
CREATE POLICY instructor_subjects_read ON public.instructor_subjects FOR SELECT
  TO authenticated USING (true);
DROP POLICY IF EXISTS instructor_subjects_write ON public.instructor_subjects;
CREATE POLICY instructor_subjects_write ON public.instructor_subjects FOR ALL
  TO authenticated
  USING (instructor_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (instructor_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.instructor_stages (
  instructor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  stage_id      uuid NOT NULL REFERENCES public.stages(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (instructor_id, stage_id)
);
GRANT SELECT, INSERT, DELETE ON public.instructor_stages TO authenticated;
GRANT ALL ON public.instructor_stages TO service_role;
ALTER TABLE public.instructor_stages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS instructor_stages_read ON public.instructor_stages;
CREATE POLICY instructor_stages_read ON public.instructor_stages FOR SELECT
  TO authenticated USING (true);
DROP POLICY IF EXISTS instructor_stages_write ON public.instructor_stages;
CREATE POLICY instructor_stages_write ON public.instructor_stages FOR ALL
  TO authenticated
  USING (instructor_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (instructor_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
