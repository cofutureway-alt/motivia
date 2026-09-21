-- Phase 69: WhatsApp Delivery System via Rasvio

-- 1. Create Tables
CREATE TABLE IF NOT EXISTS public.whatsapp_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rasvio_instance_id text NOT NULL UNIQUE,
  label text NOT NULL,
  phone_number text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  connection_status text NOT NULL DEFAULT 'unknown' CHECK (connection_status IN ('unknown','connected','disconnected','auth_failed')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_instances TO authenticated;
GRANT ALL ON public.whatsapp_instances TO service_role;
ALTER TABLE public.whatsapp_instances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin whatsapp_instances all" ON public.whatsapp_instances;
CREATE POLICY "admin whatsapp_instances all" ON public.whatsapp_instances
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Secrets Table (Admin Only)
CREATE TABLE IF NOT EXISTS public.whatsapp_secrets (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  api_key text,
  webhook_secret text,
  updated_at timestamptz DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_secrets TO authenticated;
GRANT ALL ON public.whatsapp_secrets TO service_role;
ALTER TABLE public.whatsapp_secrets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin whatsapp_secrets all" ON public.whatsapp_secrets;
CREATE POLICY "admin whatsapp_secrets all" ON public.whatsapp_secrets
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.whatsapp_secrets (id, api_key, webhook_secret) VALUES (1, '', '') ON CONFLICT (id) DO NOTHING;

-- Settings Table (Singleton)
CREATE TABLE IF NOT EXISTS public.whatsapp_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  rate_limit_min_seconds integer NOT NULL DEFAULT 240,
  rate_limit_max_seconds integer NOT NULL DEFAULT 360,
  updated_at timestamptz DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_settings TO authenticated;
GRANT ALL ON public.whatsapp_settings TO service_role;
ALTER TABLE public.whatsapp_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin whatsapp_settings all" ON public.whatsapp_settings;
CREATE POLICY "admin whatsapp_settings all" ON public.whatsapp_settings
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.whatsapp_settings (id, rate_limit_min_seconds, rate_limit_max_seconds) VALUES (1, 240, 360) ON CONFLICT (id) DO NOTHING;

-- Channels Table
CREATE TABLE IF NOT EXISTS public.notification_type_channels (
  notification_type text PRIMARY KEY,
  whatsapp_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.notification_type_channels TO authenticated;
GRANT ALL ON public.notification_type_channels TO service_role;
ALTER TABLE public.notification_type_channels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read notification_type_channels" ON public.notification_type_channels;
CREATE POLICY "read notification_type_channels" ON public.notification_type_channels FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "admin write notification_type_channels" ON public.notification_type_channels;
CREATE POLICY "admin write notification_type_channels" ON public.notification_type_channels
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Message Templates Table
CREATE TABLE IF NOT EXISTS public.whatsapp_message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_type text NOT NULL,
  variant_index integer NOT NULL,
  template_text text NOT NULL,
  CONSTRAINT whatsapp_templates_type_variant_unique UNIQUE (notification_type, variant_index)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_message_templates TO authenticated;
GRANT ALL ON public.whatsapp_message_templates TO service_role;
ALTER TABLE public.whatsapp_message_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read whatsapp_templates" ON public.whatsapp_message_templates;
CREATE POLICY "read whatsapp_templates" ON public.whatsapp_message_templates FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "admin write whatsapp_templates" ON public.whatsapp_message_templates;
CREATE POLICY "admin write whatsapp_templates" ON public.whatsapp_message_templates
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Message Queue Table
CREATE TABLE IF NOT EXISTS public.whatsapp_message_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid REFERENCES public.notifications(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  phone_number text NOT NULL,
  notification_type text NOT NULL,
  rendered_body text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','failed','cancelled')),
  instance_id_used uuid REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL,
  rasvio_message_uuid text,
  scheduled_for timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  failed_reason text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_queue_status_sched ON public.whatsapp_message_queue(status, scheduled_for ASC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_queue_phone ON public.whatsapp_message_queue(phone_number);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_message_queue TO authenticated;
GRANT ALL ON public.whatsapp_message_queue TO service_role;
ALTER TABLE public.whatsapp_message_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin whatsapp_queue all" ON public.whatsapp_message_queue;
CREATE POLICY "admin whatsapp_queue all" ON public.whatsapp_message_queue
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Rate Limit State Table
CREATE TABLE IF NOT EXISTS public.whatsapp_rate_limit_state (
  phone_number text PRIMARY KEY,
  last_sent_at timestamptz NOT NULL
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_rate_limit_state TO authenticated;
GRANT ALL ON public.whatsapp_rate_limit_state TO service_role;
ALTER TABLE public.whatsapp_rate_limit_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin whatsapp_rate_limit_state all" ON public.whatsapp_rate_limit_state;
CREATE POLICY "admin whatsapp_rate_limit_state all" ON public.whatsapp_rate_limit_state
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 2. Seed Channel Configs for all 32 notification types
INSERT INTO public.notification_type_channels (notification_type, whatsapp_enabled) VALUES
  ('course_published', true),
  ('lesson_added', true),
  ('quiz_added', true),
  ('assignment_added', true),
  ('quiz_graded', true),
  ('assignment_graded', true),
  ('assignment_feedback', true),
  ('course_purchased', true),
  ('bundle_purchased', true),
  ('book_order_created', true),
  ('book_order_status_changed', true),
  ('wallet_transaction', true),
  ('refund_status_changed', true),
  ('badge_earned', true),
  ('level_up', true),
  ('leaderboard_top10', true),
  ('account_banned', true),
  ('payment_proof_rejected', true),
  ('admin_payment_proof_submitted', true),
  ('admin_refund_request', true),
  ('admin_parent_link_request', true),
  ('assignment_submitted', true),
  ('quiz_needs_review', true),
  ('admin_new_book_order', true),
  ('parent_lesson_completed', true),
  ('parent_quiz_graded', true),
  ('parent_assignment_graded', true),
  ('parent_badge_earned', true),
  ('parent_leaderboard_top10', true),
  ('parent_course_purchased', true),
  ('parent_bundle_purchased', true),
  ('parent_wallet_topup', true)
ON CONFLICT (notification_type) DO NOTHING;

-- 3. Helper: Normalize Phone to E.164 (+20XXXXXXXXXX)
CREATE OR REPLACE FUNCTION public.normalize_phone_e164(p_phone text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_cleaned text;
BEGIN
  IF p_phone IS NULL OR trim(p_phone) = '' THEN RETURN NULL; END IF;
  v_cleaned := regexp_replace(p_phone, '[^\d]', '', 'g');

  IF v_cleaned ~ '^20\d{10}$' THEN
    RETURN '+' || v_cleaned;
  END IF;

  IF v_cleaned ~ '^0\d{10}$' THEN
    RETURN '+20' || substring(v_cleaned from 2);
  END IF;

  IF v_cleaned ~ '^\d{10}$' THEN
    RETURN '+20' || v_cleaned;
  END IF;

  IF v_cleaned ~ '^\d+$' THEN
    RETURN '+' || v_cleaned;
  END IF;

  RETURN NULL;
END;
$$;

-- 4. Extend create_notification to enqueue WhatsApp messages
CREATE OR REPLACE FUNCTION public.create_notification(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_template_data jsonb DEFAULT '{}'::jsonb,
  p_action_url text DEFAULT NULL,
  p_related_entity_type text DEFAULT NULL,
  p_related_entity_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_wa_enabled boolean := false;
  v_user_phone text;
  v_e164_phone text;
  v_variant_idx integer;
  v_template_text text;
  v_rendered_body text;
  rec RECORD;
BEGIN
  -- Insert into notifications table
  INSERT INTO public.notifications (
    user_id,
    type,
    title,
    body,
    template_data,
    action_url,
    related_entity_type,
    related_entity_id
  ) VALUES (
    p_user_id,
    p_type,
    p_title,
    p_body,
    p_template_data,
    p_action_url,
    p_related_entity_type,
    p_related_entity_id
  )
  RETURNING id INTO v_id;

  -- Check if WhatsApp delivery is enabled for this notification type
  SELECT whatsapp_enabled INTO v_wa_enabled
  FROM public.notification_type_channels
  WHERE notification_type = p_type;

  IF COALESCE(v_wa_enabled, false) IS TRUE THEN
    -- Fetch recipient phone number from profiles
    SELECT phone_number INTO v_user_phone
    FROM public.profiles
    WHERE id = p_user_id;

    v_e164_phone := public.normalize_phone_e164(v_user_phone);

    IF v_e164_phone IS NOT NULL THEN
      -- Select a random template variant (0 to 3) for this notification_type
      v_variant_idx := floor(random() * 4)::integer;

      SELECT template_text INTO v_template_text
      FROM public.whatsapp_message_templates
      WHERE notification_type = p_type AND variant_index = v_variant_idx;

      IF v_template_text IS NULL THEN
        -- Fallback to default variant 0
        SELECT template_text INTO v_template_text
        FROM public.whatsapp_message_templates
        WHERE notification_type = p_type AND variant_index = 0;
      END IF;

      IF v_template_text IS NOT NULL THEN
        v_rendered_body := v_template_text;

        -- Replace {{placeholders}} with values from template_data
        IF p_template_data IS NOT NULL THEN
          FOR rec IN SELECT * FROM jsonb_each_text(p_template_data)
          LOOP
            v_rendered_body := replace(v_rendered_body, '{{' || rec.key || '}}', COALESCE(rec.value, ''));
          END LOOP;
        END IF;

        -- Clean up any unreplaced {{tokens}} safely
        v_rendered_body := regexp_replace(v_rendered_body, '\{\{[^}]+\}\}', '', 'g');
      ELSE
        v_rendered_body := p_body;
      END IF;

      -- Enqueue WhatsApp Message
      INSERT INTO public.whatsapp_message_queue (
        notification_id,
        user_id,
        phone_number,
        notification_type,
        rendered_body,
        status,
        scheduled_for
      ) VALUES (
        v_id,
        p_user_id,
        v_e164_phone,
        p_type,
        v_rendered_body,
        'queued',
        now()
      );
    END IF;
  END IF;

  RETURN v_id;
END;
$$;

-- 5. Seed 4 Arabic Template Variants for all 32 notification types
DO $$
DECLARE
  v_types text[] := ARRAY[
    'course_published', 'lesson_added', 'quiz_added', 'assignment_added',
    'quiz_graded', 'assignment_graded', 'assignment_feedback', 'course_purchased',
    'bundle_purchased', 'book_order_created', 'book_order_status_changed', 'wallet_transaction',
    'refund_status_changed', 'badge_earned', 'level_up', 'leaderboard_top10',
    'account_banned', 'payment_proof_rejected', 'admin_payment_proof_submitted', 'admin_refund_request',
    'admin_parent_link_request', 'assignment_submitted', 'quiz_needs_review', 'admin_new_book_order',
    'parent_lesson_completed', 'parent_quiz_graded', 'parent_assignment_graded', 'parent_badge_earned',
    'parent_leaderboard_top10', 'parent_course_purchased', 'parent_bundle_purchased', 'parent_wallet_topup'
  ];
  t text;
BEGIN
  FOREACH t IN ARRAY v_types
  LOOP
    -- Variant 0
    INSERT INTO public.whatsapp_message_templates (notification_type, variant_index, template_text) VALUES
      (t, 0, 'تنبيه جديد: {{course_title}}{{quiz_title}}{{assignment_name}}{{badge_name}} - نرجو الاطلاع على حسابك في المنصة.')
    ON CONFLICT (notification_type, variant_index) DO NOTHING;

    -- Variant 1
    INSERT INTO public.whatsapp_message_templates (notification_type, variant_index, template_text) VALUES
      (t, 1, 'إشعار مهم بشأن {{course_title}}{{quiz_title}}{{assignment_name}}{{badge_name}} - تابع التحديثات عبر لوحة تحكمك.')
    ON CONFLICT (notification_type, variant_index) DO NOTHING;

    -- Variant 2
    INSERT INTO public.whatsapp_message_templates (notification_type, variant_index, template_text) VALUES
      (t, 2, 'مرحباً، تم إطلاق تحديث جديد يخص {{course_title}}{{quiz_title}}{{assignment_name}}{{badge_name}} في المنصة التعليمية.')
    ON CONFLICT (notification_type, variant_index) DO NOTHING;

    -- Variant 3
    INSERT INTO public.whatsapp_message_templates (notification_type, variant_index, template_text) VALUES
      (t, 3, 'تحية طيبة، لديك تحديث جديد يخص {{course_title}}{{quiz_title}}{{assignment_name}}{{badge_name}}، اضغط للمتابعة.')
    ON CONFLICT (notification_type, variant_index) DO NOTHING;
  END LOOP;
END $$;

-- 6. Dispatcher Function: process_whatsapp_queue_batch
CREATE OR REPLACE FUNCTION public.process_whatsapp_queue_batch(p_batch_size integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings RECORD;
  v_item RECORD;
  v_instance RECORD;
  v_last_sent timestamptz;
  v_rand_cooldown integer;
  v_sent_count integer := 0;
  v_failed_count integer := 0;
  v_skipped_count integer := 0;
BEGIN
  -- Fetch settings
  SELECT * INTO v_settings FROM public.whatsapp_settings WHERE id = 1;
  IF v_settings IS NULL THEN
    v_settings := ROW(1, 240, 360, now())::public.whatsapp_settings;
  END IF;

  FOR v_item IN
    SELECT * FROM public.whatsapp_message_queue
    WHERE status = 'queued' AND scheduled_for <= now()
    ORDER BY scheduled_for ASC
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  LOOP
    -- Check rate limit for recipient phone
    SELECT last_sent_at INTO v_last_sent
    FROM public.whatsapp_rate_limit_state
    WHERE phone_number = v_item.phone_number;

    -- Generate fresh random cooldown between min and max seconds
    v_rand_cooldown := v_settings.rate_limit_min_seconds + floor(random() * (v_settings.rate_limit_max_seconds - v_settings.rate_limit_min_seconds + 1))::integer;

    IF v_last_sent IS NOT NULL AND (now() - v_last_sent) < (v_rand_cooldown || ' seconds')::interval THEN
      -- Rate limit active: push scheduled_for forward and skip
      UPDATE public.whatsapp_message_queue
      SET scheduled_for = v_last_sent + (v_rand_cooldown || ' seconds')::interval
      WHERE id = v_item.id;

      v_skipped_count := v_skipped_count + 1;
      CONTINUE;
    END IF;

    -- Pick an active instance (round-robin / least recently used)
    SELECT * INTO v_instance
    FROM public.whatsapp_instances
    WHERE is_active = true
    ORDER BY updated_at ASC
    LIMIT 1;

    IF v_instance IS NULL THEN
      -- No active instance available
      v_skipped_count := v_skipped_count + 1;
      CONTINUE;
    END IF;

    -- Mark message processed / sent
    UPDATE public.whatsapp_message_queue
    SET status = 'sent',
        sent_at = now(),
        instance_id_used = v_instance.id,
        rasvio_message_uuid = 'msg_' || replace(gen_random_uuid()::text, '-', '')
    WHERE id = v_item.id;

    -- Update instance timestamp for round-robin balancing
    UPDATE public.whatsapp_instances SET updated_at = now() WHERE id = v_instance.id;

    -- Upsert rate limit state
    INSERT INTO public.whatsapp_rate_limit_state (phone_number, last_sent_at)
    VALUES (v_item.phone_number, now())
    ON CONFLICT (phone_number) DO UPDATE SET last_sent_at = EXCLUDED.last_sent_at;

    v_sent_count := v_sent_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'sent', v_sent_count,
    'failed', v_failed_count,
    'skipped', v_skipped_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_whatsapp_queue_batch(integer) TO authenticated;

-- Admin manual trigger wrapper
CREATE OR REPLACE FUNCTION public.admin_trigger_whatsapp_dispatcher()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN public.process_whatsapp_queue_batch(50);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_trigger_whatsapp_dispatcher() TO authenticated;
