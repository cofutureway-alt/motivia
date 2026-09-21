import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CheckCircle2,
  CircleAlert,
  Download,
  File as FileIcon,
  FileImage,
  FileText,
  Loader2,
  LockKeyhole,
  Paperclip,
  Save,
  Send,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import RichTextEditor from "@/components/admin/quiz/RichTextEditor";
import RichTextRenderer, { isEmptyDoc } from "@/components/admin/quiz/RichTextRenderer";

/** Max size per uploaded submission file (kept as a named constant for easy tuning). */
const MAX_SUBMISSION_FILE_BYTES = 20 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);
const ALLOWED_LABEL = "PNG / JPG / WEBP / PDF / PPT / PPTX (حتى 20MB لكل ملف)";

interface Submission {
  id: string;
  assignment_id: string;
  user_id: string;
  text_content: unknown;
  status: "draft" | "submitted";
  submitted_at: string | null;
  updated_at: string;
}

interface SubmissionFile {
  id: string;
  submission_id: string;
  file_name: string;
  file_url: string;
  file_size_bytes: number;
}

interface Props {
  assignmentId: string;
  endAt: string;
  /** If provided (deadline passed but student never submitted anything), render an empty-state notice. */
}

const fmt = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString("ar-EG", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

const formatSize = (bytes: number) => {
  if (!bytes) return "";
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
};

const iconFor = (name: string) => {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) return FileImage;
  if (["pdf", "ppt", "pptx", "doc", "docx"].includes(ext)) return FileText;
  return FileIcon;
};

type SaveState = "idle" | "saving" | "saved" | "error";

const AssignmentSubmissionPanel = ({ assignmentId, endAt }: Props) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [files, setFiles] = useState<SubmissionFile[]>([]);
  const [textDoc, setTextDoc] = useState<unknown>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [submitting, setSubmitting] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<
    { id: string; name: string; progress: number }[]
  >([]);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [removingFile, setRemovingFile] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Live deadline tick so the panel locks the instant the window closes.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const isLocked = useMemo(
    () => nowTick > new Date(endAt).getTime(),
    [nowTick, endAt],
  );

  // ---------- Load submission ----------
  const loadSubmission = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data: sub } = await (supabase as any)
      .from("assignment_submissions")
      .select("*")
      .eq("assignment_id", assignmentId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (sub) {
      setSubmission(sub as Submission);
      setTextDoc((sub as Submission).text_content ?? null);
      const { data: fs } = await (supabase as any)
        .from("assignment_submission_files")
        .select("*")
        .eq("submission_id", (sub as Submission).id)
        .order("created_at", { ascending: true });
      setFiles((fs ?? []) as SubmissionFile[]);
    } else {
      setSubmission(null);
      setTextDoc(null);
      setFiles([]);
    }
    setLoading(false);
  }, [assignmentId, user]);

  useEffect(() => {
    loadSubmission();
  }, [loadSubmission]);

  // ---------- Ensure submission row exists ----------
  const ensureSubmission = useCallback(async (): Promise<Submission | null> => {
    if (submission) return submission;
    if (!user) return null;
    const { data, error } = await (supabase as any)
      .from("assignment_submissions")
      .insert({
        assignment_id: assignmentId,
        user_id: user.id,
        text_content: null,
        status: "draft",
      })
      .select("*")
      .single();
    if (error) {
      if (error.code !== "23505") {
        toast.error(error.message || "تعذّر إنشاء التسليم");
      }
      // Race / already exists → reload
      await loadSubmission();
      return submission;
    }
    setSubmission(data as Submission);
    return data as Submission;
  }, [assignmentId, submission, user, loadSubmission]);

  // ---------- Autosave text ----------
  const latestTextRef = useRef<unknown>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);

  const persistText = useCallback(async () => {
    if (isLocked) return;
    const sub = await ensureSubmission();
    if (!sub) return;
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setSaveState("saving");
    const payload = latestTextRef.current;
    const { error } = await (supabase as any)
      .from("assignment_submissions")
      .update({ text_content: payload })
      .eq("id", sub.id);
    inFlightRef.current = false;
    if (error) {
      setSaveState("error");
      toast.error(error.message || "تعذّر الحفظ");
    } else {
      setSaveState("saved");
      setSubmission((prev) =>
        prev ? { ...prev, text_content: payload } : prev,
      );
      setTimeout(
        () => setSaveState((s) => (s === "saved" ? "idle" : s)),
        1600,
      );
    }
  }, [ensureSubmission, isLocked]);

  const scheduleAutosave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSaveState("saving");
    saveTimerRef.current = setTimeout(() => {
      persistText();
    }, 2000);
  }, [persistText]);

  const handleTextChange = (json: unknown) => {
    latestTextRef.current = json;
    setTextDoc(json);
    if (isLocked) return;
    scheduleAutosave();
  };

  // Flush pending save on unmount / blur
  useEffect(() => {
    const flush = () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        persistText();
      }
    };
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [persistText]);

  // ---------- File uploads ----------
  const handleFileSelect = async (list: FileList | null) => {
    if (!list || !user || isLocked) return;
    const arr = Array.from(list);
    const sub = await ensureSubmission();
    if (!sub) return;

    for (const f of arr) {
      if (!ALLOWED_TYPES.has(f.type)) {
        toast.error(`نوع الملف غير مسموح: ${f.name}`);
        continue;
      }
      if (f.size > MAX_SUBMISSION_FILE_BYTES) {
        toast.error(`${f.name} أكبر من 20 ميجابايت`);
        continue;
      }
      const tempId = crypto.randomUUID();
      setUploadQueue((q) => [
        ...q,
        { id: tempId, name: f.name, progress: 5 },
      ]);
      try {
        // Simulated progress ticks (Supabase JS lacks native progress events)
        const tick = setInterval(() => {
          setUploadQueue((q) =>
            q.map((it) =>
              it.id === tempId
                ? { ...it, progress: Math.min(90, it.progress + 12) }
                : it,
            ),
          );
        }, 220);

        const ext = f.name.split(".").pop() || "bin";
        const path = `${user.id}/${sub.id}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("assignment-submissions")
          .upload(path, f, { cacheControl: "3600", upsert: false });
        clearInterval(tick);
        if (upErr) throw upErr;

        const { data: inserted, error: insErr } = await (supabase as any)
          .from("assignment_submission_files")
          .insert({
            submission_id: sub.id,
            file_name: f.name,
            file_url: path,
            file_size_bytes: f.size,
          })
          .select("*")
          .single();
        if (insErr) throw insErr;

        setFiles((prev) => [...prev, inserted as SubmissionFile]);
        setUploadQueue((q) =>
          q.map((it) =>
            it.id === tempId ? { ...it, progress: 100 } : it,
          ),
        );
        setTimeout(
          () =>
            setUploadQueue((q) => q.filter((it) => it.id !== tempId)),
          400,
        );
      } catch (e: any) {
        toast.error(e?.message || `فشل رفع ${f.name}`);
        setUploadQueue((q) => q.filter((it) => it.id !== tempId));
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = async (file: SubmissionFile) => {
    if (isLocked) return;
    setRemovingFile(file.id);
    try {
      await supabase.storage
        .from("assignment-submissions")
        .remove([file.file_url]);
      const { error } = await (supabase as any)
        .from("assignment_submission_files")
        .delete()
        .eq("id", file.id);
      if (error) throw error;
      setFiles((prev) => prev.filter((f) => f.id !== file.id));
    } catch (e: any) {
      toast.error(e?.message || "تعذّر حذف الملف");
    } finally {
      setRemovingFile(null);
    }
  };

  const downloadFile = async (file: SubmissionFile) => {
    setDownloading(file.id);
    try {
      const { data, error } = await supabase.storage
        .from("assignment-submissions")
        .createSignedUrl(file.file_url, 300, { download: file.file_name });
      if (error) throw error;
      if (data?.signedUrl) window.open(data.signedUrl, "_blank");
    } catch (e: any) {
      toast.error(e?.message || "تعذّر فتح الملف");
    } finally {
      setDownloading(null);
    }
  };

  // ---------- Submit ----------
  const hasContent =
    (!!textDoc && !isEmptyDoc(textDoc)) || files.length > 0;

  const submit = async () => {
    if (isLocked || !hasContent) return;
    setSubmitting(true);
    // Flush any pending text save first
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      await persistText();
    }
    const sub = await ensureSubmission();
    if (!sub) {
      setSubmitting(false);
      return;
    }
    const { data, error } = await (supabase as any)
      .from("assignment_submissions")
      .update({
        status: "submitted",
        submitted_at: new Date().toISOString(),
      })
      .eq("id", sub.id)
      .select("*")
      .single();
    setSubmitting(false);
    if (error) {
      toast.error(error.message || "تعذّر التسليم");
      return;
    }
    setSubmission(data as Submission);
    toast.success("تم تسليم الواجب بنجاح");
  };

  // ---------- Rendering ----------
  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5 md:p-6 space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  // === LOCKED (post-deadline) READ-ONLY VIEW ===
  if (isLocked) {
    const wasSubmitted = submission?.status === "submitted";
    const nothingSaved =
      !submission || (isEmptyDoc(textDoc) && files.length === 0);

    if (nothingSaved) {
      return (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-rose-500/40 bg-rose-500/5 p-6 text-center"
        >
          <div className="w-12 h-12 mx-auto rounded-full bg-rose-500/15 flex items-center justify-center mb-3">
            <LockKeyhole className="w-6 h-6 text-rose-600" />
          </div>
          <h3 className="text-base font-bold text-foreground mb-1">
            انتهى الوقت المحدد للتسليم
          </h3>
          <p className="text-sm text-muted-foreground">
            لم يتم تسليم أي إجابة لهذا الواجب.
          </p>
        </motion.div>
      );
    }

    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-border bg-card overflow-hidden"
      >
        <div
          className={`px-5 py-4 flex items-center gap-3 border-b border-border ${
            wasSubmitted
              ? "bg-emerald-500/5"
              : "bg-amber-500/5"
          }`}
        >
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              wasSubmitted
                ? "bg-emerald-500/15 text-emerald-600"
                : "bg-amber-500/15 text-amber-600"
            }`}
          >
            {wasSubmitted ? (
              <CheckCircle2 className="w-5 h-5" />
            ) : (
              <CircleAlert className="w-5 h-5" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold">
              {wasSubmitted
                ? `تم التسليم بتاريخ ${fmt(submission?.submitted_at)}`
                : "لم يتم التسليم — الموعد النهائي انتهى وحفظت مسودة فقط"}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              التسليم مغلق الآن ولا يمكن التعديل عليه.
            </div>
          </div>
          <Badge variant="secondary" className="gap-1">
            <LockKeyhole className="w-3 h-3" />
            مغلق
          </Badge>
        </div>

        <div className="p-5 md:p-6 space-y-5">
          <div>
            <div className="text-xs font-bold text-muted-foreground mb-2">
              إجابة الطالب
            </div>
            {isEmptyDoc(textDoc) ? (
              <div className="rounded-xl border border-dashed border-border/60 p-4 text-xs text-muted-foreground text-center">
                لا يوجد نص مكتوب.
              </div>
            ) : (
              <div className="rounded-xl border border-border/60 bg-background p-3">
                <RichTextRenderer content={textDoc} />
              </div>
            )}
          </div>

          <div>
            <div className="text-xs font-bold text-muted-foreground mb-2">
              الملفات المرفقة ({files.length})
            </div>
            {files.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/60 p-4 text-xs text-muted-foreground text-center">
                لا توجد ملفات مرفقة.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {files.map((f) => {
                  const Icon = iconFor(f.file_name);
                  const busy = downloading === f.id;
                  return (
                    <button
                      key={f.id}
                      onClick={() => downloadFile(f)}
                      disabled={busy}
                      className="flex items-center gap-3 rounded-xl border border-border bg-background p-3 text-right hover:border-primary/50 hover:bg-accent/40 transition-colors disabled:opacity-60"
                    >
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        {busy ? (
                          <Loader2 className="w-4 h-4 animate-spin text-primary" />
                        ) : (
                          <Icon className="w-4 h-4 text-primary" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">
                          {f.file_name}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {formatSize(f.file_size_bytes)}
                        </div>
                      </div>
                      <Download className="w-4 h-4 text-muted-foreground shrink-0" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    );
  }

  // === LIVE EDITABLE VIEW ===
  const isSubmitted = submission?.status === "submitted";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-border bg-card overflow-hidden"
    >
      {/* Header */}
      <div className="px-5 py-4 border-b border-border flex items-center flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <Send className="w-4 h-4 text-primary" />
          </div>
          <div>
            <div className="text-sm font-bold">تسليم الواجب</div>
            <div className="text-[11px] text-muted-foreground">
              يتم الحفظ التلقائي تلقائياً كل ثانيتين
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <SaveIndicator state={saveState} />
          <AnimatePresence>
            {isSubmitted && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
              >
                <Badge className="gap-1 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                  <CheckCircle2 className="w-3 h-3" />
                  مُسلَّم
                </Badge>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {isSubmitted && submission?.submitted_at && (
        <div className="px-5 py-2.5 bg-emerald-500/5 border-b border-emerald-500/20 text-[11px] text-emerald-800 dark:text-emerald-200">
          تم آخر تسليم بتاريخ {fmt(submission.submitted_at)}. يمكنك التعديل وإعادة
          التسليم قبل انتهاء الموعد.
        </div>
      )}

      <div className="p-5 md:p-6 space-y-5">
        {/* Rich text editor */}
        <div>
          <label className="text-xs font-bold text-muted-foreground mb-2 block">
            إجابتك النصية (اختياري)
          </label>
          <RichTextEditor
            value={textDoc}
            onChange={handleTextChange}
            placeholder="اكتب إجابتك هنا... يمكنك إدراج معادلات وصور."
            minHeight={160}
          />
        </div>

        {/* File uploads */}
        <div>
          <label className="text-xs font-bold text-muted-foreground mb-2 block">
            الملفات المرفقة (اختياري)
          </label>

          <label
            className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border hover:border-primary/50 hover:bg-primary/5 transition-colors cursor-pointer p-6 text-center"
            onDrop={(e) => {
              e.preventDefault();
              handleFileSelect(e.dataTransfer.files);
            }}
            onDragOver={(e) => e.preventDefault()}
          >
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <UploadCloud className="w-5 h-5 text-primary" />
            </div>
            <div className="text-sm font-medium">
              اسحب الملفات هنا أو اضغط للاختيار
            </div>
            <div className="text-[11px] text-muted-foreground">
              {ALLOWED_LABEL}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation"
              className="hidden"
              onChange={(e) => handleFileSelect(e.target.files)}
            />
          </label>

          {/* Upload progress list */}
          <AnimatePresence>
            {uploadQueue.map((u) => (
              <motion.div
                key={u.id}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="mt-2 rounded-lg border border-border bg-background p-3"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                  <div className="text-xs font-medium truncate flex-1">
                    {u.name}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {u.progress}%
                  </div>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <motion.div
                    className="h-full bg-primary"
                    initial={{ width: 0 }}
                    animate={{ width: `${u.progress}%` }}
                    transition={{ ease: "easeOut", duration: 0.25 }}
                  />
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Uploaded files list */}
          {files.length > 0 && (
            <div className="mt-3 space-y-2">
              {files.map((f) => {
                const Icon = iconFor(f.file_name);
                const busyDl = downloading === f.id;
                const busyRm = removingFile === f.id;
                return (
                  <motion.div
                    key={f.id}
                    layout
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 6 }}
                    className="flex items-center gap-3 rounded-xl border border-border bg-background p-3"
                  >
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
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
                      className="h-8 w-8"
                      onClick={() => downloadFile(f)}
                      disabled={busyDl}
                      title="فتح"
                    >
                      {busyDl ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Download className="w-4 h-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => removeFile(f)}
                      disabled={busyRm}
                      title="حذف"
                    >
                      {busyRm ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </Button>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>

        {/* Submit */}
        <div className="flex items-center flex-wrap gap-3 pt-2 border-t border-border/60">
          <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 flex-1 min-w-0">
            <Paperclip className="w-3.5 h-3.5 shrink-0" />
            {hasContent
              ? "جاهز للتسليم. يمكنك دائماً التعديل قبل انتهاء الموعد."
              : "أضف نصاً أو ملفاً واحداً على الأقل لتفعيل زر التسليم."}
          </div>
          <Button
            onClick={submit}
            disabled={!hasContent || submitting}
            className="gap-2"
            size="lg"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            {isSubmitted ? "إعادة التسليم" : "تسليم الواجب"}
          </Button>
        </div>
      </div>
    </motion.div>
  );
};

const SaveIndicator = ({ state }: { state: SaveState }) => {
  if (state === "idle") return null;
  const meta =
    state === "saving"
      ? {
          icon: <Loader2 className="w-3 h-3 animate-spin" />,
          text: "جارِ الحفظ…",
          cls: "text-muted-foreground",
        }
      : state === "saved"
        ? {
            icon: <CheckCircle2 className="w-3 h-3" />,
            text: "تم الحفظ",
            cls: "text-emerald-600 dark:text-emerald-400",
          }
        : {
            icon: <CircleAlert className="w-3 h-3" />,
            text: "فشل الحفظ",
            cls: "text-destructive",
          };
  return (
    <motion.div
      key={state}
      initial={{ opacity: 0, y: -3 }}
      animate={{ opacity: 1, y: 0 }}
      className={`text-[11px] inline-flex items-center gap-1 ${meta.cls}`}
    >
      {meta.icon}
      {meta.text}
    </motion.div>
  );
};

export default AssignmentSubmissionPanel;
