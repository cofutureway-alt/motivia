import { ReactNode, useMemo, useState } from "react";
import { NavLink, useLocation, useNavigate, Outlet } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart3, BookOpen, Package, BookMarked, Users, Landmark, Wallet as WalletIcon,
  ClipboardCheck, ClipboardEdit, LogOut, Menu, X, Home, Settings2, GraduationCap,
  UserCircle2,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import ThemeToggle from "@/components/ThemeToggle";
import NotificationBell from "@/components/notifications/NotificationBell";
import InstructorTaxonomyModal from "@/components/instructor/InstructorTaxonomyModal";
import { useInstructorSelf } from "@/hooks/use-instructor-self";

type LeafItem = { to: string; label: string; icon: typeof BarChart3; end?: boolean; show: boolean };

const buildNav = (p: {
  canCourses: boolean;
  canBundles: boolean;
  canBooks: boolean;
  canStudents: boolean;
  canLocations: boolean;
}): LeafItem[] => [
  { to: "/instructor", label: "نظرة عامة", icon: BarChart3, end: true, show: true },
  { to: "/instructor/courses", label: "كورساتي", icon: BookOpen, show: p.canCourses },
  { to: "/instructor/bundles", label: "باقاتي", icon: Package, show: p.canBundles },
  { to: "/instructor/books", label: "كتبى", icon: BookMarked, show: p.canBooks },
  { to: "/instructor/students", label: "الطلاب", icon: Users, show: p.canStudents },
  { to: "/instructor/quiz-attempts", label: "محاولات الاختبارات", icon: ClipboardCheck, show: p.canStudents },
  { to: "/instructor/assignment-submissions", label: "تسليمات الواجبات", icon: ClipboardEdit, show: p.canStudents },
  { to: "/instructor/earnings", label: "أرباحي", icon: WalletIcon, show: true },
  { to: "/instructor/withdrawals", label: "طلبات السحب", icon: Landmark, show: true },
  { to: "/instructor/locations", label: "أماكن التواجد", icon: Landmark, show: p.canLocations },
  { to: "/instructor/settings", label: "إعداداتي", icon: Settings2, show: true },
  { to: "/instructor/account", label: "الملف الشخصي", icon: UserCircle2, show: true },
];

const NavLeaf = ({
  to, label, icon: Icon, end, onNavigate,
}: LeafItem & { onNavigate?: () => void }) => (
  <NavLink
    to={to}
    end={end}
    onClick={onNavigate}
    className={({ isActive }) =>
      `group relative flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium transition-all ${
        isActive
          ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
          : "text-foreground/70 hover:bg-accent hover:text-foreground"
      }`
    }
  >
    <Icon className="w-4 h-4 shrink-0" />
    <span className="truncate">{label}</span>
  </NavLink>
);
const InstructorLayout = ({ children }: { children?: ReactNode }) => {
  const { profile, user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { self, loading: selfLoading, hasTaxonomy, canCourses, canBundles, canBooks, canStudents, canLocations, reload } =
    useInstructorSelf();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [taxonomyOpen, setTaxonomyOpen] = useState(false);

  const nav = useMemo(
    () => buildNav({ canCourses, canBundles, canBooks, canStudents, canLocations }),
    [canCourses, canBundles, canBooks, canStudents, canLocations]
  );

  const initials =
    profile?.full_name
      ?.split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0])
      .join("")
      .toUpperCase() ||
    user?.email?.[0]?.toUpperCase() ||
    "م";

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const SidebarContent = ({ onNavigate }: { onNavigate?: () => void }) => (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border/60">
        <NavLink to="/instructor" className="flex items-center gap-2 px-2">
          <div className="w-9 h-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center">
            <GraduationCap className="w-5 h-5" />
          </div>
          <div className="font-bold text-sm">لوحة المعلم</div>
        </NavLink>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-4">
        {nav
          .filter((n) => n.show)
          .map((item) => (
            <NavLeaf key={item.to} {...item} onNavigate={onNavigate} />
          ))}
        <button
          type="button"
          onClick={() => {
            setTaxonomyOpen(true);
            onNavigate?.();
          }}
          className="w-full flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium text-foreground/70 hover:bg-accent hover:text-foreground transition-all"
        >
          <BookMarked className="w-4 h-4 shrink-0" />
          <span className="truncate">موادّي ومراحلي</span>
        </button>
      </nav>
      <div className="p-4 border-t border-border/60">
        <NavLink
          to="/"
          onClick={onNavigate}
          className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-foreground/70 hover:bg-accent hover:text-foreground transition-colors"
        >
          <Home className="w-5 h-5" />
          <span>العودة للموقع</span>
        </NavLink>
      </div>
    </div>
  );
  return (
    <div className="min-h-screen bg-background flex w-full" dir="rtl">
      {/* Mandatory onboarding modal when no subjects/stages selected yet */}
      {!selfLoading && !hasTaxonomy && (
        <InstructorTaxonomyModal
          open={taxonomyOpen || !hasTaxonomy}
          onOpenChange={(v) => setTaxonomyOpen(v)}
          mandatory={!hasTaxonomy}
          onSaved={reload}
        />
      )}

      {/* Desktop sidebar */}
      <aside className="hidden lg:block w-72 shrink-0 border-l border-border/60 bg-card/50 backdrop-blur-sm">
        <div className="sticky top-0 h-screen">
          <SidebarContent />
        </div>
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDrawerOpen(false)}
              className="fixed inset-0 z-40 bg-background/70 backdrop-blur-sm lg:hidden"
            />
            <motion.aside
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 32 }}
              className="fixed inset-y-0 right-0 z-50 w-72 bg-card border-l border-border shadow-2xl lg:hidden"
            >
              <div className="flex items-center justify-end p-2">
                <Button variant="ghost" size="icon" onClick={() => setDrawerOpen(false)}>
                  <X className="w-5 h-5" />
                </Button>
              </div>
              <SidebarContent onNavigate={() => setDrawerOpen(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 h-16 border-b border-border/60 bg-background/80 backdrop-blur-md flex items-center justify-between px-4 md:px-8">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setDrawerOpen(true)}>
              <Menu className="w-5 h-5" />
            </Button>
            <div className="text-sm text-muted-foreground hidden sm:block">
              مرحبًا بعودتك،{" "}
              <span className="text-foreground font-semibold">{profile?.full_name || "معلم"}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <NotificationBell />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 rounded-full p-1 pl-3 hover:bg-accent transition-colors">
                  <span className="hidden md:inline text-sm font-medium">{profile?.full_name || user?.email}</span>
                  <Avatar className="w-9 h-9 border border-border">
                    <AvatarImage src={profile?.avatar_url ?? undefined} />
                    <AvatarFallback className="bg-primary text-primary-foreground text-sm">{initials}</AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="font-semibold">{profile?.full_name || "معلم"}</div>
                  <div className="text-xs text-muted-foreground font-normal truncate">{user?.email}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/instructor/settings")}>
                  <Settings2 className="w-4 h-4 ml-2" />
                  إعداداتي
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
                  <LogOut className="w-4 h-4 ml-2" />
                  تسجيل الخروج
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <motion.main
          key={location.pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="flex-1 p-4 md:p-8"
        >
          {children ?? <Outlet />}
        </motion.main>
      </div>
    </div>
  );
};

export default InstructorLayout;