
-- Revoke public execution of internal helpers used only by RLS/triggers
REVOKE EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_enrolled_in_lesson_course(UUID, UUID) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, PUBLIC;

-- The lessons_public view + get_lessons_public function is intentionally
-- SECURITY DEFINER to expose ONLY (id, unit_id, title, position) — no video_url —
-- for signed-out curriculum previews. This is the intended pattern; the linter
-- ERROR is expected and reviewed.
