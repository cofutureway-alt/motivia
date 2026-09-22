import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  usePlatformSettings,
  invalidatePlatformSettingsCache,
  notifyPlatformSettingsListeners,
} from "@/hooks/use-platform-settings";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { KeyRound, Copy, ExternalLink, Info } from "lucide-react";

const SUPABASE_PROJECT_ID = "itzinndvggtghztpdnhc";
const REDIRECT_URI = `https://${SUPABASE_PROJECT_ID}.supabase.co/auth/v1/callback`;

/**
 * Google login (Supabase native OAuth provider) master switch + setup guide.
 *
 * The Google OAuth client id/secret itself is configured in the Supabase
 * dashboard (Auth → Providers → Google) — this flag only controls whether the
 * Google button is rendered on the Login/Signup pages.
 */
const AdminGoogleAuthSettings = () => {
  const { settings, loading } = usePlatformSettings();
  const [saving, setSaving] = useState(false);
  const enabled = settings.google_auth_enabled === true;

  const handleToggle = async (next: boolean) => {
    setSaving(true);
    try {
      const { error } = await (supabase as any)
        .from("platform_settings")
        .update({ google_auth_enabled: next })
        .eq("id", 1);
      if (error) throw error;
      const nextSettings = { ...settings, google_auth_enabled: next };
      invalidatePlatformSettingsCache();
      notifyPlatformSettingsListeners(nextSettings as any);
      toast.success(
        next ? "تم تفعيل تسجيل الدخول بحساب جوجل" : "تم إيقاف تسجيل الدخول بحساب جوجل",
      );
    } catch (e: any) {
      toast.error(e?.message || "تعذّر الحفظ");
    } finally {
      setSaving(false);
    }
  };

  const copyRedirect = async () => {
    try {
      await navigator.clipboard.writeText(REDIRECT_URI);
      toast.success("تم نسخ رابط إعادة التوجيه");
    } catch {
      toast.error("تعذّر النسخ، انسخ الرابط يدوياً");
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-foreground">تسجيل الدخول بحساب جوجل</h1>
        <p className="text-muted-foreground mt-1">
          تفعيل وإيقاف زر تسجيل الدخول/الإنشاء بحساب جوجل في صفحات الدخول والتسجيل.
        </p>
      </div>

      {/* Master switch */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="w-5 h-5 text-primary" />
            تفعيل تسجيل الدخول بجوجل
          </CardTitle>
          <CardDescription>
            عند التفعيل يظهر زر جوجل في صفحة تسجيل الدخول وصفحة إنشاء الحساب (للطلاب
            وأولياء الأمور). عند الإيقاف يُخفى الزر تماماً، مع بقاء الدخول برقم الهاتف/البريد
            وكلمة المرور يعمل دون تغيير.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-10 w-40" />
          ) : (
            <label className="flex items-center justify-between gap-4 cursor-pointer select-none">
              <span className="text-sm font-bold">إظهار زر تسجيل الدخول بحساب جوجل</span>
              <Switch checked={enabled} disabled={saving} onCheckedChange={handleToggle} />
            </label>
          )}
        </CardContent>
      </Card>

      {/* Setup guide */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ExternalLink className="w-5 h-5 text-primary" />
            إعداد مزود جوجل (مطلوب مرة واحدة)
          </CardTitle>
          <CardDescription>
            التبديل أعلاه يتحكم في الزر فقط. يجب ربط تطبيق جوجل بمشروع Supabase ليعمل
            تسجيل الدخول.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <span className="text-sm font-bold">رابط إعادة التوجيه (Redirect URI)</span>
            <div className="flex items-center gap-2">
              <code
                dir="ltr"
                className="flex-1 truncate rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs"
              >
                {REDIRECT_URI}
              </code>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 gap-2"
                onClick={copyRedirect}
              >
                <Copy className="w-3.5 h-3.5" />
                نسخ
              </Button>
            </div>
          </div>

          <ol className="space-y-3 text-sm text-muted-foreground list-decimal pr-5">
            <li>
              في <span className="font-bold text-foreground">Google Cloud Console</span> أنشئ
              مشروعاً (أو اختر مشروعاً موجوداً)، ثم فعّل مكتبة Google+ / OAuth.
            </li>
            <li>
              من <span className="font-bold text-foreground">APIs &amp; Services → Credentials</span>
              أنشئ <span className="font-bold text-foreground">OAuth Client ID</span> من نوع
              Web Application، وألصق رابط إعادة التوجيه أعلاه في
              <span className="font-bold text-foreground"> Authorized redirect URIs</span>.
            </li>
            <li>
              انسخ <span className="font-bold text-foreground">Client ID</span> و
              <span className="font-bold text-foreground"> Client Secret</span>.
            </li>
            <li>
              في لوحة Supabase: <span className="font-bold text-foreground">Authentication → Providers → Google</span>
              ، فعّل المزود والصق المفتاحين، ثم احفظ.
            </li>
            <li>
              في <span className="font-bold text-foreground">Authentication → URL Configuration</span>
              تأكد أن عنوان موقعك ضمن <span className="font-bold text-foreground">Redirect URLs</span>
              المسموح بها.
            </li>
          </ol>

          <Button
            type="button"
            variant="outline"
            className="gap-2"
            asChild
          >
            <a
              href={`https://supabase.com/dashboard/project/${SUPABASE_PROJECT_ID}/auth/providers`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="w-4 h-4" />
              فتح إعدادات المزودين في Supabase
            </a>
          </Button>
        </CardContent>
      </Card>

      {/* Warning */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Info className="w-5 h-5 text-amber-500" />
            ملاحظة هامة حول الإيقاف
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground leading-relaxed">
            المستخدمون الذين سجّلوا عبر جوجل فقط ولم يعيّنوا كلمة مرور أثناء
            الأونبوردنج لن يتمكنوا من الدخول بعد إيقاف الميزة. يُنصح المستخدمون بتعيين
            كلمة مرور اختيارية عند إكمال حسابهم.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminGoogleAuthSettings;
