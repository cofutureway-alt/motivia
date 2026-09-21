import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  ArrowLeft,
  Wallet as WalletIcon,
  GraduationCap,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPiastres } from "@/lib/money";
import { getOwnTransactionStatus, OwnTransactionStatus } from "@/lib/kashier-api";
import { expireStaleFawaterakPending } from "@/lib/fawaterak-api";
import { useAuth } from "@/contexts/AuthContext";

const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 30_000;

export default function PaymentFawaterakReturn() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [txn, setTxn] = useState<OwnTransactionStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef<number>(Date.now());
  const stopped = useRef(false);

  const reference =
    params.get("reference") ||
    params.get("invoice_number") ||
    params.get("referenceNumber") ||
    "";
  const resultHint = (params.get("result") || "").toLowerCase();

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate("/login", { replace: true });
      return;
    }
    if (!reference) {
      setError("مرجع الدفع غير موجود.");
      return;
    }

    // Age out any stale pending Fawaterak transactions before polling.
    expireStaleFawaterakPending().catch(() => {});

    let timeoutId: number | undefined;
    const tick = async () => {
      if (stopped.current) return;
      try {
        const row = await getOwnTransactionStatus(reference);
        if (stopped.current) return;
        if (row) {
          setTxn(row);
          if (row.status === "success" || row.status === "failed") {
            stopped.current = true;
            return;
          }
        }
      } catch (e) {
        console.warn("poll error", e);
      }
      const total = Date.now() - startedAt.current;
      setElapsed(total);
      if (total >= POLL_TIMEOUT_MS) {
        stopped.current = true;
        return;
      }
      timeoutId = window.setTimeout(tick, POLL_INTERVAL_MS);
    };
    tick();
    return () => {
      stopped.current = true;
      if (timeoutId) window.clearTimeout(timeoutId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reference, user, authLoading]);

  const state = useMemo<"loading" | "success" | "failed" | "pending">(() => {
    if (!txn && !error) return "loading";
    if (error) return "failed";
    if (!txn) return "loading";
    if (txn.status === "success") return "success";
    if (txn.status === "failed") return "failed";
    return "pending";
  }, [txn, error]);

  const amount =
    txn?.purpose === "wallet_topup" ? txn.topup_amount_piastres ?? 0 : txn?.amount_piastres ?? 0;

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-background">
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 180, damping: 18 }}
        className="w-full max-w-lg rounded-3xl border border-border bg-card shadow-2xl shadow-primary/5 overflow-hidden"
      >
        <div className="p-8 space-y-6">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="w-4 h-4 text-primary" />
            <span>عودة آمنة من بوابة فواتيرك</span>
            {resultHint && (
              <span className="ml-auto rounded-full bg-accent px-2 py-0.5 font-mono">{resultHint}</span>
            )}
          </div>

          <AnimatePresence mode="wait">
            {state === "loading" && (
              <motion.div key="loading" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="text-center space-y-4 py-8">
                <div className="mx-auto w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
                  <Loader2 className="w-10 h-10 text-primary animate-spin" />
                </div>
                <div>
                  <div className="text-xl font-extrabold">جارِ تأكيد الدفع...</div>
                  <div className="text-sm text-muted-foreground mt-2 leading-relaxed">
                    نتحقق من نتيجة عملية الدفع مع فواتيرك. عادةً ما يستغرق ذلك بضع ثوانٍ.
                  </div>
                </div>
                <ProgressBar elapsed={elapsed} total={POLL_TIMEOUT_MS} />
              </motion.div>
            )}

            {state === "pending" && (
              <motion.div key="pending" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="text-center space-y-4 py-6">
                <div className="mx-auto w-20 h-20 rounded-full bg-amber-500/10 flex items-center justify-center">
                  <Clock className="w-10 h-10 text-amber-500" />
                </div>
                <div>
                  <div className="text-xl font-extrabold">في انتظار تأكيد البوابة</div>
                  <div className="text-sm text-muted-foreground mt-2 leading-relaxed">
                    استلمنا عودتك من صفحة الدفع، لكن لم يصلنا تأكيد فواتيرك النهائي بعد.
                    سنُحدّث الحالة تلقائيًا فور استلامه.
                  </div>
                </div>
                <Button size="lg" className="w-full" onClick={() => navigate("/dashboard/wallet")}>
                  متابعة طلباتي
                </Button>
              </motion.div>
            )}

            {state === "success" && txn && (
              <motion.div key="success" initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ type: "spring", stiffness: 200, damping: 15 }} className="text-center space-y-4 py-4">
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.1, type: "spring", stiffness: 260, damping: 15 }} className="mx-auto w-20 h-20 rounded-full bg-emerald-500/10 flex items-center justify-center">
                  <CheckCircle2 className="w-12 h-12 text-emerald-500" />
                </motion.div>
                <div>
                  <div className="text-2xl font-extrabold">تم الدفع بنجاح</div>
                  <div className="text-sm text-muted-foreground mt-2">
                    {txn.purpose === "wallet_topup" ? "تم إضافة الرصيد إلى محفظتك." : "تم تسجيلك في الدورة."}
                  </div>
                </div>
                <SummaryBlock reference={txn.reference_number} amount={amount} icon={txn.purpose === "wallet_topup" ? WalletIcon : GraduationCap} />
                <div className="flex flex-col sm:flex-row gap-2">
                  {txn.purpose === "wallet_topup" ? (
                    <Button className="flex-1" size="lg" onClick={() => navigate("/dashboard/wallet")}>
                      الذهاب إلى المحفظة
                    </Button>
                  ) : (
                    <Button className="flex-1" size="lg" onClick={() => navigate(`/courses/${txn.course_id}`)}>
                      فتح الدورة
                    </Button>
                  )}
                  <Button variant="outline" className="flex-1" size="lg" onClick={() => navigate("/dashboard")}>
                    لوحة التحكم
                  </Button>
                </div>
              </motion.div>
            )}

            {state === "failed" && (
              <motion.div key="failed" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="text-center space-y-4 py-4">
                <div className="mx-auto w-20 h-20 rounded-full bg-rose-500/10 flex items-center justify-center">
                  <XCircle className="w-12 h-12 text-rose-500" />
                </div>
                <div>
                  <div className="text-2xl font-extrabold">تعذّر إتمام الدفع</div>
                  <div className="text-sm text-muted-foreground mt-2 leading-relaxed">
                    {error || txn?.failure_reason || "لم تكتمل عملية الدفع. يمكنك المحاولة مرة أخرى."}
                  </div>
                </div>
                {txn && <SummaryBlock reference={txn.reference_number} amount={amount} icon={XCircle} muted />}
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button className="flex-1" size="lg" onClick={() => navigate(txn?.purpose === "wallet_topup" ? "/dashboard/wallet" : txn?.course_id ? `/courses/${txn.course_id}` : "/courses")}>
                    المحاولة مرة أخرى
                  </Button>
                  <Button variant="outline" className="flex-1" size="lg" onClick={() => navigate("/dashboard")}>
                    <ArrowLeft className="w-4 h-4 ml-1.5" />
                    لوحة التحكم
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}

function ProgressBar({ elapsed, total }: { elapsed: number; total: number }) {
  const pct = Math.min(100, (elapsed / total) * 100);
  return (
    <div className="w-full h-1.5 rounded-full bg-accent overflow-hidden">
      <motion.div className="h-full bg-primary" initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ ease: "linear", duration: 0.4 }} />
    </div>
  );
}

function SummaryBlock({ reference, amount, icon: Icon, muted }: { reference: string; amount: number; icon: any; muted?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 text-right ${muted ? "border-border bg-accent/40" : "border-primary/20 bg-primary/5"}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${muted ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground">المرجع</div>
            <div className="font-mono text-xs">{reference}</div>
          </div>
        </div>
        <div className="text-lg font-extrabold tabular-nums">{formatPiastres(amount)}</div>
      </div>
    </div>
  );
}
