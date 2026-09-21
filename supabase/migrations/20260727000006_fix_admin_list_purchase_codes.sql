-- Fix admin_list_purchase_codes RPC function
DROP FUNCTION IF EXISTS public.admin_list_purchase_codes(text, text, integer, integer);

CREATE OR REPLACE FUNCTION public.admin_list_purchase_codes(
  _search  text    DEFAULT NULL,
  _status  text    DEFAULT NULL,
  _limit   integer DEFAULT 50,
  _offset  integer DEFAULT 0
)
RETURNS TABLE (
  id           uuid,
  code         text,
  target_type  text,
  target_id    uuid,
  target_title text,
  max_uses     integer,
  use_count    integer,
  status       text,
  expires_at   timestamptz,
  batch_id     uuid,
  created_at   timestamptz,
  updated_at   timestamptz,
  total_count  bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_search text := NULLIF(trim(COALESCE(_search, '')), '');
  v_status text := NULLIF(trim(COALESCE(_status, '')), '');
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Lazy 30-day cleanup step: delete used-up or expired codes older than 30 days
  DELETE FROM public.purchase_codes
  WHERE
    (use_count >= max_uses AND updated_at < now() - INTERVAL '30 days')
    OR (expires_at IS NOT NULL AND expires_at < now() - INTERVAL '30 days');

  RETURN QUERY
  WITH base AS (
    SELECT
      pc.id,
      pc.code,
      pc.target_type,
      pc.target_id,
      COALESCE(
        CASE
          WHEN pc.target_type = 'course' THEN (SELECT c.title FROM public.courses c WHERE c.id = pc.target_id)
          WHEN pc.target_type = 'bundle' THEN (SELECT b.title FROM public.bundles b WHERE b.id = pc.target_id)
          ELSE 'غير معروف'
        END,
        'غير معروف'
      ) AS target_title,
      pc.max_uses,
      pc.use_count,
      CASE
        WHEN pc.use_count >= pc.max_uses THEN 'used_up'
        WHEN pc.expires_at IS NOT NULL AND pc.expires_at < now() THEN 'expired'
        ELSE 'active'
      END AS status,
      pc.expires_at,
      pc.batch_id,
      pc.created_at,
      pc.updated_at
    FROM public.purchase_codes pc
  ),
  filtered AS (
    SELECT b.*
    FROM base b
    WHERE
      (v_status IS NULL OR v_status = 'all' OR b.status = v_status)
      AND (
        v_search IS NULL OR
        b.code ILIKE '%' || v_search || '%' OR
        b.target_title ILIKE '%' || v_search || '%'
      )
  ),
  counted AS (
    SELECT f.*, COUNT(*) OVER() AS total_count FROM filtered f
  )
  SELECT
    c.id, c.code, c.target_type, c.target_id, c.target_title,
    c.max_uses, c.use_count, c.status, c.expires_at, c.batch_id,
    c.created_at, c.updated_at, c.total_count
  FROM counted c
  ORDER BY c.created_at DESC
  LIMIT  GREATEST(COALESCE(_limit, 50), 1)
  OFFSET GREATEST(COALESCE(_offset, 0), 0);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_purchase_codes(text, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_purchase_codes(text, text, integer, integer) TO authenticated;
