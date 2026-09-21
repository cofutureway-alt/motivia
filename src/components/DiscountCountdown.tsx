import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Clock } from "lucide-react";

interface Props {
  target: Date;
  /** Called once when countdown reaches zero */
  onExpire?: () => void;
  className?: string;
  compact?: boolean;
}

function computeRemaining(target: Date, now: Date) {
  const ms = target.getTime() - now.getTime();
  if (ms <= 0) return { total: 0, days: 0, hours: 0, minutes: 0, seconds: 0 };
  const total = Math.floor(ms / 1000);
  return {
    total,
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

/**
 * Live countdown. Recomputes from the fixed server timestamp each tick
 * (same principle as the Phase 13 quiz timers) so it never drifts.
 */
export const DiscountCountdown = ({ target, onExpire, className, compact }: Props) => {
  const [remaining, setRemaining] = useState(() => computeRemaining(target, new Date()));

  useEffect(() => {
    const tick = () => {
      const r = computeRemaining(target, new Date());
      setRemaining(r);
      if (r.total === 0) {
        onExpire?.();
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target, onExpire]);

  if (remaining.total === 0) return null;

  const pad = (n: number) => n.toString().padStart(2, "0");
  const parts: { label: string; value: string }[] = [];
  if (remaining.days > 0) parts.push({ label: "يوم", value: pad(remaining.days) });
  parts.push({ label: "ساعة", value: pad(remaining.hours) });
  parts.push({ label: "دقيقة", value: pad(remaining.minutes) });
  parts.push({ label: "ثانية", value: pad(remaining.seconds) });

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={`inline-flex items-center gap-2 ${className ?? ""}`}
    >
      <Clock className="w-4 h-4 text-primary shrink-0" />
      <div className={`flex items-center gap-1.5 ${compact ? "text-xs" : "text-sm"}`}>
        <AnimatePresence mode="popLayout">
          {parts.map((p, i) => (
            <motion.div
              key={p.label}
              layout
              className="flex items-center gap-1"
            >
              <motion.span
                key={p.value}
                initial={{ y: -6, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 6, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="font-mono font-bold tabular-nums px-1.5 py-0.5 rounded bg-primary/10 text-primary min-w-[2ch] text-center"
              >
                {p.value}
              </motion.span>
              <span className="text-[10px] text-muted-foreground">{p.label}</span>
              {i < parts.length - 1 && <span className="text-muted-foreground/40">:</span>}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

export default DiscountCountdown;
