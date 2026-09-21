
-- ============ PHASE 24: QR SYSTEM ============

-- 1) Add qr_token to profiles (unique, unguessable UUID)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS qr_token uuid NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS profiles_qr_token_key ON public.profiles(qr_token);

-- Backfill: any existing rows already got a default from the DEFAULT clause on ALTER.
-- Ensure a trigger keeps future student rows guaranteed to have one (default handles it, but be safe):
UPDATE public.profiles SET qr_token = gen_random_uuid() WHERE qr_token IS NULL;

-- 2) qr_display_settings singleton
CREATE TABLE IF NOT EXISTS public.qr_display_settings (
  id integer PRIMARY KEY CHECK (id = 1),
  show_full_name boolean NOT NULL DEFAULT true,
  show_avatar boolean NOT NULL DEFAULT true,
  show_student_id boolean NOT NULL DEFAULT true,
  show_stage boolean NOT NULL DEFAULT true,
  show_phone boolean NOT NULL DEFAULT false,
  show_enrolled_courses_count boolean NOT NULL DEFAULT true,
  show_quiz_stats boolean NOT NULL DEFAULT true,
  show_weak_subjects boolean NOT NULL DEFAULT true,
  show_weak_courses boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.qr_display_settings TO anon, authenticated;
GRANT INSERT, UPDATE ON public.qr_display_settings TO authenticated;
GRANT ALL ON public.qr_display_settings TO service_role;

ALTER TABLE public.qr_display_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "qr_settings_public_read" ON public.qr_display_settings;
CREATE POLICY "qr_settings_public_read" ON public.qr_display_settings
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "qr_settings_admin_write" ON public.qr_display_settings;
CREATE POLICY "qr_settings_admin_write" ON public.qr_display_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS qr_display_settings_updated_at ON public.qr_display_settings;
CREATE TRIGGER qr_display_settings_updated_at
  BEFORE UPDATE ON public.qr_display_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.qr_display_settings (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- 3) Public snapshot RPC — respects settings server-side
CREATE OR REPLACE FUNCTION public.get_student_qr_snapshot(_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s RECORD;
  p RECORD;
  st_name text;
  cfg RECORD;
  result jsonb;
  enrolled_count int;
  qs jsonb;
  qas jsonb;
BEGIN
  SELECT * INTO cfg FROM public.qr_display_settings WHERE id = 1;
  IF cfg IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO p FROM public.profiles WHERE qr_token = _token AND role = 'student';
  IF p IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT name INTO st_name FROM public.stages WHERE id = p.stage_id;

  result := jsonb_build_object('found', true);

  IF cfg.show_full_name THEN
    result := result || jsonb_build_object('full_name', p.full_name);
  END IF;
  IF cfg.show_avatar THEN
    result := result || jsonb_build_object('avatar_url', p.avatar_url);
  END IF;
  IF cfg.show_student_id THEN
    result := result || jsonb_build_object('student_id', p.student_id);
  END IF;
  IF cfg.show_stage THEN
    result := result || jsonb_build_object('stage_name', st_name);
  END IF;
  IF cfg.show_phone THEN
    result := result || jsonb_build_object('phone_number', p.phone_number);
  END IF;

  IF cfg.show_enrolled_courses_count THEN
    SELECT COUNT(*) INTO enrolled_count FROM public.enrollments WHERE user_id = p.id;
    result := result || jsonb_build_object('enrolled_courses_count', enrolled_count);
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

  IF cfg.show_weak_subjects OR cfg.show_weak_courses THEN
    -- Expose ONLY the minimum needed for client-side weak grouping (which we already
    -- have battle-tested in src/lib/weak-analysis.ts). No PII in the shape.
    SELECT jsonb_build_object(
      'quizzes', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', q.id,
          'course_id', c.id,
          'subject_id', s.id,
          'subject_name', s.name,
          'course_title', c.title,
          'attempt_result_policy', q.attempt_result_policy
        ))
        FROM public.quizzes q
        JOIN public.courses c ON c.id = q.course_id
        LEFT JOIN public.subjects s ON s.id = c.subject_id
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
$$;

GRANT EXECUTE ON FUNCTION public.get_student_qr_snapshot(uuid) TO anon, authenticated, service_role;

-- Regenerate QR (admin only)
CREATE OR REPLACE FUNCTION public.admin_regenerate_qr_token(_uid uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_token uuid := gen_random_uuid();
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  UPDATE public.profiles SET qr_token = new_token WHERE id = _uid RETURNING qr_token INTO new_token;
  RETURN new_token;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_regenerate_qr_token(uuid) TO authenticated, service_role;

-- Extend admin_get_student to expose qr_token
CREATE OR REPLACE FUNCTION public.admin_get_student(_uid uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  SELECT to_jsonb(p) || jsonb_build_object('stage_name', st.name)
    INTO result
  FROM public.profiles p
  LEFT JOIN public.stages st ON st.id = p.stage_id
  WHERE p.id = _uid AND p.role = 'student';
  RETURN result;
END;
$$;


-- ============ PHASE 25: CARD TEMPLATES ============

CREATE TABLE IF NOT EXISTS public.card_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  front_design jsonb NOT NULL DEFAULT '{}'::jsonb,
  back_design jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS card_templates_one_default
  ON public.card_templates(is_default) WHERE is_default = true;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.card_templates TO authenticated;
GRANT ALL ON public.card_templates TO service_role;

ALTER TABLE public.card_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "card_templates_admin_all" ON public.card_templates;
CREATE POLICY "card_templates_admin_all" ON public.card_templates
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS card_templates_updated_at ON public.card_templates;
CREATE TRIGGER card_templates_updated_at
  BEFORE UPDATE ON public.card_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed a starter default design
INSERT INTO public.card_templates (name, is_default, front_design, back_design)
SELECT
  'التصميم الافتراضي',
  true,
  jsonb_build_object(
    'version', '5.3.0',
    'background', '#0f172a',
    'objects', jsonb_build_array(
      jsonb_build_object(
        'type', 'rect',
        'left', 40, 'top', 40,
        'width', 260, 'height', 320,
        'fill', '#1e293b',
        'rx', 12, 'ry', 12,
        'stroke', '#334155', 'strokeWidth', 2
      ),
      jsonb_build_object(
        'type', 'textbox',
        'left', 340, 'top', 200,
        'width', 620,
        'text', 'اسم الطالب',
        'fontSize', 56,
        'fontWeight', 'bold',
        'fill', '#f8fafc',
        'textAlign', 'center',
        'fontFamily', 'Tajawal'
      ),
      jsonb_build_object(
        'type', 'textbox',
        'left', 340, 'top', 300,
        'width', 620,
        'text', 'الصف الدراسي',
        'fontSize', 32,
        'fill', '#cbd5e1',
        'textAlign', 'center',
        'fontFamily', 'Tajawal'
      )
    )
  ),
  '{}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.card_templates WHERE is_default = true);
