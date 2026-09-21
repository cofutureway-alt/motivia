
-- Phase 21 + 22 migration

-- 1. Add profile columns
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS student_id text UNIQUE,
  ADD COLUMN IF NOT EXISTS custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS governorate text,
  ADD COLUMN IF NOT EXISTS registration_type text,
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS stage_id uuid REFERENCES public.stages(id) ON DELETE SET NULL;

-- 2. registration_form_fields table
CREATE TABLE IF NOT EXISTS public.registration_form_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  field_key text NOT NULL UNIQUE,
  label text NOT NULL,
  field_type text NOT NULL CHECK (field_type IN ('text','textarea','number','date','select','radio','checkbox','phone')),
  is_required boolean NOT NULL DEFAULT false,
  is_locked boolean NOT NULL DEFAULT false,
  options jsonb,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.registration_form_fields TO anon, authenticated;
GRANT ALL ON public.registration_form_fields TO service_role, authenticated;

ALTER TABLE public.registration_form_fields ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read registration form fields" ON public.registration_form_fields;
CREATE POLICY "Anyone can read registration form fields"
  ON public.registration_form_fields FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins manage registration form fields" ON public.registration_form_fields;
CREATE POLICY "Admins manage registration form fields"
  ON public.registration_form_fields FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER registration_form_fields_updated_at
  BEFORE UPDATE ON public.registration_form_fields
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Seed default fields
INSERT INTO public.registration_form_fields (field_key, label, field_type, is_required, is_locked, options, order_index) VALUES
  ('full_name',        'الاسم الكامل',          'text',   true,  true,  NULL, 0),
  ('phone_number',     'رقم الهاتف',            'phone',  true,  true,  NULL, 1),
  ('password',         'كلمة المرور',           'text',   true,  true,  NULL, 2),
  ('confirm_password', 'تأكيد كلمة المرور',     'text',   false, true,  NULL, 3),
  ('email',            'البريد الإلكتروني',     'text',   false, false, NULL, 4),
  ('governorate',      'المحافظة',              'select', false, false,
    '[{"value":"cairo","label":"القاهرة"},{"value":"giza","label":"الجيزة"},{"value":"alexandria","label":"الإسكندرية"},{"value":"qalyubia","label":"القليوبية"},{"value":"sharqia","label":"الشرقية"},{"value":"dakahlia","label":"الدقهلية"},{"value":"beheira","label":"البحيرة"},{"value":"gharbia","label":"الغربية"},{"value":"monufia","label":"المنوفية"},{"value":"kafr_el_sheikh","label":"كفر الشيخ"},{"value":"damietta","label":"دمياط"},{"value":"port_said","label":"بورسعيد"},{"value":"ismailia","label":"الإسماعيلية"},{"value":"suez","label":"السويس"},{"value":"north_sinai","label":"شمال سيناء"},{"value":"south_sinai","label":"جنوب سيناء"},{"value":"beni_suef","label":"بني سويف"},{"value":"faiyum","label":"الفيوم"},{"value":"minya","label":"المنيا"},{"value":"assiut","label":"أسيوط"},{"value":"sohag","label":"سوهاج"},{"value":"qena","label":"قنا"},{"value":"luxor","label":"الأقصر"},{"value":"aswan","label":"أسوان"},{"value":"red_sea","label":"البحر الأحمر"},{"value":"new_valley","label":"الوادي الجديد"},{"value":"matrouh","label":"مطروح"}]'::jsonb, 5),
  ('registration_type','نوع التسجيل',           'radio',  false, false,
    '[{"value":"online","label":"أونلاين"},{"value":"center","label":"سنتر"}]'::jsonb, 6),
  ('gender',           'النوع',                 'radio',  false, false,
    '[{"value":"male","label":"ذكر"},{"value":"female","label":"أنثى"}]'::jsonb, 7),
  ('guardian_phone',   'رقم هاتف ولي الأمر',    'phone',  true,  false, NULL, 8),
  ('stage_id',         'الصف الدراسي',          'select', false, false, NULL, 9)
ON CONFLICT (field_key) DO NOTHING;

-- 4. Student ID generation
CREATE OR REPLACE FUNCTION public.generate_student_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  candidate text;
  exists_already boolean;
BEGIN
  IF NEW.role <> 'student' OR NEW.student_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  LOOP
    candidate := lpad(floor(random()*1000000)::int::text, 6, '0');
    SELECT EXISTS(SELECT 1 FROM public.profiles WHERE student_id = candidate) INTO exists_already;
    EXIT WHEN NOT exists_already;
  END LOOP;
  NEW.student_id := candidate;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assign_student_id ON public.profiles;
CREATE TRIGGER assign_student_id
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.generate_student_id();

-- 5. Update handle_new_user to also copy known columns and custom_fields
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m jsonb := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
BEGIN
  INSERT INTO public.profiles (
    id, full_name, role, phone_number, guardian_phone, email, auth_email,
    governorate, registration_type, gender, stage_id, custom_fields
  ) VALUES (
    NEW.id,
    COALESCE(m->>'full_name', m->>'name', ''),
    COALESCE(NULLIF(m->>'role',''), 'student')::app_role,
    NULLIF(m->>'phone_number',''),
    NULLIF(m->>'guardian_phone',''),
    NULLIF(m->>'real_email',''),
    NEW.email,
    NULLIF(m->>'governorate',''),
    NULLIF(m->>'registration_type',''),
    NULLIF(m->>'gender',''),
    CASE WHEN NULLIF(m->>'stage_id','') IS NOT NULL THEN (m->>'stage_id')::uuid ELSE NULL END,
    COALESCE(m->'custom_fields', '{}'::jsonb)
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- 6. Backfill student_id for existing student profiles
DO $$
DECLARE
  r RECORD;
  candidate text;
  exists_already boolean;
BEGIN
  FOR r IN SELECT id FROM public.profiles WHERE role = 'student' AND student_id IS NULL LOOP
    LOOP
      candidate := lpad(floor(random()*1000000)::int::text, 6, '0');
      SELECT EXISTS(SELECT 1 FROM public.profiles WHERE student_id = candidate) INTO exists_already;
      EXIT WHEN NOT exists_already;
    END LOOP;
    UPDATE public.profiles SET student_id = candidate WHERE id = r.id;
  END LOOP;
END $$;
