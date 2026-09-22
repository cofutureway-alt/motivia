import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Loader2, ArrowLeft, Eye, EyeOff, GraduationCap, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import AuthLayout from "@/components/auth/AuthLayout";
import DynamicRegistrationField from "@/components/auth/DynamicRegistrationField";
import { useRegistrationFields } from "@/hooks/use-registration-fields";
import { isValidEgPhone, normalizeEgPhone } from "@/lib/phone";
import { getArabicAuthErrorMessage } from "@/lib/auth-errors";
import { KNOWN_PROFILE_COLUMNS } from "@/lib/registration-fields";

/**
 * Mandatory onboarding shown right after a Google signup (profiles created with
 * onboarding_completed = false). Content is role-aware: students fill the
 * remaining dynamic registration fields, parents confirm name + phone. Both can
 * optionally set a password so they are never locked out if the admin disables
 * Google login later.
 */
const Onboarding = () => {
  const { profile, refreshProfile } = useAuth();
  const role = profile?.role === "parent" ? "parent" : "student";

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <AuthLayout
      title="أكمل بيانات حسابك"
      subtitle={
        role === "student"
          ? "خطوة أخيرة حتى تبدأ رحلتك في المنصة"
          : "خطوة أخيرة لمتابعة أبنائك"
      }
      footer={
        <span className="inline-flex items-center gap-1.5">
          {role === "student" ? (
            <>
              <GraduationCap className="w-3.5 h-3.5" />
              إكمال حساب الطالب
            </>
          ) : (
            <>
              <Users className="w-3.5 h-3.5" />
              إكمال حساب ولي الأمر
            </>
          )}
        </span>
      }
    >
      {role === "parent" ? (
        <ParentOnboarding profile={profile} refreshProfile={refreshProfile} />
      ) : (
        <StudentOnboarding profile={profile} refreshProfile={refreshProfile} />
      )}
    </AuthLayout>
  );
};

type ProfileLite = {
  id?: string;
  full_name?: string | null;
  email?: string | null;
  phone_number?: string | null;
};

// ───────────────────────── Student ─────────────────────────
const StudentOnboarding = ({
  profile,
  refreshProfile,
}: {
  profile: ProfileLite | null;
  refreshProfile: () => Promise<void>;
}) => {
  const navigate = useNavigate();
  const { fields, loading: loadingFields } = useRegistrationFields();
  const [values, setValues] = useState<Record<string, any>>({
    full_name: profile?.full_name ?? "",
    email: profile?.email ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [showPwConfirm, setShowPwConfirm] = useState(false);

  // Google already provided name + email; password fields are handled below.
  const visibleFields = useMemo(
    () =>
      fields.filter(
        (f) =>
          !["password", "confirm_password", "full_name", "email"].includes(
            f.field_key,
          ),
      ),
    [fields],
  );

  const setValue = (k: string, v: any) => setValues((p) => ({ ...p, [k]: v }));

  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!String(values.full_name ?? "").trim()) e.full_name = "الاسم مطلوب";
    for (const f of visibleFields) {
      const raw = values[f.field_key];
      const val = typeof raw === "string" ? raw.trim() : raw;
      if (f.is_required) {
        if (val === undefined || val === null || val === "" || (f.field_type === "checkbox" && !val)) {
          e[f.field_key] = "هذا الحقل مطلوب";
          continue;
        }
      }
      if (!val && !f.is_required) continue;
      if (f.field_type === "phone" && !isValidEgPhone(String(val))) {
        e[f.field_key] = "أدخل رقم هاتف مصري صحيح (مثال: 01012345678)";
      }
    }
    const pw = String(values.password ?? "");
    const confirm = String(values.confirm_password ?? "");
    if (pw || confirm) {
      if (pw.length < 6) e.password = "كلمة المرور يجب ألا تقل عن 6 أحرف";
      else if (pw !== confirm) e.confirm_password = "كلمة المرور غير مطابقة";
    }
    return e;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const eMap = validate();
    setErrors(eMap);
    if (Object.keys(eMap).length > 0) return;

    const knownData: Record<string, any> = {};
    const customData: Record<string, any> = {};
    for (const f of visibleFields) {
      const v = values[f.field_key];
      if (v === undefined || v === null || v === "") continue;
      if (KNOWN_PROFILE_COLUMNS.has(f.field_key)) knownData[f.field_key] = v;
      else customData[f.field_key] = v;
    }
    knownData.full_name = String(values.full_name ?? "").trim();
    if (values.phone_number) {
      knownData.phone_number = normalizeEgPhone(String(values.phone_number));
    }
    if (Object.keys(customData).length > 0) knownData.custom_fields = customData;
    knownData.onboarding_completed = true;

    setLoading(true);
    const { error } = await (supabase as any)
      .from("profiles")
      .update(knownData)
      .eq("id", profile?.id);

    if (error) {
      setLoading(false);
      toast.error("تعذّر حفظ البيانات: " + getArabicAuthErrorMessage(error));
      return;
    }

    const pw = String(values.password ?? "");
    if (pw) {
      const { error: pwError } = await supabase.auth.updateUser({ password: pw });
      if (pwError) {
        toast.error("تم حفظ البيانات ولكن تعذّر تعيين كلمة المرور: " + getArabicAuthErrorMessage(pwError));
      }
    }

    await refreshProfile();
    setLoading(false);
    toast.success("تم إكمال حسابك بنجاح، أهلاً بك في منصة Motivai");
    navigate("/dashboard", { replace: true });
  };

  if (loadingFields) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-14 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <DynamicRegistrationField
        field={
          {
            id: "ob_name",
            field_key: "full_name",
            label: "الاسم بالكامل",
            field_type: "text",
            is_required: true,
            is_locked: false,
            options: null,
            order_index: 0,
          } as any
        }
        value={values.full_name}
        onChange={(v) => setValue("full_name", v)}
        error={errors.full_name}
        disabled={loading}
      />

      {visibleFields.map((f) => (
        <motion.div
          key={f.id}
          layout
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
        >
          <DynamicRegistrationField
            field={f}
            value={values[f.field_key]}
            onChange={(v) => setValue(f.field_key, v)}
            error={errors[f.field_key]}
            disabled={loading}
          />
        </motion.div>
      ))}

      <div className="pt-2 border-t border-border">
        <p className="text-xs text-muted-foreground mb-3">
          اختياري — عيّن كلمة مرور لتتمكن من الدخول بالبريد وكلمة المرور لاحقاً
          (مفيد إذا تم إيقاف الدخول بحساب جوجل).
        </p>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ob_password" className="text-sm font-bold">
              كلمة المرور (اختياري)
            </Label>
            <div className="relative">
              <Input
                id="ob_password"
                type={showPw ? "text" : "password"}
                value={values.password ?? ""}
                onChange={(e) => setValue("password", e.target.value)}
                placeholder="••••••••"
                className="pr-10 pl-10"
                disabled={loading}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPw((s) => !s)}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                tabIndex={-1}
              >
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="ob_confirm_password" className="text-sm font-bold">
              تأكيد كلمة المرور
            </Label>
            <div className="relative">
              <Input
                id="ob_confirm_password"
                type={showPwConfirm ? "text" : "password"}
                value={values.confirm_password ?? ""}
                onChange={(e) => setValue("confirm_password", e.target.value)}
                placeholder="••••••••"
                className="pr-10 pl-10"
                disabled={loading}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPwConfirm((s) => !s)}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                tabIndex={-1}
              >
                {showPwConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {errors.confirm_password && (
              <p className="text-xs text-destructive">{errors.confirm_password}</p>
            )}
          </div>
        </div>
      </div>

      <Button type="submit" className="w-full gap-2 font-bold" size="lg" disabled={loading}>
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            جارٍ الحفظ...
          </>
        ) : (
          <>
            إكمال الحساب
            <ArrowLeft className="w-4 h-4" />
          </>
        )}
      </Button>
    </form>
  );
};

// ───────────────────────── Parent ─────────────────────────
const ParentOnboarding = ({
  profile,
  refreshProfile,
}: {
  profile: ProfileLite | null;
  refreshProfile: () => Promise<void>;
}) => {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState(profile?.full_name ?? "");
  const [phone, setPhone] = useState(profile?.phone_number ?? "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [errors, setErrors] = useState<{ fullName?: string; phone?: string; password?: string; confirmPassword?: string }>({});
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const fe: typeof errors = {};
    if (!fullName.trim()) fe.fullName = "الاسم بالكامل مطلوب";
    if (!isValidEgPhone(phone)) fe.phone = "أدخل رقم هاتف مصري صحيح (مثال: 01012345678)";
    if (password || confirmPassword) {
      if (password.length < 6) fe.password = "كلمة المرور يجب ألا تقل عن 6 أحرف";
      else if (password !== confirmPassword) fe.confirmPassword = "كلمة المرور غير مطابقة";
    }
    setErrors(fe);
    if (Object.keys(fe).length > 0) return;

    setLoading(true);
    const { error } = await (supabase as any)
      .from("profiles")
      .update({
        full_name: fullName.trim(),
        phone_number: normalizeEgPhone(phone),
        onboarding_completed: true,
      })
      .eq("id", profile?.id);

    if (error) {
      setLoading(false);
      toast.error("تعذّر حفظ البيانات: " + getArabicAuthErrorMessage(error));
      return;
    }

    if (password) {
      const { error: pwError } = await supabase.auth.updateUser({ password });
      if (pwError) {
        toast.error(
          "تم حفظ البيانات ولكن تعذّر تعيين كلمة المرور: " + getArabicAuthErrorMessage(pwError),
        );
      }
    }

    await refreshProfile();
    setLoading(false);
    toast.success("تم إكمال حسابك بنجاح");
    navigate("/parent", { replace: true });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="ob_parent_name" className="text-sm font-bold">
          الاسم بالكامل
        </Label>
        <Input
          id="ob_parent_name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          disabled={loading}
        />
        {errors.fullName && <p className="text-xs text-destructive">{errors.fullName}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="ob_parent_phone" className="text-sm font-bold">
          رقم الهاتف
        </Label>
        <Input
          id="ob_parent_phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          dir="ltr"
          placeholder="01012345678"
          disabled={loading}
          className="text-right"
        />
        {errors.phone && <p className="text-xs text-destructive">{errors.phone}</p>}
      </div>

      <div className="pt-2 border-t border-border">
        <p className="text-xs text-muted-foreground mb-3">
          اختياري — عيّن كلمة مرور لتتمكن من الدخول بالبريد وكلمة المرور لاحقاً
          (مفيد إذا تم إيقاف الدخول بحساب جوجل).
        </p>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ob_parent_password" className="text-sm font-bold">
              كلمة المرور (اختياري)
            </Label>
            <div className="relative">
              <Input
                id="ob_parent_password"
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="pr-10 pl-10"
                disabled={loading}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPw((s) => !s)}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                tabIndex={-1}
              >
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="ob_parent_confirm" className="text-sm font-bold">
              تأكيد كلمة المرور
            </Label>
            <Input
              id="ob_parent_confirm"
              type={showPw ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              className="pr-10 pl-10"
              disabled={loading}
              autoComplete="new-password"
            />
            {errors.confirmPassword && (
              <p className="text-xs text-destructive">{errors.confirmPassword}</p>
            )}
          </div>
        </div>
      </div>

      <Button type="submit" className="w-full gap-2 font-bold" size="lg" disabled={loading}>
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            جارٍ الحفظ...
          </>
        ) : (
          <>
            إكمال الحساب
            <ArrowLeft className="w-4 h-4" />
          </>
        )}
      </Button>
    </form>
  );
};

export default Onboarding;
