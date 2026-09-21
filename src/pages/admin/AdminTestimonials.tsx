import { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  MessageSquare,
  Eye,
  EyeOff,
  Trash2,
  MoveUp,
  MoveDown,
  Loader2,
  Check,
  Sparkles,
  AlertTriangle,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  adminFetchTestimonials,
  uploadTestimonialImage,
  adminCreateTestimonial,
  adminUpdateTestimonial,
  adminDeleteTestimonial,
  adminReorderTestimonials,
  TestimonialRow,
} from "@/lib/testimonials-api";

export default function AdminTestimonials() {
  const [testimonials, setTestimonials] = useState<TestimonialRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Name edit tracking
  const [editingNames, setEditingNames] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  // Delete modal
  const [deleting, setDeleting] = useState<TestimonialRow | null>(null);
  const [deletePending, setDeletePending] = useState(false);

  // Lightbox preview
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await adminFetchTestimonials();
      setTestimonials(data);
      const namesMap: Record<string, string> = {};
      for (const item of data) {
        namesMap[item.id] = item.student_name || "";
      }
      setEditingNames(namesMap);
    } catch (e: any) {
      toast.error("تعذّر تحميل آراء الطلاب");
      setTestimonials([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    let successCount = 0;
    try {
      const fileList = Array.from(files);
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        try {
          const url = await uploadTestimonialImage(file);
          const nextOrder = (testimonials?.length ?? 0) + i + 1;
          await adminCreateTestimonial({
            image_url: url,
            is_visible: true,
            order_index: nextOrder,
          });
          successCount++;
        } catch (err: any) {
          toast.error(`مش عارفين نرفع صورة: ${file.name}`);
        }
      }
      if (successCount > 0) {
        toast.success(`تم رفع ${successCount} صورة رأي بنجاح`);
        load();
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleToggleVisible = async (item: TestimonialRow) => {
    try {
      const updated = !item.is_visible;
      setTestimonials((prev) =>
        prev ? prev.map((x) => (x.id === item.id ? { ...x, is_visible: updated } : x)) : null
      );
      await adminUpdateTestimonial(item.id, { is_visible: updated });
      toast.success(updated ? "تم إظهار الرأي على الموقع" : "تم إخفاء الرأي من الموقع");
    } catch (e) {
      toast.error("فشل تغيير حالة الرأي، حاول تاني");
      load();
    }
  };

  const handleSaveName = async (item: TestimonialRow) => {
    const nameVal = (editingNames[item.id] ?? "").trim();
    setSavingId(item.id);
    try {
      await adminUpdateTestimonial(item.id, { student_name: nameVal || null });
      toast.success("تم حفظ اسم الطالب بنجاح");
      load();
    } catch (e) {
      toast.error("مش عارفين نحفظ الاسم دلوقتي، حاول تاني");
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setDeletePending(true);
    try {
      await adminDeleteTestimonial(deleting.id, deleting.image_url);
      toast.success("تم حذف الرأي بنجاح");
      setDeleting(null);
      load();
    } catch (e) {
      toast.error("مش عارفين نحذف الرأي دلوقتي، حاول تاني");
    } finally {
      setDeletePending(false);
    }
  };

  const handleMove = async (index: number, direction: "up" | "down") => {
    if (!testimonials) return;
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= testimonials.length) return;

    const newArr = [...testimonials];
    const temp = newArr[index];
    newArr[index] = newArr[targetIndex];
    newArr[targetIndex] = temp;

    const reordered = newArr.map((item, idx) => ({
      ...item,
      order_index: idx + 1,
    }));
    setTestimonials(reordered);

    try {
      await adminReorderTestimonials(
        reordered.map((item) => ({ id: item.id, order_index: item.order_index }))
      );
      toast.success("تم تحديث ترتيب الآراء");
    } catch (e) {
      toast.error("فشل حفظ الترتيب، حاول تاني");
      load();
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6" dir="rtl">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row md:items-center md:justify-between gap-4"
      >
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
            <MessageSquare className="w-8 h-8 text-primary" />
            <span>آراء وانطباعات الطلاب</span>
          </h1>
          <p className="text-muted-foreground mt-1">
            ارفع صور وتقييمات الطلاب عشان تظهر في الصفحة الرئيسية للموقع.
          </p>
        </div>

        <div>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept="image/*"
            multiple
            className="hidden"
          />
          <Button
            onClick={() => fileInputRef.current?.click()}
            size="lg"
            disabled={uploading}
            className="shadow-md"
          >
            {uploading ? (
              <Loader2 className="w-4 h-4 animate-spin ml-2" />
            ) : (
              <Upload className="w-4 h-4 ml-2" />
            )}
            رفع صور آراء جديدة
          </Button>
        </div>
      </motion.div>

      {/* Grid of Testimonials */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-64 rounded-2xl" />
          ))}
        </div>
      ) : testimonials && testimonials.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          <AnimatePresence mode="popLayout">
            {testimonials.map((item, idx) => (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.2 }}
              >
                <Card className="rounded-2xl border border-border/80 overflow-hidden flex flex-col justify-between group hover:shadow-lg transition-all bg-card/60">
                  {/* Image Preview Box */}
                  <div className="relative aspect-[4/5] bg-muted/40 overflow-hidden cursor-pointer" onClick={() => setPreviewUrl(item.image_url)}>
                    <img
                      src={item.image_url}
                      alt={item.student_name || `رأي طالب ${idx + 1}`}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                      <Eye className="w-6 h-6" />
                    </div>
                    <Badge
                      variant={item.is_visible ? "default" : "secondary"}
                      className="absolute top-2 right-2 text-[10px] shadow-sm"
                    >
                      {item.is_visible ? "ظاهر" : "مخفي"}
                    </Badge>
                  </div>

                  {/* Body & Actions */}
                  <div className="p-4 space-y-3">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-muted-foreground">اسم الطالب (اختياري)</label>
                      <div className="flex gap-1.5">
                        <Input
                          size={1}
                          value={editingNames[item.id] ?? ""}
                          onChange={(e) =>
                            setEditingNames((prev) => ({ ...prev, [item.id]: e.target.value }))
                          }
                          placeholder="مثال: أحمد مصطفى"
                          className="text-xs h-8"
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 shrink-0"
                          onClick={() => handleSaveName(item)}
                          disabled={savingId === item.id}
                          title="حفظ الاسم"
                        >
                          {savingId === item.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Check className="w-3.5 h-3.5 text-primary" />
                          )}
                        </Button>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-border/50 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Switch
                          checked={item.is_visible}
                          onCheckedChange={() => handleToggleVisible(item)}
                        />
                        <span className="text-xs text-muted-foreground">
                          {item.is_visible ? <Eye className="w-3.5 h-3.5 inline text-primary" /> : <EyeOff className="w-3.5 h-3.5 inline" />}
                        </span>
                      </div>

                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          disabled={idx === 0}
                          onClick={() => handleMove(idx, "up")}
                          title="تحريك لأعلى"
                        >
                          <MoveUp className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          disabled={idx === testimonials.length - 1}
                          onClick={() => handleMove(idx, "down")}
                          title="تحريك لأسفل"
                        >
                          <MoveDown className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:bg-destructive/10"
                          onClick={() => setDeleting(item)}
                          title="حذف"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      ) : (
        <div className="text-center py-16 rounded-3xl border border-dashed border-border bg-card/40">
          <MessageSquare className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
          <h3 className="text-lg font-bold">لا توجد آراء مضافة</h3>
          <p className="text-sm text-muted-foreground mb-4">انقر فوق زر رفع الصور لإضافة تقييمات الطلاب.</p>
          <Button onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            <Upload className="w-4 h-4 ml-2" />
            رفع صور الآراء
          </Button>
        </div>
      )}

      {/* Lightbox Preview Modal */}
      {previewUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setPreviewUrl(null)}
        >
          <div className="relative max-w-3xl max-h-[90vh] overflow-hidden rounded-2xl">
            <img src={previewUrl} alt="معاينة" className="max-w-full max-h-[85vh] object-contain rounded-xl" />
          </div>
        </div>
      )}

      {/* Confirm Delete Dialog */}
      <AlertDialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              حذف رأي الطالب
            </AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف هذه الصورة والتقييم؟ لا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletePending}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              disabled={deletePending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletePending && <Loader2 className="w-4 h-4 animate-spin ml-2" />}
              حذف نهائي
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
