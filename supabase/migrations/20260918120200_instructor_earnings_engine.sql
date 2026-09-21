-- ============================================================================
-- Phase 71c: Instructor earnings engine
-- Hook: fires whenever a payment transaction becomes 'success'
-- (covers gateways, wallet purchases, and manual approvals).
-- Bundle purchases intentionally produce NO earnings (admin keeps 100%).
-- ============================================================================

-- 1) Relax uniqueness: one earnings row per (txn, product, item)
ALTER TABLE public.instructor_earnings
  DROP CONSTRAINT IF EXISTS instructor_earnings_payment_txn_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS earnings_txn_item_unique
  ON public.instructor_earnings (
    payment_txn_id,
    product_type,
    COALESCE(course_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(book_id,   '00000000-0000-0000-0000-000000000000'::uuid)
  );

-- 2) Effective instructor percent: per-instructor override wins, else global
CREATE OR REPLACE FUNCTION public._instructor_effective_percent(
  p_instructor uuid, p_type text
) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(
    CASE WHEN p_type = 'course' THEN ip.courses_percent_override ELSE ip.books_percent_override END,
    CASE WHEN p_type = 'course' THEN rs.courses_instructor_percent ELSE rs.books_instructor_percent END,
    0
  )
  FROM public.revenue_split_settings rs
  LEFT JOIN public.instructor_permissions ip ON ip.instructor_id = p_instructor
  WHERE rs.id = 1;
$$;

-- 3) Split computation.
--    Model: instructor_amount = round(gross × p/100) − instructor-borne expenses.
--    Each expense carries instructor_borne_percent (NULL ⇒ same as profit percent),
--    which degrades exactly to the "net profit split" model when NULL.
CREATE OR REPLACE FUNCTION public._compute_instructor_split(
  p_gross integer, p_percent numeric, p_expenses jsonb,
  OUT o_expenses integer, OUT o_net integer,
  OUT o_instructor_amount integer, OUT o_admin_amount integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  exp jsonb;
  v_amount integer;
  v_borne_frac numeric;
  v_instructor_borne integer := 0;
BEGIN
  o_expenses := 0;
  o_net := GREATEST(p_gross, 0);
  IF p_expenses IS NOT NULL AND jsonb_typeof(p_expenses) = 'array' THEN
    FOR exp IN SELECT * FROM jsonb_array_elements(p_expenses)
    LOOP
      IF (exp->>'type') = 'percent' THEN
        v_amount := ROUND(p_gross * COALESCE((exp->>'percent')::numeric, 0) / 100);
      ELSE
        v_amount := GREATEST(COALESCE((exp->>'fixed_piastres')::integer, 0), 0);
      END IF;
      o_expenses := o_expenses + v_amount;
      v_borne_frac := CASE
        WHEN (exp->>'instructor_borne_percent') IS NOT NULL
          THEN (exp->>'instructor_borne_percent')::numeric / 100
        ELSE p_percent / 100
      END;
      v_instructor_borne := v_instructor_borne + ROUND(v_amount * v_borne_frac);
    END LOOP;
  END IF;
  o_net := GREATEST(p_gross - o_expenses, 0);
  o_instructor_amount := GREATEST(ROUND(p_gross * p_percent / 100) - v_instructor_borne, 0);
  o_admin_amount := GREATEST(p_gross - o_expenses - o_instructor_amount, 0);
END;
$$;

-- 4) Insert one earnings row (idempotent per txn+product+item)
CREATE OR REPLACE FUNCTION public._insert_instructor_earning(
  p_txn_id uuid, p_product_type text, p_course_id uuid, p_book_id uuid,
  p_instructor uuid, p_gross integer, p_completed timestamptz
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_pct numeric;
  v_exp integer; v_net integer; v_in_amt integer; v_adm_amt integer;
  v_settings RECORD;
BEGIN
  SELECT * INTO v_settings FROM public.revenue_split_settings WHERE id = 1;
  IF v_settings IS NULL OR NOT v_settings.is_enabled THEN RETURN; END IF;
  IF NOT public.is_instructor(p_instructor) THEN RETURN; END IF;

  v_pct := public._instructor_effective_percent(p_instructor, p_product_type);
  PERFORM public._compute_instructor_split(p_gross, v_pct, v_settings.expenses,
    v_exp, v_net, v_in_amt, v_adm_amt);

  INSERT INTO public.instructor_earnings (
    instructor_id, payment_txn_id, product_type, course_id, book_id,
    gross_piastres, expenses_piastres, net_piastres,
    instructor_percent, instructor_amount, admin_amount,
    status, available_at, created_at
  ) VALUES (
    p_instructor, p_txn_id, p_product_type, p_course_id, p_book_id,
    p_gross, v_exp, v_net, v_pct, v_in_amt, v_adm_amt,
    'pending', COALESCE(p_completed, now()) + (v_settings.hold_days || ' days')::interval,
    now()
  )
  ON CONFLICT DO NOTHING;
END;
$$;
