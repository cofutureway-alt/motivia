import { useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Loader2, Mail, Lock, Eye, EyeOff, ArrowLeft, Phone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import AuthLayout from "@/components/auth/AuthLayout";
import { isValidEgPhone, looksLikePhone, normalizeEgPhone, syntheticAuthEmail } from "@/lib/phone";
import { getArabicAuthErrorMessage } from "@/lib/auth-errors";

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ identifier?: string; password?: string }>({});

  const params = new URLSearchParams(location.search);
  const redirectParam = params.get("redirect");
  const from = redirectParam ?? (location.state as { from?: string } | null)?.from ?? "/";

  // Detect if the identifier looks like a phone (any digit-only pattern) vs email
  const identifierMode: "phone" | "email" | "unknown" = useMemo(() => {
    const v = identifier.trim();
    if (!v) return "unknown";
    if (/^[+\d\s\-()]+$/.test(v)) return "phone";
    if (v.includes("@")) return "email";
    return "unknown";
  }, [identifier]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const fe: typeof errors = {};
    const idTrim = identifier.trim();
    if (!idTrim) fe.identifier = "أدخل رقم الهاتف أو البريد الإلكتروني";
    else if (identifierMode === "phone" && !isValidEgPhone(idTrim))
      fe.identifier = "رقم هاتف غير صالح";
    else if (identifierMode === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(idTrim))
      fe.identifier = "بريد إلكتروني غير صالح";
    if (password.length < 6) fe.password = "كلمة المرور يجب ألا تقل عن 6 أحرف";
    if (Object.keys(fe).length) {
      setErrors(fe);
      return;
    }

    setLoading(true);
    let authEmail: string;
    if (identifierMode === "phone") {
      const canonical = normalizeEgPhone(idTrim);
      // The canonical auth email for phone accounts is the deterministic
      // synthetic address (same one used at signup). The legacy
      // resolve_login_email RPC returns a different domain
      // (@internal.noemail.local) than the one accounts are actually
      // registered with (@phone.noemail.invalid), which breaks login —
      // so we normalize its result back to the canonical domain.
      const { data: resolved, error: resolveError } = await (supabase as any).rpc(
        "resolve_login_email",
        { _identifier: canonical },
      );
      const resolvedEmail = typeof resolved === "string" ? resolved : "";
      // The RPC is only a convenience lookup. If an older production database
      // has not received its latest grant/migration yet, do not block login;
      // phone accounts always use the deterministic synthetic email.
      if (resolveError) {
        console.warn("resolve_login_email unavailable; using canonical phone email", resolveError);
        authEmail = syntheticAuthEmail(canonical);
      } else if (resolvedEmail.endsWith("@phone.noemail.invalid")) {
        authEmail = resolvedEmail;
      } else if (
        resolvedEmail &&
        !resolvedEmail.endsWith("@internal.noemail.local") &&
        !resolvedEmail.endsWith(".invalid")
      ) {
        // A real email on file for this phone
        authEmail = resolvedEmail;
      } else {
        authEmail = syntheticAuthEmail(canonical);
      }
    } else {
      authEmail = idTrim.toLowerCase();
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: authEmail,
      password,
    });

    if (error) {
      setLoading(false);
      toast.error(getArabicAuthErrorMessage(error));
      return;
    }

    // Ban gate — must run before we surface success or navigate
    try {
      const { data: banned } = await (supabase as any).rpc("is_current_user_banned");
      if (banned === true) {
        await supabase.auth.signOut();
        setLoading(false);
        toast.error("حسابك مقيد، يرجى التواصل مع الدعم لحل المشكلة.");
        return;
      }
    } catch (err) {
      console.warn("Could not verify ban status on login:", err);
    }
    setLoading(false);
    toast.success("تم تسجيل الدخول بنجاح");

    let destination = from;
    if (!redirectParam && (!location.state || !(location.state as any)?.from)) {
      const { data: prof } = await (supabase as any)
        .from("profiles")
        .select("role")
        .eq("id", data.user!.id)
        .maybeSingle();
      const role = prof?.role as string | null | undefined;
      destination =
        role === "admin"
          ? "/admin"
          : role === "instructor"
            ? "/instructor"
          : role === "parent"
            ? "/parent"
            : "/dashboard";
    }
    navigate(destination, { replace: true });
  };

  const Icon = identifierMode === "phone" ? Phone : Mail;

  return (
    <AuthLayout
      title="تسجيل الدخول"
      subtitle="أهلاً بعودتك إلى منصة مستر محمد إبراهيم"
      footer={
        <>
          ليس لديك حساب؟{" "}
          <Link to="/signup" className="text-primary font-bold hover:underline">
            أنشئ حساباً جديداً
          </Link>
          {" · "}
          <Link to="/parent-signup" className="text-primary font-bold hover:underline">
            تسجيل ولي أمر
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="identifier" className="text-sm font-bold">
            رقم الهاتف أو البريد الإلكتروني
          </Label>
          <div className="relative">
            <Icon className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              id="identifier"
              type="text"
              dir={identifierMode === "email" ? "ltr" : "auto"}
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="01012345678 أو name@example.com"
              className="pr-10 text-right"
              disabled={loading}
              autoComplete="username"
            />
          </div>
          {errors.identifier && <p className="text-xs text-destructive">{errors.identifier}</p>}
          {!errors.identifier && identifierMode === "phone" && looksLikePhone(identifier) && (
            <p className="text-xs text-muted-foreground">
              سيتم تسجيل الدخول باستخدام رقم الهاتف
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="password" className="text-sm font-bold">كلمة المرور</Label>
          <div className="relative">
            <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="pr-10 pl-10"
              disabled={loading}
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
        </div>

        <motion.div whileHover={{ scale: loading ? 1 : 1.01 }} whileTap={{ scale: 0.99 }}>
          <Button type="submit" className="w-full gap-2 font-bold" size="lg" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                جارٍ تسجيل الدخول...
              </>
            ) : (
              <>
                تسجيل الدخول
                <ArrowLeft className="w-4 h-4" />
              </>
            )}
          </Button>
        </motion.div>
      </form>
    </AuthLayout>
  );
};

export default Login;
