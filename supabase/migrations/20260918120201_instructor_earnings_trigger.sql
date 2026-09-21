
-- 5) The trigger itself
CREATE OR REPLACE FUNCTION public.handle_payment_txn_earnings()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_course_owner uuid;
  v_item RECORD;
  v_book_owner uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS DISTINCT FROM 'success' THEN RETURN NEW; END IF;
  ELSE
    IF NEW.status IS DISTINCT FROM 'success' OR OLD.status IS NOT DISTINCT FROM 'success' THEN
      RETURN NEW;
    END IF;
  END IF;

  IF NEW.purpose = 'course_purchase' AND NEW.course_id IS NOT NULL THEN
    SELECT created_by INTO v_course_owner FROM public.courses WHERE id = NEW.course_id;
    IF v_course_owner IS NOT NULL THEN
      PERFORM public._insert_instructor_earning(
        NEW.id, 'course', NEW.course_id, NULL, v_course_owner,
        COALESCE(NEW.amount_piastres, 0), now());
    END IF;

  ELSIF NEW.purpose = 'book_order' AND NEW.book_order_id IS NOT NULL THEN
    FOR v_item IN
      SELECT oi.book_id, (oi.unit_price_piastres * oi.quantity)::integer AS gross,
             b.created_by
      FROM public.book_order_items oi
      JOIN public.books b ON b.id = oi.book_id
      WHERE oi.order_id = NEW.book_order_id
    LOOP
      IF v_item.created_by IS NOT NULL THEN
        PERFORM public._insert_instructor_earning(
          NEW.id, 'book', NULL, v_item.book_id, v_item.created_by,
          v_item.gross, now());
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payment_txn_earnings ON public.payment_transactions;
CREATE TRIGGER trg_payment_txn_earnings
AFTER INSERT OR UPDATE OF status ON public.payment_transactions
FOR EACH ROW EXECUTE FUNCTION public.handle_payment_txn_earnings();

-- 6) Refund reversal: a refunded successful transaction retracts pending/available earnings
CREATE OR REPLACE FUNCTION public.handle_payment_txn_refund_earnings()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'refunded' AND OLD.status = 'success' THEN
    DELETE FROM public.instructor_earnings
     WHERE payment_txn_id = NEW.id AND status <> 'withdrawn';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payment_txn_refund_earnings ON public.payment_transactions;
CREATE TRIGGER trg_payment_txn_refund_earnings
AFTER UPDATE OF status ON public.payment_transactions
FOR EACH ROW EXECUTE FUNCTION public.handle_payment_txn_refund_earnings();

-- 7) Availability: earnings unlock after the hold period (cron every 5 minutes)
CREATE OR REPLACE FUNCTION public.process_instructor_earnings_availability()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_flipped integer := 0;
  r RECORD;
BEGIN
  WITH flipped AS (
    UPDATE public.instructor_earnings
       SET status = 'available'
     WHERE status = 'pending' AND available_at <= now()
    RETURNING instructor_id
  )
  SELECT COUNT(*) INTO v_flipped FROM flipped;

  -- One notification per instructor who just got earnings unlocked
  FOR r IN
    SELECT DISTINCT e.instructor_id
    FROM public.instructor_earnings e
    WHERE e.status = 'available'
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.user_id = e.instructor_id
          AND n.type = 'instructor_earnings_available'
          AND n.created_at > now() - interval '7 days'
      )
  LOOP
    PERFORM public.create_notification(
      r.instructor_id,
      'instructor_earnings_available',
      'أرباحك أصبحت متاحة للسحب',
      'تم تفعيل أرباحك المعلقة ويمكنك الآن إنشاء طلب سحب من لوحة المعلم.',
      '{}'::jsonb,
      '/instructor/withdrawals'
    );
  END LOOP;

  RETURN v_flipped;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.process_instructor_earnings_availability() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_instructor_earnings_availability() TO authenticated;

-- Cron job (pg_cron must exist — enabled by migration 20260918000000)
SELECT cron.unschedule('instructor_earnings_availability_job')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'instructor_earnings_availability_job');
SELECT cron.schedule(
  'instructor_earnings_availability_job',
  '*/5 * * * *',
  $$SELECT public.process_instructor_earnings_availability()$$
);
