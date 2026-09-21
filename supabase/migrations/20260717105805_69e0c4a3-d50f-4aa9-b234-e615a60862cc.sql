
CREATE TABLE public.video_player_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  double_tap_seek_enabled BOOLEAN NOT NULL DEFAULT true,
  seek_forward_seconds INTEGER NOT NULL DEFAULT 10 CHECK (seek_forward_seconds BETWEEN 1 AND 120),
  seek_backward_seconds INTEGER NOT NULL DEFAULT 10 CHECK (seek_backward_seconds BETWEEN 1 AND 120),
  speed_control_enabled BOOLEAN NOT NULL DEFAULT true,
  allowed_speeds JSONB NOT NULL DEFAULT '[1.25, 1.5, 2]'::jsonb,
  completion_gate_enabled BOOLEAN NOT NULL DEFAULT false,
  completion_required_percentage INTEGER NOT NULL DEFAULT 90 CHECK (completion_required_percentage BETWEEN 1 AND 100),
  watermark_color TEXT NOT NULL DEFAULT '#ffffff',
  watermark_show_email BOOLEAN NOT NULL DEFAULT true,
  watermark_show_name BOOLEAN NOT NULL DEFAULT false,
  watermark_speed_seconds INTEGER NOT NULL DEFAULT 22 CHECK (watermark_speed_seconds BETWEEN 4 AND 120),
  watermark_opacity NUMERIC NOT NULL DEFAULT 0.35 CHECK (watermark_opacity BETWEEN 0 AND 1),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.video_player_settings (id) VALUES (1);

GRANT SELECT ON public.video_player_settings TO anon, authenticated;
GRANT UPDATE ON public.video_player_settings TO authenticated;
GRANT ALL ON public.video_player_settings TO service_role;

ALTER TABLE public.video_player_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read player settings"
  ON public.video_player_settings FOR SELECT
  USING (true);

CREATE POLICY "Admins update player settings"
  ON public.video_player_settings FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND id = 1);

CREATE TRIGGER update_vps_updated_at
  BEFORE UPDATE ON public.video_player_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
