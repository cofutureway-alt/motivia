import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowDownCircle, ArrowUpCircle, Loader2, Wallet as WalletIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import StrongConfirmDialog from "@/components/admin/StrongConfirmDialog";
import { formatPiastres, parseEgpToPiastres } from "@/lib/money";

interface Props {
  userId: string;
  studentName?: string | null;
  onBalanceChanged?: (newBalancePiastres: number) => void;
  compact?: boolean;
}

/**
 * Shared admin wallet charge / deduct panel — Phase 35 mechanism.
 * Reused by AdminWallets ("Manage Wallets") and AdminStudentDetail.
 * Wraps the `admin_adjust_wallet` RPC + StrongConfirmDialog.
 */
export default function AdminWalletAdjustPanel({
  userId,
  studentName,
  onBalanceChanged,
  compact,
}: Props) {
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<{
    open: boolean;
    kind: "charge" | "deduct" | null;
    amount: string;
  }>({ open: false, kind: null, amount: "" });
  const [confirmAction, setConfirmAction] = useState<{
    kind: "charge" | "deduct";
    amountPi: number;
  } | null>(null);

  const loadBalance = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("wallets")
      .select("balance_piastres")
      .eq("user_id", userId)
      .maybeSingle();
    setBalance(data?.balance_piastres ?? 0);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    loadBalance();
  }, [loadBalance]);

  const openAction = (kind: "charge" | "deduct") =>
    setForm({ open: true, kind, amount: "" });

  const proceedAction = () => {
    const pi = parseEgpToPiastres(form.amount);
    if (!pi || pi <= 0) {
      toast.error("قيمة غير صحيحة");
      return;
    }
    setForm({ open: false, kind: null, amount: "" });
    setConfirmAction({ kind: form.kind!, amountPi: pi });
  };

  const executeAction = async () => {
    if (!confirmAction) return;
    const { data, error } = await (supabase.rpc as any)("admin_adjust_wallet", {
      p_user_id: userId,
      p_amount_piastres: confirmAction.amountPi,
      p_type: confirmAction.kind === "charge" ? "admin_charge" : "admin_deduct",
    });
    if (error) throw new Error(error.message);
    if (data?.success) {
      toast.success(
        confirmAction.kind === "charge"
          ? `تم شحن ${formatPiastres(confirmAction.amountPi)}`
          : `تم خصم ${formatPiastres(confirmAction.amountPi)}`,
      );
      const newBal = data.new_balance_piastres as number;
      setBalance(newBal);
      onBalanceChanged?.(newBal);
      setConfirmAction(null);
    }
  };

  return (
    <>
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className={compact ? "p-4" : "p-5"}>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <WalletIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="font-bold">المحفظة الإلكترونية</div>
              <div className="text-xs text-muted-foreground">
                الرصيد الحالي للطالب
              </div>
            </div>
          </div>

          <motion.div
            key={balance ?? 0}
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 18 }}
            className="rounded-xl border border-border bg-accent/40 p-5 mb-4 text-center"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin text-primary mx-auto" />
            ) : (
              <div className="text-3xl font-bold tracking-tight">
                {formatPiastres(balance ?? 0)}
              </div>
            )}
          </motion.div>

          <div className="grid grid-cols-2 gap-2">
            <Button
              onClick={() => openAction("charge")}
              disabled={loading}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <ArrowUpCircle className="w-4 h-4 ml-2" />
              شحن
            </Button>
            <Button
              onClick={() => openAction("deduct")}
              disabled={loading || (balance ?? 0) <= 0}
              variant="outline"
              className="border-rose-500/40 text-rose-600 hover:bg-rose-500/10 hover:text-rose-700 dark:text-rose-400"
            >
              <ArrowDownCircle className="w-4 h-4 ml-2" />
              خصم
            </Button>
          </div>
        </div>
      </div>

      {/* Amount entry */}
      <Dialog
        open={form.open}
        onOpenChange={(o) => setForm((f) => ({ ...f, open: o }))}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {form.kind === "charge" ? "شحن رصيد" : "خصم من الرصيد"}
              {studentName ? ` — ${studentName}` : ""}
            </DialogTitle>
            <DialogDescription>
              أدخل المبلغ بالجنيه المصري.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs">المبلغ (ج.م)</Label>
            <Input
              type="number"
              min="1"
              step="1"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              placeholder="مثال: 50"
              className="text-center font-mono text-lg"
              dir="ltr"
              autoFocus
            />
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setForm({ open: false, kind: null, amount: "" })}
            >
              إلغاء
            </Button>
            <Button onClick={proceedAction}>متابعة</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Strong confirm */}
      <StrongConfirmDialog
        open={!!confirmAction}
        onOpenChange={(o) => !o && setConfirmAction(null)}
        title={confirmAction?.kind === "charge" ? "تأكيد الشحن" : "تأكيد الخصم"}
        destructive={confirmAction?.kind === "deduct"}
        description={
          confirmAction && (
            <>
              <p>
                سيتم{" "}
                <span className="font-bold">
                  {confirmAction.kind === "charge" ? "إضافة" : "خصم"}{" "}
                  {formatPiastres(confirmAction.amountPi)}
                </span>{" "}
                {confirmAction.kind === "charge" ? "إلى" : "من"} محفظة الطالب
                {studentName ? ` "${studentName}"` : ""}.
              </p>
              <p className="text-xs text-muted-foreground">
                الرصيد الحالي: {formatPiastres(balance ?? 0)} ← الرصيد المتوقع:{" "}
                <span className="font-bold text-foreground">
                  {formatPiastres(
                    (balance ?? 0) +
                      (confirmAction.kind === "charge" ? 1 : -1) *
                        confirmAction.amountPi,
                  )}
                </span>
              </p>
            </>
          )
        }
        onConfirm={executeAction}
      />
    </>
  );
}
