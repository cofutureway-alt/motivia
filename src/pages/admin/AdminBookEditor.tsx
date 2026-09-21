import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  BookOpen,
  Cloud,
  FileUp,
  GripVertical,
  Loader2,
  Package,
  Plus,
  Upload,
  X,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { getInstructorSelf, type InstructorSelf } from "@/lib/instructor-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useSignedUrl } from "@/hooks/use-signed-url";

const MAX_IMG_MB = 3;
const MAX_FILE_MB = 50;
const IMG_TYPES = ["image/png", "image/jpeg", "image/webp"];
const DOC_TYPES = ["application/pdf", "application/epub+zip"];

type BookType = "digital" | "physical";
type Status = "draft" | "published";

interface Opt { id: string; name: string }

interface FormShape {
  title: string;
  description: string;
  author: string;
  publisher: string;
  publication_year: string;
  isbn: string;
  language: string;
  subject_id: string;
  stage_id: string;
  stage_ids: string[];
  subject_ids: string[];
  tags: string[];
  book_type: BookType;
  price_egp: string;
  discount_egp: string;
  discount_expires_at: string;
  cover_image_url: string | null;
  status: Status;
  // digital
  digital_file_url: string | null;
  download_limit: string;
  unlimited_downloads: boolean;
  is_drm_protected: boolean;
  // physical
  stock_quantity: string;
  weight_grams: string;
  length_cm: string;
  width_cm: string;
  height_cm: string;
}

interface ExistingImage { id: string; image_url: string; order_index: number }

const emptyForm = (): FormShape => ({
  title: "",
  description: "",
  author: "",
  publisher: "",
  publication_year: "",
  isbn: "",
  language: "ar",
  subject_id: "",
  stage_id: "",
  stage_ids: [],
  subject_ids: [],
  tags: [],
  book_type: "digital",
  price_egp: "",
  discount_egp: "",
  discount_expires_at: "",
  cover_image_url: null,
  status: "draft",
  digital_file_url: null,
  download_limit: "",
  unlimited_downloads: true,
  is_drm_protected: true,
  stock_quantity: "",
  weight_grams: "",
  length_cm: "",
  width_cm: "",
  height_cm: "",
});

const CoverPreview = ({
  file,
  path,
}: {
  file: File | null;
  path: string | null;
}) => {
  const signed = useSignedUrl("book-assets", path);
  const src = file ? URL.createObjectURL(file) : signed;
  return src ? (
    <img src={src} alt="cover" className="w-full h-full object-cover" />
  ) : null;
};

const ImageRow = ({
  img,
  onRemove,
  drag,
  onDragOver,
  onDrop,
}: {
  img: ExistingImage;
  onRemove: () => void;
  drag: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
}) => {
  const signed = useSignedUrl("book-assets", img.image_url);
  return (
    <div
      draggable
      onDragStart={drag}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className="flex items-center gap-3 rounded-lg border border-border bg-card p-2"
    >
      <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab" />
      <div className="w-14 h-14 rounded overflow-hidden bg-accent">
        {signed && <img src={signed} className="w-full h-full object-cover" alt="" />}
      </div>
      <div className="flex-1 text-xs text-muted-foreground truncate">
        {img.image_url.split("/").pop()}
      </div>
      <Button variant="ghost" size="icon" onClick={onRemove}>
        <X className="w-4 h-4 text-destructive" />
      </Button>
    </div>
  );
};

export default function AdminBookEditor() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { id: routeId } = useParams<{ id: string }>();
  const isEdit = !!routeId && routeId !== "new";
  const isInstructor = profile?.role === "instructor";
  const backTo = isInstructor ? "/instructor/books" : "/admin/books";
  const [instructorSelf, setInstructorSelf] = useState<InstructorSelf | null>(null);

  const [form, setForm] = useState<FormShape>(emptyForm());
  const [subjects, setSubjects] = useState<Opt[]>([]);
  const [stages, setStages] = useState<Opt[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [digitalFile, setDigitalFile] = useState<File | null>(null);
  const [existingImages, setExistingImages] = useState<ExistingImage[]>([]);
  const [newImages, setNewImages] = useState<File[]>([]);
  const [tagInput, setTagInput] = useState("");
  const coverRef = useRef<HTMLInputElement>(null);
  const digitalRef = useRef<HTMLInputElement>(null);
  const extraRef = useRef<HTMLInputElement>(null);
  const dragIndex = useRef<number | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: subs }, { data: stgs }] = await Promise.all([
        (supabase as any).from("subjects").select("id,name").order("name"),
        (supabase as any).from("stages").select("id,name").order("name"),
      ]);
      setSubjects((subs as Opt[]) ?? []);
      setStages((stgs as Opt[]) ?? []);
      // Instructor scope: filter taxonomy pickers to own materials/stages
      if (isInstructor) {
        let fetched = instructorSelf;
        try {
          fetched = await getInstructorSelf();
          setInstructorSelf(fetched);
        } catch {
          fetched = null;
        }
        setSubjects((prev) =>
          prev.filter((s) => fetched?.subjects.some((x) => x.id === s.id))
        );
        setStages((prev) =>
          prev.filter((s) => fetched?.stages.some((x) => x.id === s.id))
        );
      }
      if (isEdit) {
        const { data: b, error } = await (supabase as any)
          .from("books")
          .select("*, book_images(id,image_url,order_index)")
          .eq("id", routeId)
          .maybeSingle();
        if (error || !b) {
          toast.error("تعذّر تحميل الكتاب");
          navigate(backTo);
          return;
        }
        // Instructor scope: may only edit own books
        if (isInstructor && (b as any).created_by && (b as any).created_by !== user?.id) {
          toast.error("لا تملك صلاحية تعديل هذا الكتاب");
          navigate(backTo);
          return;
        }
        const sIds = b.stage_ids && b.stage_ids.length > 0 ? b.stage_ids : (b.stage_id ? [b.stage_id] : []);
        const subIds = b.subject_ids && b.subject_ids.length > 0 ? b.subject_ids : (b.subject_id ? [b.subject_id] : []);
        setForm({
          title: b.title,
          description: b.description ?? "",
          author: b.author ?? "",
          publisher: b.publisher ?? "",
          publication_year: b.publication_year ? String(b.publication_year) : "",
          isbn: b.isbn ?? "",
          language: b.language ?? "ar",
          subject_id: b.subject_id ?? "",
          stage_id: b.stage_id ?? "",
          stage_ids: sIds,
          subject_ids: subIds,
          tags: b.tags ?? [],
          book_type: b.book_type,
          price_egp: b.price_piastres ? String(b.price_piastres / 100) : "",
          discount_egp: b.discount_price_piastres != null ? String(b.discount_price_piastres / 100) : "",
          discount_expires_at: b.discount_expires_at ? b.discount_expires_at.slice(0, 16) : "",
          cover_image_url: b.cover_image_url ?? null,
          status: b.status,
          digital_file_url: b.digital_file_url ?? null,
          download_limit: b.download_limit != null ? String(b.download_limit) : "",
          unlimited_downloads: b.download_limit == null,
          is_drm_protected: b.is_drm_protected ?? true,
          stock_quantity: b.stock_quantity != null ? String(b.stock_quantity) : "",
          weight_grams: b.weight_grams != null ? String(b.weight_grams) : "",
          length_cm: b.length_cm != null ? String(b.length_cm) : "",
          width_cm: b.width_cm != null ? String(b.width_cm) : "",
          height_cm: b.height_cm != null ? String(b.height_cm) : "",
        });
        const imgs = ((b.book_images as ExistingImage[]) ?? []).sort(
          (a, b) => a.order_index - b.order_index
        );
        setExistingImages(imgs);
      }
      setLoading(false);
    })();
  }, [routeId, isEdit, navigate]);

  const handleCoverPick = (f: File | undefined | null) => {
    if (!f) return;
    if (!IMG_TYPES.includes(f.type)) return toast.error("صيغة صورة غير مدعومة");
    if (f.size > MAX_IMG_MB * 1024 * 1024)
      return toast.error(`الحد الأقصى ${MAX_IMG_MB}MB`);
    setCoverFile(f);
  };

  const handleDigitalPick = (f: File | undefined | null) => {
    if (!f) return;
    if (!DOC_TYPES.includes(f.type)) return toast.error("يجب أن يكون الملف PDF أو EPUB");
    if (f.size > MAX_FILE_MB * 1024 * 1024)
      return toast.error(`الحد الأقصى ${MAX_FILE_MB}MB`);
    setDigitalFile(f);
  };

  const handleExtraImages = (files: FileList | null) => {
    if (!files) return;
    const arr: File[] = [];
    for (const f of Array.from(files)) {
      if (!IMG_TYPES.includes(f.type)) {
        toast.error(`${f.name}: صيغة غير مدعومة`);
        continue;
      }
      if (f.size > MAX_IMG_MB * 1024 * 1024) {
        toast.error(`${f.name}: تجاوز الحد`);
        continue;
      }
      arr.push(f);
    }
    setNewImages((cur) => [...cur, ...arr]);
  };

  const addTag = () => {
    const v = tagInput.trim();
    if (!v) return;
    if (!form.tags.includes(v)) setForm({ ...form, tags: [...form.tags, v] });
    setTagInput("");
  };

  const uploadTo = async (folder: string, file: File) => {
    const ext = file.name.split(".").pop() || "bin";
    const path = `${isInstructor ? `${user?.id}/` : ""}${folder}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage
      .from("book-assets")
      .upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw error;
    return path;
  };

  const validate = (): string | null => {
    if (!form.title.trim()) return "العنوان مطلوب";
    const price = parseFloat(form.price_egp);
    if (!Number.isFinite(price) || price <= 0) return "السعر يجب أن يكون أكبر من صفر";
    if (form.discount_egp) {
      const d = parseFloat(form.discount_egp);
      if (!Number.isFinite(d) || d < 0) return "قيمة الخصم غير صالحة";
      if (d >= price) return "سعر الخصم يجب أن يكون أقل من السعر الأصلي";
    }
    if (form.book_type === "digital") {
      if (!isEdit && !digitalFile && !form.digital_file_url)
        return "يجب رفع ملف الكتاب الرقمي";
      if (!form.unlimited_downloads) {
        const n = parseInt(form.download_limit, 10);
        if (!Number.isFinite(n) || n < 1) return "حد التنزيل غير صالح";
      }
    } else {
      if (form.stock_quantity && parseInt(form.stock_quantity, 10) < 0)
        return "المخزون لا يمكن أن يكون سالباً";
    }
    return null;
  };

  const save = async () => {
    const err = validate();
    if (err) return toast.error(err);
    setSaving(true);
    try {
      let coverPath = form.cover_image_url;
      if (coverFile) {
        coverPath = await uploadTo("covers", coverFile);
        if (isEdit && form.cover_image_url) {
          await supabase.storage.from("book-assets").remove([form.cover_image_url]);
        }
      }
      let digitalPath = form.digital_file_url;
      if (form.book_type === "digital" && digitalFile) {
        digitalPath = await uploadTo("files", digitalFile);
        if (isEdit && form.digital_file_url) {
          await supabase.storage.from("book-assets").remove([form.digital_file_url]);
        }
      }

      const price = Math.round(parseFloat(form.price_egp) * 100);
      const discount = form.discount_egp
        ? Math.round(parseFloat(form.discount_egp) * 100)
        : null;

      const payload: any = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        author: form.author.trim() || null,
        publisher: form.publisher.trim() || null,
        publication_year: form.publication_year ? parseInt(form.publication_year, 10) : null,
        isbn: form.isbn.trim() || null,
        language: form.language || "ar",
        subject_id: form.subject_ids.length > 0 ? form.subject_ids[0] : null,
        stage_id: form.stage_ids.length > 0 ? form.stage_ids[0] : null,
        subject_ids: form.subject_ids,
        stage_ids: form.stage_ids,
        tags: form.tags.length ? form.tags : null,
        book_type: form.book_type,
        price_piastres: price,
        discount_price_piastres: discount,
        discount_expires_at: form.discount_expires_at
          ? new Date(form.discount_expires_at).toISOString()
          : null,
        cover_image_url: coverPath,
        status: form.status,
        digital_file_url: form.book_type === "digital" ? digitalPath : null,
        download_limit:
          form.book_type === "digital" && !form.unlimited_downloads
            ? parseInt(form.download_limit, 10)
            : null,
        is_drm_protected: form.book_type === "digital" ? form.is_drm_protected : true,
        stock_quantity:
          form.book_type === "physical" && form.stock_quantity
            ? parseInt(form.stock_quantity, 10)
            : form.book_type === "physical"
              ? 0
              : null,
        weight_grams:
          form.book_type === "physical" && form.weight_grams
            ? parseInt(form.weight_grams, 10)
            : null,
        length_cm:
          form.book_type === "physical" && form.length_cm ? parseFloat(form.length_cm) : null,
        width_cm:
          form.book_type === "physical" && form.width_cm ? parseFloat(form.width_cm) : null,
        height_cm:
          form.book_type === "physical" && form.height_cm ? parseFloat(form.height_cm) : null,
      };

      let bookId = isEdit ? (routeId as string) : "";
      if (isEdit) {
        const { error } = await (supabase as any)
          .from("books")
          .update(payload)
          .eq("id", bookId);
        if (error) throw error;
      } else {
        payload.created_by = user?.id ?? null;
        const { data, error } = await (supabase as any)
          .from("books")
          .insert(payload)
          .select("id")
          .single();
        if (error || !data) throw error ?? new Error("تعذّر إنشاء الكتاب");
        bookId = data.id;
      }

      // Handle extra images (physical)
      if (form.book_type === "physical") {
        // Uploads first
        const uploadedPaths: string[] = [];
        for (const f of newImages) {
          const p = await uploadTo(`extras/${bookId}`, f);
          uploadedPaths.push(p);
        }
        // Reset order: reindex existing then append new
        const reindexed = existingImages.map((img, i) => ({
          id: img.id,
          order_index: i,
        }));
        for (const r of reindexed) {
          await (supabase as any)
            .from("book_images")
            .update({ order_index: r.order_index })
            .eq("id", r.id);
        }
        if (uploadedPaths.length) {
          const startIndex = existingImages.length;
          const rows = uploadedPaths.map((p, i) => ({
            book_id: bookId,
            image_url: p,
            order_index: startIndex + i,
          }));
          await (supabase as any).from("book_images").insert(rows);
        }
      }

      toast.success(isEdit ? "تم تحديث الكتاب" : "تم إنشاء الكتاب");
      navigate(backTo);
    } catch (e: any) {
      toast.error(e?.message || "حدث خطأ أثناء الحفظ");
    } finally {
      setSaving(false);
    }
  };

  const removeExistingImage = async (img: ExistingImage) => {
    setExistingImages((cur) => cur.filter((x) => x.id !== img.id));
    await (supabase as any).from("book_images").delete().eq("id", img.id);
    await supabase.storage.from("book-assets").remove([img.image_url]);
  };

  const reorderExisting = (from: number, to: number) => {
    if (from === to) return;
    setExistingImages((cur) => {
      const copy = [...cur];
      const [item] = copy.splice(from, 1);
      copy.splice(to, 0, item);
      return copy;
    });
  };

  const digitalFileName = useMemo(() => {
    if (digitalFile) return digitalFile.name;
    if (form.digital_file_url) return form.digital_file_url.split("/").pop();
    return null;
  }, [digitalFile, form.digital_file_url]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto py-24 text-center text-muted-foreground" dir="rtl">
        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-3" />
        جارٍ التحميل…
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(backTo)}>
            <ArrowRight className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
              <BookOpen className="w-7 h-7 text-primary" />
              {isEdit ? "تعديل الكتاب" : "كتاب جديد"}
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              أضف بيانات الكتاب وحدد نوعه (رقمي / قابل للشحن)
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate(backTo)} disabled={saving}>
            إلغاء
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 ml-2 animate-spin" />}
            {isEdit ? "حفظ التغييرات" : "إنشاء الكتاب"}
          </Button>
        </div>
      </div>

      {/* Basic info */}
      <Card className="p-6 space-y-5">
        <div className="text-lg font-bold">المعلومات الأساسية</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <Label>العنوان *</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              maxLength={250}
            />
          </div>
          <div className="md:col-span-2">
            <Label>الوصف</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={4}
              placeholder="يدعم Markdown"
            />
          </div>
          <div>
            <Label>المؤلف</Label>
            <Input value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })} />
          </div>
          <div>
            <Label>الناشر</Label>
            <Input value={form.publisher} onChange={(e) => setForm({ ...form, publisher: e.target.value })} />
          </div>
          <div>
            <Label>سنة النشر</Label>
            <Input
              type="number"
              value={form.publication_year}
              onChange={(e) => setForm({ ...form, publication_year: e.target.value })}
            />
          </div>
          <div>
            <Label>ISBN</Label>
            <Input value={form.isbn} onChange={(e) => setForm({ ...form, isbn: e.target.value })} />
          </div>
          <div>
            <Label>اللغة</Label>
            <Select value={form.language} onValueChange={(v) => setForm({ ...form, language: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ar">العربية</SelectItem>
                <SelectItem value="en">الإنجليزية</SelectItem>
                <SelectItem value="fr">الفرنسية</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2 space-y-2">
            <Label className="flex items-center justify-between">
              <span>المواد الدراسية (يمكن اختيار أكثر من مادة)</span>
              <span className="text-xs text-muted-foreground">{form.subject_ids.length} مواد مختارة</span>
            </Label>
            <div className="flex flex-wrap gap-2 p-3 rounded-lg border border-border bg-card">
              {subjects.map((s) => {
                const selected = form.subject_ids.includes(s.id);
                return (
                  <Badge
                    key={s.id}
                    variant={selected ? "default" : "outline"}
                    className={`cursor-pointer gap-1.5 py-1.5 px-3 transition-all ${
                      selected ? "bg-primary text-primary-foreground shadow-sm" : "hover:bg-accent"
                    }`}
                    onClick={() => {
                      const next = selected
                        ? form.subject_ids.filter((x) => x !== s.id)
                        : [...form.subject_ids, s.id];
                      setForm({
                        ...form,
                        subject_ids: next,
                        subject_id: next.length > 0 ? next[0] : "",
                      });
                    }}
                  >
                    {selected && <Check className="w-3.5 h-3.5" />}
                    {s.name}
                  </Badge>
                );
              })}
            </div>
          </div>

          <div className="md:col-span-2 space-y-2">
            <Label className="flex items-center justify-between">
              <span>المراحل الدراسية (يمكن اختيار أكثر من مرحلة)</span>
              <span className="text-xs text-muted-foreground">{form.stage_ids.length} مراحل مختارة</span>
            </Label>
            <div className="flex flex-wrap gap-2 p-3 rounded-lg border border-border bg-card">
              {stages.map((s) => {
                const selected = form.stage_ids.includes(s.id);
                return (
                  <Badge
                    key={s.id}
                    variant={selected ? "default" : "outline"}
                    className={`cursor-pointer gap-1.5 py-1.5 px-3 transition-all ${
                      selected ? "bg-primary text-primary-foreground shadow-sm" : "hover:bg-accent"
                    }`}
                    onClick={() => {
                      const next = selected
                        ? form.stage_ids.filter((x) => x !== s.id)
                        : [...form.stage_ids, s.id];
                      setForm({
                        ...form,
                        stage_ids: next,
                        stage_id: next.length > 0 ? next[0] : "",
                      });
                    }}
                  >
                    {selected && <Check className="w-3.5 h-3.5" />}
                    {s.name}
                  </Badge>
                );
              })}
            </div>
          </div>
          <div className="md:col-span-2">
            <Label>الوسوم (Tags)</Label>
            <div className="flex gap-2 mt-1">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag();
                  }
                }}
                placeholder="أضف وسم واضغط Enter"
              />
              <Button type="button" variant="outline" onClick={addTag}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            {form.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {form.tags.map((t) => (
                  <Badge key={t} variant="secondary" className="gap-1">
                    {t}
                    <button
                      onClick={() =>
                        setForm({ ...form, tags: form.tags.filter((x) => x !== t) })
                      }
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
          <div className="md:col-span-2">
            <Label>صورة الغلاف</Label>
            <div
              onClick={() => coverRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleCoverPick(e.dataTransfer.files?.[0]);
              }}
              className="relative overflow-hidden rounded-xl border-2 border-dashed border-border hover:border-primary/60 transition-colors cursor-pointer aspect-[3/2] bg-accent/40 flex items-center justify-center mt-2"
            >
              {coverFile || form.cover_image_url ? (
                <>
                  <CoverPreview file={coverFile} path={form.cover_image_url} />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCoverFile(null);
                      setForm({ ...form, cover_image_url: null });
                    }}
                    className="absolute top-2 left-2 bg-background/90 hover:bg-background rounded-full p-1.5 shadow"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <div className="w-12 h-12 rounded-full bg-background flex items-center justify-center">
                    <Upload className="w-5 h-5" />
                  </div>
                  <p className="text-sm font-medium">اسحب الصورة أو انقر للرفع</p>
                  <p className="text-xs">PNG / JPG / WEBP — حتى {MAX_IMG_MB}MB</p>
                </div>
              )}
              <input
                ref={coverRef}
                type="file"
                accept={IMG_TYPES.join(",")}
                className="hidden"
                onChange={(e) => handleCoverPick(e.target.files?.[0])}
              />
            </div>
          </div>
        </div>
      </Card>

      {/* Pricing */}
      <Card className="p-6 space-y-4">
        <div className="text-lg font-bold">التسعير</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
              placeholder="اختياري"
            />
          </div>
          <div>
            <Label>انتهاء الخصم</Label>
            <Input
              type="datetime-local"
              disabled={!form.discount_egp}
              value={form.discount_expires_at}
              onChange={(e) => setForm({ ...form, discount_expires_at: e.target.value })}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          سعر الخصم يجب أن يكون أقل من السعر الأصلي. إن لم تُحدد تاريخ الانتهاء فسيبقى الخصم فعّالاً.
        </p>
      </Card>

      {/* Type selector */}
      <Card className="p-6 space-y-5">
        <div className="text-lg font-bold">نوع الكتاب</div>
        <RadioGroup
          value={form.book_type}
          onValueChange={(v) => setForm({ ...form, book_type: v as BookType })}
          className="grid grid-cols-1 md:grid-cols-2 gap-3"
        >
          <label
            className={`flex items-center gap-3 border-2 rounded-xl p-4 cursor-pointer transition-colors ${
              form.book_type === "digital" ? "border-primary bg-primary/5" : "border-border"
            }`}
          >
            <RadioGroupItem value="digital" />
            <Cloud className="w-5 h-5 text-primary" />
            <div>
              <div className="font-semibold">رقمي</div>
              <div className="text-xs text-muted-foreground">PDF / EPUB مع قراءة داخل المنصة</div>
            </div>
          </label>
          <label
            className={`flex items-center gap-3 border-2 rounded-xl p-4 cursor-pointer transition-colors ${
              form.book_type === "physical" ? "border-primary bg-primary/5" : "border-border"
            }`}
          >
            <RadioGroupItem value="physical" />
            <Package className="w-5 h-5 text-primary" />
            <div>
              <div className="font-semibold">قابل للشحن</div>
              <div className="text-xs text-muted-foreground">مطبوع مع مخزون ووزن وشحن</div>
            </div>
          </label>
        </RadioGroup>

        <AnimatePresence mode="wait">
          {form.book_type === "digital" ? (
            <motion.div
              key="digital"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25 }}
              className="space-y-4"
            >
              <div>
                <Label>ملف الكتاب (PDF / EPUB) *</Label>
                <div
                  onClick={() => digitalRef.current?.click()}
                  className="mt-1 rounded-xl border-2 border-dashed border-border hover:border-primary/60 cursor-pointer p-4 flex items-center gap-3"
                >
                  <FileUp className="w-5 h-5 text-primary" />
                  <div className="flex-1 text-sm">
                    {digitalFileName ? (
                      <span className="font-medium">{digitalFileName}</span>
                    ) : (
                      <span className="text-muted-foreground">اضغط لاختيار الملف — حتى {MAX_FILE_MB}MB</span>
                    )}
                  </div>
                  {(digitalFile || form.digital_file_url) && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDigitalFile(null);
                        setForm({ ...form, digital_file_url: null });
                      }}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                  <input
                    ref={digitalRef}
                    type="file"
                    accept=".pdf,.epub,application/pdf,application/epub+zip"
                    className="hidden"
                    onChange={(e) => handleDigitalPick(e.target.files?.[0])}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border rounded-lg p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="cursor-pointer">تنزيلات غير محدودة</Label>
                    <Switch
                      checked={form.unlimited_downloads}
                      onCheckedChange={(v) =>
                        setForm({ ...form, unlimited_downloads: v, download_limit: v ? "" : form.download_limit })
                      }
                    />
                  </div>
                  {!form.unlimited_downloads && (
                    <div>
                      <Label>حد التنزيل لكل مشترٍ</Label>
                      <Input
                        type="number"
                        min={1}
                        value={form.download_limit}
                        onChange={(e) => setForm({ ...form, download_limit: e.target.value })}
                      />
                    </div>
                  )}
                </div>
                <div className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="cursor-pointer">حماية DRM</Label>
                    <Switch
                      checked={form.is_drm_protected}
                      onCheckedChange={(v) => setForm({ ...form, is_drm_protected: v })}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    عند التفعيل، يُقرأ الكتاب داخل عارض محمي (علامة مائية، بدون نسخ أو طباعة). يُطبَّق عند بناء تجربة القراءة في مرحلة لاحقة.
                  </p>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="physical"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25 }}
              className="space-y-4"
            >
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <Label>الكمية بالمخزون</Label>
                  <Input
                    type="number"
                    min={0}
                    value={form.stock_quantity}
                    onChange={(e) => setForm({ ...form, stock_quantity: e.target.value })}
                  />
                </div>
                <div>
                  <Label>الوزن (جم)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={form.weight_grams}
                    onChange={(e) => setForm({ ...form, weight_grams: e.target.value })}
                  />
                </div>
                <div className="col-span-2 md:col-span-2">
                  <Label>الأبعاد (سم)</Label>
                  <div className="grid grid-cols-3 gap-2">
                    <Input
                      type="number"
                      min={0}
                      step="0.1"
                      placeholder="طول"
                      value={form.length_cm}
                      onChange={(e) => setForm({ ...form, length_cm: e.target.value })}
                    />
                    <Input
                      type="number"
                      min={0}
                      step="0.1"
                      placeholder="عرض"
                      value={form.width_cm}
                      onChange={(e) => setForm({ ...form, width_cm: e.target.value })}
                    />
                    <Input
                      type="number"
                      min={0}
                      step="0.1"
                      placeholder="ارتفاع"
                      value={form.height_cm}
                      onChange={(e) => setForm({ ...form, height_cm: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <Label>صور إضافية (داخلية / خلفية)</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => extraRef.current?.click()}
                  >
                    <Plus className="w-4 h-4 ml-1" /> إضافة
                  </Button>
                  <input
                    ref={extraRef}
                    type="file"
                    accept={IMG_TYPES.join(",")}
                    multiple
                    className="hidden"
                    onChange={(e) => handleExtraImages(e.target.files)}
                  />
                </div>
                <div className="mt-2 space-y-2">
                  {existingImages.map((img, i) => (
                    <ImageRow
                      key={img.id}
                      img={img}
                      drag={() => (dragIndex.current = i)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => {
                        if (dragIndex.current !== null) {
                          reorderExisting(dragIndex.current, i);
                          dragIndex.current = null;
                        }
                      }}
                      onRemove={() => removeExistingImage(img)}
                    />
                  ))}
                  {newImages.map((f, i) => (
                    <div
                      key={`new-${i}`}
                      className="flex items-center gap-3 rounded-lg border border-dashed border-primary/50 bg-primary/5 p-2"
                    >
                      <div className="w-14 h-14 rounded overflow-hidden bg-accent">
                        <img
                          src={URL.createObjectURL(f)}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="flex-1 text-xs truncate">{f.name}</div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          setNewImages((cur) => cur.filter((_, idx) => idx !== i))
                        }
                      >
                        <X className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                  {existingImages.length === 0 && newImages.length === 0 && (
                    <div className="text-sm text-muted-foreground text-center border border-dashed rounded-lg py-6">
                      لا توجد صور إضافية بعد
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>

      {/* Status */}
      <Card className="p-6 flex items-center justify-between">
        <div>
          <div className="font-semibold">الحالة</div>
          <p className="text-xs text-muted-foreground">
            الكتاب في وضع المسودة لا يظهر إلا للمشرفين.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm">مسودة</span>
          <Switch
            checked={form.status === "published"}
            onCheckedChange={(v) => setForm({ ...form, status: v ? "published" : "draft" })}
          />
          <span className="text-sm">منشور</span>
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => navigate(backTo)} disabled={saving}>
          إلغاء
        </Button>
        <Button onClick={save} disabled={saving}>
          {saving && <Loader2 className="w-4 h-4 ml-2 animate-spin" />}
          {isEdit ? "حفظ التغييرات" : "إنشاء الكتاب"}
        </Button>
      </div>
    </div>
  );
}
