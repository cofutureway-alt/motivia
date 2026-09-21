-- ============================================================================
-- PHASE 58 — Parent Portal
-- ============================================================================

-- 1) parent_student_links table
CREATE TABLE IF NOT EXISTS public.parent_student_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  student_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','revoked')),
  relationship text,
  request_note text,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  admin_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (parent_user_id, student_user_id)
);

CREATE INDEX IF NOT EXISTS parent_links_parent_idx ON public.parent_student_links(parent_user_id, status);
CREATE INDEX IF NOT EXISTS parent_links_student_idx ON public.parent_student_links(student_user_id, status);
CREATE INDEX IF NOT EXISTS parent_links_status_idx ON public.parent_student_links(status);

GRANT SELECT, INSERT, UPDATE ON public.parent_student_links TO authenticated;
GRANT ALL ON public.parent_student_links TO service_role;

ALTER TABLE public.parent_student_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS parent_links_read ON public.parent_student_links;
CREATE POLICY parent_links_read ON public.parent_student_links FOR SELECT
  TO authenticated
  USING (
    auth.uid() = parent_user_id
    OR auth.uid() = student_user_id
    OR public.has_role(auth.uid(), 'admin')
  );

DROP POLICY IF EXISTS parent_links_insert ON public.parent_student_links;
CREATE POLICY parent_links_insert ON public.parent_student_links FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = parent_user_id
    AND public.has_role(auth.uid(), 'parent')
  );

DROP POLICY IF EXISTS parent_links_admin_update ON public.parent_student_links;
CREATE POLICY parent_links_admin_update ON public.parent_student_links FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS parent_links_touch ON public.parent_student_links;
CREATE TRIGGER parent_links_touch BEFORE UPDATE ON public.parent_student_links
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Extend handle_new_user to allow self-selected 'parent' role at signup and 'admin' role at admin creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  m jsonb := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
  v_role public.app_role := 'student'::public.app_role;
BEGIN
  IF NULLIF(m->>'intended_role','') = 'parent' OR NULLIF(m->>'role','') = 'parent' THEN
    v_role := 'parent'::public.app_role;
  ELSIF NULLIF(m->>'intended_role','') = 'admin' OR NULLIF(m->>'role','') = 'admin' THEN
    v_role := 'admin'::public.app_role;
  END IF;

  INSERT INTO public.profiles (
    id, full_name, role, phone_number, guardian_phone, email, auth_email,
    governorate, registration_type, gender, stage_id, custom_fields
  ) VALUES (
    NEW.id,
    COALESCE(m->>'full_name', m->>'name', ''),
    v_role,
    NULLIF(m->>'phone_number',''),
    NULLIF(m->>'guardian_phone',''),
    NULLIF(m->>'real_email',''),
    NEW.email,
    NULLIF(m->>'governorate',''),
    NULLIF(m->>'registration_type',''),
    NULLIF(m->>'gender',''),
    CASE WHEN NULLIF(m->>'stage_id','') IS NOT NULL THEN (m->>'stage_id')::uuid ELSE NULL END,
    COALESCE(m->'custom_fields', '{}'::jsonb)
  )
  ON CONFLICT (id) DO UPDATE SET
    role = EXCLUDED.role,
    full_name = CASE WHEN EXCLUDED.full_name <> '' THEN EXCLUDED.full_name ELSE public.profiles.full_name END;
  RETURN NEW;
END;
$function$;

-- 3) Helper: internal parent-child link check
CREATE OR REPLACE FUNCTION public.is_active_parent_of(_parent uuid, _student uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.parent_student_links
     WHERE parent_user_id = _parent
       AND student_user_id = _student
       AND status = 'approved'
  );
$$;
REVOKE EXECUTE ON FUNCTION public.is_active_parent_of(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_active_parent_of(uuid, uuid) TO authenticated;

-- 4) Parent-facing: request a link using a student's 6-digit student_id
CREATE OR REPLACE FUNCTION public.parent_request_student_link(
  p_student_code text,
  p_relationship text DEFAULT NULL,
  p_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_parent uuid := auth.uid();
  v_student uuid;
  v_link_id uuid;
  v_existing RECORD;
BEGIN
  IF v_parent IS NULL THEN RAISE EXCEPTION 'يجب تسجيل الدخول' USING ERRCODE='42501'; END IF;
  IF NOT public.has_role(v_parent, 'parent') THEN
    RAISE EXCEPTION 'هذا الإجراء متاح لحسابات أولياء الأمور فقط' USING ERRCODE='42501';
  END IF;

  SELECT id INTO v_student FROM public.profiles
    WHERE student_id = trim(p_student_code) AND role = 'student';
  IF v_student IS NULL THEN
    RAISE EXCEPTION 'لم يتم العثور على طالب بهذا الرقم';
  END IF;

  SELECT * INTO v_existing FROM public.parent_student_links
    WHERE parent_user_id = v_parent AND student_user_id = v_student;

  IF v_existing IS NOT NULL THEN
    IF v_existing.status IN ('pending','approved') THEN
      RETURN jsonb_build_object('success', false, 'reason', v_existing.status, 'link_id', v_existing.id);
    END IF;
    -- was rejected/revoked → re-request
    UPDATE public.parent_student_links
       SET status='pending', request_note=p_note, relationship=p_relationship,
           reviewed_by=NULL, reviewed_at=NULL, admin_note=NULL, updated_at=now()
     WHERE id = v_existing.id
     RETURNING id INTO v_link_id;
  ELSE
    INSERT INTO public.parent_student_links(parent_user_id, student_user_id, relationship, request_note)
    VALUES (v_parent, v_student, p_relationship, p_note)
    RETURNING id INTO v_link_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'link_id', v_link_id);
END; $$;
REVOKE EXECUTE ON FUNCTION public.parent_request_student_link(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.parent_request_student_link(text, text, text) TO authenticated;

-- 5) Parent: list my approved children (basic profile info)
CREATE OR REPLACE FUNCTION public.parent_list_children()
RETURNS TABLE (
  student_user_id uuid,
  full_name text,
  student_id text,
  avatar_url text,
  stage_name text,
  linked_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.id, p.full_name, p.student_id, p.avatar_url, s.name AS stage_name, l.updated_at
    FROM public.parent_student_links l
    JOIN public.profiles p ON p.id = l.student_user_id
    LEFT JOIN public.stages s ON s.id = p.stage_id
   WHERE l.parent_user_id = auth.uid()
     AND l.status = 'approved'
   ORDER BY l.updated_at DESC;
$$;
REVOKE EXECUTE ON FUNCTION public.parent_list_children() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.parent_list_children() TO authenticated;

-- 6) Parent: list my link requests (any status)
CREATE OR REPLACE FUNCTION public.parent_list_my_link_requests()
RETURNS TABLE (
  id uuid, student_user_id uuid, student_name text, student_code text,
  status text, relationship text, request_note text, admin_note text,
  created_at timestamptz, reviewed_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT l.id, l.student_user_id, p.full_name, p.student_id,
         l.status, l.relationship, l.request_note, l.admin_note,
         l.created_at, l.reviewed_at
    FROM public.parent_student_links l
    JOIN public.profiles p ON p.id = l.student_user_id
   WHERE l.parent_user_id = auth.uid()
   ORDER BY l.created_at DESC;
$$;
REVOKE EXECUTE ON FUNCTION public.parent_list_my_link_requests() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.parent_list_my_link_requests() TO authenticated;

-- 7) Admin: list link requests with optional status filter
CREATE OR REPLACE FUNCTION public.admin_list_parent_link_requests(p_status text DEFAULT NULL)
RETURNS TABLE (
  id uuid, status text,
  parent_user_id uuid, parent_name text, parent_phone text,
  student_user_id uuid, student_name text, student_code text,
  relationship text, request_note text, admin_note text,
  reviewed_by uuid, reviewed_at timestamptz,
  created_at timestamptz, updated_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT l.id, l.status,
         l.parent_user_id, pp.full_name, pp.phone_number,
         l.student_user_id, sp.full_name, sp.student_id,
         l.relationship, l.request_note, l.admin_note,
         l.reviewed_by, l.reviewed_at,
         l.created_at, l.updated_at
    FROM public.parent_student_links l
    JOIN public.profiles pp ON pp.id = l.parent_user_id
    JOIN public.profiles sp ON sp.id = l.student_user_id
   WHERE public.has_role(auth.uid(),'admin')
     AND (p_status IS NULL OR l.status = p_status)
   ORDER BY l.created_at DESC;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_list_parent_link_requests(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_parent_link_requests(text) TO authenticated;

-- 8) Admin: approve / reject / revoke a link
CREATE OR REPLACE FUNCTION public.admin_review_parent_link(
  p_link_id uuid,
  p_action text,   -- 'approve' | 'reject' | 'revoke'
  p_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_new_status text;
BEGIN
  IF NOT public.has_role(v_admin,'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  v_new_status := CASE p_action
    WHEN 'approve' THEN 'approved'
    WHEN 'reject'  THEN 'rejected'
    WHEN 'revoke'  THEN 'revoked'
    ELSE NULL END;
  IF v_new_status IS NULL THEN RAISE EXCEPTION 'إجراء غير صحيح'; END IF;

  UPDATE public.parent_student_links
     SET status = v_new_status,
         admin_note = COALESCE(p_note, admin_note),
         reviewed_by = v_admin,
         reviewed_at = now(),
         updated_at = now()
   WHERE id = p_link_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'الطلب غير موجود'; END IF;
  RETURN jsonb_build_object('success', true, 'status', v_new_status);
END; $$;
REVOKE EXECUTE ON FUNCTION public.admin_review_parent_link(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_review_parent_link(uuid, text, text) TO authenticated;

-- 9) Parent: read-only snapshot for an approved child (reuses QR snapshot query shape)
CREATE OR REPLACE FUNCTION public.get_child_snapshot(_student_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_parent uuid := auth.uid();
  p RECORD;
  st_name text;
  result jsonb;
  enrolled_count int;
  qs jsonb;
  a_stats jsonb;
  courses_list jsonb;
  attempts_list jsonb;
BEGIN
  IF v_parent IS NULL THEN RAISE EXCEPTION 'يجب تسجيل الدخول' USING ERRCODE='42501'; END IF;
  IF NOT public.is_active_parent_of(v_parent, _student_id) THEN
    RAISE EXCEPTION 'لا تملك صلاحية عرض بيانات هذا الطالب' USING ERRCODE='42501';
  END IF;

  SELECT * INTO p FROM public.profiles WHERE id = _student_id AND role='student';
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT name INTO st_name FROM public.stages WHERE id = p.stage_id;

  SELECT COUNT(*) INTO enrolled_count FROM public.enrollments WHERE user_id = p.id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'course_id', c.id, 'course_title', c.title,
    'stage_name', st.name, 'subject_name', subj.name,
    'enrolled_at', e.enrolled_at
  ) ORDER BY e.enrolled_at DESC), '[]'::jsonb)
    INTO courses_list
    FROM public.enrollments e
    JOIN public.courses c ON c.id = e.course_id
    LEFT JOIN public.stages st ON st.id = c.stage_id
    LEFT JOIN public.subjects subj ON subj.id = c.subject_id
   WHERE e.user_id = p.id;

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

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'attempt_id', qa.id, 'quiz_title', q.title,
    'course_title', c.title, 'subject_name', subj.name, 'stage_name', st.name,
    'attempt_number', qa.attempt_number, 'status', qa.status,
    'percentage', qa.percentage, 'passed', qa.passed, 'submitted_at', qa.submitted_at
  ) ORDER BY qa.submitted_at DESC NULLS LAST), '[]'::jsonb)
    INTO attempts_list
    FROM public.quiz_attempts qa
    JOIN public.quizzes q ON q.id = qa.quiz_id
    JOIN public.courses c ON c.id = q.course_id
    LEFT JOIN public.stages st ON st.id = c.stage_id
    LEFT JOIN public.subjects subj ON subj.id = c.subject_id
   WHERE qa.user_id = p.id AND qa.status <> 'in_progress';

  WITH enrolled_assignments AS (
    SELECT a.id AS assignment_id FROM public.assignments a
    JOIN public.units u ON u.id = a.unit_id
    JOIN public.enrollments e ON e.course_id = u.course_id AND e.user_id = p.id
  ),
  subs AS (
    SELECT s.assignment_id, s.status, s.outcome FROM public.assignment_submissions s
     WHERE s.user_id = p.id
  )
  SELECT jsonb_build_object(
    'total', (SELECT COUNT(*) FROM enrolled_assignments),
    'completed', (SELECT COUNT(*) FROM subs WHERE outcome IN ('passed','failed')),
    'passed', (SELECT COUNT(*) FROM subs WHERE outcome='passed'),
    'failed', (SELECT COUNT(*) FROM subs WHERE outcome='failed' OR outcome='not_submitted')
  ) INTO a_stats;

  result := jsonb_build_object(
    'found', true,
    'full_name', p.full_name,
    'avatar_url', p.avatar_url,
    'student_id', p.student_id,
    'stage_name', st_name,
    'phone_number', p.phone_number,
    'enrolled_courses_count', enrolled_count,
    'enrolled_courses', courses_list,
    'quiz_attempts', attempts_list,
    'quiz_stats', qs,
    'assignment_stats', a_stats
  );
  RETURN result;
END; $$;
REVOKE EXECUTE ON FUNCTION public.get_child_snapshot(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_child_snapshot(uuid) TO authenticated;

-- 10) Buy-for-child: extend purchase_course with optional recipient student
DROP FUNCTION IF EXISTS public.purchase_course(uuid);
CREATE OR REPLACE FUNCTION public.purchase_course(
  p_course_id uuid,
  p_on_behalf_of uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_recipient uuid;
  v_course RECORD;
  v_price integer;
  v_wallet RECORD;
  v_new_balance integer;
  v_wref text;
  v_pref text;
  v_wtx uuid;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'يجب تسجيل الدخول' USING ERRCODE='42501'; END IF;

  -- Determine who receives enrollment
  IF p_on_behalf_of IS NOT NULL AND p_on_behalf_of <> v_caller THEN
    IF NOT public.is_active_parent_of(v_caller, p_on_behalf_of) THEN
      RAISE EXCEPTION 'لا يمكنك الشراء لهذا الطالب';
    END IF;
    v_recipient := p_on_behalf_of;
  ELSE
    v_recipient := v_caller;
  END IF;

  SELECT * INTO v_course FROM public.courses WHERE id = p_course_id;
  IF v_course IS NULL OR v_course.status <> 'published' THEN
    RAISE EXCEPTION 'الدورة غير متاحة';
  END IF;

  v_price := public._course_effective_price(v_course);

  IF EXISTS (SELECT 1 FROM public.enrollments WHERE user_id = v_recipient AND course_id = p_course_id) THEN
    RETURN jsonb_build_object('success', false, 'failure_reason', 'الطالب مسجّل بالفعل في هذه الدورة');
  END IF;

  -- Wallet always belongs to the payer
  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_caller FOR UPDATE;
  IF v_wallet IS NULL THEN
    INSERT INTO public.wallets(user_id, balance_piastres) VALUES (v_caller, 0)
      RETURNING * INTO v_wallet;
  END IF;
  IF v_wallet.balance_piastres < v_price THEN
    RETURN jsonb_build_object('success', false, 'failure_reason', 'رصيد غير كافٍ');
  END IF;

  v_new_balance := v_wallet.balance_piastres - v_price;
  UPDATE public.wallets SET balance_piastres = v_new_balance, updated_at = now()
   WHERE id = v_wallet.id;

  v_wref := public._gen_txn_reference();
  INSERT INTO public.wallet_transactions
    (reference_number, wallet_id, type, amount_piastres, balance_after_piastres, notes)
  VALUES (v_wref, v_wallet.id, 'purchase', v_price, v_new_balance,
          CASE WHEN v_recipient = v_caller
               THEN 'شراء دورة: ' || v_course.title
               ELSE 'شراء دورة لطالب: ' || v_course.title END)
  RETURNING id INTO v_wtx;

  INSERT INTO public.enrollments (user_id, course_id) VALUES (v_recipient, p_course_id)
    ON CONFLICT DO NOTHING;

  v_pref := public._gen_payment_reference();
  INSERT INTO public.payment_transactions
    (reference_number, user_id, gateway_id, amount_piastres, status, purpose,
     course_id, wallet_transaction_id, on_behalf_of_user_id)
  VALUES (v_pref, v_caller,
          (SELECT id FROM public.payment_gateways WHERE gateway_key='wallet'),
          v_price, 'success', 'course_purchase',
          p_course_id, v_wtx,
          CASE WHEN v_recipient <> v_caller THEN v_recipient ELSE NULL END);

  RETURN jsonb_build_object(
    'success', true,
    'new_balance_piastres', v_new_balance,
    'reference_number', v_pref,
    'recipient_user_id', v_recipient
  );
END; $$;
REVOKE EXECUTE ON FUNCTION public.purchase_course(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purchase_course(uuid, uuid) TO authenticated;

-- 11) Add on_behalf_of_user_id to payment_transactions for bookkeeping
ALTER TABLE public.payment_transactions
  ADD COLUMN IF NOT EXISTS on_behalf_of_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ptx_on_behalf_idx
  ON public.payment_transactions(on_behalf_of_user_id)
  WHERE on_behalf_of_user_id IS NOT NULL;