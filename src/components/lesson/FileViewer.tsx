import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Lock,
  X,
  AlertTriangle,
  FileText,
  Image as ImageIcon,
  Presentation,
  ZoomIn,
  ZoomOut,
  Maximize2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePlayerSettings } from "@/hooks/use-player-settings";
import Watermark from "./Watermark";

// Load the pdf.js worker from a CDN pinned to the exact pdfjs-dist version
// bundled with react-pdf. Avoids Vite worker-URL and version-drift issues.
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export interface ViewerFile {
  id: string;
  file_name: string;
  file_type: string | null;
  file_url: string; // storage path
  allow_download: boolean;
  download_limit: number | null;
}

interface Props {
  file: ViewerFile | null;
  onClose: () => void;
}

type Kind = "image" | "pdf" | "pptx" | "unknown";

const detectKind = (t: string | null): Kind => {
  if (!t) return "unknown";
  if (t.startsWith("image/")) return "image";
  if (t.includes("pdf")) return "pdf";
  if (t.includes("presentation") || t.includes("powerpoint")) return "pptx";
  return "unknown";
};

export const FileViewer = ({ file, onClose }: Props) => {
  const { user, profile } = useAuth();
  const { settings } = usePlayerSettings();
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [urlLoading, setUrlLoading] = useState(false);
  const [pageCount, setPageCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pdfWidth, setPdfWidth] = useState(800);
  const [zoom, setZoom] = useState(1);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadCount, setDownloadCount] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const kind = useMemo(() => detectKind(file?.file_type ?? null), [file]);

  const setZoomClamped = useCallback(
    (v: number) => setZoom(Math.max(0.5, Math.min(4, +v.toFixed(2)))),
    [],
  );
  const zoomIn = useCallback(() => setZoomClamped(zoom + 0.25), [zoom, setZoomClamped]);
  const zoomOut = useCallback(() => setZoomClamped(zoom - 0.25), [zoom, setZoomClamped]);
  const zoomReset = useCallback(() => setZoom(1), []);

  // Pinch-to-zoom state (touch)
  const pinchRef = useRef<{ startDist: number; startZoom: number } | null>(null);
  const lastTapRef = useRef<number>(0);

  const touchDist = (touches: React.TouchList) => {
    const [a, b] = [touches[0], touches[1]];
    const dx = a.clientX - b.clientX;
    const dy = a.clientY - b.clientY;
    return Math.hypot(dx, dy);
  };

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 2) {
        pinchRef.current = { startDist: touchDist(e.touches), startZoom: zoom };
      } else if (e.touches.length === 1) {
        // Double-tap to toggle zoom
        const now = Date.now();
        if (now - lastTapRef.current < 300) {
          setZoom((z) => (z > 1 ? 1 : 2));
          lastTapRef.current = 0;
        } else {
          lastTapRef.current = now;
        }
      }
    },
    [zoom],
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 2 && pinchRef.current) {
        e.preventDefault();
        const dist = touchDist(e.touches);
        const ratio = dist / pinchRef.current.startDist;
        setZoomClamped(pinchRef.current.startZoom * ratio);
      }
    },
    [setZoomClamped],
  );

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (e.touches.length < 2) pinchRef.current = null;
  }, []);

  // Load initial download count + signed URL
  useEffect(() => {
    if (!file || !user) return;
    setSignedUrl(null);
    setPage(1);
    setPageCount(0);
    setZoom(1);
    setUrlLoading(true);

    (async () => {
      const { data } = await supabase.storage
        .from("lesson-files")
        .createSignedUrl(file.file_url, 3600);
      setSignedUrl(data?.signedUrl ?? null);
      setUrlLoading(false);
    })();

    (async () => {
      const { data } = await (supabase as any)
        .from("lesson_file_downloads")
        .select("download_count")
        .eq("user_id", user.id)
        .eq("lesson_file_id", file.id)
        .maybeSingle();
      const cnt = data?.download_count ?? 0;
      setDownloadCount(cnt);
      if (file.download_limit !== null) {
        setRemaining(Math.max(0, file.download_limit - cnt));
      } else {
        setRemaining(null);
      }
    })();
  }, [file, user]);

  // Fit PDF width to container
  useEffect(() => {
    if (!file) return;
    const compute = () => {
      const el = containerRef.current;
      if (el) setPdfWidth(Math.max(320, el.clientWidth - 48));
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, [file]);

  // Best-effort copy/print protection while open
  useEffect(() => {
    if (!file) return;

    const blockEsc = (e: KeyboardEvent) => {
      // Explicitly block Escape from closing anything
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      // Zoom shortcuts (Ctrl/Cmd + / - / 0)
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "+" || e.key === "=") {
          e.preventDefault();
          zoomIn();
        } else if (e.key === "-") {
          e.preventDefault();
          zoomOut();
        } else if (e.key === "0") {
          e.preventDefault();
          zoomReset();
        }
      }
    };
    window.addEventListener("keydown", blockEsc, true);

    const onBeforePrint = () => {
      document.body.classList.add("viewer-printing-block");
    };
    const onAfterPrint = () => {
      document.body.classList.remove("viewer-printing-block");
    };
    window.addEventListener("beforeprint", onBeforePrint);
    window.addEventListener("afterprint", onAfterPrint);

    // Style tag for print block
    const style = document.createElement("style");
    style.setAttribute("data-viewer-print", "1");
    style.textContent = `
      @media print {
        body.viewer-open * { visibility: hidden !important; }
        body.viewer-open::after {
          content: "الطباعة غير مسموح بها لهذا المحتوى";
          visibility: visible !important;
          display: block;
          font-family: sans-serif;
          font-size: 28px;
          text-align: center;
          padding: 60px 20px;
        }
      }
    `;
    document.head.appendChild(style);
    document.body.classList.add("viewer-open");

    return () => {
      window.removeEventListener("keydown", blockEsc, true);
      window.removeEventListener("beforeprint", onBeforePrint);
      window.removeEventListener("afterprint", onAfterPrint);
      document.body.classList.remove("viewer-open");
      document.body.classList.remove("viewer-printing-block");
      style.remove();
    };
  }, [file]);

  const handleDownload = useCallback(async () => {
    if (!file || !signedUrl) return;
    setDownloading(true);
    try {
      const { data, error } = await (supabase as any).rpc(
        "increment_file_download",
        { p_lesson_file_id: file.id },
      );
      if (error) throw error;
      const newCount = Number(data) || downloadCount + 1;
      setDownloadCount(newCount);
      if (file.download_limit !== null) {
        setRemaining(Math.max(0, file.download_limit - newCount));
      }

      // Trigger download via signed URL with attachment
      const { data: dl } = await supabase.storage
        .from("lesson-files")
        .createSignedUrl(file.file_url, 60, { download: file.file_name });
      if (dl?.signedUrl) {
        const a = document.createElement("a");
        a.href = dl.signedUrl;
        a.download = file.file_name;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
    } catch (e: any) {
      const msg = e?.message || "";
      if (msg.includes("limit")) toast.error("لقد استنفدت عدد مرات التحميل المتاحة");
      else if (msg.includes("not enrolled")) toast.error("يجب التسجيل في الدورة");
      else if (msg.includes("download disabled")) toast.error("التحميل غير مسموح لهذا الملف");
      else toast.error("تعذّر التحميل");
    } finally {
      setDownloading(false);
    }
  }, [file, signedUrl, downloadCount]);

  const watermarkText = useMemo(() => {
    const parts: string[] = [];
    if (settings.watermark_show_name && profile?.full_name) parts.push(profile.full_name);
    if (settings.watermark_show_email && user?.email) parts.push(user.email);
    return parts.join(" · ") || user?.email || "";
  }, [settings, profile, user]);

  if (!file) return null;

  const canDownload = file.allow_download;
  const limitReached =
    file.download_limit !== null && remaining !== null && remaining <= 0;

  const noSelectStyle: React.CSSProperties = {
    userSelect: "none",
    WebkitUserSelect: "none",
    WebkitTouchCallout: "none",
  };

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="viewer"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        className="fixed inset-0 z-[999] bg-black/95 flex flex-col"
        dir="rtl"
        onContextMenu={(e) => e.preventDefault()}
        style={noSelectStyle}
        aria-modal="true"
        role="dialog"
      >
        {/* Header */}
        <motion.div
          initial={{ y: -30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="flex items-center justify-between gap-3 p-3 md:p-4 border-b border-white/10 text-white shrink-0"
        >
          <div className="flex items-center gap-2 min-w-0">
            <KindIcon kind={kind} />
            <div className="min-w-0">
              <div className="font-bold text-sm md:text-base truncate">
                {file.file_name}
              </div>
              {kind === "pdf" && pageCount > 0 && (
                <div className="text-[11px] text-white/60">
                  الصفحة {page} من {pageCount}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {(kind === "image" || kind === "pdf") && (
              <div className="hidden sm:flex items-center gap-1 bg-white/5 border border-white/10 rounded-md p-0.5">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={zoomOut}
                  disabled={zoom <= 0.5}
                  className="h-8 w-8 text-white hover:bg-white/10 hover:text-white"
                  aria-label="تصغير"
                  title="تصغير (Ctrl -)"
                >
                  <ZoomOut className="w-4 h-4" />
                </Button>
                <button
                  onClick={zoomReset}
                  className="text-xs font-bold text-white tabular-nums px-2 min-w-[52px] hover:bg-white/10 rounded"
                  title="إعادة الضبط (Ctrl 0)"
                >
                  {Math.round(zoom * 100)}%
                </button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={zoomIn}
                  disabled={zoom >= 4}
                  className="h-8 w-8 text-white hover:bg-white/10 hover:text-white"
                  aria-label="تكبير"
                  title="تكبير (Ctrl +)"
                >
                  <ZoomIn className="w-4 h-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={zoomReset}
                  className="h-8 w-8 text-white hover:bg-white/10 hover:text-white"
                  aria-label="ملء الشاشة"
                  title="ملاءمة"
                >
                  <Maximize2 className="w-4 h-4" />
                </Button>
              </div>
            )}

            {canDownload ? (
              <div className="hidden sm:flex items-center gap-2 text-xs text-white/70">
                {file.download_limit === null ? (
                  <span>غير محدود</span>
                ) : (
                  <span className="tabular-nums">
                    متبقّي: <span className="font-bold text-white">{remaining ?? 0}</span> /{" "}
                    {file.download_limit}
                  </span>
                )}
              </div>
            ) : null}

            {canDownload ? (
              <Button
                size="sm"
                onClick={handleDownload}
                disabled={downloading || limitReached || !signedUrl}
                className="gap-1.5"
              >
                {downloading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                {limitReached ? "لقد استنفدت عدد مرات التحميل المتاحة" : "تحميل"}
              </Button>
            ) : (
              <div className="hidden sm:inline-flex items-center gap-1.5 text-xs text-white/70 px-3 py-1.5 rounded-md bg-white/5 border border-white/10">
                <Lock className="w-3.5 h-3.5" />
                التحميل غير متاح لهذا الملف
              </div>
            )}

            <Button
              size="icon"
              variant="ghost"
              onClick={onClose}
              className="text-white hover:bg-white/10 hover:text-white"
              aria-label="إغلاق"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
        </motion.div>

        {/* Content */}
        <div
          ref={containerRef}
          className="relative flex-1 overflow-auto p-3 md:p-6 touch-none"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          style={{ touchAction: "pan-x pan-y" }}
          onContextMenu={(e) => e.preventDefault()}
          onWheel={(e) => {
            if (e.ctrlKey || e.metaKey) {
              e.preventDefault();
              if (e.deltaY < 0) zoomIn();
              else zoomOut();
            }
          }}
        >
          <div className="min-h-full min-w-full flex items-center justify-center">
            {urlLoading || !signedUrl ? (
              <div className="text-white/80 flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 animate-spin" />
                <span className="text-sm">جارٍ تحميل الملف...</span>
              </div>
            ) : kind === "image" ? (
              <img
                src={signedUrl}
                alt={file.file_name}
                draggable={false}
                onContextMenu={(e) => e.preventDefault()}
                className="rounded-lg shadow-2xl transition-transform"
                style={{
                  ...noSelectStyle,
                  transform: `scale(${zoom})`,
                  transformOrigin: "center center",
                  maxWidth: zoom <= 1 ? "100%" : "none",
                  maxHeight: zoom <= 1 ? "85vh" : "none",
                }}
              />
            ) : kind === "pdf" ? (
              <div className="flex flex-col items-center gap-4">
                <Document
                  file={signedUrl}
                  onLoadSuccess={(d) => setPageCount(d.numPages)}
                  loading={
                    <div className="text-white/70 flex items-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span className="text-sm">جارٍ تحميل الملف...</span>
                    </div>
                  }
                  error={
                    <div className="text-white/80 text-center max-w-sm p-6 rounded-xl bg-white/5 border border-white/10">
                      <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-amber-400" />
                      تعذّر عرض هذا الملف.
                    </div>
                  }
                >
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={page}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.22 }}
                      className="rounded-lg overflow-hidden shadow-2xl bg-white"
                    >
                      <Page
                        pageNumber={page}
                        width={pdfWidth * zoom}
                        renderAnnotationLayer={false}
                        renderTextLayer={false}
                      />
                    </motion.div>
                  </AnimatePresence>
                </Document>
              </div>
            ) : kind === "pptx" ? (
              <FallbackUnpreviewable
                icon={<Presentation className="w-10 h-10" />}
                title="لا يمكن معاينة هذا الملف داخل المتصفح"
                hint="يمكنك تحميله لعرضه على جهازك."
              />
            ) : (
              <FallbackUnpreviewable
                icon={<FileText className="w-10 h-10" />}
                title="لا يمكن عرض هذا الملف"
                hint="يمكنك تحميله لعرضه."
              />
            )}
          </div>
        </div>

        {/* PDF Pager */}
        {kind === "pdf" && pageCount > 0 && (
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="flex items-center justify-center gap-3 p-3 border-t border-white/10 text-white shrink-0"
          >
            <Button
              size="sm"
              variant="ghost"
              className="text-white hover:bg-white/10 hover:text-white"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronRight className="w-4 h-4 ml-1" />
              السابقة
            </Button>
            <div className="text-sm font-bold tabular-nums px-3 py-1 rounded-md bg-white/10">
              {page} / {pageCount}
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="text-white hover:bg-white/10 hover:text-white"
              disabled={page >= pageCount}
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            >
              التالية
              <ChevronLeft className="w-4 h-4 mr-1" />
            </Button>
          </motion.div>
        )}

        {/* Watermark overlay — matches player settings */}
        <Watermark
          text={watermarkText}
          color={settings.watermark_color}
          opacity={settings.watermark_opacity}
          speedSeconds={settings.watermark_speed_seconds}
        />
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
};

const KindIcon = ({ kind }: { kind: Kind }) => {
  const cls = "w-5 h-5 text-white/70 shrink-0";
  if (kind === "image") return <ImageIcon className={cls} />;
  if (kind === "pdf") return <FileText className={cls} />;
  if (kind === "pptx") return <Presentation className={cls} />;
  return <FileText className={cls} />;
};

const FallbackUnpreviewable = ({
  icon,
  title,
  hint,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
}) => (
  <div className="max-w-md text-center text-white/90 p-8 rounded-2xl bg-white/5 border border-white/10">
    <div className="w-16 h-16 rounded-2xl bg-white/10 mx-auto mb-3 flex items-center justify-center">
      {icon}
    </div>
    <div className="font-bold text-lg mb-1">{title}</div>
    <div className="text-sm text-white/70">{hint}</div>
  </div>
);

export default FileViewer;
