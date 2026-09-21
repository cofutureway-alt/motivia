-- ============================================================================
-- Phase 71n: Instructor notifications + enriched public profile
-- ============================================================================

-- 1) Notify instructor when a student enrolls in one of his courses
CREATE OR REPLACE FUNCTION public.handle_instructor_new_enrollment()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_course_title text;
  v_student_name text;
BEGIN
  SELECT c.created_by, c.title INTO v_owner, v_course_title
    FROM public.courses c WHERE c.id = NEW.course_id;
  IF v_owner IS NULL THEN RETURN NEW; END IF;
  SELECT p.full_name INTO v_student_name FROM public.profiles p WHERE p.id = NEW.user_id;

  PERFORM public.create_notification(
    v_owner,
    'instructor_new_enrollment',
    'تسجيل جديد في كورسك',
    (COALESCE(v_student_name, 'طالب جديد') || ' سجّل في كورس: ' || v_course_title),
    jsonb_build_object('course_id', NEW.course_id, 'student_id', NEW.user_id),
    '/instructor/courses',
    'course', NEW.course_id
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_instructor_new_enrollment ON public.enrollments;
CREATE TRIGGER trg_instructor_new_enrollment
AFTER INSERT ON public.enrollments
FOR EACH ROW EXECUTE FUNCTION public.handle_instructor_new_enrollment();

-- 2) Notify instructor when an attempt needs review / graded in his courses
CREATE OR REPLACE FUNCTION public.handle_instructor_new_attempt()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_course_title text;
  v_quiz_title text;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;
  IF NEW.status NOT IN ('submitted','needs_review','graded') THEN
    RETURN NEW;
  END IF;

  SELECT c.created_by, c.title, q.title
    INTO v_owner, v_course_title, v_quiz_title
  FROM public.quiz_attempts qa
  JOIN public.quizzes q ON q.id = qa.quiz_id
  JOIN public.courses c ON c.id = q.course_id
  WHERE qa.id = NEW.id;

  IF v_owner IS NULL OR NOT public.is_instructor(v_owner) THEN RETURN NEW; END IF;

  PERFORM public.create_notification(
    v_owner,
    'instructor_new_attempt',
    'محاولة اختبار جديدة',
    ('محاولة في اختبار: ' || v_quiz_title || ' (كورس: ' || v_course_title || ')'),
    jsonb_build_object('attempt_id', NEW.id, 'quiz_id', NEW.quiz_id),
    '/instructor/quiz-attempts',
    'quiz_attempt', NEW.id
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_instructor_new_attempt ON public.quiz_attempts;
CREATE TRIGGER trg_instructor_new_attempt
AFTER INSERT OR UPDATE OF status ON public.quiz_attempts
FOR EACH ROW EXECUTE FUNCTION public.handle_instructor_new_attempt();

-- 3) Enriched public instructor profile (adds subjects, stages, locations)
CREATE OR REPLACE FUNCTION public.get_public_instructor_profile(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_res JSONB;
BEGIN
  SELECT jsonb_build_object(
    'id', p.id,
    'full_name', p.full_name,
    'avatar_url', p.avatar_url,
    'bio', p.bio,
    'social_links', COALESCE(p.social_links, '[]'::jsonb),
    'user_role', p.role::text,
    'is_primary_admin', COALESCE(p.is_primary_admin, false),
    'subjects', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) ORDER BY s.name)
      FROM public.instructor_subjects ist
      JOIN public.subjects s ON s.id = ist.subject_id
      WHERE ist.instructor_id = p.id
    ), '[]'::jsonb),
    'stages', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', st.id, 'name', st.name) ORDER BY st.name)
      FROM public.instructor_stages istg
      JOIN public.stages st ON st.id = istg.stage_id
      WHERE istg.instructor_id = p.id
    ), '[]'::jsonb),
    'locations', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', l.id, 'name', l.name, 'address', l.address,
        'map_url', l.map_url, 'phone', l.phone
      ) ORDER BY l.order_index)
      FROM public.instructor_locations l
      WHERE l.instructor_id = p.id AND l.is_active = true
    ), '[]'::jsonb)
  )
  INTO v_res
  FROM public.profiles p
  WHERE p.id = _user_id;

  RETURN v_res;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_instructor_profile(uuid) TO anon, authenticated;

-- 4) Public listing of all instructors
CREATE OR REPLACE FUNCTION public.list_public_instructors()
RETURNS TABLE (
  instructor_id uuid, full_name text, avatar_url text, bio text,
  subjects jsonb, stages jsonb, courses_count bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    p.id, p.full_name, p.avatar_url, p.bio,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) ORDER BY s.name)
      FROM public.instructor_subjects ist
      JOIN public.subjects s ON s.id = ist.subject_id
      WHERE ist.instructor_id = p.id
    ), '[]'::jsonb),
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', st.id, 'name', st.name) ORDER BY st.name)
      FROM public.instructor_stages istg
      JOIN public.stages st ON st.id = istg.stage_id
      WHERE istg.instructor_id = p.id
    ), '[]'::jsonb),
    (SELECT COUNT(*) FROM public.courses c
      WHERE c.created_by = p.id AND c.status = 'published') AS courses_count
  FROM public.profiles p
  WHERE p.role = 'instructor' AND p.is_banned = false
  ORDER BY courses_count DESC, p.full_name;
$$;

GRANT EXECUTE ON FUNCTION public.list_public_instructors() TO anon, authenticated;
