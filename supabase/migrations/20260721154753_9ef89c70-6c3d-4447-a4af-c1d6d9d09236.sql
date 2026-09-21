CREATE OR REPLACE FUNCTION public.resolve_login_email(_identifier text)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id text := trim(COALESCE(_identifier, ''));
BEGIN
  -- Never reveal whether a phone number is registered, and never return
  -- another user's real email. Always return the deterministic synthetic
  -- address so the response is indistinguishable for existing vs
  -- non-existing accounts.
  IF v_id ~ '^201[0125][0-9]{8}$' THEN
    RETURN v_id || '@internal.noemail.local';
  END IF;
  RETURN lower(v_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_login_email(text) TO anon, authenticated;