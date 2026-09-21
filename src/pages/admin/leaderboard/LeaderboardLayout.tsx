import { Outlet, NavLink, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Trophy, Award, Layers, Settings, Sparkles } from "lucide-react";

const tabs = [
  { to: "/admin/leaderboard", label: "الأوائل", icon: Trophy, end: true },
  { to: "/admin/leaderboard/badges", label: "الشارات", icon: Award },
  { to: "/admin/leaderboard/levels", label: "المستويات", icon: Layers },
  { to: "/admin/leaderboard/settings", label: "الإعدادات", icon: Settings },
];

export default function LeaderboardLayout() {
  const { pathname } = useLocation();
  return (
    <div dir="rtl" className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-l from-indigo-950 via-slate-950 to-slate-900 p-6 md:p-8"
      >
        <div className="absolute inset-0 opacity-10 pointer-events-none" style={{
          backgroundImage: "radial-gradient(circle at 20% 20%, hsl(45 95% 55%) 0, transparent 40%), radial-gradient(circle at 80% 60%, hsl(250 90% 65%) 0, transparent 40%)",
        }} />
        <div className="relative flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center">
            <Trophy className="w-7 h-7 text-amber-300" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-amber-50 flex items-center gap-2">
              لوحة المتصدرين
              <Sparkles className="w-5 h-5 text-amber-300" />
            </h1>
            <p className="text-sm text-amber-100/70 mt-1">
              نظام النقاط، المستويات، والشارات لجميع الطلاب.
            </p>
          </div>
        </div>
      </motion.div>

      <div className="flex flex-wrap gap-2 border-b border-border/60 pb-2">
        {tabs.map((t) => {
          const isActive = t.end ? pathname === t.to : pathname === t.to || pathname.startsWith(t.to + "/");
          return (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={`relative flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                isActive
                  ? "text-amber-50 bg-indigo-600/90 shadow-[0_0_20px_hsl(250_90%_65%/0.4)]"
                  : "text-foreground/70 hover:bg-accent"
              }`}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
              {isActive && (
                <motion.span
                  layoutId="lb-tab-glow"
                  className="absolute inset-0 rounded-xl ring-2 ring-amber-400/50 pointer-events-none"
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                />
              )}
            </NavLink>
          );
        })}
      </div>

      <Outlet />
    </div>
  );
}
