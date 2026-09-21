
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.leaderboard_public_top10() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_publish_scheduled_courses() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_lessons_public() TO anon, authenticated;
