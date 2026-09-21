
ALTER TABLE public.qr_display_settings
  ADD COLUMN IF NOT EXISTS show_enrolled_courses_list boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_quiz_attempts_list boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.get_student_qr_snapshot(_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  p RECORD;
  st_name text;
  cfg RECORD;
  result jsonb;
  enrolled_count int;
  qs jsonb;
  qas jsonb;
  courses_list jsonb;
  attempts_list jsonb;
BEGIN
  SELECT * INTO cfg FROM public.qr_display_settings WHERE id = 1;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT * INTO p FROM public.profiles WHERE qr_token = _token AND role = 'student';
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT name INTO st_name FROM public.stages WHERE id = p.stage_id;

  result := jsonb_build_object('found', true);

  IF cfg.show_full_name THEN result := result || jsonb_build_object('full_name', p.full_name); END IF;
  IF cfg.show_avatar THEN result := result || jsonb_build_object('avatar_url', p.avatar_url); END IF;
  IF cfg.show_student_id THEN result := result || jsonb_build_object('student_id', p.student_id); END IF;
  IF cfg.show_stage THEN result := result || jsonb_build_object('stage_name', st_name); END IF;
  IF cfg.show_phone THEN result := result || jsonb_build_object('phone_number', p.phone_number); END IF;

  IF cfg.show_enrolled_courses_count THEN
    SELECT COUNT(*) INTO enrolled_count FROM public.enrollments WHERE user_id = p.id;
    result := result || jsonb_build_object('enrolled_courses_count', enrolled_count);
  END IF;

  IF cfg.show_enrolled_courses_list THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'course_id', c.id,
      'course_title', c.title,
      'stage_name', st.name,
      'subject_name', subj.name,
      'enrolled_at', e.enrolled_at
    ) ORDER BY e.enrolled_at DESC), '[]'::jsonb)
    INTO courses_list
    FROM public.enrollments e
    JOIN public.courses c ON c.id = e.course_id
    LEFT JOIN public.stages st ON st.id = c.stage_id
    LEFT JOIN public.subjects subj ON subj.id = c.subject_id
    WHERE e.user_id = p.id;
    result := result || jsonb_build_object('enrolled_courses', courses_list);
  END IF;

  IF cfg.show_quiz_stats THEN
    WITH atts AS (
      SELECT quiz_id, status, passed FROM public.quiz_attempts
      WHERE user_id = p.id AND status <> 'in_progress'
    )
    SELECT jsonb_build_object(
      'total_attempts', (SELECT COUNT(*) FROM atts),
      'unique_quizzes', (SELECT COUNT(DISTINCT quiz_id) FROM atts),
      'passed', (SELECT COUNT(*) FROM atts WHERE status='graded' AND passed IS TRUE),
      'failed', (SELECT COUNT(*) FROM atts WHERE status='graded' AND passed IS FALSE),
      'graded_total', (SELECT COUNT(*) FROM atts WHERE status='graded')
    ) INTO qs;
    result := result || jsonb_build_object('quiz_stats', qs);
  END IF;

  IF cfg.show_quiz_attempts_list THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'attempt_id', qa.id,
      'quiz_title', q.title,
      'course_title', c.title,
      'subject_name', subj.name,
      'stage_name', st.name,
      'attempt_number', qa.attempt_number,
      'status', qa.status,
      'percentage', qa.percentage,
      'passed', qa.passed,
      'submitted_at', qa.submitted_at
    ) ORDER BY qa.submitted_at DESC NULLS LAST), '[]'::jsonb)
    INTO attempts_list
    FROM public.quiz_attempts qa
    JOIN public.quizzes q ON q.id = qa.quiz_id
    JOIN public.courses c ON c.id = q.course_id
    LEFT JOIN public.stages st ON st.id = c.stage_id
    LEFT JOIN public.subjects subj ON subj.id = c.subject_id
    WHERE qa.user_id = p.id AND qa.status <> 'in_progress';
    result := result || jsonb_build_object('quiz_attempts', attempts_list);
  END IF;

  IF cfg.show_weak_subjects OR cfg.show_weak_courses THEN
    SELECT jsonb_build_object(
      'quizzes', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', q.id,
          'course_id', c.id,
          'subject_id', subj.id,
          'subject_name', subj.name,
          'course_title', c.title,
          'attempt_result_policy', q.attempt_result_policy
        ))
        FROM public.quizzes q
        JOIN public.courses c ON c.id = q.course_id
        LEFT JOIN public.subjects subj ON subj.id = c.subject_id
        WHERE q.id IN (
          SELECT DISTINCT quiz_id FROM public.quiz_attempts
          WHERE user_id = p.id AND status = 'graded'
        )
      ), '[]'::jsonb),
      'attempts', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'quiz_id', qa.quiz_id,
          'passed', qa.passed,
          'percentage', qa.percentage,
          'attempt_number', qa.attempt_number,
          'status', qa.status
        ))
        FROM public.quiz_attempts qa
        WHERE qa.user_id = p.id AND qa.status = 'graded'
      ), '[]'::jsonb)
    ) INTO qas;
    result := result || jsonb_build_object(
      'weak_data', qas,
      'weak_flags', jsonb_build_object(
        'subjects', cfg.show_weak_subjects,
        'courses', cfg.show_weak_courses
      )
    );
  END IF;

  RETURN result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_student_qr_snapshot(uuid) TO anon, authenticated;
