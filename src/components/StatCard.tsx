import { motion } from "framer-motion";
import { LucideIcon } from "lucide-react";
import { useCountUp } from "@/hooks/use-count-up";

interface Props {
  label: string;
  value: number;
  icon: LucideIcon;
  suffix?: string;
  delay?: number;
  accent?: "primary" | "emerald" | "amber" | "violet";
  children?: React.ReactNode;
}

const accentMap = {
  primary: "bg-primary/10 text-primary",
  emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  violet: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
};

export const StatCard = ({
  label,
  value,
  icon: Icon,
  suffix,
  delay = 0,
  accent = "primary",
  children,
}: Props) => {
  const { count } = useCountUp(value, 1400, true);
  return (
    <motion.div
      initial={{ opacity: 0, y: 18, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay, type: "spring", damping: 22, stiffness: 200 }}
      whileHover={{ y: -3 }}
      className="relative overflow-hidden rounded-2xl border border-border/60 bg-card p-5 md:p-6 shadow-sm hover:shadow-xl hover:border-primary/30 transition-all"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-xs md:text-sm font-medium text-muted-foreground mb-2">
            {label}
          </div>
          <div className="text-3xl md:text-4xl font-black tabular-nums text-foreground leading-none">
            {count}
            {suffix && (
              <span className="text-lg md:text-xl font-bold text-muted-foreground mr-1">
                {suffix}
              </span>
            )}
          </div>
          {children}
        </div>
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${accentMap[accent]}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </motion.div>
  );
};

export default StatCard;
