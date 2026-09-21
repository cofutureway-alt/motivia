
-- ============= PHASE 20: Profile phone fields =============
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone_number text,
  ADD COLUMN IF NOT EXISTS guardian_phone text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS auth_email text;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_number_unique
  ON public.profiles (phone_number) WHERE phone_number IS NOT NULL;

-- Trigger to sync auth.users -> profiles on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role, phone_number, guardian_phone, email, auth_email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    'student',
    NULLIF(NEW.raw_user_meta_data->>'phone_number', ''),
    NULLIF(NEW.raw_user_meta_data->>'guardian_phone', ''),
    NULLIF(NEW.raw_user_meta_data->>'real_email', ''),
    NEW.email
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Resolve login identifier (phone or email) -> auth email
CREATE OR REPLACE FUNCTION public.resolve_login_email(_identifier text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id text := trim(COALESCE(_identifier, ''));
  v_email text;
BEGIN
  IF v_id ~ '^201[0125][0-9]{8}$' THEN
    SELECT auth_email INTO v_email FROM public.profiles
      WHERE phone_number = v_id LIMIT 1;
    RETURN COALESCE(v_email, v_id || '@internal.noemail.local');
  END IF;
  RETURN lower(v_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.resolve_login_email(text) TO anon, authenticated;

-- ============= PHASE 19: Analytics RPCs =============
CREATE OR REPLACE FUNCTION public.get_most_failed_quizzes(_limit int DEFAULT 10)
RETURNS TABLE (
  quiz_id uuid,
  quiz_title text,
  course_id uuid,
  course_title text,
  stage_id uuid,
  stage_name text,
  subject_id uuid,
  subject_name text,
  failed_count bigint,
  total_official bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH ranked AS (
    SELECT qa.*, q.attempt_result_policy AS policy,
      ROW_NUMBER() OVER (
        PARTITION BY qa.quiz_id, qa.user_id
        ORDER BY
          CASE WHEN q.attempt_result_policy = 'first' THEN qa.attempt_number END ASC NULLS LAST,
          CASE WHEN q.attempt_result_policy = 'last'  THEN qa.attempt_number END DESC NULLS LAST,
          CASE WHEN q.attempt_result_policy NOT IN ('first','last') THEN qa.percentage END DESC NULLS LAST,
          CASE WHEN q.attempt_result_policy NOT IN ('first','last') THEN qa.attempt_number END ASC
      ) AS rn
    FROM public.quiz_attempts qa
    JOIN public.quizzes q ON q.id = qa.quiz_id
    WHERE qa.status = 'graded'
  ),
  official AS (SELECT * FROM ranked WHERE rn = 1),
  agg AS (
    SELECT o.quiz_id,
      COUNT(*) FILTER (WHERE o.passed IS FALSE) AS failed_count,
      COUNT(*) AS total_official
    FROM official o
    GROUP BY o.quiz_id
    HAVING COUNT(*) FILTER (WHERE o.passed IS FALSE) > 0
  )
  SELECT
    q.id, q.title,
    c.id, c.title,
    st.id, st.name,
    s.id, s.name,
    a.failed_count, a.total_official
  FROM agg a
  JOIN public.quizzes q ON q.id = a.quiz_id
  JOIN public.courses c ON c.id = q.course_id
  LEFT JOIN public.stages st ON st.id = c.stage_id
  LEFT JOIN public.subjects s ON s.id = c.subject_id
  ORDER BY a.failed_count DESC, a.total_official DESC
  LIMIT GREATEST(COALESCE(_limit, 10), 1);
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_most_failed_quizzes(int) TO authenticated;

-- Per-question analysis for a given quiz + form (based on OFFICIAL attempts only)
CREATE OR REPLACE FUNCTION public.get_question_analysis(_quiz_id uuid, _form int)
RETURNS TABLE (
  question_id uuid,
  content text,
  type text,
  points numeric,
  order_index int,
  correct_count bigint,
  incorrect_count bigint,
  unanswered_count bigint,
  total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH ranked AS (
    SELECT qa.*,
      ROW_NUMBER() OVER (
        PARTITION BY qa.user_id
        ORDER BY
          CASE WHEN q.attempt_result_policy = 'first' THEN qa.attempt_number END ASC NULLS LAST,
          CASE WHEN q.attempt_result_policy = 'last'  THEN qa.attempt_number END DESC NULLS LAST,
          CASE WHEN q.attempt_result_policy NOT IN ('first','last') THEN qa.percentage END DESC NULLS LAST,
          CASE WHEN q.attempt_result_policy NOT IN ('first','last') THEN qa.attempt_number END ASC
      ) AS rn
    FROM public.quiz_attempts qa
    JOIN public.quizzes q ON q.id = qa.quiz_id
    WHERE qa.quiz_id = _quiz_id AND qa.status = 'graded'
  ),
  official AS (SELECT * FROM ranked WHERE rn = 1 AND form_number = _form)
  SELECT
    qq.id,
    qq.content,
    qq.type::text,
    qq.points::numeric,
    qq.order_index,
    COUNT(*) FILTER (WHERE ans.is_correct IS TRUE) AS correct_count,
    COUNT(*) FILTER (WHERE ans.is_correct IS FALSE) AS incorrect_count,
    COUNT(*) FILTER (WHERE ans.is_correct IS NULL) AS unanswered_count,
    COUNT(ans.id) AS total_count
  FROM public.quiz_questions qq
  LEFT JOIN public.quiz_answers ans
    ON ans.question_id = qq.id
   AND ans.attempt_id IN (SELECT id FROM official)
  WHERE qq.quiz_id = _quiz_id AND qq.form_number = _form
  GROUP BY qq.id, qq.content, qq.type, qq.points, qq.order_index
  ORDER BY qq.order_index;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_question_analysis(uuid, int) TO authenticated;

-- ============= list_quiz_attempts: add _quiz_id filter =============
CREATE OR REPLACE FUNCTION public.list_quiz_attempts(
  _user_search text DEFAULT NULL,
  _course_id uuid DEFAULT NULL,
  _stage_id uuid DEFAULT NULL,
  _subject_id uuid DEFAULT NULL,
  _needs_review_only boolean DEFAULT false,
  _quiz_id uuid DEFAULT NULL,
  _limit int DEFAULT 100,
  _offset int DEFAULT 0
)
RETURNS TABLE(
  attempt_id uuid, quiz_id uuid, user_id uuid, student_name text, student_email text,
  course_id uuid, course_title text, subject_id uuid, subject_name text,
  stage_id uuid, stage_name text, quiz_title text, form_number int, attempt_number int,
  status text, percentage numeric, passed boolean, earned_points numeric, total_points numeric,
  pass_percentage int, submitted_at timestamptz, has_feedback boolean,
  feedback_given_at timestamptz, total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_is_admin boolean := public.has_role(v_user, 'admin');
  v_search text := NULLIF(trim(COALESCE(_user_search, '')), '');
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth required' USING ERRCODE='42501'; END IF;
  RETURN QUERY
  WITH base AS (
    SELECT
      qa.id AS attempt_id, qa.quiz_id, qa.user_id,
      COALESCE(p.full_name, '') AS student_name,
      u.email::text AS student_email,
      c.id AS course_id, c.title AS course_title,
      s.id AS subject_id, s.name AS subject_name,
      st.id AS stage_id, st.name AS stage_name,
      q.title AS quiz_title, qa.form_number, qa.attempt_number, qa.status,
      qa.percentage, qa.passed, qa.earned_points, qa.total_points,
      q.pass_percentage, qa.submitted_at,
      (qa.feedback_given_at IS NOT NULL) AS has_feedback,
      qa.feedback_given_at
    FROM public.quiz_attempts qa
    JOIN public.quizzes q ON q.id = qa.quiz_id
    JOIN public.courses c ON c.id = q.course_id
    LEFT JOIN public.subjects s ON s.id = c.subject_id
    LEFT JOIN public.stages   st ON st.id = c.stage_id
    LEFT JOIN public.profiles p ON p.id = qa.user_id
    LEFT JOIN auth.users u ON u.id = qa.user_id
    WHERE qa.status <> 'in_progress'
      AND (v_is_admin OR qa.user_id = v_user)
      AND (_course_id IS NULL OR c.id = _course_id)
      AND (_quiz_id IS NULL OR q.id = _quiz_id)
      AND (NOT v_is_admin OR _stage_id IS NULL OR c.stage_id = _stage_id)
      AND (NOT v_is_admin OR _subject_id IS NULL OR c.subject_id = _subject_id)
      AND (NOT v_is_admin OR NOT _needs_review_only OR qa.status = 'needs_review')
      AND (
        NOT v_is_admin OR v_search IS NULL
        OR p.full_name ILIKE '%' || v_search || '%'
        OR u.email ILIKE '%' || v_search || '%'
      )
  ),
  counted AS (SELECT b.*, COUNT(*) OVER () AS total_count FROM base b)
  SELECT * FROM counted
  ORDER BY submitted_at DESC NULLS LAST, attempt_id DESC
  LIMIT GREATEST(COALESCE(_limit, 100), 1)
  OFFSET GREATEST(COALESCE(_offset, 0), 0);
END;
$$;
