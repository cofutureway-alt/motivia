import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Loader2, Package, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSignedThumbnail } from "@/hooks/use-signed-thumbnail";

interface CourseOpt {
  id: string;
  title: string;
}

const MAX_MB = 3;
const ALLOWED = ["image/png", "image/jpeg", "image/webp"];

const emptyForm = () => ({
  title: "",
  description: "",
  cover_image_url: "" as string | null,
  status: "draft",
  is_paid: true,
  is_featured: false,
  price_egp: "",
  discount_egp: "",
  discount_expires_at: "",
  course_ids: [] as string[],
});

export default function AdminBundleEditor() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { id: routeId } = useParams<{ id: string }>();
  const isEdit = !!routeId && routeId !== "new";
  const isInstructor = profile?.role === "instructor";
  const backTo = isInstructor ? "/instructor/bundles" : "/admin/bundles";

  const [courses, setCourses] = useState<CourseOpt[]>([]);
  const [form, setForm] = useState(emptyForm());
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const existingSigned = useSignedThumbnail(form.cover_image_url ?? null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      // Instructor scope: bundle picker limited to own courses; ownership enforced on edit
      const { data: c } = await (supabase as any)
        .from("courses")
        .select("id, title, created_by")
        .order("title");
      setCourses(
        ((c as CourseOpt[]) ?? []).filter((x) =>
          isInstructor ? (x as any).created_by === user?.id : true
        ) as CourseOpt[]
      );

      if (isEdit) {
        const { data: b, error } = await (supabase as any)
          .from("bundles")
          .select(
            "title, description, cover_image_url, status, is_paid, is_featured, price_piastres, discount_price_piastres, discount_expires_at, created_by, bundle_courses(course_id)"
          )
          .eq("id", routeId)
          .maybeSingle();
        if (error || !b) {
          toast.error("تعذّر تحميل الباقة");
          navigate(backTo);
          return;
        }
        if (isInstructor && (b as any).created_by && (b as any).created_by !== user?.id) {
          toast.error("لا تملك صلاحية تعديل هذه الباقة");
          navigate(backTo);
          return;
        }
        setForm({
          title: b.title,
          description: b.description ?? "",
          cover_image_url: b.cover_image_url ?? null,
          status: b.status,
          is_paid: !!b.is_paid,
          is_featured: !!b.is_featured,
          price_egp: b.price_piastres != null ? String(b.price_piastres / 100) : "",
          discount_egp:
            b.discount_price_piastres != null
              ? String(b.discount_price_piastres / 100)
              : "",
          discount_expires_at: b.discount_expires_at
            ? b.discount_expires_at.slice(0, 16)
            : "",
          course_ids: (b.bundle_courses ?? []).map((x: any) => x.course_id),
        });
      }
      setLoading(false);
    })();
  }, [routeId, isEdit, navigate]);

  const displayPreview = useMemo(() => {
    if (preview) return preview;
    if (existingSigned) return existingSigned;
    return null;
  }, [preview, existingSigned]);

  const handleFile = (f: File | undefined | null) => {
    if (!f) return;
    if (!ALLOWED.includes(f.type)) {
      toast.error("صيغة الصورة غير مدعومة. اختر PNG أو JPG أو WEBP");
      return;
    }
    if (f.size > MAX_MB * 1024 * 1024) {
      toast.error(`حجم الصورة يجب أن يكون أقل من ${MAX_MB} ميغابايت`);
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const clearImage = () => {
    setFile(null);
    setPreview(null);
    setForm((f) => ({ ...f, cover_image_url: null }));
  };

  const filteredCourses = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return courses;
    return courses.filter((c) => c.title.toLowerCase().includes(q));
  }, [courses, search]);

  const save = async () => {
    if (!form.title.trim()) {
      toast.error("عنوان الباقة مطلوب");
      return;
    }
    if (form.course_ids.length < 2) {
      toast.error("اختر دورتين على الأقل");
      return;
    }
    if (isInstructor) {
      const allowedIds = new Set(courses.map((course) => course.id));
      if (form.course_ids.some((courseId) => !allowedIds.has(courseId))) {
        toast.error("يمكنك إضافة كورساتك فقط إلى باقتك");
        return;
      }
    }
    const price =
      form.is_paid && form.price_egp
        ? Math.round(parseFloat(form.price_egp) * 100)
        : null;
    const discount =
      form.is_paid && form.discount_egp
        ? Math.round(parseFloat(form.discount_egp) * 100)
        : null;
    if (form.is_paid && (price == null || price <= 0)) {
      toast.error("سعر الباقة غير صالح");
      return;
    }

    setSaving(true);
    try {
      let coverPath: string | null = form.cover_image_url ?? null;

      if (file) {
        const ext = file.name.split(".").pop() || "jpg";
        const path = `${isInstructor ? `${user?.id}/` : ""}bundles/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("thumbnails")
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) throw upErr;
        if (isEdit && form.cover_image_url) {
          await supabase.storage.from("thumbnails").remove([form.cover_image_url]);
        }
        coverPath = path;
      } else if (isEdit && !form.cover_image_url) {
        // user cleared image
        coverPath = null;
      }

      const payload: any = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        cover_image_url: coverPath,
        status: form.status,
        is_paid: form.is_paid,
        is_featured: form.is_featured,
        price_piastres: price,
        discount_price_piastres: discount,
        discount_expires_at: form.discount_expires_at
          ? new Date(form.discount_expires_at).toISOString()
          : null,
      };

      let bundleId = isEdit ? (routeId as string) : "";
      if (isEdit) {
        const { error } = await (supabase as any)
          .from("bundles")
          .update(payload)
          .eq("id", bundleId);
        if (error) throw error;
        await (supabase as any).from("bundle_courses").delete().eq("bundle_id", bundleId);
      } else {
        payload.created_by = user?.id ?? null;
        const { data, error } = await (supabase as any)
          .from("bundles")
          .insert(payload)
          .select("id")
          .single();
        if (error || !data) throw error ?? new Error("تعذّر إنشاء الباقة");
        bundleId = data.id;
      }

      const rows = form.course_ids.map((cid, i) => ({
        bundle_id: bundleId,
        course_id: cid,
        position: i,
      }));
      if (rows.length) {
        const { error: bcErr } = await (supabase as any)
          .from("bundle_courses")
          .insert(rows);
        if (bcErr) throw bcErr;
      }

      toast.success(isEdit ? "تم تحديث الباقة" : "تم إنشاء الباقة");
      navigate(backTo);
    } catch (e: any) {
      toast.error(e?.message || "حدث خطأ أثناء الحفظ");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto py-24 text-center text-muted-foreground" dir="rtl">
        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-3" />
        جارٍ التحميل…
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(backTo)}>
            <ArrowRight className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
              <Package className="w-7 h-7 text-primary" />
              {isEdit ? "تعديل الباقة" : "باقة جديدة"}
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              اجمع عدة دورات في باقة واحدة بسعر مميز
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate(backTo)} disabled={saving}>
            إلغاء
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 ml-2 animate-spin" />}
            {isEdit ? "حفظ التغييرات" : "إنشاء الباقة"}
          </Button>
        </div>
      </div>

      <Card className="p-6 space-y-5">
        <div>
          <Label>العنوان *</Label>
          <Input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            maxLength={200}
            placeholder="مثال: باقة الرياضيات الشاملة"
          />
        </div>

        <div>
          <Label>الوصف</Label>
          <Textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={3}
            placeholder="اكتب وصفًا موجزًا عن الباقة"
          />
        </div>

        <div>
          <Label>صورة الغلاف</Label>
          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              handleFile(e.dataTransfer.files?.[0]);
            }}
            className="relative overflow-hidden rounded-xl border-2 border-dashed border-border hover:border-primary/60 transition-colors cursor-pointer aspect-video bg-accent/40 flex items-center justify-center mt-2"
          >
            <AnimatePresence mode="wait">
              {displayPreview ? (
                <motion.div
                  key="preview"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0"
                >
                  <img
                    src={displayPreview}
                    alt="preview"
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      clearImage();
                    }}
                    className="absolute top-2 left-2 bg-background/90 hover:bg-background text-foreground rounded-full p-1.5 shadow"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </motion.div>
              ) : (
                <motion.div
                  key="placeholder"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center gap-2 text-muted-foreground"
                >
                  <div className="w-12 h-12 rounded-full bg-background flex items-center justify-center">
                    <Upload className="w-5 h-5" />
                  </div>
                  <p className="text-sm font-medium">اسحب الصورة أو انقر للرفع</p>
                  <p className="text-xs">PNG / JPG / WEBP — حتى {MAX_MB}MB</p>
                </motion.div>
              )}
            </AnimatePresence>
            <input
              ref={inputRef}
              type="file"
              accept={ALLOWED.join(",")}
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>الحالة</Label>
            <Select
              value={form.status}
              onValueChange={(v) => setForm({ ...form, status: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">مسودة</SelectItem>
                <SelectItem value="published">منشورة</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between border rounded-lg px-3">
            <Label className="cursor-pointer">مدفوعة</Label>
            <Switch
              checked={form.is_paid}
              onCheckedChange={(v) => setForm({ ...form, is_paid: v })}
            />
          </div>
        </div>

        {form.is_paid && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>السعر (ج.م) *</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={form.price_egp}
                onChange={(e) => setForm({ ...form, price_egp: e.target.value })}
              />
            </div>
            <div>
              <Label>سعر الخصم (ج.م)</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={form.discount_egp}
                onChange={(e) => setForm({ ...form, discount_egp: e.target.value })}
              />
            </div>
            <div className="md:col-span-2">
              <Label>انتهاء الخصم</Label>
              <Input
                type="datetime-local"
                value={form.discount_expires_at}
                onChange={(e) =>
                  setForm({ ...form, discount_expires_at: e.target.value })
                }
              />
            </div>
          </div>
        )}

        <div className="flex items-center justify-between border rounded-lg px-3 py-2">
          <Label className="cursor-pointer">عرض في القسم المميز بالصفحة الرئيسية</Label>
          <Switch
            checked={form.is_featured}
            onCheckedChange={(v) => setForm({ ...form, is_featured: v })}
          />
        </div>

        <div>
          <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
            <Label>الدورات داخل الباقة * (دورتان على الأقل)</Label>
            <span className="text-xs text-muted-foreground">
              محدد: {form.course_ids.length}
            </span>
          </div>
          <Input
            placeholder="ابحث عن دورة…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mb-2"
          />
          <div className="max-h-72 overflow-y-auto border rounded-lg p-2 space-y-1">
            {filteredCourses.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-6">
                لا توجد دورات مطابقة
              </div>
            ) : (
              filteredCourses.map((c) => {
                const checked = form.course_ids.includes(c.id);
                return (
                  <label
                    key={c.id}
                    className="flex items-center gap-2 cursor-pointer hover:bg-accent rounded p-2"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) => {
                        setForm({
                          ...form,
                          course_ids: v
                            ? [...form.course_ids, c.id]
                            : form.course_ids.filter((x) => x !== c.id),
                        });
                      }}
                    />
                    <span className="text-sm">{c.title}</span>
                  </label>
                );
              })
            )}
          </div>
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => navigate(backTo)} disabled={saving}>
          إلغاء
        </Button>
        <Button onClick={save} disabled={saving}>
          {saving && <Loader2 className="w-4 h-4 ml-2 animate-spin" />}
          {isEdit ? "حفظ التغييرات" : "إنشاء الباقة"}
        </Button>
      </div>
    </div>
  );
}
