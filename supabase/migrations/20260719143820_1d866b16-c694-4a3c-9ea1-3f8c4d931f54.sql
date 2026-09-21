
-- Fix 1: handle_new_user must never trust client-supplied role
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  m jsonb := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
BEGIN
  INSERT INTO public.profiles (
    id, full_name, role, phone_number, guardian_phone, email, auth_email,
    governorate, registration_type, gender, stage_id, custom_fields
  ) VALUES (
    NEW.id,
    COALESCE(m->>'full_name', m->>'name', ''),
    'student'::app_role,  -- HARDCODED: never trust client metadata
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

-- Fix 2: prevent students from updating privileged columns on their own profile
CREATE OR REPLACE FUNCTION public.prevent_privileged_profile_updates()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  NEW.role := OLD.role;
  NEW.is_banned := OLD.is_banned;
  NEW.student_id := OLD.student_id;
  NEW.qr_token := OLD.qr_token;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_prevent_privileged_profile_updates ON public.profiles;
CREATE TRIGGER trg_prevent_privileged_profile_updates
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_privileged_profile_updates();
