import { NavLink, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { LayoutGrid, Wallet, Compass, BookOpen, UserCircle2 } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

type Item = {
  to: string;
  label: string;
  icon: typeof LayoutGrid;
  end?: boolean;
};

const sideItems: [Item, Item, Item, Item] = [
  { to: "/", label: "الرئيسية", icon: LayoutGrid, end: true },
  { to: "/dashboard/wallet", label: "المحفظة", icon: Wallet },
  { to: "/dashboard", label: "دوراتي", icon: BookOpen, end: true },
  { to: "/dashboard/account", label: "حسابي", icon: UserCircle2 },
];

const centerItem: Item = { to: "/courses", label: "الدورات", icon: Compass };

const isActivePath = (pathname: string, to: string, end?: boolean) => {
  if (end) return pathname === to;
  return pathname === to || pathname.startsWith(to + "/");
};

const SideButton = ({ item, active }: { item: Item; active: boolean }) => {
  const Icon = item.icon;
  return (
    <NavLink to={item.to} end={item.end} className="flex-1 flex items-center justify-center">
      <motion.div
        whileTap={{ scale: 0.9 }}
        className="relative flex flex-col items-center justify-center gap-1 px-2 py-1.5 rounded-2xl min-w-[56px]"
      >
        {active && (
          <motion.span
            layoutId="mobile-nav-active-chip"
            className="absolute inset-0 rounded-2xl bg-primary/12"
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
          />
        )}
        <Icon
          className={cn(
            "w-5 h-5 relative z-10 transition-colors",
            active ? "text-primary" : "text-muted-foreground"
          )}
        />
        <span
          className={cn(
            "text-[10px] font-semibold relative z-10 transition-colors",
            active ? "text-primary" : "text-muted-foreground"
          )}
        >
          {item.label}
        </span>
      </motion.div>
    </NavLink>
  );
};

const MobileBottomNav = () => {
  const isMobile = useIsMobile();
  const { pathname } = useLocation();

  if (!isMobile) return null;

  const CenterIcon = centerItem.icon;

  return (
    <nav
      dir="rtl"
      aria-label="التنقل السفلي"
      className="fixed inset-x-0 z-50 lg:hidden pointer-events-none"
      style={{ bottom: `calc(env(safe-area-inset-bottom, 0px) + 12px)` }}
    >
      <div className="mx-3 pointer-events-auto">
        <div className="relative bg-card/95 backdrop-blur-md border border-border/60 shadow-[0_10px_30px_-8px_hsl(var(--foreground)/0.25)] rounded-[28px] px-2 pt-2 pb-2 flex items-end">
          <SideButton item={sideItems[0]} active={isActivePath(pathname, sideItems[0].to, sideItems[0].end)} />
          <SideButton item={sideItems[1]} active={isActivePath(pathname, sideItems[1].to, sideItems[1].end)} />

          {/* Center elevated */}
          <div className="flex-1 flex flex-col items-center justify-end -mt-8">
            <NavLink to={centerItem.to} className="flex flex-col items-center gap-1">
              <motion.div
                whileTap={{ scale: 0.92 }}
                whileHover={{ y: -2 }}
                className="w-14 h-14 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center shadow-lg shadow-primary/30 ring-4 ring-background"
              >
                <CenterIcon className="w-6 h-6" />
              </motion.div>
              <span className="text-[10px] font-bold text-primary">{centerItem.label}</span>
            </NavLink>
          </div>

          <SideButton item={sideItems[2]} active={isActivePath(pathname, sideItems[2].to, sideItems[2].end)} />
          <SideButton item={sideItems[3]} active={isActivePath(pathname, sideItems[3].to, sideItems[3].end)} />
        </div>
      </div>
    </nav>
  );
};

export default MobileBottomNav;
