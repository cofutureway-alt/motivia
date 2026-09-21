
-- =============== 1. profiles.leaderboard_visible ===============
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS leaderboard_visible boolean NOT NULL DEFAULT true;

-- =============== 2. badges ===============
CREATE TABLE IF NOT EXISTS public.badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  icon_url text NOT NULL,
  points_reward integer CHECK (points_reward IS NULL OR points_reward >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);
GRANT SELECT ON public.badges TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.badges TO authenticated;
GRANT ALL ON public.badges TO service_role;
ALTER TABLE public.badges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "badges read all" ON public.badges;
CREATE POLICY "badges read all" ON public.badges FOR SELECT USING (true);
DROP POLICY IF EXISTS "badges admin write" ON public.badges;
CREATE POLICY "badges admin write" ON public.badges
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_badges_updated_at BEFORE UPDATE ON public.badges
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============== 3. badge_conditions ===============
CREATE TABLE IF NOT EXISTS public.badge_conditions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  badge_id uuid NOT NULL REFERENCES public.badges(id) ON DELETE CASCADE,
  condition_type text NOT NULL CHECK (condition_type IN (
    'points_at_least',
    'level_at_least',
    'has_badge',
    'quizzes_completed_at_least',
    'lessons_completed_at_least',
    'assignments_completed_at_least',
    'quizzes_passed_at_least',
    'assignments_passed_at_least',
    'assignments_failed_at_least',
    'quizzes_failed_at_least'
  )),
  target_int integer,
  target_uuid uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT badge_conditions_target_shape CHECK (
    CASE condition_type
      WHEN 'level_at_least' THEN target_uuid IS NOT NULL AND target_int IS NULL
      WHEN 'has_badge'      THEN target_uuid IS NOT NULL AND target_int IS NULL
      ELSE target_int IS NOT NULL AND target_uuid IS NULL AND target_int >= 0
    END
  )
);
GRANT SELECT ON public.badge_conditions TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.badge_conditions TO authenticated;
GRANT ALL ON public.badge_conditions TO service_role;
ALTER TABLE public.badge_conditions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "badge_conditions read all" ON public.badge_conditions;
CREATE POLICY "badge_conditions read all" ON public.badge_conditions FOR SELECT USING (true);
DROP POLICY IF EXISTS "badge_conditions admin write" ON public.badge_conditions;
CREATE POLICY "badge_conditions admin write" ON public.badge_conditions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Prevent a has_badge condition from referencing its own badge
CREATE OR REPLACE FUNCTION public.badge_conditions_no_self_ref()
RETURNS trigger LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.condition_type = 'has_badge' AND NEW.target_uuid = NEW.badge_id THEN
    RAISE EXCEPTION 'A badge cannot require itself as a prerequisite';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_badge_conditions_no_self_ref ON public.badge_conditions;
CREATE TRIGGER trg_badge_conditions_no_self_ref
  BEFORE INSERT OR UPDATE ON public.badge_conditions
  FOR EACH ROW EXECUTE FUNCTION public.badge_conditions_no_self_ref();

CREATE INDEX IF NOT EXISTS idx_badge_conditions_badge ON public.badge_conditions(badge_id);

-- =============== 4. student_badges ===============
CREATE TABLE IF NOT EXISTS public.student_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  badge_id uuid NOT NULL REFERENCES public.badges(id) ON DELETE CASCADE,
  awarded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, badge_id)
);
GRANT SELECT ON public.student_badges TO anon, authenticated;
GRANT DELETE ON public.student_badges TO authenticated;
GRANT ALL ON public.student_badges TO service_role;
ALTER TABLE public.student_badges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "student_badges read all" ON public.student_badges;
CREATE POLICY "student_badges read all" ON public.student_badges FOR SELECT USING (true);
DROP POLICY IF EXISTS "student_badges admin delete" ON public.student_badges;
CREATE POLICY "student_badges admin delete" ON public.student_badges
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_student_badges_student ON public.student_badges(student_id);
CREATE INDEX IF NOT EXISTS idx_student_badges_badge ON public.student_badges(badge_id);

-- =============== 5. student_condition_progress ===============
CREATE OR REPLACE FUNCTION public.student_condition_progress(
  p_student uuid,
  p_condition_type text,
  p_target_int integer,
  p_target_uuid uuid
) RETURNS TABLE(current_value integer, target_value integer, satisfied boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_current integer := 0;
  v_target integer := COALESCE(p_target_int, 0);
BEGIN
  IF p_condition_type = 'points_at_least' THEN
    v_current := public.student_points_total(p_student);
    v_target := COALESCE(p_target_int, 0);

  ELSIF p_condition_type = 'level_at_least' THEN
    v_current := public.student_points_total(p_student);
    SELECT COALESCE(min_points, 0) INTO v_target FROM public.levels WHERE id = p_target_uuid;
    v_target := COALESCE(v_target, 0);

  ELSIF p_condition_type = 'has_badge' THEN
    v_current := CASE WHEN EXISTS(
      SELECT 1 FROM public.student_badges WHERE student_id = p_student AND badge_id = p_target_uuid
    ) THEN 1 ELSE 0 END;
    v_target := 1;

  ELSIF p_condition_type = 'quizzes_completed_at_least' THEN
    SELECT COUNT(DISTINCT source_id)::int INTO v_current FROM public.points_ledger
    WHERE student_id = p_student AND source_kind = 'quiz_attempt' AND event_key = 'quiz_completed';

  ELSIF p_condition_type = 'lessons_completed_at_least' THEN
    SELECT COUNT(DISTINCT source_id)::int INTO v_current FROM public.points_ledger
    WHERE student_id = p_student AND source_kind = 'lesson_progress' AND event_key = 'lesson_completed';

  ELSIF p_condition_type = 'assignments_completed_at_least' THEN
    SELECT COUNT(*)::int INTO v_current FROM public.assignment_submissions
    WHERE user_id = p_student AND status = 'submitted';

  ELSIF p_condition_type = 'quizzes_passed_at_least' THEN
    SELECT COUNT(DISTINCT source_id)::int INTO v_current FROM public.points_ledger
    WHERE student_id = p_student AND source_kind = 'quiz_attempt' AND event_key = 'quiz_passed';

  ELSIF p_condition_type = 'quizzes_failed_at_least' THEN
    SELECT COUNT(DISTINCT source_id)::int INTO v_current FROM public.points_ledger
    WHERE student_id = p_student AND source_kind = 'quiz_attempt' AND event_key = 'quiz_failed';

  ELSIF p_condition_type = 'assignments_passed_at_least' THEN
    SELECT COUNT(DISTINCT source_id)::int INTO v_current FROM public.points_ledger
    WHERE student_id = p_student AND source_kind = 'assignment_submission' AND event_key = 'assignment_passed';

  ELSIF p_condition_type = 'assignments_failed_at_least' THEN
    SELECT COUNT(DISTINCT source_id)::int INTO v_current FROM public.points_ledger
    WHERE student_id = p_student AND source_kind = 'assignment_submission' AND event_key = 'assignment_failed';
  END IF;

  RETURN QUERY SELECT COALESCE(v_current, 0), COALESCE(v_target, 0), COALESCE(v_current, 0) >= COALESCE(v_target, 0);
END;
$$;
GRANT EXECUTE ON FUNCTION public.student_condition_progress(uuid, text, integer, uuid) TO anon, authenticated;

-- =============== 6. evaluate_badges_for_student ===============
CREATE OR REPLACE FUNCTION public.evaluate_badges_for_student(p_student uuid)
RETURNS SETOF uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role app_role;
  v_badge record;
  v_cond record;
  v_all_ok boolean;
  v_prog record;
  v_inserted boolean;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = p_student;
  IF v_role IS DISTINCT FROM 'student' THEN
    RETURN;
  END IF;

  FOR v_badge IN
    SELECT b.id, b.points_reward
    FROM public.badges b
    WHERE b.is_active = true
      AND NOT EXISTS (
        SELECT 1 FROM public.student_badges sb
        WHERE sb.student_id = p_student AND sb.badge_id = b.id
      )
  LOOP
    v_all_ok := true;

    -- must have at least one condition
    IF NOT EXISTS (SELECT 1 FROM public.badge_conditions WHERE badge_id = v_badge.id) THEN
      v_all_ok := false;
    END IF;

    FOR v_cond IN
      SELECT condition_type, target_int, target_uuid
      FROM public.badge_conditions WHERE badge_id = v_badge.id
    LOOP
      SELECT * INTO v_prog FROM public.student_condition_progress(
        p_student, v_cond.condition_type, v_cond.target_int, v_cond.target_uuid
      );
      IF NOT v_prog.satisfied THEN
        v_all_ok := false;
        EXIT;
      END IF;
    END LOOP;

    IF v_all_ok THEN
      v_inserted := false;
      WITH ins AS (
        INSERT INTO public.student_badges (student_id, badge_id)
        VALUES (p_student, v_badge.id)
        ON CONFLICT (student_id, badge_id) DO NOTHING
        RETURNING id
      ) SELECT EXISTS(SELECT 1 FROM ins) INTO v_inserted;

      IF v_inserted THEN
        IF v_badge.points_reward IS NOT NULL AND v_badge.points_reward > 0 THEN
          INSERT INTO public.points_ledger (student_id, event_key, points_delta, source_kind, source_id, notes)
          VALUES (p_student, 'badge_award', v_badge.points_reward, 'badge_award', v_badge.id, 'Badge reward')
          ON CONFLICT DO NOTHING;
        END IF;
        RETURN NEXT v_badge.id;
      END IF;
    END IF;
  END LOOP;
END;
$$;
GRANT EXECUTE ON FUNCTION public.evaluate_badges_for_student(uuid) TO authenticated, service_role;

-- =============== 7. Trigger on points_ledger ===============
CREATE OR REPLACE FUNCTION public.trg_evaluate_badges_on_ledger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Skip badge_award rows to avoid recursion when a badge reward inserts a ledger row
  IF NEW.event_key <> 'badge_award' THEN
    PERFORM public.evaluate_badges_for_student(NEW.student_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ledger_evaluate_badges ON public.points_ledger;
CREATE TRIGGER trg_ledger_evaluate_badges
  AFTER INSERT ON public.points_ledger
  FOR EACH ROW EXECUTE FUNCTION public.trg_evaluate_badges_on_ledger();

-- =============== 8. Evaluate a new badge across all eligible students ===============
CREATE OR REPLACE FUNCTION public.evaluate_badge_for_all_students(p_badge_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_student uuid;
  v_count integer := 0;
  v_result uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  FOR v_student IN
    SELECT id FROM public.profiles WHERE role = 'student' AND is_banned = false
  LOOP
    FOR v_result IN SELECT * FROM public.evaluate_badges_for_student(v_student)
    LOOP
      IF v_result = p_badge_id THEN v_count := v_count + 1; END IF;
    END LOOP;
  END LOOP;
  RETURN v_count;
END;
$$;
GRANT EXECUTE ON FUNCTION public.evaluate_badge_for_all_students(uuid) TO authenticated;

-- =============== 9. Public leaderboard (opt-in, top 10 with level+badges) ===============
CREATE OR REPLACE FUNCTION public.leaderboard_public_top10()
RETURNS TABLE(
  student_id uuid,
  full_name text,
  avatar_url text,
  total_points integer,
  rank bigint,
  level_id uuid,
  level_name text,
  level_icon_url text,
  badge_count integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH base AS (
    SELECT p.id AS student_id, p.full_name, p.avatar_url,
           GREATEST(COALESCE((SELECT SUM(points_delta) FROM public.points_ledger WHERE student_id = p.id), 0), 0)::int AS total_points,
           (SELECT MIN(created_at) FROM public.points_ledger WHERE student_id = p.id) AS first_earn_at
    FROM public.profiles p
    WHERE p.role = 'student'
      AND p.is_banned = false
      AND p.leaderboard_visible = true
  ),
  ranked AS (
    SELECT *, ROW_NUMBER() OVER (ORDER BY total_points DESC, first_earn_at ASC NULLS LAST, full_name ASC) AS rank
    FROM base
    WHERE total_points > 0
  )
  SELECT r.student_id, r.full_name, r.avatar_url, r.total_points, r.rank,
         lv.id, lv.name, lv.icon_url,
         COALESCE((SELECT COUNT(*)::int FROM public.student_badges WHERE student_id = r.student_id), 0)
  FROM ranked r
  LEFT JOIN LATERAL (
    SELECT * FROM public.levels WHERE min_points <= r.total_points ORDER BY min_points DESC LIMIT 1
  ) lv ON true
  ORDER BY r.rank
  LIMIT 10;
$$;
GRANT EXECUTE ON FUNCTION public.leaderboard_public_top10() TO anon, authenticated;

-- =============== 10. leaderboard_rank_for_student ===============
CREATE OR REPLACE FUNCTION public.leaderboard_rank_for_student(p_student uuid)
RETURNS TABLE(rank bigint, total_students bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH base AS (
    SELECT id AS student_id,
           GREATEST(COALESCE((SELECT SUM(points_delta) FROM public.points_ledger WHERE student_id = p.id), 0), 0)::int AS total_points,
           (SELECT MIN(created_at) FROM public.points_ledger WHERE student_id = p.id) AS first_earn_at,
           full_name
    FROM public.profiles p
    WHERE p.role = 'student' AND p.is_banned = false
  ),
  ranked AS (
    SELECT student_id, ROW_NUMBER() OVER (ORDER BY total_points DESC, first_earn_at ASC NULLS LAST, full_name ASC) AS rk
    FROM base
  )
  SELECT (SELECT rk FROM ranked WHERE student_id = p_student),
         (SELECT COUNT(*) FROM base);
$$;
GRANT EXECUTE ON FUNCTION public.leaderboard_rank_for_student(uuid) TO authenticated;

-- =============== 11. student_earned_badges ===============
CREATE OR REPLACE FUNCTION public.student_earned_badges(p_student uuid)
RETURNS TABLE(badge_id uuid, name text, description text, icon_url text, awarded_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT b.id, b.name, b.description, b.icon_url, sb.awarded_at
  FROM public.student_badges sb
  JOIN public.badges b ON b.id = sb.badge_id
  WHERE sb.student_id = p_student
  ORDER BY sb.awarded_at DESC;
$$;
GRANT EXECUTE ON FUNCTION public.student_earned_badges(uuid) TO anon, authenticated;
