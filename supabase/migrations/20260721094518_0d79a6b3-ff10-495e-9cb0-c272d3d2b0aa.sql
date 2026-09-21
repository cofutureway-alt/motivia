
-- Assignments (unit content, alongside lessons + quizzes)
CREATE TABLE IF NOT EXISTS public.assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  order_index integer NOT NULL DEFAULT 0,
  total_grade numeric NOT NULL CHECK (total_grade > 0),
  pass_grade numeric NOT NULL CHECK (pass_grade > 0),
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT assignments_pass_le_total CHECK (pass_grade <= total_grade)
);

CREATE INDEX IF NOT EXISTS assignments_unit_id_idx ON public.assignments(unit_id);
CREATE INDEX IF NOT EXISTS assignments_course_id_idx ON public.assignments(course_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.assignments TO authenticated;
GRANT ALL ON public.assignments TO service_role;

ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enrolled or admin can view assignments"
  ON public.assignments FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.enrollments e
      WHERE e.course_id = assignments.course_id AND e.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins insert assignments"
  ON public.assignments FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update assignments"
  ON public.assignments FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete assignments"
  ON public.assignments FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER assignments_set_updated_at
  BEFORE UPDATE ON public.assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Assignment reference files (admin uploads for students to consult)
CREATE TABLE IF NOT EXISTS public.assignment_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_size_bytes bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assignment_files_assignment_id_idx
  ON public.assignment_files(assignment_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.assignment_files TO authenticated;
GRANT ALL ON public.assignment_files TO service_role;

ALTER TABLE public.assignment_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enrolled or admin can view assignment files"
  ON public.assignment_files FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.assignments a
      JOIN public.enrollments e ON e.course_id = a.course_id
      WHERE a.id = assignment_files.assignment_id AND e.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins insert assignment files"
  ON public.assignment_files FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update assignment files"
  ON public.assignment_files FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete assignment files"
  ON public.assignment_files FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Extend the shared "next order_index" helper to include assignments
CREATE OR REPLACE FUNCTION public.next_unit_order_index(_unit_id uuid)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(MAX(pos), -1) + 1 FROM (
    SELECT position AS pos FROM public.lessons WHERE unit_id = _unit_id
    UNION ALL
    SELECT order_index AS pos FROM public.quizzes WHERE unit_id = _unit_id
    UNION ALL
    SELECT order_index AS pos FROM public.assignments WHERE unit_id = _unit_id
  ) t;
$function$;
