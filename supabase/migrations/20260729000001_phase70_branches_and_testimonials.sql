-- Phase 70: Branches/Locations Page + Student Testimonials

-- 1. Create branches table
CREATE TABLE IF NOT EXISTS public.branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    governorate TEXT NOT NULL,
    branch_name TEXT NOT NULL,
    address_details TEXT NOT NULL,
    order_index INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger for updated_at on branches
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_branches_updated_at') THEN
        CREATE TRIGGER update_branches_updated_at
        BEFORE UPDATE ON public.branches
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- RLS for branches
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view active branches" ON public.branches;
CREATE POLICY "Anyone can view active branches" ON public.branches
    FOR SELECT USING (is_active = true OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can insert branches" ON public.branches;
CREATE POLICY "Admins can insert branches" ON public.branches
    FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can update branches" ON public.branches;
CREATE POLICY "Admins can update branches" ON public.branches
    FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can delete branches" ON public.branches;
CREATE POLICY "Admins can delete branches" ON public.branches
    FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

-- Seed 5 default branches if table is empty
INSERT INTO public.branches (governorate, branch_name, address_details, order_index, is_active)
SELECT 'الجيزة', 'سنتر IMA', 'الهرم، سهل حمزة، أعلى محلات اكتيف، داخل چوميرال مول', 1, true
WHERE NOT EXISTS (SELECT 1 FROM public.branches WHERE branch_name = 'سنتر IMA');

INSERT INTO public.branches (governorate, branch_name, address_details, order_index, is_active)
SELECT 'ملوي', 'سنتر نيو نيوتن', 'شارع الجمهورية، ميدان الثانوية بنات، أعلى خير زمان', 2, true
WHERE NOT EXISTS (SELECT 1 FROM public.branches WHERE branch_name = 'سنتر نيو نيوتن');

INSERT INTO public.branches (governorate, branch_name, address_details, order_index, is_active)
SELECT 'أسيوط', 'مؤسسة خطوة', 'شارع الجمهورية، بجوار صيدلية عبدين', 3, true
WHERE NOT EXISTS (SELECT 1 FROM public.branches WHERE branch_name = 'مؤسسة خطوة');

INSERT INTO public.branches (governorate, branch_name, address_details, order_index, is_active)
SELECT 'القوصية', 'سنتر زويل', 'شارع الجلاء، بجوار مقلة الزجاج، أول حارة شمال', 4, true
WHERE NOT EXISTS (SELECT 1 FROM public.branches WHERE branch_name = 'سنتر زويل');

INSERT INTO public.branches (governorate, branch_name, address_details, order_index, is_active)
SELECT 'سوهاج', 'سنتر تمكين', 'سيتي، أمام جامع أحمد ضيف الله، أول شارع يمين، برج الهنا، الدور الثاني', 5, true
WHERE NOT EXISTS (SELECT 1 FROM public.branches WHERE branch_name = 'سنتر تمكين');

-- 2. Create testimonials table
CREATE TABLE IF NOT EXISTS public.testimonials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    image_url TEXT NOT NULL,
    student_name TEXT NULL,
    order_index INTEGER NOT NULL DEFAULT 0,
    is_visible BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger for updated_at on testimonials
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_testimonials_updated_at') THEN
        CREATE TRIGGER update_testimonials_updated_at
        BEFORE UPDATE ON public.testimonials
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- RLS for testimonials
ALTER TABLE public.testimonials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view visible testimonials" ON public.testimonials;
CREATE POLICY "Anyone can view visible testimonials" ON public.testimonials
    FOR SELECT USING (is_visible = true OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can insert testimonials" ON public.testimonials;
CREATE POLICY "Admins can insert testimonials" ON public.testimonials
    FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can update testimonials" ON public.testimonials;
CREATE POLICY "Admins can update testimonials" ON public.testimonials
    FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can delete testimonials" ON public.testimonials;
CREATE POLICY "Admins can delete testimonials" ON public.testimonials
    FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

-- 3. Storage bucket setup for testimonial-images
INSERT INTO storage.buckets (id, name, public)
VALUES ('testimonial-images', 'testimonial-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read access for testimonial-images" ON storage.objects;
CREATE POLICY "Public read access for testimonial-images" ON storage.objects
    FOR SELECT USING (bucket_id = 'testimonial-images');

DROP POLICY IF EXISTS "Admin upload access for testimonial-images" ON storage.objects;
CREATE POLICY "Admin upload access for testimonial-images" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id = 'testimonial-images' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admin update access for testimonial-images" ON storage.objects;
CREATE POLICY "Admin update access for testimonial-images" ON storage.objects
    FOR UPDATE USING (bucket_id = 'testimonial-images' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admin delete access for testimonial-images" ON storage.objects;
CREATE POLICY "Admin delete access for testimonial-images" ON storage.objects
    FOR DELETE USING (bucket_id = 'testimonial-images' AND public.has_role(auth.uid(), 'admin'));

-- Seed 7 initial testimonial image records if table is empty
INSERT INTO public.testimonials (image_url, student_name, order_index, is_visible)
SELECT '/testimonials/5999141763244822460.jpg', NULL, 1, true
WHERE NOT EXISTS (SELECT 1 FROM public.testimonials WHERE image_url LIKE '%5999141763244822460.jpg');

INSERT INTO public.testimonials (image_url, student_name, order_index, is_visible)
SELECT '/testimonials/5999141763244822461.jpg', NULL, 2, true
WHERE NOT EXISTS (SELECT 1 FROM public.testimonials WHERE image_url LIKE '%5999141763244822461.jpg');

INSERT INTO public.testimonials (image_url, student_name, order_index, is_visible)
SELECT '/testimonials/5999141763244822462.jpg', NULL, 3, true
WHERE NOT EXISTS (SELECT 1 FROM public.testimonials WHERE image_url LIKE '%5999141763244822462.jpg');

INSERT INTO public.testimonials (image_url, student_name, order_index, is_visible)
SELECT '/testimonials/5999141763244822463.jpg', NULL, 4, true
WHERE NOT EXISTS (SELECT 1 FROM public.testimonials WHERE image_url LIKE '%5999141763244822463.jpg');

INSERT INTO public.testimonials (image_url, student_name, order_index, is_visible)
SELECT '/testimonials/5999141763244822464.jpg', NULL, 5, true
WHERE NOT EXISTS (SELECT 1 FROM public.testimonials WHERE image_url LIKE '%5999141763244822464.jpg');

INSERT INTO public.testimonials (image_url, student_name, order_index, is_visible)
SELECT '/testimonials/5999141763244822465.jpg', NULL, 6, true
WHERE NOT EXISTS (SELECT 1 FROM public.testimonials WHERE image_url LIKE '%5999141763244822465.jpg');

INSERT INTO public.testimonials (image_url, student_name, order_index, is_visible)
SELECT '/testimonials/5999141763244822466.jpg', NULL, 7, true
WHERE NOT EXISTS (SELECT 1 FROM public.testimonials WHERE image_url LIKE '%5999141763244822466.jpg');
