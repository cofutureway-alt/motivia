
-- 1. Ban flag
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_banned boolean NOT NULL DEFAULT false;

-- 2. Admin management policies on profiles
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
CREATE POLICY "Admins can update all profiles" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can delete profiles" ON public.profiles;
CREATE POLICY "Admins can delete profiles" ON public.profiles
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 3. Update resolve_login_email to reject banned accounts by returning a marker
CREATE OR REPLACE FUNCTION public.resolve_login_email(_identifier text)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id text := trim(COALESCE(_identifier, ''));
  v_email text;
BEGIN
  IF v_id ~ '^201[0125][0-9]{8}$' THEN
    SELECT auth_email INTO v_email FROM public.profiles
      WHERE phone_number = v_id LIMIT 1;
    RETURN COALESCE(v_email, v_id || '@internal.noemail.local');
  END IF;
  RETURN lower(v_id);
END;
$$;

-- 4. Ban check helper (used post-login)
CREATE OR REPLACE FUNCTION public.is_current_user_banned()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE((SELECT is_banned FROM public.profiles WHERE id = auth.uid()), false);
$$;
GRANT EXECUTE ON FUNCTION public.is_current_user_banned() TO authenticated, anon;

-- 5. Admin students list RPC (dynamic filter via jsonb)
CREATE OR REPLACE FUNCTION public.admin_list_students(
  _search text DEFAULT NULL,
  _known_filters jsonb DEFAULT '{}'::jsonb,
  _custom_filters jsonb DEFAULT '{}'::jsonb,
  _limit int DEFAULT 50,
  _offset int DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  full_name text,
  phone_number text,
  student_id text,
  email text,
  auth_email text,
  avatar_url text,
  is_banned boolean,
  created_at timestamptz,
  governorate text,
  registration_type text,
  gender text,
  stage_id uuid,
  stage_name text,
  custom_fields jsonb,
  enrollments_count bigint,
  total_count bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_search text := NULLIF(trim(COALESCE(_search, '')), '');
  v_is_digit_id boolean := v_search IS NOT NULL AND v_search ~ '^[0-9]{1,6}$';
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT p.*, st.name AS stage_name,
      (SELECT COUNT(*) FROM public.enrollments e WHERE e.user_id = p.id) AS enrollments_count
    FROM public.profiles p
    LEFT JOIN public.stages st ON st.id = p.stage_id
    WHERE p.role = 'student'
      AND (
        v_search IS NULL
        OR p.full_name ILIKE '%'||v_search||'%'
        OR p.phone_number ILIKE '%'||v_search||'%'
        OR p.student_id ILIKE '%'||v_search||'%'
        OR (v_is_digit_id AND p.student_id = lpad(v_search, 6, '0'))
      )
      AND (NOT (_known_filters ? 'governorate') OR p.governorate = _known_filters->>'governorate')
      AND (NOT (_known_filters ? 'registration_type') OR p.registration_type = _known_filters->>'registration_type')
      AND (NOT (_known_filters ? 'gender') OR p.gender = _known_filters->>'gender')
      AND (NOT (_known_filters ? 'stage_id') OR p.stage_id = (_known_filters->>'stage_id')::uuid)
      AND (_custom_filters = '{}'::jsonb OR p.custom_fields @> _custom_filters)
  ),
  counted AS (
    SELECT b.*, COUNT(*) OVER () AS total_count FROM base b
  )
  SELECT
    c.id, c.full_name, c.phone_number, c.student_id,
    c.email, c.auth_email, c.avatar_url, c.is_banned, c.created_at,
    c.governorate, c.registration_type, c.gender, c.stage_id, c.stage_name,
    c.custom_fields, c.enrollments_count, c.total_count
  FROM counted c
  ORDER BY
    CASE WHEN v_is_digit_id AND c.student_id = lpad(v_search, 6, '0') THEN 0 ELSE 1 END,
    c.created_at DESC
  LIMIT GREATEST(COALESCE(_limit, 50), 1)
  OFFSET GREATEST(COALESCE(_offset, 0), 0);
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_list_students(text, jsonb, jsonb, int, int) TO authenticated;

-- 6. Admin: full detail helper
CREATE OR REPLACE FUNCTION public.admin_get_student(_uid uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  SELECT to_jsonb(p) || jsonb_build_object('stage_name', st.name)
    INTO result
  FROM public.profiles p
  LEFT JOIN public.stages st ON st.id = p.stage_id
  WHERE p.id = _uid AND p.role = 'student';
  RETURN result;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_get_student(uuid) TO authenticated;

-- 7. Admin: enrollments listing for a student
CREATE OR REPLACE FUNCTION public.admin_student_enrollments(_uid uuid)
RETURNS TABLE(
  course_id uuid,
  course_title text,
  stage_name text,
  subject_name text,
  enrolled_at timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  RETURN QUERY
  SELECT c.id, c.title, st.name, s.name, e.enrolled_at
  FROM public.enrollments e
  JOIN public.courses c ON c.id = e.course_id
  LEFT JOIN public.stages st ON st.id = c.stage_id
  LEFT JOIN public.subjects s ON s.id = c.subject_id
  WHERE e.user_id = _uid
  ORDER BY e.enrolled_at DESC;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_student_enrollments(uuid) TO authenticated;
