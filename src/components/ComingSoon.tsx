import { useEffect, useState } from "react";
import { Clock, Sparkles } from "lucide-react";
import { motion } from "framer-motion";

function computeParts(target: Date) {
  const diff = Math.max(0, target.getTime() - Date.now());
  const s = Math.floor(diff / 1000);
  return {
    total: diff,
    days: Math.floor(s / 86400),
    hours: Math.floor((s % 86400) / 3600),
    minutes: Math.floor((s % 3600) / 60),
    seconds: s % 60,
  };
}

/**
 * Shimmer-animated "قريبًا" pill. Use inside course cards / list rows.
 */
export const ComingSoonBadge = ({ className = "" }: { className?: string }) => (
  <span
    className={
      "relative inline-flex items-center gap-1.5 overflow-hidden rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-[11px] font-bold text-amber-700 dark:text-amber-300 " +
      className
    }
  >
    <Sparkles className="w-3 h-3" />
    قريبًا
    <span
      className="pointer-events-none absolute inset-0"
      style={{
        background:
          "linear-gradient(120deg, transparent 30%, hsl(var(--primary-foreground) / 0.35) 50%, transparent 70%)",
        animation: "coming-soon-shimmer 2.4s linear infinite",
      }}
    />
    <style>{`@keyframes coming-soon-shimmer{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}`}</style>
  </span>
);

/**
 * Larger countdown block for hero / detail page.
 */
export const ComingSoonCountdown = ({
  target,
  className = "",
}: {
  target: string;
  className?: string;
}) => {
  const [parts, setParts] = useState(() => computeParts(new Date(target)));
  useEffect(() => {
    const t = new Date(target);
    const id = window.setInterval(() => setParts(computeParts(t)), 1000);
    return () => window.clearInterval(id);
  }, [target]);

  if (parts.total <= 0) {
    return (
      <div
        className={
          "inline-flex items-center gap-2 text-sm font-semibold text-emerald-600 dark:text-emerald-400 " +
          className
        }
      >
        <Clock className="w-4 h-4" /> جاهز للنشر خلال دقائق…
      </div>
    );
  }

  const Cell = ({ v, label }: { v: number; label: string }) => (
    <div className="flex flex-col items-center px-2.5 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 min-w-[56px]">
      <span className="text-lg font-extrabold tabular-nums text-amber-700 dark:text-amber-300">
        {String(v).padStart(2, "0")}
      </span>
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={"inline-flex items-center gap-2 flex-wrap " + className}
      dir="ltr"
    >
      <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
      <Cell v={parts.days} label="يوم" />
      <Cell v={parts.hours} label="ساعة" />
      <Cell v={parts.minutes} label="دقيقة" />
      <Cell v={parts.seconds} label="ثانية" />
    </motion.div>
  );
};
