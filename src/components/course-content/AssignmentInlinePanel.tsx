import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  CalendarClock,
  ClipboardList,
  Clock,
  Download,
  File as FileIcon,
  FileImage,
  FileText,
  Loader2,
  Target,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import AssignmentSubmissionPanel from "./AssignmentSubmissionPanel";

interface AssignmentRow {
  id: string;
  title: string;
  description: string | null;
  total_grade: number;
  pass_grade: number;
  start_at: string;
  end_at: string;
}

interface FileRow {
  id: string;
  file_name: string;
  file_url: string;
  file_size_bytes: number;
}

const fmt = (iso: string | null) =>
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
  if (ext === "pdf" || ["ppt", "pptx", "doc", "docx"].includes(ext)) return FileText;
  return FileIcon;
};

interface Props {
  assignmentId: string;
}

/**
 * Read-only assignment panel used inside the unified course-content page.
 * Phase 29 scope: show the assignment metadata, availability window, grade
 * targets, and the admin-provided reference files. The student submission
 * flow is built in Phase 30 and will be composed into this same panel.
 */
const AssignmentInlinePanel = ({ assignmentId }: Props) => {
  const [assignment, setAssignment] = useState<AssignmentRow | null>(null);
  const [files, setFiles] = useState<FileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ data: a }, { data: f }] = await Promise.all([
        (supabase as any)
          .from("assignments")
          .select("id, title, description, total_grade, pass_grade, start_at, end_at")
          .eq("id", assignmentId)
          .maybeSingle(),
        (supabase as any)
          .from("assignment_files")
          .select("id, file_name, file_url, file_size_bytes")
          .eq("assignment_id", assignmentId)
          .order("created_at", { ascending: true }),
      ]);
      if (cancelled) return;
      setAssignment((a as AssignmentRow) ?? null);
      setFiles((f ?? []) as FileRow[]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [assignmentId]);

  const openFile = async (row: FileRow) => {
    try {
      setDownloading(row.id);
      const { data, error } = await supabase.storage
        .from("assignment-files")
        .createSignedUrl(row.file_url, 300, { download: row.file_name });
      if (error) throw error;
      if (data?.signedUrl) window.open(data.signedUrl, "_blank");
    } catch (e: any) {
      toast.error(e?.message || "تعذّر فتح الملف");
    } finally {
      setDownloading(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 rounded-2xl" />
        <Skeleton className="h-40 rounded-2xl" />
      </div>
    );
  }

  if (!assignment) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-border p-10 text-center">
        <p className="text-muted-foreground">لم يتم العثور على الواجب.</p>
      </div>
    );
  }

  return <AssignmentBody assignment={assignment} files={files} downloading={downloading} openFile={openFile} />;
};

interface BodyProps {
  assignment: AssignmentRow;
  files: FileRow[];
  downloading: string | null;
  openFile: (row: FileRow) => void;
}

const AssignmentBody = ({ assignment, files, downloading, openFile }: BodyProps) => {
  // Live clock so the window state changes without needing a manual refresh.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const start = useMemo(() => new Date(assignment.start_at).getTime(), [assignment.start_at]);
  const end = useMemo(() => new Date(assignment.end_at).getTime(), [assignment.end_at]);
  const status = now < start ? "upcoming" : now > end ? "closed" : "open";

  const statusMeta: Record<
    typeof status,
    { label: string; className: string }
  > = {
    upcoming: {
      label: "لم يبدأ بعد",
      className:
        "bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/30",
    },
    open: {
      label: "متاح الآن",
      className:
        "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30",
    },
    closed: {
      label: "انتهى الموعد",
      className:
        "bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30",
    },
  };

  return (
    <div className="space-y-5">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-border bg-card overflow-hidden"
      >
        <div className="p-5 md:p-6 border-b border-border">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <ClipboardList className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="text-xs font-bold text-muted-foreground">
                  واجب
                </span>
                <Badge className={statusMeta[status].className}>
                  {statusMeta[status].label}
                </Badge>
              </div>
              <h1 className="text-xl md:text-2xl font-bold text-foreground">
                {assignment.title}
              </h1>
            </div>
          </div>

          {assignment.description && (
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
              {assignment.description}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border">
          <MetaCell
            icon={Target}
            label="الدرجة النهائية"
            value={String(assignment.total_grade)}
          />
          <MetaCell
            icon={Target}
            label="درجة النجاح"
            value={String(assignment.pass_grade)}
            emerald
          />
          <MetaCell
            icon={CalendarClock}
            label="تاريخ البداية"
            value={fmt(assignment.start_at)}
          />
          <MetaCell
            icon={CalendarClock}
            label="تاريخ النهاية"
            value={fmt(assignment.end_at)}
            amber
          />
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="rounded-2xl border border-border bg-card p-5 md:p-6"
      >
        <div className="flex items-center gap-2 mb-4">
          <FileText className="w-5 h-5 text-primary" />
          <h2 className="text-base font-bold">ملفات الواجب</h2>
          {files.length > 0 && (
            <Badge variant="secondary" className="text-[10px]">
              {files.length}
            </Badge>
          )}
        </div>

        {files.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
            لا توجد ملفات مرفقة لهذا الواجب.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {files.map((f) => {
              const Icon = iconFor(f.file_name);
              const busy = downloading === f.id;
              return (
                <button
                  key={f.id}
                  onClick={() => openFile(f)}
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
      </motion.div>

      {status === "upcoming" ? (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-sky-500/30 bg-sky-500/5 p-6 text-center"
        >
          <div className="w-12 h-12 mx-auto rounded-full bg-sky-500/15 flex items-center justify-center mb-3">
            <Clock className="w-6 h-6 text-sky-600" />
          </div>
          <h3 className="text-base font-bold mb-1">لم يبدأ الواجب بعد</h3>
          <p className="text-sm text-muted-foreground">
            سيكون متاحاً في {fmt(assignment.start_at)}
          </p>
        </motion.div>
      ) : (
        <AssignmentSubmissionPanel
          assignmentId={assignment.id}
          endAt={assignment.end_at}
        />
      )}
    </div>
  );
};

const MetaCell = ({
  icon: Icon,
  label,
  value,
  emerald,
  amber,
}: {
  icon: typeof Target;
  label: string;
  value: string;
  emerald?: boolean;
  amber?: boolean;
}) => (
  <div className="bg-card p-4">
    <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-1.5">
      <Icon
        className={`w-3.5 h-3.5 ${
          emerald
            ? "text-emerald-600"
            : amber
              ? "text-amber-600"
              : "text-primary"
        }`}
      />
      {label}
    </div>
    <div className="text-sm font-bold text-foreground truncate">{value}</div>
  </div>
);

export default AssignmentInlinePanel;
