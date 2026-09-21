
-- Phase 61: Platform Settings singleton table
-- Stores logo URLs, social links, and hero section content

CREATE TABLE public.platform_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  logo_light_url  TEXT,
  logo_dark_url   TEXT,
  social_links    JSONB NOT NULL DEFAULT '[]'::jsonb,
  hero_image_url  TEXT,
  hero_headline   TEXT,
  hero_subtext    TEXT,
  hero_cta_label  TEXT,
  hero_cta_url    TEXT,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed the single row with defaults matching the current hardcoded hero content
INSERT INTO public.platform_settings (
  id,
  hero_headline,
  hero_subtext,
  hero_cta_label,
  hero_cta_url,
  social_links
) VALUES (
  1,
  E'رحلتك في العلم\nتبدأ من هنا',
  'دروس منظّمة، متابعة مستمرة، واختبارات تفاعلية تقيس تقدّمك خطوة بخطوة — كل ما تحتاجه للتفوّق في مكان واحد.',
  'تصفح الكورسات',
  '/courses',
  '[{"platform":"YouTube","url":"https://www.youtube.com/@elsa3i"},{"platform":"Facebook","url":"https://www.facebook.com/Elsa3i.shr3i"},{"platform":"Telegram","url":"https://t.me/elsa3i"}]'::jsonb
);

-- Grants
GRANT SELECT ON public.platform_settings TO anon, authenticated;
GRANT UPDATE ON public.platform_settings TO authenticated;
GRANT ALL ON public.platform_settings TO service_role;

-- RLS
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform settings readable by everyone"
  ON public.platform_settings FOR SELECT
  USING (true);

CREATE POLICY "Admins update platform settings"
  ON public.platform_settings FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND id = 1);

-- Auto-update updated_at
CREATE TRIGGER update_platform_settings_updated_at
  BEFORE UPDATE ON public.platform_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
