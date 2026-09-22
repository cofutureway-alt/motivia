-- Google OAuth login + mandatory onboarding gate
--
-- 1) onboarding_completed: only Google-created accounts start as not-onboarded.
--    Every other signup path (phone/email/admin-created) defaults to true so
--    existing and future classic accounts never see the onboarding page.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT true;

-- 2) Master switch for the Google login button (shown/hidden on Login & Signup).
--    The actual Google OAuth client id/secret is configured in the Supabase
--    dashboard (Auth -> Providers -> Google); this flag only controls the UI.
ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS google_auth_enabled BOOLEAN NOT NULL DEFAULT false;

-- 3) handle_new_user: mark Google provider accounts as needing onboarding.
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
    governorate, registration_type, gender, stage_id, custom_fields,
    onboarding_completed
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
    COALESCE(m->'custom_fields', '{}'::jsonb),
    -- Google sign-in creates the auth user without profile data (phone/stage...),
    -- so those accounts must complete onboarding. Everything else is complete.
    NEW.raw_app_meta_data->>'provider' = 'google'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$function$;
