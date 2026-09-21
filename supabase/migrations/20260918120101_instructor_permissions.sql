
-- ─── 3. Instructor permissions + per-instructor percent overrides ────────────
CREATE TABLE IF NOT EXISTS public.instructor_permissions (
  instructor_id              uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  can_create_courses         boolean NOT NULL DEFAULT true,
  can_create_bundles         boolean NOT NULL DEFAULT false,
  can_create_books           boolean NOT NULL DEFAULT false,
  can_manage_locations       boolean NOT NULL DEFAULT true,
  can_manage_students        boolean NOT NULL DEFAULT true,
  courses_percent_override   numeric(5,2) CHECK (courses_percent_override IS NULL OR (courses_percent_override >= 0 AND courses_percent_override <= 100)),
  books_percent_override     numeric(5,2) CHECK (books_percent_override IS NULL OR (books_percent_override >= 0 AND books_percent_override <= 100)),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  updated_by                 uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);
GRANT SELECT, INSERT, UPDATE ON public.instructor_permissions TO authenticated;
GRANT ALL ON public.instructor_permissions TO service_role;
ALTER TABLE public.instructor_permissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS instructor_permissions_read ON public.instructor_permissions;
CREATE POLICY instructor_permissions_read ON public.instructor_permissions FOR SELECT
  TO authenticated USING (instructor_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS instructor_permissions_admin_write ON public.instructor_permissions;
CREATE POLICY instructor_permissions_admin_write ON public.instructor_permissions FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ─── 4. Instructor locations (أماكن التواجد) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.instructor_locations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name          text NOT NULL,
  address       text,
  map_url       text,
  phone         text,
  is_active     boolean NOT NULL DEFAULT true,
  order_index   integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.instructor_locations TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.instructor_locations TO authenticated;
GRANT ALL ON public.instructor_locations TO service_role;
ALTER TABLE public.instructor_locations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS instructor_locations_read ON public.instructor_locations;
CREATE POLICY instructor_locations_read ON public.instructor_locations FOR SELECT
  USING (is_active = true OR instructor_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS instructor_locations_write ON public.instructor_locations;
CREATE POLICY instructor_locations_write ON public.instructor_locations FOR ALL
  TO authenticated
  USING (
    (instructor_id = auth.uid() AND COALESCE((SELECT can_manage_locations FROM public.instructor_permissions WHERE instructor_id = auth.uid()), true))
    OR public.has_role(auth.uid(), 'admin')
  )
  WITH CHECK (
    (instructor_id = auth.uid() AND COALESCE((SELECT can_manage_locations FROM public.instructor_permissions WHERE instructor_id = auth.uid()), true))
    OR public.has_role(auth.uid(), 'admin')
  );
CREATE TRIGGER instructor_locations_updated_at BEFORE UPDATE ON public.instructor_locations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS instructor_locations_instructor_idx ON public.instructor_locations(instructor_id, order_index);
