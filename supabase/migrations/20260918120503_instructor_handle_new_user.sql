-- Phase 71o: allow admin-created instructor accounts (same trust model as admin)
-- The role is set defensively by the admin-create-instructor edge function too.
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  m jsonb := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
  v_role public.app_role := 'student'::public.app_role;
BEGIN
  IF NULLIF(m->>'intended_role','') = 'parent' OR NULLIF(m->>'role','') = 'parent' THEN
    v_role := 'parent'::public.app_role;
  ELSIF NULLIF(m->>'intended_role','') = 'admin' OR NULLIF(m->>'role','') = 'admin' THEN
    v_role := 'admin'::public.app_role;
  ELSIF NULLIF(m->>'intended_role','') = 'instructor' OR NULLIF(m->>'role','') = 'instructor' THEN
    v_role := 'instructor'::public.app_role;
  END IF;

  INSERT INTO public.profiles (
    id, full_name, role, phone_number, guardian_phone, email, auth_email,
    governorate, registration_type, gender, stage_id, custom_fields
  ) VALUES (
    NEW.id,
    COALESCE(m->>'full_name', m->>'name', ''),
    v_role,
    NULLIF(m->>'phone_number',''),
    NULLIF(m->>'guardian_phone',''),
    NULLIF(m->>'real_email',''),
    NEW.email,
    NULLIF(m->>'governorate',''),
    NULLIF(m->>'registration_type',''),
    NULLIF(m->>'gender',''),
    CASE WHEN NULLIF(m->>'stage_id','') IS NOT NULL THEN (m->>'stage_id')::uuid ELSE NULL END,
    COALESCE(m->'custom_fields', '{}'::jsonb)
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$function$;
