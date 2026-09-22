import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

interface Props {
  children: ReactNode;
}

/** True when this account still must finish the post-Google-signup onboarding. */
export function needsOnboarding(profile: { role?: string | null; onboarding_completed?: boolean | null } | null) {
  return (
    !!profile &&
    (profile.role === "student" || profile.role === "parent") &&
    profile.onboarding_completed === false
  );
}

const RequireAuth = ({ children }: Props) => {
  const { user, profile, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    const redirect = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?redirect=${redirect}`} replace />;
  }

  // Google-created accounts must complete onboarding before reaching any app area.
  if (needsOnboarding(profile) && location.pathname !== "/onboarding") {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
};

export default RequireAuth;
