import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Globe,
  GripVertical,
  Image as ImageIcon,
  Loader2,
  Moon,
  Plus,
  Save,
  Sun,
  Trash2,
  Link2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DEFAULT_PLATFORM_SETTINGS,
  invalidatePlatformSettingsCache,
  notifyPlatformSettingsListeners,
  usePlatformSettings,
  type SocialLink,
  type PlatformSettings,
} from "@/hooks/use-platform-settings";
import { useTheme } from "@/contexts/ThemeContext";

// ────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────

async function uploadLogo(
  file: File,
  slot: "light" | "dark"
): Promise<string> {
  const ext = file.name.split(".").pop() || "png";
  const path = `logos/logo-${slot}.${ext}`;
  const { error } = await supabase.storage
    .from("thumbnails")
    .upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw error;
  const { data } = supabase.storage.from("thumbnails").getPublicUrl(path);
  // Bust cache with timestamp
  return `${data.publicUrl}?t=${Date.now()}`;
}

const PLATFORM_PRESETS = [
  "YouTube",
  "Facebook",
  "Instagram",
  "Twitter",
  "Telegram",
  "WhatsApp",
  "TikTok",
  "LinkedIn",
  "Snapchat",
  "Website",
];

// ────────────────────────────────────────────────────────────────
// Logo Upload Slot
// ────────────────────────────────────────────────────────────────

function LogoSlot({
  label,
  sublabel,
  currentUrl,
  onUploaded,
  previewBg,
  icon: Icon,
}: {
  label: string;
  sublabel: string;
  currentUrl: string | null;
  onUploaded: (url: string) => void;
  previewBg: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(currentUrl);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setPreview(currentUrl);
  }, [currentUrl]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) {
      toast.error("حجم الصورة يجب أن يكون أقل من 2 ميجا");
      return;
    }
    setPreview(URL.createObjectURL(f));
    setUploading(true);
    try {
      const slot = label.includes("الفاتح") ? "light" : "dark";
      const url = await uploadLogo(f, slot);
      onUploaded(url);
      toast.success("تم رفع الشعار بنجاح");
    } catch (err: any) {
      toast.error(err?.message || "فشل رفع الشعار");
      setPreview(currentUrl);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-muted-foreground" />
        <div>
          <div className="font-semibold text-sm">{label}</div>
          <div className="text-xs text-muted-foreground">{sublabel}</div>
        </div>
      </div>

      {/* Preview swatch */}
      <motion.div
        layout
        className={`relative rounded-2xl border border-border overflow-hidden flex items-center justify-center h-40 ${previewBg}`}
      >
        <AnimatePresence mode="wait">
          {preview ? (
            <motion.img
              key={preview}
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.92 }}
              transition={{ duration: 0.3 }}
              src={preview}
              alt={label}
              className="h-20 w-auto object-contain rounded-lg"
            />
          ) : (
            <motion.div
              key="placeholder"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-2 text-muted-foreground/60"
            >
              <ImageIcon className="w-8 h-8" />
              <span className="text-xs">لا يوجد شعار</span>
            </motion.div>
          )}
        </AnimatePresence>

        {uploading && (
          <div className="absolute inset-0 bg-background/70 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        )}
      </motion.div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFile}
      />
      <Button
        variant="outline"
        size="sm"
        className="w-full gap-2"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
      >
        {uploading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <ImageIcon className="w-4 h-4" />
        )}
        {uploading ? "جارٍ الرفع…" : "رفع شعار"}
      </Button>

      {preview && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-destructive hover:text-destructive gap-2 text-xs"
          onClick={() => {
            setPreview(null);
            onUploaded("");
          }}
        >
          <Trash2 className="w-3.5 h-3.5" />
          إزالة الشعار
        </Button>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Social Link Row
// ────────────────────────────────────────────────────────────────

function SocialLinkRow({
  link,
  index,
  total,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  link: SocialLink;
  index: number;
  total: number;
  onChange: (updated: SocialLink) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8, scale: 0.97 }}
      transition={{ duration: 0.2 }}
      className="flex items-center gap-2 bg-secondary/40 rounded-xl p-3 border border-border"
    >
      <GripVertical className="w-4 h-4 text-muted-foreground/40 shrink-0 cursor-grab" />

      <div className="flex-1 grid grid-cols-2 gap-2 min-w-0">
        <div className="relative">
          <select
            value={PLATFORM_PRESETS.includes(link.platform) ? link.platform : "custom"}
            onChange={(e) => {
              if (e.target.value !== "custom") {
                onChange({ ...link, platform: e.target.value });
              }
            }}
            className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring appearance-none"
            dir="rtl"
          >
            {PLATFORM_PRESETS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
            {!PLATFORM_PRESETS.includes(link.platform) && (
              <option value="custom">{link.platform}</option>
            )}
            <option value="custom">أخرى…</option>
          </select>
        </div>

        <Input
          placeholder="https://..."
          value={link.url}
          onChange={(e) => onChange({ ...link, url: e.target.value })}
          className="h-9 text-sm"
          dir="ltr"
        />
      </div>

      <div className="flex flex-col gap-0.5 shrink-0">
        <button
          onClick={onMoveUp}
          disabled={index === 0}
          className="p-1 rounded hover:bg-secondary disabled:opacity-20 transition-colors"
        >
          <ChevronUp className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onMoveDown}
          disabled={index === total - 1}
          className="p-1 rounded hover:bg-secondary disabled:opacity-20 transition-colors"
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </div>

      <button
        onClick={onRemove}
        className="p-2 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors shrink-0"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </motion.div>
  );
}

// ────────────────────────────────────────────────────────────────
// Main Page
// ────────────────────────────────────────────────────────────────

const AdminBrandingSettings = () => {
  const { settings: loaded, loading } = usePlatformSettings();
  const { theme } = useTheme();

  const [form, setForm] = useState<PlatformSettings>(DEFAULT_PLATFORM_SETTINGS);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const debouncerRef = useRef<number | null>(null);
  const firstLoad = useRef(true);

  useEffect(() => {
    if (!loading && firstLoad.current) {
      setForm(loaded);
      firstLoad.current = false;
    }
  }, [loading, loaded]);

  const scheduleSave = useCallback(
    async (next: PlatformSettings) => {
      if (debouncerRef.current) window.clearTimeout(debouncerRef.current);
      setStatus("saving");
      debouncerRef.current = window.setTimeout(async () => {
        try {
          const { error } = await (supabase as any)
            .from("platform_settings")
            .update({
              logo_light_url: next.logo_light_url || null,
              logo_dark_url: next.logo_dark_url || null,
              social_links: next.social_links,
              hero_headline: next.hero_headline || null,
              hero_subtext: next.hero_subtext || null,
              hero_cta_label: next.hero_cta_label || null,
              hero_cta_url: next.hero_cta_url || null,
            })
            .eq("id", 1);
          if (error) throw error;
          invalidatePlatformSettingsCache();
          notifyPlatformSettingsListeners(next);
          setStatus("saved");
          setTimeout(() => setStatus("idle"), 2000);
        } catch (e: any) {
          toast.error(e?.message || "فشل الحفظ");
          setStatus("error");
          setTimeout(() => setStatus("idle"), 3000);
        }
      }, 600);
    },
    []
  );

  const update = useCallback(
    (patch: Partial<PlatformSettings>) => {
      setForm((prev) => {
        const next = { ...prev, ...patch };
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave]
  );

  const addLink = () => {
    update({
      social_links: [...form.social_links, { platform: "Facebook", url: "" }],
    });
  };

  const removeLink = (i: number) => {
    const next = form.social_links.filter((_, idx) => idx !== i);
    update({ social_links: next });
  };

  const changeLink = (i: number, val: SocialLink) => {
    const next = form.social_links.map((l, idx) => (idx === i ? val : l));
    update({ social_links: next });
  };

  const moveLink = (i: number, dir: -1 | 1) => {
    const arr = [...form.social_links];
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    update({ social_links: arr });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8" dir="rtl">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-start justify-between gap-4 flex-wrap"
      >
        <div className="flex items-center gap-3">
          <Link
            to="/admin/settings"
            className="p-2 rounded-xl hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
          >
            <ArrowRight className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">
              الهوية البصرية والتواصل
            </h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              شعار المنصة وروابط التواصل الاجتماعي
            </p>
          </div>
        </div>

        {/* Save status */}
        <AnimatePresence mode="wait">
          {status !== "idle" && (
            <motion.div
              key={status}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold ${
                status === "saving"
                  ? "bg-secondary text-muted-foreground"
                  : status === "saved"
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : "bg-destructive/10 text-destructive"
              }`}
            >
              {status === "saving" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : status === "saved" ? (
                <Check className="w-4 h-4" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {status === "saving"
                ? "جارٍ الحفظ…"
                : status === "saved"
                ? "تم الحفظ"
                : "حدث خطأ"}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* ── Logos Section ── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="rounded-2xl border border-border bg-card p-6 space-y-6"
      >
        <div className="flex items-center gap-3 pb-4 border-b border-border">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <ImageIcon className="w-5 h-5 text-primary" />
          </div>
          <div>
            <div className="font-bold">شعار المنصة</div>
            <p className="text-xs text-muted-foreground">
              يظهر في شريط التنقل والتذييل. يُفضّل PNG شفّاف، بحد أقصى 2 ميجا.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <LogoSlot
            label="الشعار — الوضع الفاتح"
            sublabel="يُعرض عندما تكون واجهة الموقع فاتحة"
            currentUrl={form.logo_light_url}
            onUploaded={(url) => update({ logo_light_url: url || null })}
            previewBg="bg-white"
            icon={Sun}
          />
          <LogoSlot
            label="الشعار — الوضع الداكن"
            sublabel="يُعرض عندما تكون واجهة الموقع داكنة"
            currentUrl={form.logo_dark_url}
            onUploaded={(url) => update({ logo_dark_url: url || null })}
            previewBg="bg-zinc-900"
            icon={Moon}
          />
        </div>

        <div className="rounded-xl bg-secondary/40 border border-border px-4 py-3 text-xs text-muted-foreground">
          <strong>ملاحظة:</strong> إذا لم يُرفع شعار للوضع الداكن، سيُستخدم الشعار الفاتح تلقائيًا.
          وإذا لم يُرفع أي شعار، سيظل الشعار الافتراضي{" "}
          <code className="bg-background rounded px-1">/logo.png</code> مستخدمًا.
        </div>
      </motion.div>

      {/* ── Social Links Section ── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-2xl border border-border bg-card p-6 space-y-5"
      >
        <div className="flex items-center justify-between gap-4 pb-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Globe className="w-5 h-5 text-primary" />
            </div>
            <div>
              <div className="font-bold">روابط التواصل الاجتماعي</div>
              <p className="text-xs text-muted-foreground">
                تظهر في تذييل الصفحة. يمكنك إضافة أي منصة وإعادة ترتيبها.
              </p>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={addLink} className="gap-1.5 shrink-0">
            <Plus className="w-4 h-4" />
            إضافة
          </Button>
        </div>

        <AnimatePresence initial={false}>
          {form.social_links.length === 0 && (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-3 py-10 text-muted-foreground/60"
            >
              <Link2 className="w-8 h-8" />
              <p className="text-sm">لا توجد روابط بعد. اضغط "إضافة" لإضافة أولى.</p>
            </motion.div>
          )}

          {form.social_links.map((link, i) => (
            <SocialLinkRow
              key={i}
              link={link}
              index={i}
              total={form.social_links.length}
              onChange={(val) => changeLink(i, val)}
              onRemove={() => removeLink(i)}
              onMoveUp={() => moveLink(i, -1)}
              onMoveDown={() => moveLink(i, 1)}
            />
          ))}
        </AnimatePresence>

        {form.social_links.length > 0 && (
          <p className="text-xs text-muted-foreground pt-1">
            التغييرات تُحفظ تلقائيًا. اضغط الأسهم لإعادة الترتيب.
          </p>
        )}
      </motion.div>
    </div>
  );
};

export default AdminBrandingSettings;
