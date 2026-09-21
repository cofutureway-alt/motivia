
-- Quizzes table
CREATE TABLE public.quizzes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  order_index integer NOT NULL DEFAULT 0,
  duration_minutes integer NOT NULL DEFAULT 30,
  start_at timestamptz,
  end_at timestamptz,
  randomize_enabled boolean NOT NULL DEFAULT true,
  pass_percentage integer NOT NULL DEFAULT 50 CHECK (pass_percentage BETWEEN 1 AND 100),
  max_attempts integer NOT NULL DEFAULT 1 CHECK (max_attempts BETWEEN 1 AND 20),
  attempt_result_policy text NOT NULL DEFAULT 'highest' CHECK (attempt_result_policy IN ('first','highest','last')),
  forms_count integer NOT NULL DEFAULT 1 CHECK (forms_count BETWEEN 1 AND 5),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_quizzes_unit_id ON public.quizzes(unit_id);
CREATE INDEX idx_quizzes_course_id ON public.quizzes(course_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quizzes TO authenticated;
GRANT ALL ON public.quizzes TO service_role;

ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage quizzes"
  ON public.quizzes FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Enrolled students read quizzes"
  ON public.quizzes FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.enrollments e
      WHERE e.user_id = auth.uid() AND e.course_id = quizzes.course_id
    )
  );

CREATE TRIGGER trg_quizzes_updated_at
  BEFORE UPDATE ON public.quizzes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RPC: compute next combined order index across lessons + quizzes for a unit
CREATE OR REPLACE FUNCTION public.next_unit_order_index(_unit_id uuid)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(MAX(pos), -1) + 1 FROM (
    SELECT position AS pos FROM public.lessons WHERE unit_id = _unit_id
    UNION ALL
    SELECT order_index AS pos FROM public.quizzes WHERE unit_id = _unit_id
  ) t;
$$;

GRANT EXECUTE ON FUNCTION public.next_unit_order_index(uuid) TO authenticated;
