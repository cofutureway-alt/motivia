import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Image as ImageIcon, Upload, X, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useSignedThumbnail } from "@/hooks/use-signed-thumbnail";

export interface StageRow {
  id: string;
  name: string;
  description: string | null;
  thumbnail_url: string | null;
}

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "الاسم قصير جدًا")
    .max(80, "الاسم طويل جدًا"),
  description: z.string().trim().max(500, "الوصف طويل جدًا").optional(),
});

type FormValues = z.infer<typeof schema>;

const MAX_MB = 3;
const ALLOWED = ["image/png", "image/jpeg", "image/webp"];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  stage: StageRow | null;
  onSaved: () => void;
}

const StageFormModal = ({ open, onOpenChange, stage, onSaved }: Props) => {
  const isEdit = !!stage;
  const existingSigned = useSignedThumbnail(stage?.thumbnail_url ?? null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", description: "" },
  });

  useEffect(() => {
    if (open) {
      reset({
        name: stage?.name ?? "",
        description: stage?.description ?? "",
      });
      setFile(null);
      setPreview(null);
    }
  }, [open, stage, reset]);

  const displayPreview = useMemo(() => {
    if (preview) return preview;
    if (isEdit && existingSigned) return existingSigned;
    return null;
  }, [preview, isEdit, existingSigned]);

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

  const onSubmit = async (values: FormValues) => {
    setSubmitting(true);
    try {
      let thumbnailPath = stage?.thumbnail_url ?? null;

      if (file) {
        const ext = file.name.split(".").pop() || "jpg";
        const path = `stages/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("thumbnails")
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) throw upErr;

        // Remove old thumbnail if replacing
        if (isEdit && stage?.thumbnail_url) {
          await supabase.storage
            .from("thumbnails")
            .remove([stage.thumbnail_url]);
        }
        thumbnailPath = path;
      }

      if (isEdit && stage) {
        const { error } = await supabase
          .from("stages")
          .update({
            name: values.name,
            description: values.description || null,
            thumbnail_url: thumbnailPath,
          })
          .eq("id", stage.id);
        if (error) throw error;
        toast.success("تم تحديث المرحلة");
      } else {
        const { error } = await supabase.from("stages").insert({
          name: values.name,
          description: values.description || null,
          thumbnail_url: thumbnailPath,
        });
        if (error) throw error;
        toast.success("تمت إضافة المرحلة");
      }

      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "حدث خطأ أثناء الحفظ");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "تعديل المرحلة" : "إضافة مرحلة جديدة"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "قم بتحديث بيانات المرحلة أو استبدال صورتها."
              : "أدخل بيانات المرحلة الجديدة لعرضها في المنصة."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="name">اسم المرحلة</Label>
            <Input
              id="name"
              placeholder="مثال: المرحلة الابتدائية"
              {...register("name")}
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">الوصف</Label>
            <Textarea
              id="description"
              rows={3}
              placeholder="وصف مختصر عن هذه المرحلة"
              {...register("description")}
            />
            {errors.description && (
              <p className="text-xs text-destructive">
                {errors.description.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>الصورة المصغّرة</Label>
            <div
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleFile(e.dataTransfer.files?.[0]);
              }}
              className="relative overflow-hidden rounded-xl border-2 border-dashed border-border hover:border-primary/60 transition-colors cursor-pointer aspect-video bg-accent/40 flex items-center justify-center"
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
                        setFile(null);
                        setPreview(null);
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

          <div className="flex justify-end gap-2 pt-2">
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
              {isEdit ? "حفظ التغييرات" : "إضافة المرحلة"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default StageFormModal;
