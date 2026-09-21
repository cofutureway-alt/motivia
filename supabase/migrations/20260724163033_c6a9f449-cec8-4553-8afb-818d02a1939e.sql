
-- Admin: list parents with linked-student and request counts
CREATE OR REPLACE FUNCTION public.admin_list_parents(_search text DEFAULT NULL)
RETURNS TABLE (
  parent_user_id uuid,
  full_name text,
  phone_number text,
  email text,
  avatar_url text,
  is_banned boolean,
  created_at timestamptz,
  approved_children_count bigint,
  pending_requests_count bigint,
  total_requests_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.full_name,
    p.phone_number,
    COALESCE(p.email, p.auth_email),
    p.avatar_url,
    COALESCE(p.is_banned, false),
    p.created_at,
    COALESCE((SELECT count(*) FROM public.parent_student_links l
              WHERE l.parent_user_id = p.id AND l.status = 'approved'), 0),
    COALESCE((SELECT count(*) FROM public.parent_student_links l
              WHERE l.parent_user_id = p.id AND l.status = 'pending'), 0),
    COALESCE((SELECT count(*) FROM public.parent_student_links l
              WHERE l.parent_user_id = p.id), 0)
  FROM public.profiles p
  WHERE p.role = 'parent'
    AND (
      _search IS NULL OR _search = '' OR
      p.full_name ILIKE '%' || _search || '%' OR
      p.phone_number ILIKE '%' || _search || '%' OR
      COALESCE(p.email, p.auth_email) ILIKE '%' || _search || '%'
    )
    AND public.has_role(auth.uid(), 'admin'::app_role)
  ORDER BY p.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.admin_list_parents(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_parents(text) TO authenticated;

-- Admin: get all links (any status) for one parent, with student info
CREATE OR REPLACE FUNCTION public.admin_get_parent_links(_parent_id uuid)
RETURNS TABLE (
  id uuid,
  student_user_id uuid,
  student_name text,
  student_code text,
  student_phone text,
  status text,
  relationship text,
  request_note text,
  admin_note text,
  created_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    l.id,
    l.student_user_id,
    sp.full_name,
    sp.student_id,
    sp.phone_number,
    l.status,
    l.relationship,
    l.request_note,
    l.admin_note,
    l.created_at,
    l.reviewed_at,
    l.reviewed_by,
    l.updated_at
  FROM public.parent_student_links l
  LEFT JOIN public.profiles sp ON sp.id = l.student_user_id
  WHERE l.parent_user_id = _parent_id
    AND public.has_role(auth.uid(), 'admin'::app_role)
  ORDER BY
    CASE l.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 WHEN 'rejected' THEN 2 ELSE 3 END,
    l.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.admin_get_parent_links(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_parent_links(uuid) TO authenticated;
