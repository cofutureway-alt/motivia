import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Check,
  Gauge,
  Loader2,
  Lock,
  MousePointerClick,
  Palette,
  Save,
  User,
  Mail,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  DEFAULT_PLAYER_SETTINGS,
  usePlayerSettings,
  type VideoPlayerSettings,
} from "@/hooks/use-player-settings";
import Watermark from "@/components/lesson/Watermark";

const OPTIONAL_SPEEDS = [1.25, 1.5, 2] as const;

const AdminVideoPlayerSettings = () => {
  const { settings: loaded, loading, setSettings: setStore } = usePlayerSettings();
  const { user, profile } = useAuth();
  const [form, setForm] = useState<VideoPlayerSettings>(DEFAULT_PLAYER_SETTINGS);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const debouncerRef = useRef<number | null>(null);
  const firstLoadRef = useRef(true);

  useEffect(() => {
    if (!loading) {
      setForm(loaded);
      firstLoadRef.current = false;
    }
  }, [loading, loaded]);

  const scheduleSave = useCallback((next: VideoPlayerSettings) => {
    if (debouncerRef.current) window.clearTimeout(debouncerRef.current);
    setStatus("saving");
    debouncerRef.current = window.setTimeout(async () => {
      const { error } = await supabase
        .from("video_player_settings")
        .update({
          double_tap_seek_enabled: next.double_tap_seek_enabled,
          seek_forward_seconds: next.seek_forward_seconds,
          seek_backward_seconds: next.seek_backward_seconds,
          speed_control_enabled: next.speed_control_enabled,
          allowed_speeds: next.allowed_speeds,
          completion_gate_enabled: next.completion_gate_enabled,
          completion_required_percentage: next.completion_required_percentage,
          watermark_color: next.watermark_color,
          watermark_show_email: next.watermark_show_email,
          watermark_show_name: next.watermark_show_name,
          watermark_speed_seconds: next.watermark_speed_seconds,
          watermark_opacity: next.watermark_opacity,
        })
        .eq("id", 1);
      if (error) {
        setStatus("error");
        toast.error("تعذّر حفظ الإعدادات");
        return;
      }
      setStatus("saved");
      setStore(next);
      window.setTimeout(() => setStatus("idle"), 1600);
    }, 500);
  }, [setStore]);

  const update = <K extends keyof VideoPlayerSettings>(key: K, value: VideoPlayerSettings[K]) => {
    if (firstLoadRef.current) return;
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      scheduleSave(next);
      return next;
    });
  };

  const toggleSpeed = (s: number) => {
    const has = form.allowed_speeds.includes(s);
    const next = has
      ? form.allowed_speeds.filter((v) => v !== s)
      : [...form.allowed_speeds, s].sort((a, b) => a - b);
    update("allowed_speeds", next);
  };

  const watermarkText = (() => {
    const parts: string[] = [];
    if (form.watermark_show_name && profile?.full_name) parts.push(profile.full_name);
    if (form.watermark_show_email && user?.email) parts.push(user.email);
    return parts.join(" · ") || user?.email || "طالب المنصة";
  })();

  return (
    <div className="max-w-5xl mx-auto space-y-6" dir="rtl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link
            to="/admin/settings"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-2"
          >
            <ArrowRight className="w-4 h-4" />
            الإعدادات
          </Link>
          <h1 className="text-2xl md:text-3xl font-bold">إعدادات مشغّل الفيديو</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            تسري الإعدادات على جميع الدروس فور حفظها.
          </p>
        </div>
        <SaveIndicator status={status} />
      </div>

      {loading ? (
        <div className="rounded-2xl border border-border/60 bg-card p-10 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-5">
          {/* Seek */}
          <Card
            icon={<MousePointerClick className="w-5 h-5" />}
            title="التقديم والإرجاع بالنقر المزدوج"
            desc="عند التفعيل، النقر المزدوج على يمين الفيديو يقدّم، وعلى اليسار يُرجع — كما في تطبيق يوتيوب."
          >
            <Row>
              <Label className="font-semibold">تفعيل النقر المزدوج للتقديم/الإرجاع</Label>
              <Switch
                checked={form.double_tap_seek_enabled}
                onCheckedChange={(v) => update("double_tap_seek_enabled", v)}
              />
            </Row>
            <div className="grid sm:grid-cols-2 gap-4 pt-2">
              <div>
                <Label className="text-sm">ثواني التقديم</Label>
                <Input
                  type="number"
                  min={1}
                  max={120}
                  value={form.seek_forward_seconds}
                  onChange={(e) =>
                    update("seek_forward_seconds", clamp(parseInt(e.target.value) || 1, 1, 120))
                  }
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label className="text-sm">ثواني الإرجاع</Label>
                <Input
                  type="number"
                  min={1}
                  max={120}
                  value={form.seek_backward_seconds}
                  onChange={(e) =>
                    update("seek_backward_seconds", clamp(parseInt(e.target.value) || 1, 1, 120))
                  }
                  className="mt-1.5"
                />
              </div>
            </div>
          </Card>

          {/* Speed */}
          <Card
            icon={<Gauge className="w-5 h-5" />}
            title="التحكم في سرعة التشغيل"
            desc="السرعة العادية (1x) متاحة دائمًا. يمكنك تفعيل أو تعطيل التحكم في السرعة نهائيًا، وتحديد السرعات الإضافية المسموحة."
          >
            <Row>
              <Label className="font-semibold">تفعيل التحكم في السرعة</Label>
              <Switch
                checked={form.speed_control_enabled}
                onCheckedChange={(v) => update("speed_control_enabled", v)}
              />
            </Row>
            {form.speed_control_enabled && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="pt-2"
              >
                <Label className="text-sm mb-2 block">السرعات المسموحة</Label>
                <div className="flex flex-wrap gap-2">
                  <SpeedPill label="1x" checked disabled />
                  {OPTIONAL_SPEEDS.map((s) => (
                    <SpeedPill
                      key={s}
                      label={`${s}x`}
                      checked={form.allowed_speeds.includes(s)}
                      onClick={() => toggleSpeed(s)}
                    />
                  ))}
                </div>
              </motion.div>
            )}
          </Card>

          {/* Completion gate */}
          <Card
            icon={<Lock className="w-5 h-5" />}
            title="اشتراط نسبة مشاهدة قبل إتمام الدرس"
            desc="عند التفعيل، لا يمكن للطالب تخطّي الفيديو ولا تعليم الدرس كمكتمل قبل مشاهدة النسبة المطلوبة."
          >
            <Row>
              <Label className="font-semibold">تفعيل شرط نسبة المشاهدة</Label>
              <Switch
                checked={form.completion_gate_enabled}
                onCheckedChange={(v) => update("completion_gate_enabled", v)}
              />
            </Row>
            {form.completion_gate_enabled && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="pt-3 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <Label className="text-sm">النسبة المطلوبة</Label>
                  <span className="text-lg font-bold tabular-nums text-primary">
                    {form.completion_required_percentage}%
                  </span>
                </div>
                <Slider
                  min={1}
                  max={100}
                  step={1}
                  value={[form.completion_required_percentage]}
                  onValueChange={(v) => update("completion_required_percentage", v[0])}
                />
              </motion.div>
            )}
          </Card>

          {/* Watermark */}
          <Card
            icon={<Palette className="w-5 h-5" />}
            title="العلامة المائية"
            desc="نص شفاف متحرّك يظهر فوق الفيديو ويُصعّب اقتصاصه من الشاشة."
          >
            <div className="grid lg:grid-cols-2 gap-6">
              <div className="space-y-4">
                <Row>
                  <Label className="font-semibold flex items-center gap-2">
                    <Mail className="w-4 h-4" /> عرض البريد الإلكتروني
                  </Label>
                  <Switch
                    checked={form.watermark_show_email}
                    onCheckedChange={(v) => update("watermark_show_email", v)}
                  />
                </Row>
                <Row>
                  <Label className="font-semibold flex items-center gap-2">
                    <User className="w-4 h-4" /> عرض اسم الطالب
                  </Label>
                  <Switch
                    checked={form.watermark_show_name}
                    onCheckedChange={(v) => update("watermark_show_name", v)}
                  />
                </Row>

                <div>
                  <Label className="text-sm mb-2 block">اللون</Label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={form.watermark_color}
                      onChange={(e) => update("watermark_color", e.target.value)}
                      className="w-12 h-10 rounded-md border border-border cursor-pointer bg-transparent"
                      aria-label="لون العلامة المائية"
                    />
                    <Input
                      value={form.watermark_color}
                      onChange={(e) => update("watermark_color", e.target.value)}
                      className="max-w-[140px] font-mono"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <Label className="text-sm">الشفافية</Label>
                    <span className="text-sm font-bold tabular-nums">
                      {Math.round(form.watermark_opacity * 100)}%
                    </span>
                  </div>
                  <Slider
                    min={5}
                    max={100}
                    step={5}
                    value={[Math.round(form.watermark_opacity * 100)]}
                    onValueChange={(v) => update("watermark_opacity", v[0] / 100)}
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <Label className="text-sm">سرعة الحركة (ثواني/انتقال)</Label>
                    <span className="text-sm font-bold tabular-nums">
                      {form.watermark_speed_seconds}ث
                    </span>
                  </div>
                  <Slider
                    min={4}
                    max={60}
                    step={1}
                    value={[form.watermark_speed_seconds]}
                    onValueChange={(v) => update("watermark_speed_seconds", v[0])}
                  />
                </div>
              </div>

              <div>
                <Label className="text-sm mb-2 block">معاينة مباشرة</Label>
                <div
                  className="relative aspect-video w-full rounded-xl overflow-hidden border border-border bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900"
                  dir="ltr"
                >
                  <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-xs uppercase tracking-widest">
                    Sample video frame
                  </div>
                  <Watermark
                    text={watermarkText}
                    color={form.watermark_color}
                    opacity={form.watermark_opacity}
                    speedSeconds={form.watermark_speed_seconds}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  المعاينة تعرض نص العلامة كما سيراه الطالب: {watermarkText}
                </p>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

const SaveIndicator = ({ status }: { status: "idle" | "saving" | "saved" | "error" }) => {
  if (status === "idle") return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className={`inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded-full border ${
        status === "saving"
          ? "border-border bg-card text-muted-foreground"
          : status === "saved"
            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
            : "border-destructive/40 bg-destructive/10 text-destructive"
      }`}
    >
      {status === "saving" && <Loader2 className="w-4 h-4 animate-spin" />}
      {status === "saved" && <Check className="w-4 h-4" />}
      {status === "error" && <Save className="w-4 h-4" />}
      {status === "saving" ? "جارٍ الحفظ…" : status === "saved" ? "تم حفظ التغييرات" : "تعذّر الحفظ"}
    </motion.div>
  );
};

const Card = ({
  icon,
  title,
  desc,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  children: React.ReactNode;
}) => (
  <motion.section
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    className="rounded-2xl border border-border/60 bg-card p-5 md:p-6 space-y-4"
  >
    <div className="flex items-start gap-3">
      <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div>
        <div className="font-bold text-lg">{title}</div>
        <p className="text-sm text-muted-foreground mt-0.5">{desc}</p>
      </div>
    </div>
    <div className="space-y-3">{children}</div>
  </motion.section>
);

const Row = ({ children }: { children: React.ReactNode }) => (
  <div className="flex items-center justify-between gap-4 py-2 border-b border-border/50 last:border-0">
    {children}
  </div>
);

const SpeedPill = ({
  label,
  checked,
  disabled,
  onClick,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onClick}
    className={`px-4 py-2 rounded-full text-sm font-bold border transition-all ${
      checked
        ? "bg-primary text-primary-foreground border-primary shadow-md shadow-primary/20"
        : "bg-background text-foreground border-border hover:border-primary/50"
    } ${disabled ? "opacity-70 cursor-not-allowed" : "cursor-pointer"}`}
  >
    {label}
  </button>
);

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

export default AdminVideoPlayerSettings;
