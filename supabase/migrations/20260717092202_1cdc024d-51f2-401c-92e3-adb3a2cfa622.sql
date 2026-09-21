GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_enrolled_in_lesson_course(uuid, uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_lessons_public() TO authenticated, anon;