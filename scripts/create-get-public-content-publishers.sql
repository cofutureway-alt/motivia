-- ============================================================
-- إصلاح: إنشاء دالة get_public_content_publishers في قاعدة البيانات
-- ============================================================
-- لماذا؟  هذه الدالة تُستخدم لجلب اسم وصورة المعلم على بطاقات
-- الدورات والباقات والكتب. هي موجودة في مشروعك محلياً (مجلد
-- supabase/migrations/20260918121000...) لكنها غير مرفوعة إلى
-- قاعدة البيانات الحية، لذلك فشل الاستدعاء (404) واختفى اسم
-- المعلم وصورته من البطاقات.
--
-- كيف تشغّلها؟  افتح Supabase Dashboard → SQL Editor → الصق
-- كامل المحتوى أدناه → Run. (يعمل بأمان، لا يغيّر أي بيانات)
--
-- ملاحظة: استخدمنا مقارنة نصية مباشرة ('instructor','admin')
-- بدون cast على الـ enum حتى تعمل الدالة حتى لو لم يكن نوع
-- app_role موجوداً بعد في قاعدة البيانات الحية.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_public_content_publishers(_user_ids uuid[])
RETURNS TABLE (id uuid, full_name text, avatar_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.id, p.full_name, p.avatar_url
  FROM public.profiles p
  WHERE p.id = ANY(COALESCE(_user_ids, ARRAY[]::uuid[]))
    AND p.role IN ('instructor', 'admin');
$$;

GRANT EXECUTE ON FUNCTION public.get_public_content_publishers(uuid[]) TO anon, authenticated;

-- ------------------------------------------------------------
-- (اختياري) تحقق سريع: اعرض محتوى ما ستعيده الدالة
-- ------------------------------------------------------------
SELECT p.id, p.full_name, p.avatar_url, p.role
FROM public.profiles p
WHERE p.role IN ('instructor', 'admin')
ORDER BY p.full_name
LIMIT 20;
