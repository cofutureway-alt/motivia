
ALTER VIEW public.leaderboard_eligible_students SET (security_invoker = on);

REVOKE EXECUTE ON FUNCTION public.student_points_total(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.student_current_level(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.student_next_level(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.save_points_config(jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.save_purchase_thresholds(text, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reset_leaderboard() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.award_admin_adjustment(uuid, integer, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.leaderboard_top(integer, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.leaderboard_eligible_count() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public._award_points(uuid, text, text, uuid, integer) FROM PUBLIC, anon;
