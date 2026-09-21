import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Wallet as WalletIcon,
  Ticket,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ArrowDownCircle,
  ArrowUpCircle,
  ReceiptText,
  Copy,
  Check,
  Inbox,
  Sparkles,
  HandCoins,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPiastres } from "@/lib/money";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import WalletTopupModal from "@/components/wallet/WalletTopupModal";
import MyPaymentRequests from "@/components/payments/MyPaymentRequests";

type TxType =
  | "card_redemption"
  | "admin_charge"
  | "admin_deduct"
  | "bulk_charge"
  | "bulk_deduct"
  | "purchase"
  | "admin_reset"
  | "gateway_topup";

interface WalletTransaction {
  id: string;
  reference_number: string;
  wallet_id: string;
  type: TxType;
  amount_piastres: number;
  balance_after_piastres: number;
  related_card_id: string | null;
  performed_by: string | null;
  notes: string | null;
  created_at: string;
}

const TYPE_LABEL: Record<TxType, string> = {
  card_redemption: "شحن بكارت",
  admin_charge: "شحن من الإدارة",
  admin_deduct: "خصم من الإدارة",
  bulk_charge: "شحن جماعي",
  bulk_deduct: "خصم جماعي",
  purchase: "شراء كورس",
  admin_reset: "تصفير الرصيد",
  gateway_topup: "شحن عبر بوابة دفع",
};

const CREDIT_TYPES: TxType[] = ["card_redemption", "admin_charge", "bulk_charge", "gateway_topup"];

const isCredit = (t: TxType) => CREDIT_TYPES.includes(t);
const isReset = (t: TxType) => t === "admin_reset";

/** Animated count-up for piastres → EGP display. */
function useBalanceAnim(target: number, duration = 900) {
  const [val, setVal] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = performance.now();
    const startVal = from.current;
    const diff = target - startVal;
    if (diff === 0) return;
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(startVal + diff * eased));
      if (p < 1) raf = requestAnimationFrame(step);
      else from.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}

function formatDateAr(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("ar-EG", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const BalanceCard = ({ balance, loading }: { balance: number; loading: boolean }) => {
  const animated = useBalanceAnim(balance);
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-2xl border border-border/60 bg-card p-6 md:p-8"
    >
      {/* decorative 8-pointed star */}
      <div
        aria-hidden
        className="absolute -top-16 -left-16 w-64 h-64 opacity-[0.06] rotate-12 pointer-events-none"
      >
        <div className="w-full h-full bg-primary [clip-path:polygon(50%_0%,61%_35%,98%_35%,68%_57%,79%_91%,50%_70%,21%_91%,32%_57%,2%_35%,39%_35%)]" />
      </div>

      <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <WalletIcon className="w-7 h-7 text-primary" />
          </div>
          <div>
            <div className="text-sm text-muted-foreground">الرصيد الحالي</div>
            <div className="text-xs text-muted-foreground/80 mt-0.5">
              محفظتك على منصة السعي
            </div>
          </div>
        </div>

        <div className="text-right">
          {loading ? (
            <Skeleton className="h-12 w-40" />
          ) : (
            <div className="flex items-baseline gap-2 justify-end">
              <motion.span
                key={balance}
                initial={{ scale: 0.95 }}
                animate={{ scale: 1 }}
                className="text-4xl md:text-5xl font-extrabold text-foreground tabular-nums"
              >
                {formatPiastres(animated, { withSuffix: false })}
              </motion.span>
              <span className="text-lg font-bold text-muted-foreground">ج.م</span>
            </div>
          )}
          <div className="text-[11px] text-muted-foreground mt-1">
            الحد الأقصى للمحفظة: 2000 ج.م
          </div>
        </div>
      </div>
    </motion.div>
  );
};

interface RedeemResult {
  success: true;
  new_balance_piastres: number;
  amount_piastres: number;
  reference_number: string;
}

const RedeemSection = ({
  onSuccess,
}: {
  onSuccess: (r: RedeemResult) => void;
}) => {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<RedeemResult | null>(null);
  const [copied, setCopied] = useState(false);

  const canSubmit = /^\d{6}$/.test(code) && !loading;

  const handleRedeem = async () => {
    if (!canSubmit) return;
    setError(null);
    setFlash(null);
    setLoading(true);
    try {
      const { data, error: err } = await (supabase.rpc as any)("redeem_top_up_card", {
        p_code: code,
      });
      if (err) throw err;
      const r = data as RedeemResult;
      setFlash(r);
      setCode("");
      onSuccess(r);
    } catch (e: any) {
      setError(e?.message || "حدث خطأ غير متوقع");
    } finally {
      setLoading(false);
    }
  };

  const copyRef = async () => {
    if (!flash) return;
    try {
      await navigator.clipboard.writeText(flash.reference_number);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("تعذّر النسخ");
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 }}
      className="rounded-2xl border border-border/60 bg-card p-6 md:p-8"
    >
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Ticket className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-foreground">شحن الرصيد</h2>
          <p className="text-xs text-muted-foreground">
            أدخل كود الكارت المكوّن من 6 أرقام
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <Input
          value={code}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "").slice(0, 6);
            setCode(v);
            if (error) setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && canSubmit) handleRedeem();
          }}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="000000"
          className="flex-1 text-center text-2xl font-bold tracking-[0.6em] tabular-nums h-14 rounded-xl"
          aria-invalid={!!error}
          aria-describedby={error ? "redeem-error" : undefined}
        />
        <Button
          onClick={handleRedeem}
          disabled={!canSubmit}
          className="h-14 px-8 rounded-xl text-base font-bold"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 ml-2 animate-spin" />
              جاري الشحن
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 ml-2" />
              شحن
            </>
          )}
        </Button>
      </div>

      <AnimatePresence mode="wait">
        {error && (
          <motion.div
            id="redeem-error"
            key="err"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="mt-4 flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-destructive text-sm"
            role="alert"
          >
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </motion.div>
        )}

        {flash && (
          <motion.div
            key={flash.reference_number}
            initial={{ opacity: 0, scale: 0.96, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 300, damping: 22 }}
            className="mt-4 relative overflow-hidden rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4"
          >
            <div className="flex items-start gap-3">
              <motion.div
                initial={{ scale: 0, rotate: -45 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 400, damping: 15 }}
                className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0"
              >
                <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
              </motion.div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-emerald-700 dark:text-emerald-300">
                  تم شحن رصيدك بنجاح
                </div>
                <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-[11px] text-muted-foreground">المبلغ المضاف</div>
                    <div className="font-bold text-foreground">
                      + {formatPiastres(flash.amount_piastres)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-muted-foreground">الرصيد الجديد</div>
                    <div className="font-bold text-foreground">
                      {formatPiastres(flash.new_balance_piastres)}
                    </div>
                  </div>
                </div>
                <button
                  onClick={copyRef}
                  className="mt-3 inline-flex items-center gap-2 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
                  type="button"
                >
                  <span>الرقم المرجعي: {flash.reference_number}</span>
                  {copied ? (
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

const TransactionRow = ({ t, i }: { t: WalletTransaction; i: number }) => {
  const credit = isCredit(t.type);
  const reset = isReset(t.type);
  const Icon = credit ? ArrowDownCircle : reset ? ReceiptText : ArrowUpCircle;
  const sign = credit ? "+" : reset ? "" : "-";
  const color = credit
    ? "text-emerald-600 dark:text-emerald-400"
    : reset
      ? "text-muted-foreground"
      : "text-red-600 dark:text-red-400";
  const bg = credit
    ? "bg-emerald-500/10 border-emerald-500/30"
    : reset
      ? "bg-muted border-border"
      : "bg-red-500/10 border-red-500/30";

  return (
    <motion.tr
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(i * 0.03, 0.3) }}
      className="border-b border-border/40 last:border-0 hover:bg-accent/40 transition-colors"
    >
      <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">
        {formatDateAr(t.created_at)}
      </td>
      <td className="p-3">
        <div
          className={cn(
            "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold",
            bg,
            color,
          )}
        >
          <Icon className="w-3.5 h-3.5" />
          {TYPE_LABEL[t.type]}
        </div>
      </td>
      <td className={cn("p-3 font-bold tabular-nums whitespace-nowrap", color)}>
        {sign} {formatPiastres(t.amount_piastres)}
      </td>
      <td className="p-3 font-medium tabular-nums whitespace-nowrap text-foreground">
        {formatPiastres(t.balance_after_piastres)}
      </td>
      <td className="p-3">
        <span className="text-[11px] font-mono text-muted-foreground">
          {t.reference_number}
        </span>
      </td>
    </motion.tr>
  );
};

const MyWallet = () => {
  const { user } = useAuth();
  const [balance, setBalance] = useState<number>(0);
  const [walletId, setWalletId] = useState<string | null>(null);
  const [loadingWallet, setLoadingWallet] = useState(true);
  const [transactions, setTransactions] = useState<WalletTransaction[] | null>(null);
  const [topupOpen, setTopupOpen] = useState(false);
  const [requestsReloadKey, setRequestsReloadKey] = useState(0);

  const loadWallet = async () => {
    if (!user) return;
    const { data } = await (supabase as any)
      .from("wallets")
      .select("id, balance_piastres")
      .eq("user_id", user.id)
      .maybeSingle();
    if (data) {
      setWalletId(data.id);
      setBalance(data.balance_piastres ?? 0);
    }
    setLoadingWallet(false);
  };

  const loadTransactions = async (wid: string) => {
    const { data } = await (supabase as any)
      .from("wallet_transactions")
      .select("*")
      .eq("wallet_id", wid)
      .order("created_at", { ascending: false });
    setTransactions((data as WalletTransaction[]) ?? []);
  };

  useEffect(() => {
    loadWallet();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    if (walletId) loadTransactions(walletId);
  }, [walletId]);

  const handleRedeemSuccess = (r: RedeemResult) => {
    setBalance(r.new_balance_piastres);
    if (walletId) loadTransactions(walletId);
  };

  const hasTx = useMemo(() => (transactions?.length ?? 0) > 0, [transactions]);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl md:text-3xl font-extrabold text-foreground">المحفظة</h1>
        <p className="text-sm text-muted-foreground mt-1">
          تابع رصيدك، اشحن كروت الشحن، وتصفح كل معاملاتك.
        </p>
      </motion.div>

      <BalanceCard balance={balance} loading={loadingWallet} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <RedeemSection onSuccess={handleRedeemSuccess} />
        <motion.button
          type="button"
          onClick={() => setTopupOpen(true)}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="rounded-2xl border border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors p-6 md:p-8 text-right flex flex-col justify-between gap-3"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <HandCoins className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">شحن عبر بوابة دفع</h2>
              <p className="text-xs text-muted-foreground">فودافون كاش / إنستاباي بمراجعة يدوية</p>
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            أدخل المبلغ، ثم قم بالتحويل وارفع صورة الإيصال. سيتم إضافة الرصيد بعد المراجعة.
          </div>
          <span className="inline-flex items-center gap-1.5 text-sm font-bold text-primary self-start">
            بدء طلب الشحن
            <Sparkles className="w-4 h-4" />
          </span>
        </motion.button>
      </div>

      <MyPaymentRequests reloadKey={requestsReloadKey} />

      <WalletTopupModal
        open={topupOpen}
        onOpenChange={setTopupOpen}
        currentBalance={balance}
        onSubmitted={() => setRequestsReloadKey((k) => k + 1)}
      />


      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-2xl border border-border/60 bg-card overflow-hidden"
      >
        <div className="flex items-center gap-3 p-5 md:p-6 border-b border-border/50">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <ReceiptText className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">سجل المعاملات</h2>
            <p className="text-xs text-muted-foreground">
              كل حركة تمت على محفظتك، الأحدث أولاً
            </p>
          </div>
        </div>

        {transactions === null ? (
          <div className="p-5 space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        ) : !hasTx ? (
          <div className="p-10 flex flex-col items-center justify-center text-center">
            <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-3">
              <Inbox className="w-6 h-6 text-muted-foreground" />
            </div>
            <div className="font-bold text-foreground">لا توجد معاملات بعد</div>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              عند شحن رصيدك أو شراء كورس ستظهر تفاصيل المعاملة هنا مع رقم مرجعي فريد.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="p-3 text-right font-semibold">التاريخ</th>
                  <th className="p-3 text-right font-semibold">النوع</th>
                  <th className="p-3 text-right font-semibold">المبلغ</th>
                  <th className="p-3 text-right font-semibold">الرصيد بعد</th>
                  <th className="p-3 text-right font-semibold">الرقم المرجعي</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t, i) => (
                  <TransactionRow key={t.id} t={t} i={i} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default MyWallet;
