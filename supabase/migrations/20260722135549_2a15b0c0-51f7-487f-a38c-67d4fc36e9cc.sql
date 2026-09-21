
-- =========================================================
-- PHASE 50: Leaderboard Foundation
-- =========================================================

-- 1) points_config
CREATE TABLE public.points_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL UNIQUE,
  points_value integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);
GRANT SELECT ON public.points_config TO anon, authenticated;
GRANT ALL ON public.points_config TO service_role;
ALTER TABLE public.points_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "points_config read all" ON public.points_config FOR SELECT USING (true);
CREATE POLICY "points_config admin write" ON public.points_config FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_points_config_updated_at BEFORE UPDATE ON public.points_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.points_config (event_key, points_value) VALUES
  ('lesson_completed', 0),
  ('quiz_completed', 0),
  ('quiz_passed', 0),
  ('quiz_failed', 0),
  ('assignment_passed', 0),
  ('assignment_failed', 0),
  ('course_completed', 0)
ON CONFLICT (event_key) DO NOTHING;

-- 2) points_purchase_thresholds
CREATE TABLE public.points_purchase_thresholds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('courses', 'bundles')),
  threshold_count integer NOT NULL CHECK (threshold_count > 0),
  points_value integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  UNIQUE (kind, threshold_count)
);
GRANT SELECT ON public.points_purchase_thresholds TO anon, authenticated;
GRANT ALL ON public.points_purchase_thresholds TO service_role;
ALTER TABLE public.points_purchase_thresholds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ppt read all" ON public.points_purchase_thresholds FOR SELECT USING (true);
CREATE POLICY "ppt admin write" ON public.points_purchase_thresholds FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_ppt_updated_at BEFORE UPDATE ON public.points_purchase_thresholds
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) points_ledger (append-only)
CREATE TABLE public.points_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_key text NOT NULL,
  points_delta integer NOT NULL,
  source_kind text,
  source_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.points_ledger TO authenticated;
GRANT ALL ON public.points_ledger TO service_role;
CREATE INDEX idx_points_ledger_student ON public.points_ledger(student_id);
CREATE INDEX idx_points_ledger_student_created ON public.points_ledger(student_id, created_at DESC);
CREATE INDEX idx_points_ledger_source ON public.points_ledger(source_kind, source_id);
CREATE UNIQUE INDEX points_ledger_idempotency
  ON public.points_ledger (student_id, source_kind, source_id, event_key)
  WHERE source_id IS NOT NULL;
ALTER TABLE public.points_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ledger own or admin" ON public.points_ledger FOR SELECT TO authenticated
  USING (student_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));
-- no INSERT/UPDATE/DELETE policies: triggers/RPCs use SECURITY DEFINER

-- 4) levels
CREATE TABLE public.levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  icon_url text,
  min_points integer NOT NULL CHECK (min_points >= 0) UNIQUE,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);
GRANT SELECT ON public.levels TO anon, authenticated;
GRANT ALL ON public.levels TO service_role;
ALTER TABLE public.levels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "levels read all" ON public.levels FOR SELECT USING (true);
CREATE POLICY "levels admin write" ON public.levels FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_levels_updated_at BEFORE UPDATE ON public.levels
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5) admin_audit_log (if not exists)
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  target text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.admin_audit_log TO authenticated;
GRANT ALL ON public.admin_audit_log TO service_role;
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "audit admin read" ON public.admin_audit_log;
CREATE POLICY "audit admin read" ON public.admin_audit_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- =========================================================
-- Helper: award points into ledger (idempotent)
-- =========================================================
CREATE OR REPLACE FUNCTION public._award_points(
  p_student uuid,
  p_event_key text,
  p_source_kind text,
  p_source_id uuid,
  p_delta_override integer DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role app_role;
  v_delta integer;
BEGIN
  -- only students earn points
  SELECT role INTO v_role FROM public.profiles WHERE id = p_student;
  IF v_role IS DISTINCT FROM 'student'::app_role THEN
    RETURN;
  END IF;

  IF p_delta_override IS NOT NULL THEN
    v_delta := p_delta_override;
  ELSE
    SELECT points_value INTO v_delta FROM public.points_config WHERE event_key = p_event_key;
  END IF;

  IF v_delta IS NULL OR v_delta = 0 THEN
    RETURN; -- do not clutter ledger with zero awards
  END IF;

  INSERT INTO public.points_ledger (student_id, event_key, points_delta, source_kind, source_id)
  VALUES (p_student, p_event_key, v_delta, p_source_kind, p_source_id)
  ON CONFLICT (student_id, source_kind, source_id, event_key) WHERE source_id IS NOT NULL DO NOTHING;
END;
$$;

-- =========================================================
-- Helper: derive stable uuid from text
-- =========================================================
CREATE OR REPLACE FUNCTION public._stable_uuid(p text) RETURNS uuid
LANGUAGE sql IMMUTABLE AS $$
  SELECT (
    substr(md5(p),1,8) || '-' ||
    substr(md5(p),9,4) || '-' ||
    substr(md5(p),13,4) || '-' ||
    substr(md5(p),17,4) || '-' ||
    substr(md5(p),21,12)
  )::uuid;
$$;

-- =========================================================
-- Trigger: lesson_progress -> lesson_completed + maybe course_completed
-- =========================================================
CREATE OR REPLACE FUNCTION public.trg_award_lesson_progress()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_total_lessons integer;
  v_done_lessons integer;
  v_course uuid := NEW.course_id;
BEGIN
  -- lesson_completed
  PERFORM public._award_points(NEW.user_id, 'lesson_completed', 'lesson', NEW.id, NULL);

  -- course_completed: all published lessons of this course done by this user
  SELECT COUNT(*) INTO v_total_lessons
  FROM public.lessons l
  JOIN public.units u ON u.id = l.unit_id
  WHERE u.course_id = v_course;

  IF v_total_lessons > 0 THEN
    SELECT COUNT(DISTINCT lp.lesson_id) INTO v_done_lessons
    FROM public.lesson_progress lp
    JOIN public.lessons l ON l.id = lp.lesson_id
    JOIN public.units u ON u.id = l.unit_id
    WHERE u.course_id = v_course AND lp.user_id = NEW.user_id;

    IF v_done_lessons >= v_total_lessons THEN
      PERFORM public._award_points(
        NEW.user_id, 'course_completed', 'course_completion',
        public._stable_uuid('course:' || v_course::text || ':user:' || NEW.user_id::text),
        NULL
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lesson_progress_points ON public.lesson_progress;
CREATE TRIGGER trg_lesson_progress_points
AFTER INSERT ON public.lesson_progress
FOR EACH ROW EXECUTE FUNCTION public.trg_award_lesson_progress();

-- =========================================================
-- Trigger: quiz_attempts
-- =========================================================
CREATE OR REPLACE FUNCTION public.trg_award_quiz_attempt()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status NOT IN ('submitted','needs_review','graded') THEN
    RETURN NEW;
  END IF;

  -- Fire only when transitioning into a final state
  IF TG_OP = 'UPDATE' AND OLD.status = NEW.status THEN
    -- still allow first pass/fail assignment when passed becomes non-null
    IF OLD.passed IS NOT DISTINCT FROM NEW.passed THEN
      RETURN NEW;
    END IF;
  END IF;

  -- quiz_completed always awarded once
  PERFORM public._award_points(NEW.user_id, 'quiz_completed', 'quiz_attempt', NEW.id, NULL);

  IF NEW.passed IS TRUE THEN
    PERFORM public._award_points(NEW.user_id, 'quiz_passed', 'quiz_attempt', NEW.id, NULL);
  ELSIF NEW.passed IS FALSE THEN
    PERFORM public._award_points(NEW.user_id, 'quiz_failed', 'quiz_attempt', NEW.id, NULL);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_quiz_attempts_points ON public.quiz_attempts;
CREATE TRIGGER trg_quiz_attempts_points
AFTER INSERT OR UPDATE ON public.quiz_attempts
FOR EACH ROW EXECUTE FUNCTION public.trg_award_quiz_attempt();

-- =========================================================
-- Trigger: assignment_submissions
-- =========================================================
CREATE OR REPLACE FUNCTION public.trg_award_assignment_submission()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.outcome IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.outcome IS NOT DISTINCT FROM NEW.outcome THEN
    RETURN NEW;
  END IF;

  IF NEW.outcome = 'passed' THEN
    PERFORM public._award_points(NEW.user_id, 'assignment_passed', 'assignment_submission', NEW.id, NULL);
  ELSIF NEW.outcome = 'failed' THEN
    PERFORM public._award_points(NEW.user_id, 'assignment_failed', 'assignment_submission', NEW.id, NULL);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assignment_submissions_points ON public.assignment_submissions;
CREATE TRIGGER trg_assignment_submissions_points
AFTER INSERT OR UPDATE ON public.assignment_submissions
FOR EACH ROW EXECUTE FUNCTION public.trg_award_assignment_submission();

-- =========================================================
-- Trigger: payment_transactions -> purchase thresholds
-- =========================================================
CREATE OR REPLACE FUNCTION public.trg_award_purchase_thresholds()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_course_count integer;
  v_bundle_count integer;
  r RECORD;
BEGIN
  IF NEW.status <> 'success' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'success' THEN
    RETURN NEW;
  END IF;

  IF NEW.purpose = 'course_purchase' THEN
    SELECT COUNT(DISTINCT course_id) INTO v_course_count
    FROM public.payment_transactions
    WHERE user_id = NEW.user_id AND purpose = 'course_purchase' AND status = 'success' AND course_id IS NOT NULL;

    FOR r IN
      SELECT id, points_value FROM public.points_purchase_thresholds
      WHERE kind = 'courses' AND threshold_count <= v_course_count
    LOOP
      PERFORM public._award_points(NEW.user_id, 'purchased_courses_threshold', 'purchase_threshold_courses', r.id, r.points_value);
    END LOOP;
  ELSIF NEW.purpose = 'bundle_purchase' THEN
    SELECT COUNT(DISTINCT bundle_id) INTO v_bundle_count
    FROM public.payment_transactions
    WHERE user_id = NEW.user_id AND purpose = 'bundle_purchase' AND status = 'success' AND bundle_id IS NOT NULL;

    FOR r IN
      SELECT id, points_value FROM public.points_purchase_thresholds
      WHERE kind = 'bundles' AND threshold_count <= v_bundle_count
    LOOP
      PERFORM public._award_points(NEW.user_id, 'purchased_bundles_threshold', 'purchase_threshold_bundles', r.id, r.points_value);
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payment_txns_points ON public.payment_transactions;
CREATE TRIGGER trg_payment_txns_points
AFTER INSERT OR UPDATE ON public.payment_transactions
FOR EACH ROW EXECUTE FUNCTION public.trg_award_purchase_thresholds();

-- =========================================================
-- Read helpers
-- =========================================================
CREATE OR REPLACE FUNCTION public.student_points_total(p_student uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(SUM(points_delta), 0)::integer
  FROM public.points_ledger WHERE student_id = p_student;
$$;

CREATE OR REPLACE FUNCTION public.student_current_level(p_student uuid)
RETURNS SETOF public.levels LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.levels
  WHERE min_points <= public.student_points_total(p_student)
  ORDER BY min_points DESC LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.student_next_level(p_student uuid)
RETURNS SETOF public.levels LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.levels
  WHERE min_points > public.student_points_total(p_student)
  ORDER BY min_points ASC LIMIT 1;
$$;

-- Leaderboard eligible students view
CREATE OR REPLACE VIEW public.leaderboard_eligible_students AS
SELECT p.id, p.full_name, p.avatar_url, p.student_id,
       COALESCE(SUM(pl.points_delta), 0)::integer AS total_points,
       MIN(pl.created_at) AS first_earn_at
FROM public.profiles p
LEFT JOIN public.points_ledger pl ON pl.student_id = p.id
WHERE p.role = 'student'::app_role AND p.is_banned = false
GROUP BY p.id, p.full_name, p.avatar_url, p.student_id;

GRANT SELECT ON public.leaderboard_eligible_students TO authenticated;

-- =========================================================
-- Admin RPCs
-- =========================================================
CREATE OR REPLACE FUNCTION public.save_points_config(p_updates jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  FOR r IN SELECT * FROM jsonb_to_recordset(p_updates) AS x(event_key text, points_value integer)
  LOOP
    UPDATE public.points_config
    SET points_value = r.points_value, updated_by = auth.uid(), updated_at = now()
    WHERE event_key = r.event_key;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_purchase_thresholds(p_kind text, p_rows jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r RECORD;
  v_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_kind NOT IN ('courses','bundles') THEN
    RAISE EXCEPTION 'bad kind';
  END IF;

  FOR r IN SELECT * FROM jsonb_to_recordset(p_rows)
    AS x(id uuid, threshold_count integer, points_value integer)
  LOOP
    IF r.id IS NULL THEN
      INSERT INTO public.points_purchase_thresholds (kind, threshold_count, points_value, updated_by)
      VALUES (p_kind, r.threshold_count, r.points_value, auth.uid())
      ON CONFLICT (kind, threshold_count) DO UPDATE SET points_value = EXCLUDED.points_value, updated_by = auth.uid(), updated_at = now()
      RETURNING id INTO r.id;
    ELSE
      UPDATE public.points_purchase_thresholds
      SET threshold_count = r.threshold_count, points_value = r.points_value, updated_by = auth.uid(), updated_at = now()
      WHERE id = r.id AND kind = p_kind;
    END IF;
    v_ids := v_ids || r.id;
  END LOOP;

  DELETE FROM public.points_purchase_thresholds
  WHERE kind = p_kind AND NOT (id = ANY(v_ids));
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_leaderboard()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rows integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  WITH d AS (DELETE FROM public.points_ledger RETURNING 1)
  SELECT COUNT(*) INTO v_rows FROM d;
  INSERT INTO public.admin_audit_log (actor_id, action, target, detail)
  VALUES (auth.uid(), 'leaderboard_full_reset', 'platform', jsonb_build_object('rows_deleted', v_rows));
  RETURN v_rows;
END;
$$;

CREATE OR REPLACE FUNCTION public.award_admin_adjustment(p_student uuid, p_delta integer, p_notes text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  INSERT INTO public.points_ledger (student_id, event_key, points_delta, source_kind, source_id, notes)
  VALUES (p_student, 'admin_adjustment', p_delta, 'admin_adjustment', NULL, p_notes)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Leaderboard listing RPC (paginated)
CREATE OR REPLACE FUNCTION public.leaderboard_top(p_limit integer, p_offset integer)
RETURNS TABLE(
  student_id uuid,
  full_name text,
  avatar_url text,
  total_points integer,
  first_earn_at timestamptz,
  rank bigint
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH base AS (
    SELECT id AS student_id, full_name, avatar_url,
           GREATEST(total_points, 0) AS total_points,
           first_earn_at
    FROM public.leaderboard_eligible_students
  ),
  ranked AS (
    SELECT *, ROW_NUMBER() OVER (ORDER BY total_points DESC, first_earn_at ASC NULLS LAST, full_name ASC) AS rank
    FROM base
  )
  SELECT student_id, full_name, avatar_url, total_points, first_earn_at, rank
  FROM ranked
  ORDER BY rank
  LIMIT COALESCE(p_limit, 20) OFFSET COALESCE(p_offset, 0);
$$;

CREATE OR REPLACE FUNCTION public.leaderboard_eligible_count()
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COUNT(*)::integer FROM public.leaderboard_eligible_students;
$$;

GRANT EXECUTE ON FUNCTION public.student_points_total(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.student_current_level(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.student_next_level(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_points_config(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_purchase_thresholds(text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_leaderboard() TO authenticated;
GRANT EXECUTE ON FUNCTION public.award_admin_adjustment(uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leaderboard_top(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leaderboard_eligible_count() TO authenticated;
