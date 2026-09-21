
-- 1. Extend assignment_submissions with grading columns
ALTER TABLE public.assignment_submissions
  ADD COLUMN IF NOT EXISTS grade numeric,
  ADD COLUMN IF NOT EXISTS outcome text,
  ADD COLUMN IF NOT EXISTS feedback text,
  ADD COLUMN IF NOT EXISTS feedback_given_at timestamptz,
  ADD COLUMN IF NOT EXISTS graded_at timestamptz,
  ADD COLUMN IF NOT EXISTS graded_by uuid REFERENCES public.profiles(id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'assignment_submissions_outcome_check'
  ) THEN
    ALTER TABLE public.assignment_submissions
      ADD CONSTRAINT assignment_submissions_outcome_check
      CHECK (outcome IS NULL OR outcome IN ('passed','failed','not_submitted'));
  END IF;
END $$;

-- 2. Admin-only UPDATE policy (add separately; keep Phase 30 student policy untouched)
DROP POLICY IF EXISTS "Admins can grade submissions" ON public.assignment_submissions;
CREATE POLICY "Admins can grade submissions"
  ON public.assignment_submissions
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3. Helper: finalize a never-submitted row (called first time admin opens it)
CREATE OR REPLACE FUNCTION public.admin_finalize_not_submitted(_submission_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s RECORD;
  a RECORD;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO s FROM public.assignment_submissions WHERE id = _submission_id FOR UPDATE;
  IF s IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO a FROM public.assignments WHERE id = s.assignment_id;
  IF a IS NULL THEN RETURN NULL; END IF;

  IF s.outcome IS NULL AND s.status = 'draft' AND now() > a.end_at THEN
    UPDATE public.assignment_submissions
       SET outcome = 'not_submitted',
           grade = 0,
           graded_at = now(),
           graded_by = auth.uid()
     WHERE id = _submission_id;
    SELECT * INTO s FROM public.assignment_submissions WHERE id = _submission_id;
  END IF;

  RETURN to_jsonb(s);
END;
$$;

-- 4. Listing RPC used by both admin & student pages
CREATE OR REPLACE FUNCTION public.list_assignment_submissions(
  _user_search text DEFAULT NULL,
  _course_id uuid DEFAULT NULL,
  _stage_id uuid DEFAULT NULL,
  _subject_id uuid DEFAULT NULL,
  _ungraded_only boolean DEFAULT false,
  _limit integer DEFAULT 100,
  _offset integer DEFAULT 0
)
RETURNS TABLE(
  submission_id uuid,
  assignment_id uuid,
  user_id uuid,
  student_name text,
  student_email text,
  student_phone text,
  student_student_id text,
  course_id uuid,
  course_title text,
  subject_id uuid,
  subject_name text,
  stage_id uuid,
  stage_name text,
  assignment_title text,
  total_grade numeric,
  pass_grade numeric,
  end_at timestamptz,
  status text,
  submitted_at timestamptz,
  grade numeric,
  outcome text,
  computed_outcome text,
  has_feedback boolean,
  feedback_given_at timestamptz,
  graded_at timestamptz,
  total_count bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_is_admin boolean := public.has_role(v_user, 'admin');
  v_search text := NULLIF(trim(COALESCE(_user_search,'')), '');
  v_is_digit_id boolean := v_search IS NOT NULL AND v_search ~ '^[0-9]{1,6}$';
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth required' USING ERRCODE='42501'; END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      s.id AS submission_id,
      s.assignment_id,
      s.user_id,
      COALESCE(p.full_name, '') AS student_name,
      u.email::text AS student_email,
      p.phone_number AS student_phone,
      p.student_id  AS student_student_id,
      c.id AS course_id, c.title AS course_title,
      subj.id AS subject_id, subj.name AS subject_name,
      st.id AS stage_id, st.name AS stage_name,
      a.title AS assignment_title,
      a.total_grade, a.pass_grade, a.end_at,
      s.status, s.submitted_at,
      s.grade, s.outcome,
      CASE
        WHEN s.outcome IS NOT NULL THEN s.outcome
        WHEN s.status = 'submitted' THEN NULL
        WHEN s.status = 'draft' AND now() > a.end_at THEN 'not_submitted'
        ELSE NULL
      END AS computed_outcome,
      (s.feedback_given_at IS NOT NULL) AS has_feedback,
      s.feedback_given_at, s.graded_at
    FROM public.assignment_submissions s
    JOIN public.assignments a ON a.id = s.assignment_id
    JOIN public.courses c     ON c.id = a.course_id
    LEFT JOIN public.subjects subj ON subj.id = c.subject_id
    LEFT JOIN public.stages   st   ON st.id   = c.stage_id
    LEFT JOIN public.profiles p    ON p.id    = s.user_id
    LEFT JOIN auth.users u         ON u.id    = s.user_id
    WHERE
      -- Only finalized/closed rows: submitted OR deadline passed
      (s.status = 'submitted' OR now() > a.end_at)
      AND (v_is_admin OR s.user_id = v_user)
      AND (_course_id  IS NULL OR c.id = _course_id)
      AND (NOT v_is_admin OR _stage_id   IS NULL OR c.stage_id   = _stage_id)
      AND (NOT v_is_admin OR _subject_id IS NULL OR c.subject_id = _subject_id)
      AND (NOT v_is_admin OR NOT _ungraded_only OR s.outcome IS NULL)
      AND (
        NOT v_is_admin OR v_search IS NULL
        OR p.full_name    ILIKE '%'||v_search||'%'
        OR u.email        ILIKE '%'||v_search||'%'
        OR p.phone_number ILIKE '%'||v_search||'%'
        OR p.student_id   ILIKE '%'||v_search||'%'
        OR (v_is_digit_id AND p.student_id = lpad(v_search, 6, '0'))
      )
  ),
  counted AS (SELECT b.*, COUNT(*) OVER () AS total_count FROM base b)
  SELECT * FROM counted
  ORDER BY submitted_at DESC NULLS LAST, submission_id DESC
  LIMIT GREATEST(COALESCE(_limit, 100), 1)
  OFFSET GREATEST(COALESCE(_offset, 0), 0);
END;
$$;
