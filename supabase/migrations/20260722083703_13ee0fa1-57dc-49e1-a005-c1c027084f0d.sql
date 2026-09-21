
-- 1. Column for storing gateway-specific identifiers (e.g. Fawaterak invoice_id/invoice_key)
ALTER TABLE public.payment_transactions
  ADD COLUMN IF NOT EXISTS gateway_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 2. Helper to age out stale Fawaterak pending_gateway transactions.
--    Fawaterak's webhook fires only on paid, so anything left pending past the
--    timeout is treated as failed. Runs as SECURITY DEFINER so any caller can
--    trigger the cleanup safely (only touches Fawaterak pending rows past the cutoff).
CREATE OR REPLACE FUNCTION public.expire_stale_fawaterak_pending()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gateway_id uuid;
  v_cutoff timestamptz := now() - interval '2 hours';
  v_count integer := 0;
BEGIN
  SELECT id INTO v_gateway_id FROM public.payment_gateways WHERE gateway_key = 'fawaterak';
  IF v_gateway_id IS NULL THEN
    RETURN 0;
  END IF;

  WITH updated AS (
    UPDATE public.payment_transactions
       SET status = 'failed',
           failure_reason = COALESCE(failure_reason, 'انتهت مهلة إتمام الدفع دون تأكيد من فواتيرك')
     WHERE gateway_id = v_gateway_id
       AND status = 'pending_gateway'
       AND created_at < v_cutoff
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM updated;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_stale_fawaterak_pending() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_stale_fawaterak_pending() TO authenticated;
GRANT EXECUTE ON FUNCTION public.expire_stale_fawaterak_pending() TO service_role;
