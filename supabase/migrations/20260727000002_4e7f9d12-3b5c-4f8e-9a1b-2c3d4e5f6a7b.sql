-- Phase 62: Primary Admin Protection + All Users listing function

-- ─── 1. Add is_primary_admin to profiles ─────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_primary_admin BOOLEAN NOT NULL DEFAULT FALSE;

-- ─── 2. Seed: flag the earliest admin account as primary (idempotent) ─────────
-- Only runs if no primary admin has been designated yet.
UPDATE public.profiles
SET is_primary_admin = TRUE
WHERE id = (
  SELECT id
  FROM public.profiles
  WHERE role = 'admin'
  ORDER BY created_at ASC
  LIMIT 1
)
AND NOT EXISTS (
  SELECT 1 FROM public.profiles WHERE is_primary_admin = TRUE
);

-- ─── 3. Enforce exactly one primary admin at a time ───────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS profiles_one_primary_admin
  ON public.profiles (is_primary_admin)
  WHERE is_primary_admin = TRUE;

-- ─── 4. Unified all-users listing function ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_list_all_users(
  _search  TEXT    DEFAULT NULL,
  _role    TEXT    DEFAULT NULL,
  _limit   INTEGER DEFAULT 50,
  _offset  INTEGER DEFAULT 0
)
RETURNS TABLE (
  id                    UUID,
  full_name             TEXT,
  phone_number          TEXT,
  email                 TEXT,
  auth_email            TEXT,
  avatar_url            TEXT,
  user_role             TEXT,
  is_banned             BOOLEAN,
  is_primary_admin      BOOLEAN,
  created_at            TIMESTAMPTZ,
  student_id            TEXT,
  linked_children_count BIGINT,
  total_count           BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Caller must be an admin
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.full_name,
    p.phone_number,
    p.email,
    au.email                                                              AS auth_email,
    p.avatar_url,
    p.role::text                                                          AS user_role,
    p.is_banned,
    p.is_primary_admin,
    p.created_at,
    p.student_id,
    COALESCE(
      (SELECT COUNT(*)::BIGINT
       FROM public.parent_student_links psl
       WHERE psl.parent_user_id = p.id
         AND psl.status = 'approved'),
      0::BIGINT
    )                                                                     AS linked_children_count,
    COUNT(*) OVER()                                                       AS total_count
  FROM public.profiles p
  LEFT JOIN auth.users au ON au.id = p.id
  WHERE
    (_role IS NULL OR p.role::text = _role)
    AND (
      _search IS NULL OR _search = ''
      OR p.full_name    ILIKE '%' || _search || '%'
      OR p.phone_number ILIKE '%' || _search || '%'
      OR p.student_id   ILIKE '%' || _search || '%'
    )
  ORDER BY
    p.is_primary_admin DESC,  -- primary admin always first in admin list
    p.created_at DESC
  LIMIT  _limit
  OFFSET _offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_all_users(TEXT, TEXT, INTEGER, INTEGER) TO authenticated;
