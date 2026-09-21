import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, ExternalLink, Loader2, MousePointerClick, Save, Type } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_PLATFORM_SETTINGS, invalidatePlatformSettingsCache, notifyPlatformSettingsListeners, usePlatformSettings, type PlatformSettings } from "@/hooks/use-platform-settings";

export default function AdminHomepageSettings() {
  const { settings: loaded, loading } = usePlatformSettings();
  const [form, setForm] = useState<PlatformSettings>(DEFAULT_PLATFORM_SETTINGS);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const firstLoad = useRef(true);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!loading && firstLoad.current) {
      setForm(loaded);
      firstLoad.current = false;
    }
  }, [loaded, loading]);

  const update = (patch: Partial<PlatformSettings>) => {
    setForm((previous) => {
      const next = { ...previous, ...patch };
      if (timer.current) window.clearTimeout(timer.current);
      setStatus("saving");
      timer.current = window.setTimeout(async () => {
        try {
          const { error } = await (supabase as any).from("platform_settings").update({
            hero_headline: next.hero_headline || null,
            hero_subtext: next.hero_subtext || null,
            hero_cta_label: next.hero_cta_label || null,
            hero_cta_url: next.hero_cta_url || null,
          }).eq("id", 1);
          if (error) throw error;
          invalidatePlatformSettingsCache();
          notifyPlatformSettingsListeners(next);
          setStatus("saved");
          window.setTimeout(() => setStatus("idle"), 2000);
        } catch (error: any) {
          toast.error(error?.message || "فشل حفظ إعدادات الصفحة الرئيسية");
          setStatus("error");
        }
      }, 600);
      return next;
    });
  };

  if (loading) return <div className="flex h-48 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return <div className="mx-auto max-w-3xl space-y-6" dir="rtl">
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-center gap-3"><Link to="/admin/settings" className="rounded-xl p-2 text-muted-foreground hover:bg-secondary"><ArrowRight className="h-5 w-5" /></Link><div><h1 className="text-2xl font-black">إعدادات الصفحة الرئيسية</h1><p className="mt-1 text-sm text-muted-foreground">تعديل النصوص والزر الظاهر في Hero الخاص بتصميم Motivai.</p></div></div>
      {status !== "idle" && <div className="flex items-center gap-2 rounded-full bg-secondary px-4 py-2 text-sm font-semibold">{status === "saving" ? <Loader2 className="h-4 w-4 animate-spin" /> : status === "saved" ? <Check className="h-4 w-4 text-emerald-600" /> : <Save className="h-4 w-4 text-destructive" />}{status === "saving" ? "جارٍ الحفظ…" : status === "saved" ? "تم الحفظ" : "حدث خطأ"}</div>}
    </div>

    <section className="space-y-5 rounded-3xl border border-border bg-card p-6 shadow-subtle">
      <div className="flex items-center gap-3 border-b border-border pb-4"><span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><Type className="h-5 w-5" /></span><div><h2 className="font-bold">نصوص Hero</h2><p className="text-xs text-muted-foreground">لا توجد صورة معلم في تصميم Motivai.</p></div></div>
      <div className="space-y-2"><Label htmlFor="homepage-headline">العنوان الرئيسي</Label><Textarea id="homepage-headline" value={form.hero_headline ?? ""} onChange={(event) => update({ hero_headline: event.target.value })} rows={3} className="text-lg font-bold" placeholder="تعلّم بطريقتك\nوتقدّم كل يوم" /></div>
      <div className="space-y-2"><Label htmlFor="homepage-subtext">النص الداعم</Label><Textarea id="homepage-subtext" value={form.hero_subtext ?? ""} onChange={(event) => update({ hero_subtext: event.target.value })} rows={4} placeholder="وصف مختصر عن المنصة" /></div>
    </section>

    <section className="space-y-5 rounded-3xl border border-border bg-card p-6 shadow-subtle">
      <div className="flex items-center gap-3 border-b border-border pb-4"><span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><MousePointerClick className="h-5 w-5" /></span><div><h2 className="font-bold">زر الدعوة للتعلم</h2><p className="text-xs text-muted-foreground">يظهر في Hero ويستخدم رابطًا داخل المنصة.</p></div></div>
      <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="homepage-cta-label">نص الزر</Label><Input id="homepage-cta-label" value={form.hero_cta_label ?? ""} onChange={(event) => update({ hero_cta_label: event.target.value })} /></div><div className="space-y-2"><Label htmlFor="homepage-cta-url">رابط الزر</Label><Input id="homepage-cta-url" dir="ltr" value={form.hero_cta_url ?? ""} onChange={(event) => update({ hero_cta_url: event.target.value })} /></div></div>
    </section>

    <a href="/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-bold text-primary hover:underline"><ExternalLink className="h-4 w-4" /> فتح الصفحة الرئيسية</a>
  </div>;
}