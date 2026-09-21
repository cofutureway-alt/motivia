-- ─── 10. Helpers ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_instructor(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND role = 'instructor'::public.app_role); $$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND role = _role); $$;

REVOKE EXECUTE ON FUNCTION public.is_instructor(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_instructor(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, anon;

-- ─── 11. Guard trigger: keep students from touching privileged columns ───────
-- (Admins are exempt, which allows admins to promote students to instructor)
CREATE OR REPLACE FUNCTION public.prevent_privileged_profile_updates()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  NEW.role := OLD.role;
  NEW.is_banned := OLD.is_banned;
  NEW.student_id := OLD.student_id;
  NEW.qr_token := OLD.qr_token;
  RETURN NEW;
END;
$function$;

-- ─── 12. Scope trigger: instructors create content only in their own
--         subjects/stages; ownership is force-set to the caller.
CREATE OR REPLACE FUNCTION public.enforce_instructor_content_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role public.app_role;
  v_ok boolean := false;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role IS DISTINCT FROM 'instructor'::public.app_role THEN
    RETURN NEW; -- admins/service rows unaffected
  END IF;

  IF TG_TABLE_NAME = 'courses' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.instructor_subjects
       WHERE instructor_id = auth.uid() AND subject_id = NEW.subject_id
    ) INTO v_ok;
    IF NOT v_ok THEN
      RAISE EXCEPTION 'لا يمكنك إنشاء محتوى في مادة غير مخصصة لك';
    END IF;
    IF NEW.stage_id IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1 FROM public.instructor_stages
         WHERE instructor_id = auth.uid() AND stage_id = NEW.stage_id
      ) INTO v_ok;
      IF NOT v_ok THEN
        RAISE EXCEPTION 'لا يمكنك إنشاء محتوى في مرحلة غير مخصصة لك';
      END IF;
    END IF;
    NEW.created_by := auth.uid();
  ELSIF TG_TABLE_NAME = 'books' THEN
    NEW.created_by := auth.uid();
  ELSIF TG_TABLE_NAME = 'bundles' THEN
    NEW.created_by := auth.uid();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_instructor_courses_scope ON public.courses;
CREATE TRIGGER trg_instructor_courses_scope BEFORE INSERT OR UPDATE ON public.courses
  FOR EACH ROW EXECUTE FUNCTION public.enforce_instructor_content_scope();
DROP TRIGGER IF EXISTS trg_instructor_books_scope ON public.books;
CREATE TRIGGER trg_instructor_books_scope BEFORE INSERT OR UPDATE ON public.books
  FOR EACH ROW EXECUTE FUNCTION public.enforce_instructor_content_scope();
DROP TRIGGER IF EXISTS trg_instructor_bundles_scope ON public.bundles;
CREATE TRIGGER trg_instructor_bundles_scope BEFORE INSERT OR UPDATE ON public.bundles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_instructor_content_scope();

-- ─── 13. RLS: instructor-owned content write policies ────────────────────────
DROP POLICY IF EXISTS "instructor own courses write" ON public.courses;
CREATE POLICY "instructor own courses write" ON public.courses FOR ALL
  TO authenticated
  USING (created_by = auth.uid() AND public.has_role(auth.uid(), 'instructor'))
  WITH CHECK (created_by = auth.uid() AND public.has_role(auth.uid(), 'instructor'));

DROP POLICY IF EXISTS "instructor own bundles write" ON public.bundles;
CREATE POLICY "instructor own bundles write" ON public.bundles FOR ALL
  TO authenticated
  USING (created_by = auth.uid() AND public.has_role(auth.uid(), 'instructor'))
  WITH CHECK (created_by = auth.uid() AND public.has_role(auth.uid(), 'instructor'));

DROP POLICY IF EXISTS "instructor own books write" ON public.books;
CREATE POLICY "instructor own books write" ON public.books FOR ALL
  TO authenticated
  USING (created_by = auth.uid() AND public.has_role(auth.uid(), 'instructor'))
  WITH CHECK (created_by = auth.uid() AND public.has_role(auth.uid(), 'instructor'));

-- ─── 14. Notification channel seeds for instructor notifications ─────────────
INSERT INTO public.notification_type_channels (notification_type, whatsapp_enabled) VALUES
  ('instructor_new_enrollment',   false),
  ('instructor_new_attempt',      false),
  ('instructor_withdrawal_submitted', false),
  ('instructor_withdrawal_approved',  false),
  ('instructor_withdrawal_rejected',  false),
  ('instructor_earnings_available',   false)
ON CONFLICT (notification_type) DO NOTHING;
