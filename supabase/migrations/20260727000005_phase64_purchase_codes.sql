-- Phase 64: Purchase Codes System

-- 1. Create purchase_codes table
CREATE TABLE IF NOT EXISTS public.purchase_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  target_type text NOT NULL CHECK (target_type IN ('course', 'bundle')),
  target_id uuid NOT NULL,
  max_uses integer NOT NULL DEFAULT 1 CHECK (max_uses > 0),
  use_count integer NOT NULL DEFAULT 0 CHECK (use_count >= 0),
  expires_at timestamptz,
  batch_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Index for code lookup and target lookup
CREATE INDEX IF NOT EXISTS idx_purchase_codes_code ON public.purchase_codes(code);
CREATE INDEX IF NOT EXISTS idx_purchase_codes_batch ON public.purchase_codes(batch_id);
CREATE INDEX IF NOT EXISTS idx_purchase_codes_target ON public.purchase_codes(target_type, target_id);

-- 2. Create purchase_code_redemptions table
CREATE TABLE IF NOT EXISTS public.purchase_code_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_code_id uuid NOT NULL REFERENCES public.purchase_codes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (purchase_code_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_code_redemptions_user ON public.purchase_code_redemptions(user_id);

-- 3. Enable RLS
ALTER TABLE public.purchase_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_code_redemptions ENABLE ROW LEVEL SECURITY;

-- Policies for purchase_codes
DROP POLICY IF EXISTS purchase_codes_admin_all ON public.purchase_codes;
CREATE POLICY purchase_codes_admin_all ON public.purchase_codes
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Policies for purchase_code_redemptions
DROP POLICY IF EXISTS purchase_code_redemptions_read ON public.purchase_code_redemptions;
CREATE POLICY purchase_code_redemptions_read ON public.purchase_code_redemptions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

-- 4. Automatic 30-day lazy cleanup & admin listing function
CREATE OR REPLACE FUNCTION public.admin_list_purchase_codes(
  _search  text    DEFAULT NULL,
  _status  text    DEFAULT NULL,
  _limit   integer DEFAULT 50,
  _offset  integer DEFAULT 0
)
RETURNS TABLE (
  id           uuid,
  code         text,
  target_type  text,
  target_id    uuid,
  target_title text,
  max_uses     integer,
  use_count    integer,
  status       text,
  expires_at   timestamptz,
  batch_id     uuid,
  created_at   timestamptz,
  updated_at   timestamptz,
  total_count  bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Lazy 30-day cleanup step: delete used-up or expired codes older than 30 days
  DELETE FROM public.purchase_codes
  WHERE
    (use_count >= max_uses AND updated_at < now() - INTERVAL '30 days')
    OR (expires_at IS NOT NULL AND expires_at < now() - INTERVAL '30 days');

  RETURN QUERY
  WITH base AS (
    SELECT
      pc.id,
      pc.code,
      pc.target_type,
      pc.target_id,
      CASE
        WHEN pc.target_type = 'course' THEN (SELECT c.title FROM public.courses c WHERE c.id = pc.target_id)
        WHEN pc.target_type = 'bundle' THEN (SELECT b.title FROM public.bundles b WHERE b.id = pc.target_id)
        ELSE 'غير معروف'
      END AS target_title,
      pc.max_uses,
      pc.use_count,
      CASE
        WHEN pc.use_count >= pc.max_uses THEN 'used_up'
        WHEN pc.expires_at IS NOT NULL AND pc.expires_at < now() THEN 'expired'
        ELSE 'active'
      END AS status,
      pc.expires_at,
      pc.batch_id,
      pc.created_at,
      pc.updated_at
    FROM public.purchase_codes pc
  ),
  filtered AS (
    SELECT b.*
    FROM base b
    WHERE
      (_status IS NULL OR _status = '' OR _status = 'all' OR b.status = _status)
      AND (
        _search IS NULL OR _search = '' OR
        b.code ILIKE '%' || _search || '%' OR
        b.target_title ILIKE '%' || _search || '%'
      )
  ),
  counted AS (
    SELECT f.*, COUNT(*) OVER() AS total_count FROM filtered f
  )
  SELECT
    c.id, c.code, c.target_type, c.target_id, c.target_title,
    c.max_uses, c.use_count, c.status, c.expires_at, c.batch_id,
    c.created_at, c.updated_at, c.total_count
  FROM counted c
  ORDER BY c.created_at DESC
  LIMIT  GREATEST(COALESCE(_limit, 50), 1)
  OFFSET GREATEST(COALESCE(_offset, 0), 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_purchase_codes(text, text, integer, integer) TO authenticated;

-- 5. Admin Quick Cleanup Functions
CREATE OR REPLACE FUNCTION public.admin_delete_used_purchase_codes()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  WITH deleted AS (
    DELETE FROM public.purchase_codes
    WHERE use_count >= max_uses
    RETURNING id
  )
  SELECT count(*)::integer INTO v_count FROM deleted;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_used_purchase_codes() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_delete_expired_purchase_codes()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  WITH deleted AS (
    DELETE FROM public.purchase_codes
    WHERE expires_at IS NOT NULL AND expires_at < now()
    RETURNING id
  )
  SELECT count(*)::integer INTO v_count FROM deleted;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_expired_purchase_codes() TO authenticated;

-- 6. Atomic Security Definer Redemption Function
CREATE OR REPLACE FUNCTION public.redeem_purchase_code(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_clean_code text := trim(p_code);
  v_code RECORD;
  v_already_redeemed boolean;
  v_already_owned boolean;
  v_target_title text;
  v_courses_count integer := 0;
BEGIN
  -- Caller must be authenticated
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'يجب تسجيل الدخول أولاً لاستخدام الكود.');
  END IF;

  IF v_clean_code IS NULL OR v_clean_code = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'يرجى إدخال كود الشراء.');
  END IF;

  -- 1. Look up code (case insensitive comparison)
  SELECT * INTO v_code
  FROM public.purchase_codes
  WHERE UPPER(code) = UPPER(v_clean_code);

  IF v_code IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'الكود غير صحيح.');
  END IF;

  -- 2. Check max uses
  IF v_code.use_count >= v_code.max_uses THEN
    RETURN jsonb_build_object('success', false, 'error', 'تم استخدام هذا الكود بالكامل.');
  END IF;

  -- 3. Check expiry date
  IF v_code.expires_at IS NOT NULL AND v_code.expires_at < now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'انتهت صلاحية هذا الكود.');
  END IF;

  -- 4. Check if user has already redeemed this exact code
  SELECT EXISTS (
    SELECT 1 FROM public.purchase_code_redemptions
    WHERE purchase_code_id = v_code.id AND user_id = v_user_id
  ) INTO v_already_redeemed;

  IF v_already_redeemed THEN
    RETURN jsonb_build_object('success', false, 'error', 'لقد استخدمت هذا الكود من قبل.');
  END IF;

  -- 5. Check if user already owns the target
  IF v_code.target_type = 'course' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.enrollments
      WHERE user_id = v_user_id AND course_id = v_code.target_id
    ) INTO v_already_owned;

    SELECT title INTO v_target_title FROM public.courses WHERE id = v_code.target_id;
  ELSIF v_code.target_type = 'bundle' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.bundle_purchases
      WHERE user_id = v_user_id AND bundle_id = v_code.target_id
    ) INTO v_already_owned;

    SELECT title INTO v_target_title FROM public.bundles WHERE id = v_code.target_id;
  END IF;

  IF v_already_owned THEN
    RETURN jsonb_build_object('success', false, 'error', 'أنت مسجل بالفعل في هذا الكورس/الباقة');
  END IF;

  -- 6. Grant access
  IF v_code.target_type = 'course' THEN
    INSERT INTO public.enrollments (user_id, course_id)
    VALUES (v_user_id, v_code.target_id)
    ON CONFLICT DO NOTHING;
  ELSIF v_code.target_type = 'bundle' THEN
    v_courses_count := public._enroll_user_in_bundle(v_user_id, v_code.target_id);
    INSERT INTO public.bundle_purchases
      (user_id, bundle_id, amount_piastres, courses_included, original_price_piastres, discount_amount_piastres)
      VALUES (v_user_id, v_code.target_id, 0, v_courses_count, 0, 0)
      ON CONFLICT DO NOTHING;
  END IF;

  -- 7. Record redemption and increment use_count
  INSERT INTO public.purchase_code_redemptions (purchase_code_id, user_id)
  VALUES (v_code.id, v_user_id);

  UPDATE public.purchase_codes
  SET
    use_count = use_count + 1,
    updated_at = now()
  WHERE id = v_code.id;

  RETURN jsonb_build_object(
    'success', true,
    'target_type', v_code.target_type,
    'target_id', v_code.target_id,
    'target_title', COALESCE(v_target_title, 'الدورة/الباقة'),
    'message', 'تم تفعيل الكود بنجاح!'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.redeem_purchase_code(text) TO authenticated;
