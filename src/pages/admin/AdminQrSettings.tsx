import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Check,
  Loader2,
  Save,
  User,
  Image as ImageIcon,
  IdCard,
  GraduationCap,
  Phone,
  BookOpen,
  BarChart3,
  AlertTriangle,
  Focus,
  QrCode,
  ListChecks,
  ClipboardList,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  DEFAULT_QR_SETTINGS,
  useQrSettings,
  type QrDisplaySettings,
} from "@/hooks/use-qr-settings";

type FieldMeta = {
  key: keyof QrDisplaySettings;
  title: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
  sensitive?: boolean;
};

const FIELDS: FieldMeta[] = [
  { key: "show_full_name", title: "الاسم الكامل", desc: "يظهر اسم الطالب في أعلى الصفحة.", icon: User },
  { key: "show_avatar", title: "الصورة الشخصية", desc: "صورة البروفايل الخاصة بالطالب.", icon: ImageIcon },
  { key: "show_student_id", title: "رقم الطالب", desc: "الرقم التعريفي المكوّن من 6 أرقام.", icon: IdCard },
  { key: "show_stage", title: "المرحلة الدراسية", desc: "اسم المرحلة المسجّل بها.", icon: GraduationCap },
  { key: "show_phone", title: "رقم الهاتف", desc: "رقم الطالب — بيانات حسّاسة، مغلقة افتراضيًا.", icon: Phone, sensitive: true },
  { key: "show_enrolled_courses_count", title: "عدد الكورسات", desc: "إجمالي عدد الدورات التي التحق بها.", icon: BookOpen },
  { key: "show_enrolled_courses_list", title: "جدول الكورسات المسجّلة", desc: "جدول يعرض كل الكورسات المسجّل بها الطالب.", icon: ListChecks },
  { key: "show_quiz_stats", title: "إحصائيات الاختبارات", desc: "الإجمالي، الناجحة، الراسبة، ونسبة النجاح.", icon: BarChart3 },
  { key: "show_quiz_attempts_list", title: "جدول محاولات الاختبارات", desc: "جدول بكل محاولات الطالب مع الفلاتر والنتائج.", icon: ClipboardList },
  { key: "show_assignment_stats", title: "إحصائيات الواجبات", desc: "الإجمالي، المكتملة، الناجحة، والراسبة (بما فيها لم يتم التسليم).", icon: FileText },
  { key: "show_weak_subjects", title: "نقاط الضعف بالمواد", desc: "تحليل تلقائي للمواد التي يحتاج فيها الطالب دعمًا.", icon: AlertTriangle },
  { key: "show_weak_courses", title: "نقاط الضعف بالكورسات", desc: "تحليل تلقائي للكورسات الأضعف أداءً.", icon: Focus },
];

const AdminQrSettings = () => {
  const { settings: loaded, loading, setSettings: setStore } = useQrSettings();
  const [form, setForm] = useState<QrDisplaySettings>(DEFAULT_QR_SETTINGS);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const debouncerRef = useRef<number | null>(null);
  const firstLoadRef = useRef(true);

  useEffect(() => {
    if (!loading) {
      setForm(loaded);
      firstLoadRef.current = false;
    }
  }, [loading, loaded]);

  const scheduleSave = useCallback(
    (next: QrDisplaySettings) => {
      if (debouncerRef.current) window.clearTimeout(debouncerRef.current);
      setStatus("saving");
      debouncerRef.current = window.setTimeout(async () => {
        const { error } = await (supabase as any)
          .from("qr_display_settings")
          .update(next)
          .eq("id", 1);
        if (error) {
          setStatus("error");
          toast.error("تعذّر حفظ الإعدادات");
          return;
        }
        setStatus("saved");
        setStore(next);
        window.setTimeout(() => setStatus("idle"), 1500);
      }, 400);
    },
    [setStore],
  );

  const toggle = (key: keyof QrDisplaySettings, val: boolean) => {
    if (firstLoadRef.current) return;
    setForm((prev) => {
      const next = { ...prev, [key]: val };
      scheduleSave(next);
      return next;
    });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6" dir="rtl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link
            to="/admin/settings"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-2"
          >
            <ArrowRight className="w-4 h-4" />
            الإعدادات
          </Link>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3">
            <span className="inline-flex w-10 h-10 rounded-xl bg-primary/10 text-primary items-center justify-center">
              <QrCode className="w-5 h-5" />
            </span>
            إعدادات QR الطالب
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            تحكّم في البيانات التي تظهر عند مسح رمز QR الخاص بالطالب — دون الحاجة لتسجيل دخول.
          </p>
        </div>
        <SaveIndicator status={status} />
      </div>

      {loading ? (
        <div className="rounded-2xl border border-border/60 bg-card p-10 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid gap-3">
          {FIELDS.map((f, i) => {
            const Icon = f.icon;
            const active = form[f.key];
            return (
              <motion.div
                key={f.key}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className={`rounded-2xl border p-4 md:p-5 flex items-center gap-4 transition-colors ${
                  active
                    ? "border-primary/40 bg-primary/[0.04]"
                    : "border-border/60 bg-card"
                }`}
              >
                <div
                  className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                    active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Label className="font-bold text-base">{f.title}</Label>
                    {f.sensitive && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400 font-bold">
                        حسّاس
                      </span>
                    )}
                  </div>
                  <p className="text-xs md:text-sm text-muted-foreground mt-0.5">
                    {f.desc}
                  </p>
                </div>
                <Switch checked={active} onCheckedChange={(v) => toggle(f.key, v)} />
              </motion.div>
            );
          })}
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
      {status === "saving" ? "جارٍ الحفظ…" : status === "saved" ? "تم الحفظ" : "تعذّر الحفظ"}
    </motion.div>
  );
};

export default AdminQrSettings;
