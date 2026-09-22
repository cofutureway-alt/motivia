import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "student" | "parent" | "instructor";

export interface Profile {
  id: string;
  full_name: string | null;
  role: AppRole;
  avatar_url: string | null;
  created_at: string;
  phone_number: string | null;
  guardian_phone: string | null;
  email: string | null;
  auth_email: string | null;
  onboarding_completed?: boolean | null;
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (uid: string, currentUserObj?: User | null) => {
    try {
      let { data, error } = await (supabase as any)
        .from("profiles")
        .select("*")
        .eq("id", uid)
        .maybeSingle();

      const activeUser = currentUserObj || user;

      // Self-healing: if user is authenticated but profile row does not exist, create it
      if (!data && !error && activeUser) {
        const defaultName =
          activeUser.user_metadata?.full_name ||
          activeUser.email?.split("@")[0] ||
          "طالب";
        const { data: newProf } = await (supabase as any)
          .from("profiles")
          .upsert({
            id: uid,
            full_name: defaultName,
            role: "student",
            email: activeUser.email,
            auth_email: activeUser.email,
          })
          .select("*")
          .maybeSingle();
        if (newProf) {
          data = newProf;
        }
      }

      if (data && (data as any).is_banned === true) {
        await supabase.auth.signOut();
        setProfile(null);
        return;
      }

      if (data) {
        setProfile(data as Profile);
      }
    } catch (err) {
      console.error("Error loading profile:", err);
    }
  };

  const refreshProfile = async () => {
    if (user) await loadProfile(user.id, user);
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      if (newSession?.user) {
        setTimeout(() => loadProfile(newSession.user.id, newSession.user), 0);
      } else {
        setProfile(null);
      }
    });

    supabase.auth.getSession().then(({ data: { session: existing } }) => {
      setSession(existing);
      setUser(existing?.user ?? null);
      if (existing?.user) {
        loadProfile(existing.user.id, existing.user).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
  };

  return (
    <AuthContext.Provider value={{ session, user, profile, loading, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};

