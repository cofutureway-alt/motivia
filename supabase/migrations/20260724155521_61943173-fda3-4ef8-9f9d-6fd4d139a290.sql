DROP FUNCTION IF EXISTS public.admin_list_students(text, jsonb, jsonb, integer, integer);

CREATE OR REPLACE FUNCTION public.admin_list_students(
  _search text DEFAULT NULL,
  _known_filters jsonb DEFAULT '{}'::jsonb,
  _custom_filters jsonb DEFAULT '{}'::jsonb,
  _limit integer DEFAULT 50,
  _offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid, full_name text, phone_number text, student_id text,
  email text, auth_email text, avatar_url text, is_banned boolean,
  created_at timestamptz, governorate text, registration_type text,
  gender text, stage_id uuid, stage_name text, custom_fields jsonb,
  enrollments_count bigint, completed_courses_count bigint,
  wallet_balance_piastres bigint, total_count bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
      (SELECT COUNT(*) FROM public.enrollments e WHERE e.user_id = p.id) AS enrollments_count,
      (
        SELECT COUNT(*) FROM public.enrollments e
        WHERE e.user_id = p.id
          AND EXISTS (
            SELECT 1 FROM public.lessons l
            JOIN public.units u ON u.id = l.unit_id
            WHERE u.course_id = e.course_id
          )
          AND NOT EXISTS (
            SELECT 1 FROM public.lessons l
            JOIN public.units u ON u.id = l.unit_id
            WHERE u.course_id = e.course_id
              AND NOT EXISTS (
                SELECT 1 FROM public.lesson_progress lp
                WHERE lp.user_id = p.id AND lp.lesson_id = l.id
              )
          )
      ) AS completed_courses_count,
      COALESCE(
        (SELECT w.balance_piastres FROM public.wallets w WHERE w.user_id = p.id),
        0
      )::bigint AS wallet_balance_piastres
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
    c.custom_fields, c.enrollments_count, c.completed_courses_count,
    c.wallet_balance_piastres, c.total_count
  FROM counted c
  ORDER BY
    CASE WHEN v_is_digit_id AND c.student_id = lpad(v_search, 6, '0') THEN 0 ELSE 1 END,
    c.created_at DESC
  LIMIT GREATEST(COALESCE(_limit, 50), 1)
  OFFSET GREATEST(COALESCE(_offset, 0), 0);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_list_students(text, jsonb, jsonb, integer, integer) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_list_students(text, jsonb, jsonb, integer, integer) FROM anon, PUBLIC;