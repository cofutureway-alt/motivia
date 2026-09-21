-- Fix admin_list_all_users RPC function
DROP FUNCTION IF EXISTS public.admin_list_all_users(text, text, integer, integer);

CREATE OR REPLACE FUNCTION public.admin_list_all_users(
  _search  text    DEFAULT NULL,
  _role    text    DEFAULT NULL,
  _limit   integer DEFAULT 50,
  _offset  integer DEFAULT 0
)
RETURNS TABLE (
  id                    uuid,
  full_name             text,
  phone_number          text,
  email                 text,
  auth_email            text,
  avatar_url            text,
  user_role             text,
  is_banned             boolean,
  is_primary_admin      boolean,
  created_at            timestamptz,
  student_id            text,
  linked_children_count bigint,
  total_count           bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_search text := NULLIF(trim(COALESCE(_search, '')), '');
  v_role   text := NULLIF(trim(COALESCE(_role, '')), '');
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.full_name,
    p.phone_number,
    p.email,
    COALESCE(p.auth_email, p.email)                                      AS auth_email,
    p.avatar_url,
    p.role::text                                                         AS user_role,
    COALESCE(p.is_banned, false)                                         AS is_banned,
    COALESCE(p.is_primary_admin, false)                                  AS is_primary_admin,
    p.created_at,
    p.student_id,
    COALESCE(
      (SELECT COUNT(*)::bigint
       FROM public.parent_student_links psl
       WHERE psl.parent_user_id = p.id
         AND psl.status = 'approved'),
      0::bigint
    )                                                                    AS linked_children_count,
    COUNT(*) OVER()                                                      AS total_count
  FROM public.profiles p
  WHERE
    (v_role IS NULL OR p.role::text = v_role)
    AND (
      v_search IS NULL
      OR p.full_name    ILIKE '%' || v_search || '%'
      OR p.phone_number ILIKE '%' || v_search || '%'
      OR p.student_id   ILIKE '%' || v_search || '%'
      OR COALESCE(p.email, p.auth_email) ILIKE '%' || v_search || '%'
    )
  ORDER BY
    COALESCE(p.is_primary_admin, false) DESC,
    p.created_at DESC
  LIMIT  GREATEST(COALESCE(_limit, 50), 1)
  OFFSET GREATEST(COALESCE(_offset, 0), 0);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_all_users(text, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_all_users(text, text, integer, integer) TO authenticated;
