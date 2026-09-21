import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Award, Sparkles } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

interface EarnedBadge { badge_id: string; name: string; icon_url: string }

const STORAGE_PREFIX = "badge_snapshot_";

/**
 * Polls the current student's badges on mount and shows a celebration overlay
 * for any freshly earned since last visit. No emojis, no confetti — radial burst.
 */
export default function BadgeCelebration() {
  const { user, profile } = useAuth();
  const [queue, setQueue] = useState<EarnedBadge[]>([]);
  const [showing, setShowing] = useState<EarnedBadge | null>(null);

  useEffect(() => {
    if (!user || profile?.role !== "student") return;
    let mounted = true;
    (async () => {
      const { data } = await supabase.rpc("student_earned_badges", { p_student: user.id });
      if (!mounted) return;
      const list = (data ?? []) as EarnedBadge[];
      const key = STORAGE_PREFIX + user.id;
      const prevRaw = localStorage.getItem(key);
      const prev: string[] = prevRaw ? JSON.parse(prevRaw) : [];
      const fresh = list.filter((b) => !prev.includes(b.badge_id));
      // Always keep cache in sync even if nothing to show (first visit)
      localStorage.setItem(key, JSON.stringify(list.map((b) => b.badge_id)));
      // Skip celebration on the very first load ever (no prior cache) to avoid dumping all badges
      if (prevRaw === null) return;
      if (fresh.length > 0) setQueue(fresh);
    })();
    return () => { mounted = false; };
  }, [user, profile?.role]);

  useEffect(() => {
    if (showing || queue.length === 0) return;
    const next = queue[0];
    setQueue((q) => q.slice(1));
    setShowing(next);
    const t = setTimeout(() => setShowing(null), 3000);
    return () => clearTimeout(t);
  }, [queue, showing]);

  return (
    <AnimatePresence>
      {showing && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none"
          dir="rtl"
        >
          <div className="absolute inset-0 bg-background/80 backdrop-blur-md" />
          <motion.div
            initial={{ scale: 0.3, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0, y: -30 }}
            transition={{ type: "spring", stiffness: 200, damping: 18 }}
            className="relative"
          >
            {/* Radial burst */}
            <motion.div
              initial={{ scale: 0.5, opacity: 0.6 }}
              animate={{ scale: 2.5, opacity: 0 }}
              transition={{ duration: 1.6, ease: "easeOut", repeat: Infinity }}
              className="absolute inset-0 rounded-full"
              style={{ background: "radial-gradient(circle, hsl(45 95% 55% / 0.55) 0%, transparent 70%)" }}
            />
            <div className="relative w-72 md:w-96 rounded-3xl border-2 border-amber-500/60 bg-card p-8 text-center shadow-[0_0_60px_hsl(45_95%_55%/0.4)]">
              <motion.div
                initial={{ y: 30, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.15 }}
                className="mx-auto w-28 h-28 rounded-3xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center overflow-hidden mb-4"
              >
                {showing.icon_url ? (
                  <img src={showing.icon_url} alt="" className="w-full h-full object-contain" />
                ) : (
                  <Award className="w-14 h-14 text-amber-500" />
                )}
              </motion.div>
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.3 }}
              >
                <div className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-600 uppercase tracking-wider">
                  <Sparkles className="w-3.5 h-3.5" />
                  شارة جديدة
                </div>
                <div className="text-2xl md:text-3xl font-black mt-2">{showing.name}</div>
                <div className="text-sm text-muted-foreground mt-1">مبروك على الإنجاز!</div>
              </motion.div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
