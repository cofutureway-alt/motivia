import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  usePlatformSettings,
  invalidatePlatformSettingsCache,
  notifyPlatformSettingsListeners,
} from "@/hooks/use-platform-settings";
import { useRegistrationFields } from "@/hooks/use-registration-fields";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, GraduationCap, Info } from "lucide-react";

/**
 * Grade-lock master switch.
 *
 * The lock is effective only when the signup form contains the
 * "الصف الدراسي" (stage_id) field — shown live on this page so the admin
 * understands the coupling.
 */
const AdminGradeLockSettings = () => {
  const { settings, loading: settingsLoading } = usePlatformSettings();
  const { fields, loading: fieldsLoading } = useRegistrationFields();
  const [saving, setSaving] = useState(false);

  const stageFieldPresent = fields.some((f) => f.field_key === "stage_id");
  const lockEnabled = settings.grade_lock_enabled === true;

  const handleToggle = async (next: boolean) => {
    setSaving(true);
    try {
      const { error } = await (supabase as any)
        .from("platform_settings")
        .update({ grade_lock_enabled: next })
        .eq("id", 1);
      if (error) throw error;
      const nextSettings = { ...settings, grade_lock_enabled: next };
      invalidatePlatformSettingsCache();
      notifyPlatformSettingsListeners(nextSettings as any);
      toast.success(next ? "تم تفعيل قفل الصفوف الدراسية" : "تم إيقاف قفل الصفوف الدراسية");
    } catch (e: any) {
      toast.error(e?.message || "تعذّر الحفظ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-foreground">قفل الصفوف الدراسية</h1>
        <p className="text-muted-foreground mt-1">
          التحكم في رؤية الكورسات حسب صف الطالب.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="w-5 h-5 text-primary" />
            تفعيل القفل
          </CardTitle>
          <CardDescription>
            عند التفعيل يرى الطالب فقط الكورسات المرتبطة بصفه الدراسي. المدراء وأولياء الأمور
            والزوار لا يتأثرون، والطالب المشترك في كورس يحتفظ بوصوله دائمًا.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {settingsLoading ? (
            <Skeleton className="h-10 w-40" />
          ) : (
            <label className="flex items-center justify-between gap-4 cursor-pointer select-none">
              <span className="text-sm font-bold">قفل الكورسات على صف الطالب</span>
              <Switch
                checked={lockEnabled}
                disabled={saving}
                onCheckedChange={handleToggle}
              />
            </label>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <GraduationCap className="w-5 h-5 text-primary" />
            شرط التفعيل
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {fieldsLoading ? (
            <Skeleton className="h-12 w-full" />
          ) : stageFieldPresent ? (
            <div className="flex items-start gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
              <Badge className="bg-emerald-600 shrink-0">مستوفى</Badge>
              <p className="text-sm text-muted-foreground leading-relaxed">
                حقل <span className="font-bold text-foreground">الصف الدراسي</span> موجود في نموذج
                التسجيل — القفل سيعمل مباشرة عند تفعيله.
              </p>
            </div>
          ) : (
            <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
              <Badge variant="outline" className="border-amber-600 text-amber-600 dark:text-amber-400 shrink-0">
                غير مستوفى
              </Badge>
              <p className="text-sm text-muted-foreground leading-relaxed">
                أضف حقل <span className="font-bold text-foreground">الصف الدراسي</span> من
                {" "}
                <a href="/admin/settings/registration-form" className="underline text-primary">
                  إعدادات نموذج التسجيل
                </a>{" "}
                حتى يعمل القفل. بدون هذا الحقل لن يكون للطالب صف نُربط به.
              </p>
            </div>
          )}
          <div className="flex items-start gap-2 text-xs text-muted-foreground p-3 rounded-lg bg-muted/50">
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            الكورس الواحد يمكن ربطه بأكثر من صف من صفحة تعديل بيانات الكورس.
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminGradeLockSettings;
