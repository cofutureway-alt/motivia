-- ============================================================
-- إصلاح جذري: resolve_login_email
-- المشكلة: الدالة الحالية ترجع @internal.noemail.local بينما
-- كل الحسابات مسجلة بـ @phone.noemail.invalid (نطاق Signup.tsx)
-- الصق هذا كله في Supabase Dashboard → SQL Editor → Run
-- ============================================================

CREATE OR REPLACE FUNCTION public.resolve_login_email(_identifier text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id text := trim(COALESCE(_identifier, ''));
  v_email text;
BEGIN
  IF v_id ~ '^201[0125][0-9]{8}$' THEN
    SELECT auth_email INTO v_email FROM public.profiles
      WHERE phone_number = v_id LIMIT 1;
    RETURN COALESCE(v_email, v_id || '@phone.noemail.invalid');
  END IF;
  RETURN lower(v_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_login_email(text) TO anon, authenticated;

-- تحقق فوري: لازم يرجع 201111111111@phone.noemail.invalid
SELECT public.resolve_login_email('201111111111') AS test_result;
