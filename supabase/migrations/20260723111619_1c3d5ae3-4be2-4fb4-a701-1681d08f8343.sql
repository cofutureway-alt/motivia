
CREATE OR REPLACE FUNCTION public.leaderboard_top_full(p_limit integer, p_offset integer)
RETURNS TABLE(
  student_id uuid,
  full_name text,
  avatar_url text,
  total_points integer,
  rank bigint,
  level_id uuid,
  level_name text,
  level_icon_url text,
  badge_count integer,
  leaderboard_visible boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH base AS (
    SELECT p.id AS student_id, p.full_name, p.avatar_url, p.leaderboard_visible,
           GREATEST(COALESCE((SELECT SUM(points_delta) FROM public.points_ledger WHERE student_id = p.id), 0), 0)::int AS total_points,
           (SELECT MIN(created_at) FROM public.points_ledger WHERE student_id = p.id) AS first_earn_at
    FROM public.profiles p
    WHERE p.role = 'student' AND p.is_banned = false
  ),
  ranked AS (
    SELECT *, ROW_NUMBER() OVER (ORDER BY total_points DESC, first_earn_at ASC NULLS LAST, full_name ASC) AS rank
    FROM base
  )
  SELECT r.student_id, r.full_name, r.avatar_url, r.total_points, r.rank,
         lv.id, lv.name, lv.icon_url,
         COALESCE((SELECT COUNT(*)::int FROM public.student_badges WHERE student_id = r.student_id), 0),
         r.leaderboard_visible
  FROM ranked r
  LEFT JOIN LATERAL (
    SELECT * FROM public.levels WHERE min_points <= r.total_points ORDER BY min_points DESC LIMIT 1
  ) lv ON true
  ORDER BY r.rank
  LIMIT COALESCE(p_limit, 20) OFFSET COALESCE(p_offset, 0);
$$;
GRANT EXECUTE ON FUNCTION public.leaderboard_top_full(integer, integer) TO authenticated;
