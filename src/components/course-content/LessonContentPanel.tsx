import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Eye,
  File as FileIcon,
  FileImage,
  FileText,
  Layers,
  ListChecks,
  Loader2,
  Lock,
  Presentation,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import LessonVideoPlayer from "@/components/lesson/LessonVideoPlayer";
import CircularProgress from "@/components/lesson/CircularProgress";
import { usePlayerSettings } from "@/hooks/use-player-settings";
import FileViewer, { type ViewerFile } from "@/components/lesson/FileViewer";
import type { VideoProvider } from "@/lib/video";
import type { ContentItem } from "@/hooks/use-unit-content-items";

interface LessonRow {
  id: string;
  title: string;
  description: string | null;
  unit_id: string;
  position: number;
  video_provider: VideoProvider | null;
  video_url: string | null;
}

interface Props {
  lessonId: string;
  courseId: string;
  isAdmin: boolean;
  nextItem: ContentItem | undefined;
  currentIndex: number;
  totalItems: number;
  onCompleted?: () => void;
}

const LessonContentPanel = ({
  lessonId,
  courseId,
  isAdmin,
  nextItem,
  currentIndex,
  totalItems,
  onCompleted,
}: Props) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { settings: playerSettings } = usePlayerSettings();

  const [lesson, setLesson] = useState<LessonRow | null>(null);
  const [files, setFiles] = useState<ViewerFile[]>([]);
  const [viewerFile, setViewerFile] = useState<ViewerFile | null>(null);
  const [isCompleted, setIsCompleted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [watchPct, setWatchPct] = useState(0);

  const load = useCallback(async () => {
    if (!lessonId) return;
    setLoading(true);
    const [{ data: lRow }, { data: fData }, prog] = await Promise.all([
      supabase
        .from("lessons")
        .select("id, unit_id, title, description, position, video_provider, video_url")
        .eq("id", lessonId)
        .maybeSingle(),
      (supabase as any)
        .from("lesson_files")
        .select("id, file_name, file_type, file_url, allow_download, download_limit")
        .eq("lesson_id", lessonId)
        .order("created_at"),
      user
        ? supabase
            .from("lesson_progress")
            .select("lesson_id")
            .eq("lesson_id", lessonId)
            .eq("user_id", user.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    setLesson((lRow as LessonRow) ?? null);
    setFiles((fData ?? []) as ViewerFile[]);
    setIsCompleted(!!(prog as any)?.data);
    setLoading(false);
  }, [lessonId, user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const gateActive = playerSettings.completion_gate_enabled && !isAdmin;
  const requiredPct = playerSettings.completion_required_percentage;
  const completeLocked = gateActive && !isCompleted && watchPct < requiredPct;

  const toggleComplete = async () => {
    if (!user || !lesson) return;
    if (isCompleted) return; // no un-complete
    if (completeLocked) {
      toast.error(`يجب مشاهدة ${requiredPct}% من الفيديو قبل إتمام الدرس (شاهدت ${watchPct}%)`);
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("lesson_progress")
        .insert({ user_id: user.id, lesson_id: lesson.id, course_id: courseId });
      if (error && (error as any).code !== "23505") throw error;
      setIsCompleted(true);
      toast.success("أحسنت! تم إنجاز الدرس");
      onCompleted?.();
    } catch (e: any) {
      toast.error(e?.message || "تعذّر حفظ التقدّم");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !lesson) {
    return (
      <div className="space-y-4">
        <Skeleton className="aspect-video w-full rounded-2xl" />
        <Skeleton className="h-40 rounded-2xl" />
      </div>
    );
  }

  return (
    <>
      <LessonVideoPlayer
        lessonId={lesson.id}
        courseId={courseId}
        title={lesson.title}
        provider={lesson.video_provider}
        videoUrl={lesson.video_url}
        settings={
          isAdmin
            ? { ...playerSettings, completion_gate_enabled: false }
            : playerSettings
        }
        onProgress={setWatchPct}
        paused={!!viewerFile}
      />

      <div className="rounded-2xl border border-border bg-card p-4 md:p-6 mt-5">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div className="min-w-0 flex items-center gap-3">
            <CircularProgress value={watchPct} size={52} label="نسبة المشاهدة" />
            <div className="min-w-0">
              <h1 className="text-xl md:text-2xl font-bold">{lesson.title}</h1>
              <div className="text-xs text-muted-foreground mt-1">
                العنصر {currentIndex + 1} من {totalItems}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <motion.div whileTap={{ scale: 0.96 }}>
              <Button
                onClick={toggleComplete}
                disabled={saving || isCompleted}
                variant={isCompleted ? "outline" : "default"}
                title={
                  isCompleted
                    ? "تم إنجاز الدرس — لا يمكن التراجع عن الإنجاز"
                    : completeLocked
                      ? `مطلوب مشاهدة ${requiredPct}% (شاهدت ${watchPct}%)`
                      : undefined
                }
                className={`gap-2 font-bold ${
                  isCompleted
                    ? "border-emerald-500/50 text-emerald-600 dark:text-emerald-400"
                    : completeLocked
                      ? "opacity-60"
                      : ""
                }`}
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : isCompleted ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : completeLocked ? (
                  <Lock className="w-4 h-4" />
                ) : (
                  <ListChecks className="w-4 h-4" />
                )}
                {isCompleted
                  ? "تم الإنجاز"
                  : completeLocked
                    ? `${watchPct}% / ${requiredPct}%`
                    : "إنجاز الدرس"}
              </Button>
            </motion.div>
            {nextItem && (
              <Button
                variant="secondary"
                onClick={() => navigate(nextItem.routePath)}
                className="gap-1 font-bold"
              >
                {nextItem.type === "quiz" ? "الاختبار التالي" : "التالي"}
                <ArrowLeft className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>

        <Tabs defaultValue="files" className="w-full">
          <TabsList className="grid grid-cols-2 max-w-sm">
            <TabsTrigger value="files" className="gap-2">
              <FileText className="w-4 h-4" />
              الملفات ({files.length})
            </TabsTrigger>
            <TabsTrigger value="description" className="gap-2">
              <Layers className="w-4 h-4" />
              الوصف
            </TabsTrigger>
          </TabsList>

          <TabsContent value="files" className="pt-4">
            {files.length === 0 ? (
              <div className="rounded-xl border-2 border-dashed border-border p-10 text-center text-muted-foreground">
                <FileText className="w-8 h-8 mx-auto opacity-40 mb-2" />
                لا توجد ملفات لهذا الدرس.
              </div>
            ) : (
              <div className="space-y-2">
                <AnimatePresence initial={false}>
                  {files.map((f, i) => (
                    <motion.button
                      key={f.id}
                      initial={{ opacity: 0, x: 12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.04 }}
                      onClick={() => setViewerFile(f)}
                      whileHover={{ y: -2 }}
                      className="w-full flex items-center gap-3 p-3 rounded-xl border border-border bg-background hover:border-primary/50 hover:shadow-md transition-all text-right"
                    >
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                        <FileTypeIcon type={f.file_type} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold truncate">{f.file_name}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-2">
                          <span>{f.file_type?.split("/")[1]?.toUpperCase() || "ملف"}</span>
                          {!f.allow_download && (
                            <>
                              <span className="opacity-40">·</span>
                              <span className="inline-flex items-center gap-1 text-destructive">
                                <Lock className="w-3 h-3" />
                                عرض فقط
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="inline-flex items-center gap-1 text-xs font-semibold text-primary shrink-0">
                        <Eye className="w-4 h-4" />
                        عرض
                      </div>
                    </motion.button>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </TabsContent>

          <TabsContent value="description" className="pt-4">
            {lesson.description ? (
              <div className="prose prose-sm max-w-none text-foreground whitespace-pre-wrap leading-relaxed">
                {lesson.description}
              </div>
            ) : (
              <div className="rounded-xl border-2 border-dashed border-border p-10 text-center text-muted-foreground">
                لا يوجد وصف لهذا الدرس.
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <FileViewer file={viewerFile} onClose={() => setViewerFile(null)} />
    </>
  );
};

const FileTypeIcon = ({ type }: { type: string | null }) => {
  const t = (type || "").toLowerCase();
  if (t.startsWith("image/")) return <FileImage className="w-4 h-4" />;
  if (t.includes("pdf")) return <FileText className="w-4 h-4" />;
  if (t.includes("presentation") || t.includes("powerpoint"))
    return <Presentation className="w-4 h-4" />;
  return <FileIcon className="w-4 h-4" />;
};

export default LessonContentPanel;
