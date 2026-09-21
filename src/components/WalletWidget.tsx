import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Wallet as WalletIcon, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatPiastres } from "@/lib/money";
import { cn } from "@/lib/utils";

const WalletWidget = ({ to = "/dashboard/wallet" }: { to?: string }) => {
  const { user } = useAuth();
  const userId = user?.id;
  const navigate = useNavigate();
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async (showLoader = true) => {
      if (!userId) {
        setBalance(null);
        setLoading(false);
        return;
      }

      if (showLoader) setLoading(true);
      const { data } = await (supabase as any)
        .from("wallets")
        .select("balance_piastres")
        .eq("user_id", userId)
        .maybeSingle();

      if (cancelled) return;
      setBalance(data?.balance_piastres ?? 0);
      setLoading(false);
    };

    void load();

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void load(false);
    };

    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    const refreshTimer = window.setInterval(refreshWhenVisible, 30_000);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.clearInterval(refreshTimer);
    };

  }, [userId]);

  if (!user) return null;

  return (
    <motion.button
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      onClick={() => navigate(to)}
      title="محفظتي"
      className={cn(
        "group relative flex items-center gap-2 rounded-full border border-border bg-card hover:bg-accent transition-colors px-3 py-1.5 h-9"
      )}
    >
      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary">
        <WalletIcon className="w-3.5 h-3.5" />
      </span>
      <div className="flex flex-col items-start leading-tight">
        <span className="text-[10px] text-muted-foreground hidden sm:block">الرصيد</span>
        <AnimatePresence mode="wait">
          {loading ? (
            <motion.span
              key="l"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-1 text-xs font-bold"
            >
              <Loader2 className="w-3 h-3 animate-spin" />
            </motion.span>
          ) : (
            <motion.span
              key={balance ?? 0}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              className="text-xs font-extrabold text-foreground tabular-nums"
            >
              {formatPiastres(balance ?? 0)}
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </motion.button>
  );
};

export default WalletWidget;
