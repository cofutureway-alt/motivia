import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, AlertTriangle, UserPlus, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { getArabicAuthErrorMessage } from "@/lib/auth-errors";

type CallbackState =
  | { kind: "loading" }
  | { kind: "not_found" }
  | { kind: "error"; message: string }
  | { kind: "done" };

/**
 * OAuth redirect target.
 *
 * Two outcomes matter here:
 *  1) The user tried Google login on an account that does not exist
 *     (shouldCreateUser:false) → Supabase redirects back with an error; we show
 *     "account does not exist" with a button to signup.
 *  2) A real session comes back (PKCE code exchange) → stamp the chosen signup
 *     role, refresh the profile, then route to onboarding or the role dashboard.
 */
const AuthCallback = () => {
  const navigate = useNavigate();
  const { user, profile, refreshProfile, loading } = useAuth();
  const [state, setState] = useState<CallbackState>({ kind: "loading" });
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const params = new URLSearchParams(window.location.search);
    const errCode = params.get("error") || params.get("error_code");
    const errDesc = params.get("error_description") || params.get("error_description_code");
    const mode = (params.get("mode") as "login" | "signup") || "login";
    const role = (params.get("role") as "student" | "parent") || "student";

    // ── (1) Supabase redirects OAuth failures back as query params ──────────
    if (errCode) {
      const code = errCode.toLowerCase();
      if (code.includes("user_not_found") || code.includes("not_found")) {
        setState({ kind: "not_found" });
      } else if (code.includes("access_denied") || code.includes("cancelled")) {
        setState({ kind: "error", message: "تم إلغاء تسجيل الدخول. يمكنك المحاولة مرة أخرى." });
      } else {
        setState({
          kind: "error",
          message: errDesc || "تعذّر إكمال تسجيل الدخول بحساب جوجل، حاول مرة أخرى.",
        });
      }
      return;
    }

    // ── (2) Exchange the PKCE code for a session ────────────────────────────
    (async () => {
      const { error } = await supabase.auth.exchangeCodeForSession(window.location.href);
      if (error) {
        const msg = (error.message || "").toLowerCase();
        if (msg.includes("user_not_found") || msg.includes("not found")) {
          setState({ kind: "not_found" });
        } else {
          setState({ kind: "error", message: getArabicAuthErrorMessage(error) });
        }
        return;
      }
      // signup flow: apply the role the user picked on the signup page.
      // (The trigger creates the profile as "student" — OAuth metadata can't
      // carry the intended role, so we stamp it here, before any redirect.)
      if (mode === "signup" && role === "parent") {
        const { data: cur } = await supabase.auth.getUser();
        const uid = cur.user?.id;
        if (uid) {
          await (supabase as any)
            .from("profiles")
            .update({ role: "parent" })
            .eq("id", uid)
            .neq("role", "admin");
        }
      }
      // Always reload the profile before routing so role + onboarding flag are
      // fresh (the routing effect below waits for it).
      await refreshProfile();
      setState({ kind: "done" });
    })();
  }, [refreshProfile]);

  // ── Route once the refreshed profile is available ──────────────────────────
  useEffect(() => {
    if (state.kind !== "done" || loading) return;
    // Wait for the profile row (role + onboarding flag) before choosing a
    // destination — without it a parent would be sent to the student dashboard.
    if (!user || !profile) return;

    const params = new URLSearchParams(window.location.search);
    const mode = params.get("mode");
    const next = params.get("next");

    if (profile && profile.onboarding_completed === false) {
      navigate("/onboarding", { replace: true });
      return;
    }

    // In signup mode the role decides the destination; only login mode honors an
    // explicit "next" (otherwise a parent would land on the student dashboard).
    const destination =
      (mode === "login" ? next : undefined) ||
      (profile?.role === "admin"
        ? "/admin"
        : profile?.role === "instructor"
          ? "/instructor"
          : profile?.role === "parent"
            ? "/parent"
            : "/dashboard");
    navigate(destination, { replace: true });
  }, [state, loading, user, profile, navigate]);

  if (state.kind === "loading") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background" dir="rtl">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">جارٍ التحقق من حساب جوجل...</p>
      </div>
    );
  }

  if (state.kind === "not_found") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background" dir="rtl">
        <div className="w-full max-w-md space-y-6 rounded-2xl border border-border bg-card p-8 shadow-xl text-center">
          <div className="w-14 h-14 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center mx-auto">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-extrabold text-foreground">هذا الحساب غير موجود</h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              لا يوجد حساب مرتبط بهذا البريد على المنصة. يرجى إنشاء حساب أولاً لتتمكن
              من تسجيل الدخول بحساب جوجل.
            </p>
          </div>
          <div className="space-y-3">
            <Button size="lg" className="w-full gap-2 font-bold" asChild>
              <Link to="/signup">
                <UserPlus className="w-4 h-4" />
                الذهاب لإنشاء حساب
              </Link>
            </Button>
            <Button size="lg" variant="ghost" className="w-full gap-2" asChild>
              <Link to="/login">
                <ArrowRight className="w-4 h-4" />
                العودة لتسجيل الدخول
              </Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background" dir="rtl">
        <div className="w-full max-w-md space-y-6 rounded-2xl border border-border bg-card p-8 shadow-xl text-center">
          <div className="w-14 h-14 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center mx-auto">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-extrabold text-foreground">تعذّر تسجيل الدخول</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">{state.message}</p>
          <Button size="lg" className="w-full font-bold" asChild>
            <Link to="/login">العودة لتسجيل الدخول</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background" dir="rtl">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">جارٍ توجيهك...</p>
    </div>
  );
};

export default AuthCallback;
