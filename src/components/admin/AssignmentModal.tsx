import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  Loader2,
  Upload,
  Trash2,
  FileText,
  FileImage,
  File as FileIcon,
  Info,
  Paperclip,
  CalendarClock,
  Target,
  ClipboardList,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export interface AssignmentRecord {
  id: string;
  unit_id: string;
  course_id: string;
  title: string;
  description: string | null;
  order_index: number;
  total_grade: number;
  pass_grade: number;
  start_at: string;
  end_at: string;
}

interface AssignmentFileRow {
  id: string;
  file_name: string;
  file_url: string;
  file_size_bytes: number;
}

// Reuse the same allow-list as Phase 10 lesson files for consistency.
const ALLOWED_UPLOAD_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
];
const ALLOWED_TYPES_LABEL = "PNG / JPG / WEBP / PDF / PPT / PPTX فقط";
const MAX_FILE_BYTES = 30 * 1024 * 1024;

const fileIcon = (type?: string | null) => {
  if (!type) return FileIcon;
  if (type.startsWith("image/")) return FileImage;
  if (type.includes("pdf")) return FileText;
  if (type.includes("presentation") || type.includes("powerpoint")) return FileText;
  return FileIcon;
};

const formatSize = (bytes?: number | null) => {
  if (!bytes) return "";
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
};

// Convert an ISO/Date string to the value accepted by <input type="datetime-local">.
const toLocalInput = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const schema = z
  .object({
    title: z.string().trim().min(2, "العنوان قصير جدًا").max(160),
    description: z.string().trim().max(2000).optional(),
    totalGrade: z.coerce
      .number({ invalid_type_error: "أدخل رقمًا" })
      .positive("يجب أن تكون أكبر من صفر"),
    passGrade: z.coerce
      .number({ invalid_type_error: "أدخل رقمًا" })
      .positive("يجب أن تكون أكبر من صفر"),
    startAt: z.string().min(1, "حدد تاريخ البداية"),
    endAt: z.string().min(1, "حدد تاريخ النهاية"),
  })
  .superRefine((v, ctx) => {
    if (v.passGrade > v.totalGrade) {
      ctx.addIssue({
        path: ["passGrade"],
        code: z.ZodIssueCode.custom,
        message: "درجة النجاح يجب ألا تتجاوز الدرجة النهائية",
      });
    }
    const s = new Date(v.startAt).getTime();
    const e = new Date(v.endAt).getTime();
    if (Number.isFinite(s) && Number.isFinite(e) && e <= s) {
      ctx.addIssue({
        path: ["endAt"],
        code: z.ZodIssueCode.custom,
        message: "تاريخ النهاية يجب أن يكون بعد تاريخ البداية",
      });
    }
  });

type FormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  unitId: string;
  courseId: string;
  assignment: AssignmentRecord | null;
  onSaved: () => void;
}

/**
 * Single-screen assignment editor: metadata + optional file attachments.
 * Follows the same visual language as LessonModal but is intentionally
 * simpler — no multi-step wizard.
 */
const AssignmentModal = ({
  open,
  onOpenChange,
  unitId,
  courseId,
  assignment,
  onSaved,
}: Props) => {
  const isEdit = !!assignment;
  const [tab, setTab] = useState<"details" | "files">("details");
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [files, setFiles] = useState<AssignmentFileRow[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeAssignmentId = savedId ?? assignment?.id ?? null;

  const defaultStart = useMemo(() => toLocalInput(new Date().toISOString()), []);
  const defaultEnd = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return toLocalInput(d.toISOString());
  }, []);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: "",
      description: "",
      totalGrade: 100,
      passGrade: 50,
      startAt: defaultStart,
      endAt: defaultEnd,
    },
  });

  useEffect(() => {
    if (!open) return;
    setTab("details");
    setSavedId(null);
    setFiles([]);
    reset({
      title: assignment?.title ?? "",
      description: assignment?.description ?? "",
      totalGrade: assignment?.total_grade ?? 100,
      passGrade: assignment?.pass_grade ?? 50,
      startAt: toLocalInput(assignment?.start_at) || defaultStart,
      endAt: toLocalInput(assignment?.end_at) || defaultEnd,
    });
  }, [open, assignment, reset, defaultStart, defaultEnd]);

  // Load attached files whenever an existing/just-saved assignment id is known.
  useEffect(() => {
    if (!open || !activeAssignmentId) return;
    (async () => {
      const { data } = await (supabase as any)
        .from("assignment_files")
        .select("id, file_name, file_url, file_size_bytes")
        .eq("assignment_id", activeAssignmentId)
        .order("created_at", { ascending: true });
      setFiles((data ?? []) as AssignmentFileRow[]);
    })();
  }, [open, activeAssignmentId]);

  const onSubmit = async (values: FormValues) => {
    try {
      setSubmitting(true);
      const payload = {
        unit_id: unitId,
        course_id: courseId,
        title: values.title,
        description: values.description?.trim() || null,
        total_grade: values.totalGrade,
        pass_grade: values.passGrade,
        start_at: new Date(values.startAt).toISOString(),
        end_at: new Date(values.endAt).toISOString(),
      };

      if (activeAssignmentId) {
        const { error } = await (supabase as any)
          .from("assignments")
          .update(payload)
          .eq("id", activeAssignmentId);
        if (error) throw error;
        toast.success("تم حفظ الواجب");
        onSaved();
        onOpenChange(false);
      } else {
        // Fetch the next combined order_index for this unit (lessons+quizzes+assignments).
        const { data: nextIdx } = await (supabase as any).rpc(
          "next_unit_order_index",
          { _unit_id: unitId },
        );
        const { data: inserted, error } = await (supabase as any)
          .from("assignments")
          .insert({ ...payload, order_index: nextIdx ?? 0 })
          .select("id")
          .single();
        if (error) throw error;
        setSavedId(inserted.id);
        toast.success("تم إنشاء الواجب — يمكنك الآن رفع الملفات");
        setTab("files");
        onSaved();
      }
    } catch (e: any) {
      toast.error(e?.message || "فشل الحفظ");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpload = async (fileList: FileList | null) => {
    if (!fileList || !fileList.length || !activeAssignmentId) return;
    setUploading(true);
    try {
      for (const file of Array.from(fileList)) {
        if (!ALLOWED_UPLOAD_TYPES.includes(file.type)) {
          toast.error(`نوع ملف غير مسموح: ${file.name}`);
          continue;
        }
        if (file.size > MAX_FILE_BYTES) {
          toast.error(`الملف كبير جدًا: ${file.name}`);
          continue;
        }
        const ext = file.name.split(".").pop() || "bin";
        const { data: currentUser } = await supabase.auth.getUser();
        const path = `${currentUser.user?.id ? `${currentUser.user.id}/` : ""}${activeAssignmentId}/${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("assignment-files")
          .upload(path, file, { cacheControl: "3600", upsert: false });
        if (upErr) throw upErr;
        const { data: row, error: rowErr } = await (supabase as any)
          .from("assignment_files")
          .insert({
            assignment_id: activeAssignmentId,
            file_name: file.name,
            file_url: path,
            file_size_bytes: file.size,
          })
          .select("id, file_name, file_url, file_size_bytes")
          .single();
        if (rowErr) throw rowErr;
        setFiles((prev) => [...prev, row as AssignmentFileRow]);
      }
    } catch (e: any) {
      toast.error(e?.message || "تعذّر الرفع");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const deleteFile = async (row: AssignmentFileRow) => {
    try {
      await supabase.storage.from("assignment-files").remove([row.file_url]);
      await (supabase as any).from("assignment_files").delete().eq("id", row.id);
      setFiles((prev) => prev.filter((f) => f.id !== row.id));
    } catch (e: any) {
      toast.error(e?.message || "تعذّر الحذف");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl p-0 gap-0 overflow-hidden max-h-[90vh] flex flex-col"
        dir="rtl"
      >
        <DialogHeader className="px-6 pt-6 pb-3 shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-primary" />
            {isEdit ? "تعديل الواجب" : "واجب جديد"}
          </DialogTitle>
        </DialogHeader>

        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as any)}
          className="flex-1 min-h-0 flex flex-col"
        >
          <div className="px-6 shrink-0">
            <TabsList className="w-full grid grid-cols-2">
              <TabsTrigger value="details" className="gap-2">
                <Info className="w-4 h-4" />
                تفاصيل الواجب
              </TabsTrigger>
              <TabsTrigger
                value="files"
                disabled={!activeAssignmentId}
                className="gap-2"
              >
                <Paperclip className="w-4 h-4" />
                الملفات{files.length ? ` (${files.length})` : ""}
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="details" className="mt-0 flex-1 min-h-0 overflow-y-auto">
            <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-5">
              <div className="space-y-2">
                <Label htmlFor="a-title">اسم الواجب</Label>
                <Input
                  id="a-title"
                  {...register("title")}
                  placeholder="مثال: تمارين على قانون نيوتن الأول"
                />
                {errors.title && (
                  <p className="text-xs text-destructive">{errors.title.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="a-desc">الوصف</Label>
                <Textarea
                  id="a-desc"
                  rows={4}
                  {...register("description")}
                  placeholder="اشرح المطلوب من الطلاب في هذا الواجب."
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="a-total" className="flex items-center gap-1.5">
                    <Target className="w-3.5 h-3.5 text-primary" />
                    الدرجة النهائية
                  </Label>
                  <Input
                    id="a-total"
                    type="number"
                    step="0.5"
                    min={0}
                    {...register("totalGrade")}
                  />
                  {errors.totalGrade && (
                    <p className="text-xs text-destructive">
                      {errors.totalGrade.message}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="a-pass" className="flex items-center gap-1.5">
                    <Target className="w-3.5 h-3.5 text-emerald-600" />
                    درجة النجاح
                  </Label>
                  <Input
                    id="a-pass"
                    type="number"
                    step="0.5"
                    min={0}
                    {...register("passGrade")}
                  />
                  {errors.passGrade && (
                    <p className="text-xs text-destructive">
                      {errors.passGrade.message}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="a-start" className="flex items-center gap-1.5">
                    <CalendarClock className="w-3.5 h-3.5" />
                    تاريخ البداية
                  </Label>
                  <Input id="a-start" type="datetime-local" {...register("startAt")} />
                  {errors.startAt && (
                    <p className="text-xs text-destructive">
                      {errors.startAt.message}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="a-end" className="flex items-center gap-1.5">
                    <CalendarClock className="w-3.5 h-3.5 text-amber-600" />
                    تاريخ النهاية
                  </Label>
                  <Input id="a-end" type="datetime-local" {...register("endAt")} />
                  {errors.endAt && (
                    <p className="text-xs text-destructive">{errors.endAt.message}</p>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => onOpenChange(false)}
                  disabled={submitting}
                >
                  إلغاء
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting && <Loader2 className="w-4 h-4 ml-2 animate-spin" />}
                  {isEdit || savedId ? "حفظ الواجب" : "إضافة الواجب"}
                </Button>
              </div>
            </form>
          </TabsContent>

          <TabsContent value="files" className="mt-0 flex-1 min-h-0 overflow-y-auto">
            <div className="p-6 space-y-4">
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  handleUpload(e.dataTransfer.files);
                }}
                className="rounded-xl border-2 border-dashed border-border hover:border-primary/60 transition-colors cursor-pointer p-8 text-center bg-accent/30"
              >
                {uploading ? (
                  <div className="flex items-center justify-center gap-2 text-muted-foreground">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>جارٍ الرفع...</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <div className="w-12 h-12 rounded-full bg-background flex items-center justify-center">
                      <Upload className="w-5 h-5" />
                    </div>
                    <p className="text-sm font-medium">
                      اسحب الملفات أو انقر للرفع
                    </p>
                    <p className="text-xs">{ALLOWED_TYPES_LABEL}</p>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept={ALLOWED_UPLOAD_TYPES.join(",")}
                  className="hidden"
                  onChange={(e) => handleUpload(e.target.files)}
                />
              </div>

              <div className="space-y-2 max-h-80 overflow-y-auto">
                <AnimatePresence>
                  {files.map((f) => {
                    const guessedType =
                      f.file_name.split(".").pop()?.toLowerCase() ?? "";
                    const Icon = fileIcon(
                      guessedType === "pdf"
                        ? "application/pdf"
                        : ["png", "jpg", "jpeg", "webp"].includes(guessedType)
                          ? "image/"
                          : ["ppt", "pptx"].includes(guessedType)
                            ? "presentation"
                            : null,
                    );
                    return (
                      <motion.div
                        key={f.id}
                        layout
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="flex items-center gap-3 rounded-lg border border-border/60 bg-card p-3"
                      >
                        <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                          <Icon className="w-4 h-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">
                            {f.file_name}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {formatSize(f.file_size_bytes)}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8"
                          onClick={() => deleteFile(f)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
                {files.length === 0 && !uploading && (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    لا توجد ملفات مرفقة بعد
                  </p>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  تم
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default AssignmentModal;
