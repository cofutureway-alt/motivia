import { useEffect, useState } from "react";
import { Loader2, Check, X, Banknote, ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  adminListWithdrawals, adminProcessWithdrawal, type AdminWithdrawalRow,
} from "@/lib/admin-instructors-api";
import { formatEGP } from "@/lib/instructor-api";

const W_STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "قيد المراجعة", cls: "bg-orange-500/10 text-orange-600 border-orange-500/30" },
  approved: { label: "تمت الموافقة", cls: "bg-blue-500/10 text-blue-600 border-blue-500/30" },
  paid: { label: "تم التحويل", cls: "bg-green-500/10 text-green-600 border-green-500/30" },
  rejected: { label: "مرفوض", cls: "bg-red-500/10 text-red-600 border-red-500/30" },
};

export default function AdminWithdrawals() {
  const [rows, setRows] = useState<AdminWithdrawalRow[]>([]);
  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<{ row: AdminWithdrawalRow; kind: "approve" | "reject" | "paid" } | null>(null);
  const [reason, setReason] = useState("");
  const [proofUrl, setProofUrl] = useState("");
  const [processing, setProcessing] = useState(false);

  const load = () => {
    setLoading(true);
    adminListWithdrawals(status || null)
      .then(setRows)
      .catch((e) => toast.error(e?.message || "تعذّر التحميل"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [status]);

  const openAction = (row: AdminWithdrawalRow, kind: "approve" | "reject" | "paid") => {
    setAction({ row, kind });
    setReason("");
    setProofUrl(row.proof_url ?? "");
  };

  const confirmAction = async () => {
    if (!action) return;
    if (action.kind === "reject" && !reason.trim()) return toast.error("سبب الرفض مطلوب");
    setProcessing(true);
    try {
      await adminProcessWithdrawal(action.row.id, action.kind, {
        rejectionReason: action.kind === "reject" ? reason.trim() : null,
        proofUrl: action.kind !== "reject" ? proofUrl.trim() || null : null,
      });
      toast.success(
        action.kind === "approve"
          ? "تمت الموافقة وحُجزت الأرباح"
          : action.kind === "reject"
            ? "تم رفض الطلب"
            : "تم تأكيد التحويل"
      );
      setAction(null);
      load();
    } catch (e: any) {
      toast.error(e?.message || "تعذّر التنفيذ");
    } finally {
      setProcessing(false);
    }
  };

  const detailsText = (r: AdminWithdrawalRow) => {
    const d = r.payout_details ?? {};
    return [d.handle, d.phone, d.bank_name, d.iban, d.holder].filter(Boolean).join(" — ");
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
          <Banknote className="w-7 h-7 text-primary" />
          طلبات سحب المعلمين
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          الموافقة تحجز الأرباح المتاحة — الرفض يعيدها لرصيد المعلم
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          { v: "", l: "الكل" },
          { v: "pending", l: "قيد المراجعة" },
          { v: "approved", l: "تمت الموافقة" },
          { v: "paid", l: "تم التحويل" },
          { v: "rejected", l: "مرفوضة" },
        ].map((f) => (
          <Button key={f.l} size="sm" variant={status === f.v ? "default" : "outline"} onClick={() => setStatus(f.v)}>
            {f.l}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">لا توجد طلبات</CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <Card key={r.id}>
              <CardContent className="p-4 flex flex-wrap items-center gap-4">
                <Avatar className="w-10 h-10">
                  <AvatarImage src={r.avatar_url ?? undefined} />
                  <AvatarFallback className="bg-primary/10 text-primary text-xs">
                    {r.instructor_name?.[0] ?? "م"}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-32">
                  <div className="font-semibold">{r.instructor_name || "معلم"}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleString("ar-EG")}
                  </div>
                </div>
                <div className="text-lg font-bold text-green-600">{formatEGP(r.amount_piastres)}</div>
                <div className="text-sm">
                  <div className="font-medium">{r.method_key}</div>
                  {detailsText(r) && (
                    <div className="text-xs text-muted-foreground max-w-56 truncate">{detailsText(r)}</div>
                  )}
                </div>
                <Badge variant="outline" className={W_STATUS[r.status]?.cls ?? ""}>
                  {W_STATUS[r.status]?.label ?? r.status}
                </Badge>
                <div className="text-xs max-w-48">
                  {r.rejection_reason && <span className="text-red-600 block">السبب: {r.rejection_reason}</span>}
                  {r.admin_note && <span className="text-muted-foreground block">{r.admin_note}</span>}
                  {r.proof_url && (
                    <a href={r.proof_url} target="_blank" rel="noreferrer" className="text-blue-600 underline inline-flex items-center gap-1">
                      إثبات الدفع <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
                <div className="flex gap-2 mr-auto">
                  {r.status === "pending" && (
                    <>
                      <Button size="sm" onClick={() => openAction(r, "approve")}>
                        <Check className="w-4 h-4 ml-1" /> موافقة
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => openAction(r, "reject")}>
                        <X className="w-4 h-4 ml-1" /> رفض
                      </Button>
                    </>
                  )}
                  {r.status === "approved" && (
                    <Button size="sm" onClick={() => openAction(r, "paid")}>
                      تأكيد التحويل
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!action} onOpenChange={(v) => !v && setAction(null)}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {action?.kind === "approve"
                ? "موافقة على الطلب"
                : action?.kind === "reject"
                  ? "رفض الطلب"
                  : "تأكيد التحويل"}
            </DialogTitle>
          </DialogHeader>
          {action && (
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">
                {action.row.instructor_name} —{" "}
                <span className="font-bold text-foreground">{formatEGP(action.row.amount_piastres)}</span>
                {action.kind === "approve" && (
                  <p className="text-xs mt-1">
                    سيتم حجز الأرباح المتاحة لتغطية هذا المبلغ ولن تُحسب لطلبات أخرى.
                  </p>
                )}
              </div>
              {action.kind === "reject" && (
                <div className="space-y-2">
                  <Label>سبب الرفض *</Label>
                  <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="سيظهر للمعلم" />
                </div>
              )}
              {action.kind !== "reject" && (
                <div className="space-y-2">
                  <Label>رابط إثبات الدفع (اختياري)</Label>
                  <Input value={proofUrl} onChange={(e) => setProofUrl(e.target.value)} placeholder="https://…" />
                </div>
              )}
              <Button onClick={confirmAction} disabled={processing} className="w-full">
                {processing && <Loader2 className="w-4 h-4 ml-2 animate-spin" />}
                تأكيد
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}