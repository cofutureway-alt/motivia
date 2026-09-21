-- ============================================================================
-- Phase 71m: Admin permissions editor + taxonomy + revenue split settings
-- ============================================================================

-- 1) Save per-instructor permissions + percent overrides
CREATE OR REPLACE FUNCTION public.admin_save_instructor_permissions(
  p_instructor_id uuid,
  p_permissions jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL OR NOT public.has_role(v_user, 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = p_instructor_id AND role = 'instructor'
  ) THEN
    RAISE EXCEPTION 'المستخدم ليس معلماً';
  END IF;

  INSERT INTO public.instructor_permissions (
    instructor_id, can_create_courses, can_create_bundles, can_create_books,
    can_manage_locations, can_manage_students,
    courses_percent_override, books_percent_override, updated_by, updated_at
  ) VALUES (
    p_instructor_id,
    COALESCE((p_permissions->>'can_create_courses')::boolean, true),
    COALESCE((p_permissions->>'can_create_bundles')::boolean, false),
    COALESCE((p_permissions->>'can_create_books')::boolean, false),
    COALESCE((p_permissions->>'can_manage_locations')::boolean, true),
    COALESCE((p_permissions->>'can_manage_students')::boolean, true),
    (p_permissions->>'courses_percent_override')::numeric,
    (p_permissions->>'books_percent_override')::numeric,
    v_user, now()
  )
  ON CONFLICT (instructor_id) DO UPDATE SET
    can_create_courses       = EXCLUDED.can_create_courses,
    can_create_bundles       = EXCLUDED.can_create_bundles,
    can_create_books         = EXCLUDED.can_create_books,
    can_manage_locations     = EXCLUDED.can_manage_locations,
    can_manage_students      = EXCLUDED.can_manage_students,
    courses_percent_override = EXCLUDED.courses_percent_override,
    books_percent_override   = EXCLUDED.books_percent_override,
    updated_by               = EXCLUDED.updated_by,
    updated_at               = now();

  RETURN jsonb_build_object('success', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_save_instructor_permissions(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_save_instructor_permissions(uuid, jsonb) TO authenticated;

-- 2) Admin sets/removes an instructor's subjects & stages
CREATE OR REPLACE FUNCTION public.admin_set_instructor_taxonomy(
  p_instructor_id uuid,
  p_subject_ids uuid[] DEFAULT NULL,
  p_stage_ids uuid[] DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  s uuid;
BEGIN
  IF v_user IS NULL OR NOT public.has_role(v_user, 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_subject_ids IS NOT NULL THEN
    DELETE FROM public.instructor_subjects WHERE instructor_id = p_instructor_id;
    FOREACH s IN ARRAY p_subject_ids LOOP
      INSERT INTO public.instructor_subjects (instructor_id, subject_id)
      VALUES (p_instructor_id, s) ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  IF p_stage_ids IS NOT NULL THEN
    DELETE FROM public.instructor_stages WHERE instructor_id = p_instructor_id;
    FOREACH s IN ARRAY p_stage_ids LOOP
      INSERT INTO public.instructor_stages (instructor_id, stage_id)
      VALUES (p_instructor_id, s) ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_set_instructor_taxonomy(uuid, uuid[], uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_instructor_taxonomy(uuid, uuid[], uuid[]) TO authenticated;

-- 3) Save revenue split settings
CREATE OR REPLACE FUNCTION public.admin_save_revenue_split_settings(
  p_settings jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL OR NOT public.has_role(v_user, 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.revenue_split_settings SET
    is_enabled                 = COALESCE((p_settings->>'is_enabled')::boolean, is_enabled),
    courses_instructor_percent = COALESCE((p_settings->>'courses_instructor_percent')::numeric, courses_instructor_percent),
    books_instructor_percent   = COALESCE((p_settings->>'books_instructor_percent')::numeric, books_instructor_percent),
    hold_days                  = COALESCE((p_settings->>'hold_days')::integer, hold_days),
    min_withdrawal_piastres    = COALESCE((p_settings->>'min_withdrawal_piastres')::integer, min_withdrawal_piastres),
    expenses                   = COALESCE(p_settings->'expenses', expenses),
    updated_at                 = now(),
    updated_by                 = v_user
  WHERE id = 1;

  RETURN (SELECT to_jsonb(x) FROM public.revenue_split_settings x WHERE x.id = 1);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_save_revenue_split_settings(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_save_revenue_split_settings(jsonb) TO authenticated;
