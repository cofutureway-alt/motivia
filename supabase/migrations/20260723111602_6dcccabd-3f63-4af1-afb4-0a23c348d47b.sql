
CREATE OR REPLACE FUNCTION public._award_points(p_student uuid, p_event_key text, p_source_kind text, p_source_id uuid, p_delta_override integer DEFAULT NULL::integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role app_role;
  v_delta integer;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = p_student;
  IF v_role IS DISTINCT FROM 'student'::app_role THEN
    RETURN;
  END IF;

  IF p_delta_override IS NOT NULL THEN
    v_delta := p_delta_override;
  ELSE
    SELECT points_value INTO v_delta FROM public.points_config WHERE event_key = p_event_key;
  END IF;

  IF v_delta IS NULL THEN v_delta := 0; END IF;

  -- Always insert so the ledger is a complete event history (Phase 51: needed by badge conditions)
  INSERT INTO public.points_ledger (student_id, event_key, points_delta, source_kind, source_id)
  VALUES (p_student, p_event_key, v_delta, p_source_kind, p_source_id)
  ON CONFLICT (student_id, source_kind, source_id, event_key) WHERE source_id IS NOT NULL DO NOTHING;
END;
$function$;
