import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

interface Props {
  children: ReactNode;
}

const RequireGuest = ({ children }: Props) => {
  const { user, profile, loading } = useAuth();
  const location = useLocation();

  if (loading || (user && !profile)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background" dir="rtl">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (user) {
    const params = new URLSearchParams(location.search);
    const redirectParam = params.get("redirect");

    let destination = redirectParam || "/";
    if (!redirectParam) {
      destination =
        profile?.role === "admin"
          ? "/admin"
          : profile?.role === "instructor"
            ? "/instructor"
            : profile?.role === "parent"
              ? "/parent"
              : "/dashboard";
    }

    return <Navigate to={destination} replace />;
  }

  return <>{children}</>;
};

export default RequireGuest;
