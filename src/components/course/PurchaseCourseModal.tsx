import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Wallet as WalletIcon,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  ArrowLeft,
  Sparkles,
  HandCoins,
  Clock,
  CreditCard,
  ExternalLink,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { listMyChildren, ParentChild } from "@/lib/parent-api";
import { formatPiastres } from "@/lib/money";
import { cn } from "@/lib/utils";
import ManualPaymentForm from "@/components/payments/ManualPaymentForm";
import {
  ManualPaymentMethod,
  listEnabledManualMethods,
  submitManualCoursePayment,
} from "@/lib/manual-payment-api";
import { initiateKashierPayment } from "@/lib/kashier-api";
import { initiatePaymobPayment } from "@/lib/paymob-api";
import { initiateFawaterakPayment, FawaterakMethod } from "@/lib/fawaterak-api";
import FawaterakMethodPicker from "@/components/payments/FawaterakMethodPicker";

interface Gateway {
  id: string;
  gateway_key: string;
  display_name: string;
  type: "automatic" | "manual";
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  courseId: string;
  courseTitle: string;
  amountPiastres: number;
  onPurchased?: (info: { newBalance: number; reference: string }) => void;
}

export default function PurchaseCourseModal({
  open,
  onOpenChange,
  courseId,
  courseTitle,
  amountPiastres,
  onPurchased,
}: Props) {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const isParent = profile?.role === "parent";
  const [children, setChildren] = useState<ParentChild[]>([]);
  const [selectedChild, setSelectedChild] = useState<string | null>(null);

  const [gateways, setGateways] = useState<Gateway[] | null>(null);
  const [manualMethods, setManualMethods] = useState<ManualPaymentMethod[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [existingPending, setExistingPending] = useState<{ reference: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<
    | { type: "success"; newBalance: number; reference: string }
    | { type: "pending"; reference: string }
    | { type: "redirecting"; reference: string; mode: "test" | "live" }
    | { type: "inline"; reference: string; code: string | null; expire_at: string | null }
    | { type: "error"; message: string; insufficient?: boolean }
    | null
  >(null);

  useEffect(() => {
    if (!open) return;
    setResult(null);
    setSelected(null);
    setLoading(true);
    (async () => {
      const [{ data: gws }, { data: wal }, methods, { data: pending }] = await Promise.all([
        (supabase as any)
          .from("payment_gateways")
          .select("id, gateway_key, display_name, type")
          .eq("is_enabled", true)
          .order("created_at"),
        user
          ? (supabase as any)
              .from("wallets")
              .select("balance_piastres")
              .eq("user_id", user.id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        listEnabledManualMethods().catch(() => []),
        user
          ? (supabase as any)
              .from("payment_transactions")
              .select("reference_number")
              .eq("user_id", user.id)
              .eq("course_id", courseId)
              .eq("status", "pending_review")
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      const list = (gws ?? []) as Gateway[];
      setGateways(list);
      setManualMethods(methods);
      setWalletBalance(wal?.balance_piastres ?? 0);
      setExistingPending(pending ? { reference: pending.reference_number } : null);
      if (list.length === 1) setSelected(list[0].id);
      setLoading(false);
    })();
    if (isParent) {
      listMyChildren().then((c) => {
        setChildren(c);
        if (c.length === 1) setSelectedChild(c[0].student_user_id);
      }).catch(() => {});
    }
  }, [open, user, courseId, isParent]);

  const selectedGateway = gateways?.find((g) => g.id === selected) ?? null;
  const isWallet = selectedGateway?.gateway_key === "wallet";
  const isManual = selectedGateway?.gateway_key === "manual";
  const isKashier = selectedGateway?.gateway_key === "kashier";
  const isPaymob = selectedGateway?.gateway_key === "paymob";
  const isFawaterak = selectedGateway?.gateway_key === "fawaterak";
  const insufficient = isWallet && walletBalance !== null && walletBalance < amountPiastres;
  const balanceAfter = isWallet && walletBalance !== null ? walletBalance - amountPiastres : null;

  const handleWalletConfirm = async () => {
    if (!selectedGateway || submitting) return;
    setSubmitting(true);
    try {
      const { data, error } = await (supabase as any).rpc("purchase_course", {
        p_course_id: courseId,
        p_on_behalf_of: isParent ? selectedChild : null,
      });
      if (error) throw error;
      if (data?.success) {
        onPurchased?.({
          newBalance: data.new_balance_piastres ?? 0,
          reference: data.reference_number ?? "",
        });
        onOpenChange(false);
      } else {
        setResult({
          type: "error",
          message: data?.failure_reason ?? "تعذّر إتمام عملية الشراء",
          insufficient: data?.failure_reason === "رصيد غير كافٍ",
        });
      }
    } catch (e: any) {
      setResult({ type: "error", message: e?.message ?? "حدث خطأ غير متوقع" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleGatewayRedirect = async (provider: "kashier" | "paymob") => {
    if (submitting) return;
    setSubmitting(true);
    setResult(null);
    try {
      const res =
        provider === "kashier"
          ? await initiateKashierPayment({ purpose: "course_purchase", courseId })
          : await initiatePaymobPayment({ purpose: "course_purchase", courseId });
      setResult({
        type: "redirecting",
        reference: res.reference_number,
        mode: (res as any).mode ?? "live",
      });
      setTimeout(() => {
        window.location.assign(res.redirect_url);
      }, 400);
    } catch (e: any) {
      setResult({ type: "error", message: e?.message ?? "تعذّر بدء عملية الدفع" });
      setSubmitting(false);
    }
  };
  const handleKashierConfirm = () => handleGatewayRedirect("kashier");
  const handlePaymobConfirm = () => handleGatewayRedirect("paymob");

  const handleFawaterakPick = async (method: FawaterakMethod) => {
    if (submitting) return;
    setSubmitting(true);
    setResult(null);
    try {
      const res = await initiateFawaterakPayment({
        purpose: "course_purchase",
        courseId,
        paymentMethodId: method.payment_id,
      });
      if (res.redirect_url) {
        setResult({ type: "redirecting", reference: res.reference_number, mode: "live" });
        setTimeout(() => window.location.assign(res.redirect_url!), 400);
      } else {
        setResult({
          type: "inline",
          reference: res.reference_number,
          code: res.inline?.code ?? null,
          expire_at: res.inline?.expire_at ?? null,
        });
        setSubmitting(false);
      }
    } catch (e: any) {
      setResult({ type: "error", message: e?.message ?? "تعذّر بدء عملية الدفع" });
      setSubmitting(false);
    }
  };

  const handleManualSubmit = async (args: {
    methodId: string;
    senderNumber: string;
    proofPath: string;
  }) => {
    const data = await submitManualCoursePayment({
      courseId,
      methodId: args.methodId,
      senderNumber: args.senderNumber,
      proofPath: args.proofPath,
    });
    setResult({ type: "pending", reference: data?.reference_number ?? "" });
  };

  const goToCourse = () => {
    onOpenChange(false);
    setTimeout(() => navigate(`/courses/${courseId}`), 50);
  };

  const gatewayIconFor = (key: string) => {
    if (key === "manual") return HandCoins;
    if (key === "kashier" || key === "paymob" || key === "fawaterak") return CreditCard;
    return WalletIcon;
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent className="max-w-lg overflow-hidden p-0">
        <div className="p-6 pb-4 border-b border-border">
          <DialogHeader>
            <DialogTitle className="text-xl">
              {result?.type === "success"
                ? "تم الشراء بنجاح"
                : result?.type === "pending"
                  ? "تم إرسال طلب الدفع"
                  : existingPending
                    ? "طلبك قيد المراجعة"
                    : "اختر طريقة الدفع"}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mt-1 truncate">{courseTitle}</p>
        </div>

        <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
          <AnimatePresence mode="wait">
            {result?.type === "pending" ? (
              <motion.div
                key="pending"
                initial={{ opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center space-y-4 py-4"
              >
                <div className="w-20 h-20 mx-auto rounded-full bg-amber-500/10 flex items-center justify-center">
                  <Clock className="w-10 h-10 text-amber-500" />
                </div>
                <div>
                  <div className="text-lg font-bold">تم استلام طلب الدفع</div>
                  <div className="text-sm text-muted-foreground mt-1 leading-relaxed">
                    يرجى انتظار مراجعة الإدارة. لن تتمكن من إعادة الدفع لهذا الكورس حتى تتم مراجعة الطلب.
                  </div>
                  <div className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-mono px-2 py-1 rounded bg-accent">
                    {result.reference}
                  </div>
                </div>
                <Button size="lg" className="w-full" onClick={() => onOpenChange(false)}>
                  إغلاق
                </Button>
              </motion.div>
            ) : existingPending ? (
              <motion.div
                key="existing-pending"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center space-y-4 py-4"
              >
                <div className="w-20 h-20 mx-auto rounded-full bg-amber-500/10 flex items-center justify-center">
                  <Clock className="w-10 h-10 text-amber-500" />
                </div>
                <div>
                  <div className="text-lg font-bold">لديك طلب دفع قيد المراجعة</div>
                  <div className="text-sm text-muted-foreground mt-1 leading-relaxed">
                    لا يمكنك إرسال طلب جديد لهذا الكورس حتى تتم مراجعة الطلب الحالي.
                  </div>
                  <div className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-mono px-2 py-1 rounded bg-accent">
                    {existingPending.reference}
                  </div>
                </div>
                <Button
                  size="lg"
                  className="w-full"
                  onClick={() => {
                    onOpenChange(false);
                    setTimeout(() => navigate("/dashboard/wallet"), 50);
                  }}
                >
                  متابعة طلباتي
                </Button>
              </motion.div>
            ) : loading ? (
              <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
                <Skeleton className="h-20 w-full rounded-xl" />
                <Skeleton className="h-24 w-full rounded-xl" />
              </motion.div>
            ) : (gateways?.length ?? 0) === 0 ? (
              <motion.div
                key="none"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-dashed border-border p-8 text-center"
              >
                <AlertCircle className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <div className="font-semibold">لا توجد طريقة دفع متاحة حالياً</div>
              </motion.div>
            ) : (
              <motion.div key="pick" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                {isParent && (
                  <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-2">
                    <div className="text-sm font-bold">الشراء لصالح</div>
                    {children.length === 0 ? (
                      <div className="text-xs text-muted-foreground">لا يوجد أبناء مرتبطون بحسابك بعد. اذهب إلى «ربط طالب» أولاً.</div>
                    ) : (
                      <select value={selectedChild ?? ""} onChange={(e) => setSelectedChild(e.target.value || null)}
                        className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
                        <option value="">— اختر الطالب —</option>
                        {children.map((c) => (
                          <option key={c.student_user_id} value={c.student_user_id}>
                            {c.full_name} ({c.student_id})
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
                <div className="space-y-2">
                  {gateways!.map((g) => {
                    const Icon = gatewayIconFor(g.gateway_key);
                    const isSel = g.id === selected;
                    const disabled = g.gateway_key === "manual" && manualMethods.length === 0;
                    return (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => !disabled && setSelected(g.id)}
                        disabled={disabled}
                        className={cn(
                          "w-full text-right p-4 rounded-xl border-2 transition-all flex items-center gap-3",
                          isSel
                            ? "border-primary bg-primary/5 shadow-sm shadow-primary/10"
                            : "border-border hover:bg-accent/40",
                          disabled && "opacity-50 cursor-not-allowed",
                        )}
                      >
                        <div
                          className={cn(
                            "w-11 h-11 rounded-lg flex items-center justify-center shrink-0",
                            isSel ? "bg-primary text-primary-foreground" : "bg-accent text-primary",
                          )}
                        >
                          <Icon className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold">{g.display_name}</div>
                          {g.gateway_key === "wallet" && walletBalance !== null && (
                            <div className="text-xs text-muted-foreground">
                              الرصيد الحالي: {formatPiastres(walletBalance)}
                            </div>
                          )}
                          {g.gateway_key === "manual" && (
                            <div className="text-xs text-muted-foreground">
                              فودافون كاش / إنستاباي — يتم المراجعة يدويًا
                            </div>
                          )}
                        </div>
                        <div
                          className={cn(
                            "w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center",
                            isSel ? "border-primary bg-primary" : "border-muted-foreground/40",
                          )}
                        >
                          {isSel && <div className="w-2 h-2 rounded-full bg-primary-foreground" />}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {isWallet && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-xl border border-border bg-card overflow-hidden"
                  >
                    <div className="p-4 space-y-2 text-sm">
                      <Row label="سعر الدورة" value={formatPiastres(amountPiastres)} strong />
                      <div className="border-t border-border" />
                      <Row label="الرصيد قبل الشراء" value={formatPiastres(walletBalance ?? 0)} />
                      <Row
                        label="الرصيد بعد الشراء"
                        value={formatPiastres(balanceAfter ?? 0)}
                        highlight={insufficient ? "danger" : "ok"}
                      />
                    </div>
                    {insufficient && (
                      <div className="px-4 py-3 bg-rose-500/10 border-t border-rose-500/20 text-sm">
                        <div className="font-semibold text-rose-700 dark:text-rose-300">رصيد غير كافٍ</div>
                        <button
                          onClick={() => {
                            onOpenChange(false);
                            setTimeout(() => navigate("/dashboard/wallet"), 50);
                          }}
                          className="text-xs underline text-rose-700 dark:text-rose-300 mt-0.5"
                        >
                          اذهب إلى المحفظة لشحن الرصيد
                        </button>
                      </div>
                    )}
                  </motion.div>
                )}

                {isManual && (
                  <div className="space-y-3">
                    <div className="rounded-xl bg-accent/40 border border-border p-3 text-sm text-center">
                      المبلغ المطلوب: <span className="font-bold">{formatPiastres(amountPiastres)}</span>
                    </div>
                    <ManualPaymentForm methods={manualMethods} onSubmit={handleManualSubmit} />
                  </div>
                )}

                {(isKashier || isPaymob) && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-xl border border-primary/20 bg-primary/5 overflow-hidden"
                  >
                    <div className="p-4 space-y-2 text-sm">
                      <div className="flex items-center gap-2 font-bold">
                        <CreditCard className="w-4 h-4 text-primary" />
                        الدفع الإلكتروني عبر {isKashier ? "Kashier" : "PayMob"}
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        سيتم تحويلك إلى صفحة الدفع الآمنة لإتمام العملية بالبطاقة أو المحفظة الإلكترونية، ثم العودة تلقائيًا لتفعيل الدورة.
                      </p>
                      <div className="pt-2 border-t border-primary/20 flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">المبلغ</span>
                        <span className="font-bold text-base">{formatPiastres(amountPiastres)}</span>
                      </div>
                    </div>
                  </motion.div>
                )}

                {isFawaterak && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-xl border border-primary/20 bg-primary/5 overflow-hidden"
                  >
                    <div className="p-4 space-y-3 text-sm">
                      <div className="flex items-center gap-2 font-bold">
                        <CreditCard className="w-4 h-4 text-primary" />
                        الدفع الإلكتروني عبر فواتيرك
                      </div>
                      <div className="pt-2 border-t border-primary/20 flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">المبلغ</span>
                        <span className="font-bold text-base">{formatPiastres(amountPiastres)}</span>
                      </div>
                      {result?.type === "inline" ? (
                        <div className="rounded-lg border border-primary/30 bg-background/60 p-3 space-y-1 text-center">
                          <div className="text-xs text-muted-foreground">كود الدفع</div>
                          <div className="font-mono text-lg font-bold tracking-widest">{result.code ?? "—"}</div>
                          {result.expire_at && (
                            <div className="text-[11px] text-muted-foreground">
                              صالح حتى: <span dir="ltr">{String(result.expire_at)}</span>
                            </div>
                          )}
                          <div className="text-[11px] text-muted-foreground pt-1 leading-relaxed">
                            استخدم هذا الكود لإتمام الدفع في منفذ فواتيرك. سيتم تفعيل الدورة تلقائيًا فور استلام التأكيد.
                          </div>
                        </div>
                      ) : (
                        <FawaterakMethodPicker onPick={handleFawaterakPick} disabled={submitting} />
                      )}
                    </div>
                  </motion.div>
                )}

                {result?.type === "error" && (
                  <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-3 text-sm flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
                    <div className="flex-1 font-semibold text-rose-700 dark:text-rose-300">{result.message}</div>
                  </div>
                )}

                {isWallet && (
                  <>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                      عملية آمنة — يتم الخصم لمرة واحدة وتفعيل الدورة فورًا.
                    </div>
                    <Button
                      size="lg"
                      className="w-full font-bold shadow-lg shadow-primary/20"
                      disabled={!selected || submitting || insufficient || (isParent && !selectedChild)}
                      onClick={handleWalletConfirm}
                    >
                      {submitting ? (
                        <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                      ) : (
                        <Sparkles className="w-4 h-4 ml-2" />
                      )}
                      تأكيد الشراء
                    </Button>
                  </>
                )}

                {(isKashier || isPaymob) && (
                  <>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                      تحويل آمن — سيتم إتمام الدفع على صفحة {isKashier ? "Kashier" : "PayMob"} ثم العودة تلقائيًا.
                    </div>
                    <Button
                      size="lg"
                      className="w-full font-bold shadow-lg shadow-primary/20"
                      disabled={!selected || submitting}
                      onClick={isKashier ? handleKashierConfirm : handlePaymobConfirm}
                    >
                      {submitting ? (
                        <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                      ) : (
                        <ExternalLink className="w-4 h-4 ml-2" />
                      )}
                      المتابعة إلى {isKashier ? "Kashier" : "PayMob"}
                    </Button>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({
  label,
  value,
  strong,
  highlight,
}: {
  label: string;
  value: string;
  strong?: boolean;
  highlight?: "ok" | "danger";
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          strong && "font-bold text-base",
          highlight === "danger" && "text-rose-600 dark:text-rose-400 font-bold",
          highlight === "ok" && "text-emerald-600 dark:text-emerald-400 font-bold",
        )}
      >
        {value}
      </span>
    </div>
  );
}
