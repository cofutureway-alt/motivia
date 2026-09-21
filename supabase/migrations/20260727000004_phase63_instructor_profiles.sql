-- Phase 63: Public Instructor / Publisher Profile

-- 1. Add bio and social_links to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS bio TEXT,
  ADD COLUMN IF NOT EXISTS social_links JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 2. Backfill existing courses' created_by with the primary admin
UPDATE public.courses
SET created_by = (
  SELECT id FROM public.profiles WHERE is_primary_admin = true LIMIT 1
)
WHERE created_by IS NULL;

-- 3. Create public RPC to fetch non-sensitive public instructor profile info
CREATE OR REPLACE FUNCTION public.get_public_instructor_profile(_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_res JSONB;
BEGIN
  SELECT jsonb_build_object(
    'id', p.id,
    'full_name', p.full_name,
    'avatar_url', p.avatar_url,
    'bio', p.bio,
    'social_links', COALESCE(p.social_links, '[]'::jsonb),
    'user_role', p.role::text,
    'is_primary_admin', COALESCE(p.is_primary_admin, false)
  )
  INTO v_res
  FROM public.profiles p
  WHERE p.id = _user_id;

  RETURN v_res;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_instructor_profile(UUID) TO anon, authenticated;
