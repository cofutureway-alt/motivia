import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { getArabicAuthErrorMessage } from "@/lib/auth-errors";

type GoogleMode = "login" | "signup";
type GoogleRole = "student" | "parent";

interface Props {
  mode: GoogleMode;
  /** Required in signup mode: the role tab the user picked. */
  role?: GoogleRole;
  disabled?: boolean;
  /** Optional final destination preserved through the OAuth round-trip. */
  next?: string;
}

const GoogleIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z"
    />
  </svg>
);

/**
 * Google OAuth (Supabase native provider).
 *
 * - mode="login"  → shouldCreateUser:false, so an unknown Google account is
 *   rejected server-side and surfaced on /auth/callback as "account not found".
 * - mode="signup" → creates the account; the chosen role is carried through the
 *   redirect query so the callback can stamp it onto the profile.
 */
const GoogleAuthButton = ({ mode, role, disabled, next }: Props) => {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    const origin = window.location.origin;
    const params = new URLSearchParams({ mode });
    if (mode === "signup") params.set("role", role ?? "student");
    if (next) params.set("next", next);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${origin}/auth/callback?${params.toString()}`,
        ...(mode === "login" ? { shouldCreateUser: false } : {}),
      },
    });

    if (error) {
      setLoading(false);
      // Most OAuth errors come back through the redirect; a thrown error here
      // (e.g. popup blocked / provider misconfigured) is shown inline.
      toast.error(getArabicAuthErrorMessage(error));
    }
    // On success the browser is redirected to Google — nothing to do here.
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="lg"
      className="w-full gap-3 font-bold bg-card"
      disabled={disabled || loading}
      onClick={handleClick}
    >
      {loading ? (
        <Loader2 className="w-5 h-5 animate-spin" />
      ) : (
        <GoogleIcon />
      )}
      {mode === "login" ? "الدخول بحساب جوجل" : "التسجيل بحساب جوجل"}
    </Button>
  );
};

export default GoogleAuthButton;
