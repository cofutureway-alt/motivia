import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Clock, CheckCircle2, XCircle, Loader2, Inbox, Wallet as WalletIcon,
  BookOpen, Filter, ExternalLink, ImageIcon, Receipt,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatPiastres } from "@/lib/money";
import { normalizeEgPhone } from "@/lib/phone";
import {
  AdminPaymentRequest,
  METHOD_LABEL,
  adminListPaymentRequests,
  adminApprovePaymentRequest,
  adminRejectPaymentRequest,
  getProofSignedUrl,
} from "@/lib/manual-payment-api";

const STATUS_META = {
  pending_review: { label: "قيد المراجعة", color: "text-amber-600", bg: "bg-amber-500/10 border-amber-500/30", Icon: Clock },
  pending_gateway: { label: "بانتظار الدفع", color: "text-sky-600", bg: "bg-sky-500/10 border-sky-500/30", Icon: Loader2 },
  success:        { label: "مقبول",         color: "text-emerald-600", bg: "bg-emerald-500/10 border-emerald-500/30", Icon: CheckCircle2 },
  failed:         { label: "مرفوض",         color: "text-rose-600", bg: "bg-rose-500/10 border-rose-500/30", Icon: XCircle },
} as const;

const FALLBACK_STATUS_META = {
  label: "غير معروف",
  color: "text-muted-foreground",
  bg: "bg-muted border-border",
  Icon: Receipt,
};

function dateAr(iso: string) {
  return new Date(iso).toLocaleString("ar-EG", {
    year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

export default function AdminPaymentRequests() {
  const [purposeFilter, setPurposeFilter] = useState<"all" | "course_purchase" | "wallet_topup">("all");
  const [statusFilter, setStatusFilter] = useState<"pending_review" | "success" | "failed" | "all">("pending_review");
  const [gatewayFilter, setGatewayFilter] = useState<"all" | "manual" | "purchase_code">("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [items, setItems] = useState<AdminPaymentRequest[] | null>(null);
  const [selected, setSelected] = useState<AdminPaymentRequest | null>(null);

  const load = async () => {
    setItems(null);
    try {
      const data = await adminListPaymentRequests({
        status: statusFilter === "all" ? null : statusFilter,
        purpose: purposeFilter === "all" ? null : purposeFilter,
        limit: 200,
      });
      setItems(data);
    } catch (e: any) {
      toast.error(e?.message || "تعذّر تحميل الطلبات");
      setItems([]);
    }
  };

  useEffect(() => { load(); }, [purposeFilter, statusFilter]);

  const filtered = useMemo(() => {
    if (!items) return null;
    return items.filter((r) => {
      if (dateFrom && new Date(r.created_at) < new Date(dateFrom)) return false;
      if (dateTo && new Date(r.created_at) > new Date(dateTo + "T23:59:59")) return false;
      if (gatewayFilter === "manual" && (r.gateway_display_name === "كود شراء" || r.reference_number.startsWith("CODE-"))) return false;
      if (gatewayFilter === "purchase_code" && !(r.gateway_display_name === "كود شراء" || r.reference_number.startsWith("CODE-"))) return false;
      return true;
    });
  }, [items, dateFrom, dateTo, gatewayFilter]);

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
          <Inbox className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">طلبات وسجلات الدفع</h1>
          <p className="text-sm text-muted-foreground">مراجعة ومتابعة جميع عمليات الدفع اليدوي وأكواد الشراء والتحويلات.</p>
        </div>
      </motion.div>

      {/* Filters */}
      <div className="rounded-2xl border border-border bg-card p-4 grid grid-cols-1 md:grid-cols-5 gap-3">
        <div>
          <Label className="text-xs">طريقة الدفع</Label>
          <div className="mt-1 flex flex-wrap gap-1">
            {[
              { v: "all", l: "الكل" },
              { v: "manual", l: "دفع يدوي" },
              { v: "purchase_code", l: "أكواد الشراء" },
            ].map((g) => (
              <button
                key={g.v}
                type="button"
                onClick={() => {
                  setGatewayFilter(g.v as any);
                  if (g.v === "purchase_code" && statusFilter === "pending_review") {
                    setStatusFilter("all");
                  }
                }}
                className={cn(
                  "px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all",
                  gatewayFilter === g.v ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-accent",
                )}
              >
                {g.l}
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label className="text-xs">الحالة</Label>
          <div className="mt-1 flex flex-wrap gap-1">
            {(["pending_review", "success", "failed", "all"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={cn(
                  "px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all",
                  statusFilter === s ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-accent",
                )}
              >
                {s === "all" ? "الكل" : STATUS_META[s].label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label className="text-xs">النوع</Label>
          <div className="mt-1 flex flex-wrap gap-1">
            {[
              { v: "all", l: "الكل" },
              { v: "course_purchase", l: "شراء دورة" },
              { v: "wallet_topup", l: "شحن محفظة" },
            ].map((o) => (
              <button
                key={o.v}
                type="button"
                onClick={() => setPurposeFilter(o.v as any)}
                className={cn(
                  "px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all",
                  purposeFilter === o.v ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-accent",
                )}
              >
                {o.l}
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label className="text-xs">من تاريخ</Label>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="mt-1 text-xs" />
        </div>
        <div>
          <Label className="text-xs">إلى تاريخ</Label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="mt-1 text-xs" />
        </div>
      </div>

      {/* List */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {filtered === null ? (
          <div className="p-6 space-y-2">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-14 text-center">
            <div className="w-14 h-14 mx-auto rounded-full bg-muted flex items-center justify-center mb-3">
              <Inbox className="w-6 h-6 text-muted-foreground" />
            </div>
            <div className="font-bold">لا توجد طلبات مطابقة</div>
            <p className="text-sm text-muted-foreground mt-1">جرّب تغيير الفلاتر أو الانتظار حتى وصول طلبات جديدة.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="p-3 text-right font-semibold">الطالب</th>
                  <th className="p-3 text-right font-semibold">النوع</th>
                  <th className="p-3 text-right font-semibold">المبلغ</th>
                  <th className="p-3 text-right font-semibold">الطريقة</th>
                  <th className="p-3 text-right font-semibold">التاريخ</th>
                  <th className="p-3 text-right font-semibold">الحالة</th>
                  <th className="p-3 text-right font-semibold"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => {
                  const meta = STATUS_META[r.status as keyof typeof STATUS_META] ?? FALLBACK_STATUS_META;
                  const Icon = meta.Icon;
                  const amount = r.purpose === "wallet_topup" ? r.topup_amount_piastres ?? 0 : r.amount_piastres;
                  return (
                    <motion.tr
                      key={r.transaction_id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(i * 0.02, 0.3) }}
                      className="border-b border-border/40 last:border-0 hover:bg-accent/30 transition-colors"
                    >
                      <td className="p-3">
                        <div className="font-semibold">{r.student_name}</div>
                        <div className="text-xs text-muted-foreground font-mono">{r.student_student_id ?? ""}</div>
                      </td>
                      <td className="p-3">
                        <div className="inline-flex items-center gap-1.5 text-xs font-semibold">
                          {r.purpose === "wallet_topup" ? <WalletIcon className="w-3.5 h-3.5" /> : <BookOpen className="w-3.5 h-3.5" />}
                          {r.purpose === "wallet_topup" ? "شحن محفظة" : "شراء دورة"}
                        </div>
                        {r.course_title && <div className="text-xs text-muted-foreground mt-0.5 truncate max-w-[200px]">{r.course_title}</div>}
                      </td>
                      <td className="p-3 font-bold tabular-nums whitespace-nowrap">{formatPiastres(amount)}</td>
                      <td className="p-3 text-xs">{r.method_type ? METHOD_LABEL[r.method_type] ?? r.method_type : r.gateway_display_name}</td>
                      <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">{dateAr(r.created_at)}</td>
                      <td className="p-3">
                        <span className={cn("inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-full border", meta.bg, meta.color)}>
                          <Icon className="w-3.5 h-3.5" />
                          {meta.label}
                        </span>
                      </td>
                      <td className="p-3 text-left">
                        <Button size="sm" onClick={() => setSelected(r)}>
                          {r.status === "pending_review" ? "مراجعة" : "عرض"}
                        </Button>
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ReviewModal
        request={selected}
        onClose={() => setSelected(null)}
        onDone={() => { setSelected(null); load(); }}
      />
    </div>
  );
}

function ReviewModal({
  request, onClose, onDone,
}: { request: AdminPaymentRequest | null; onClose: () => void; onDone: () => void }) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSignedUrl(null);
    setRejecting(false);
    setReason("");
    if (request?.proof_image_url) {
      getProofSignedUrl(request.proof_image_url).then((u) => setSignedUrl(u));
    }
  }, [request]);

  if (!request) return null;
  const meta = STATUS_META[request.status as keyof typeof STATUS_META] ?? FALLBACK_STATUS_META;
  const amount = request.purpose === "wallet_topup" ? request.topup_amount_piastres ?? 0 : request.amount_piastres;
  const wa = request.method_whatsapp ? `https://wa.me/${normalizeEgPhone(request.method_whatsapp)}` : null;
  const isPending = request.status === "pending_review";

  const approve = async () => {
    setBusy(true);
    try {
      await adminApprovePaymentRequest(request.transaction_id);
      toast.success("تم قبول الطلب");
      onDone();
    } catch (e: any) {
      toast.error(e?.message || "تعذّر قبول الطلب");
    } finally {
      setBusy(false);
    }
  };

  const reject = async () => {
    if (reason.trim().length < 3) {
      toast.error("أدخل سبب رفض واضح");
      return;
    }
    setBusy(true);
    try {
      await adminRejectPaymentRequest(request.transaction_id, reason.trim());
      toast.success("تم رفض الطلب");
      onDone();
    } catch (e: any) {
      toast.error(e?.message || "تعذّر رفض الطلب");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!request} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            مراجعة طلب دفع
            <span className={cn("text-xs font-semibold px-2 py-1 rounded-full border", meta.bg, meta.color)}>
              {meta.label}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2 max-h-[65vh] overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Panel title="الطالب">
              <div className="font-bold">{request.student_name}</div>
              <div className="text-xs text-muted-foreground font-mono" dir="ltr">{request.student_phone}</div>
              <div className="text-xs text-muted-foreground font-mono">{request.student_student_id}</div>
            </Panel>
            <Panel title="الطلب">
              <div className="font-bold">
                {request.purpose === "wallet_topup" ? "شحن محفظة" : "شراء دورة"}
              </div>
              {request.course_title && <div className="text-sm text-muted-foreground truncate">{request.course_title}</div>}
              <div className="mt-1 text-lg font-extrabold tabular-nums">{formatPiastres(amount)}</div>
              <div className="text-[11px] font-mono text-muted-foreground mt-0.5">{request.reference_number}</div>
            </Panel>
            <Panel title="طريقة الدفع">
              <div className="font-semibold">{request.method_type ? METHOD_LABEL[request.method_type] ?? request.method_type : request.gateway_display_name}</div>
              {request.method_account_holder && (<div className="text-xs text-muted-foreground">{request.method_account_holder}</div>)}
              {request.method_account_number && (
                <div className="text-xs font-mono mt-1" dir="ltr">{request.method_account_number}</div>
              )}
              {wa && (
                <a href={wa} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline inline-flex items-center gap-1 mt-1">
                  <ExternalLink className="w-3 h-3" /> واتساب الدعم
                </a>
              )}
            </Panel>
            <Panel title="بيانات المُحوِّل">
              <div className="text-xs text-muted-foreground">الرقم الذي تم التحويل منه:</div>
              <div className="font-mono font-bold" dir="ltr">{request.sender_number ?? "—"}</div>
              <div className="text-xs text-muted-foreground mt-2">التاريخ: {dateAr(request.created_at)}</div>
            </Panel>
          </div>

          <Panel title="صورة إثبات التحويل">
            {request.proof_image_url ? (
              signedUrl ? (
                <a href={signedUrl} target="_blank" rel="noreferrer" className="block rounded-lg overflow-hidden border border-border">
                  <img src={signedUrl} alt="proof" className="w-full max-h-96 object-contain bg-black/60" />
                </a>
              ) : (
                <div className="h-40 flex items-center justify-center text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin" />
                </div>
              )
            ) : (
              <div className="h-24 flex items-center justify-center text-muted-foreground">
                <ImageIcon className="w-6 h-6" />
              </div>
            )}
          </Panel>

          {!isPending && (request.review_notes || request.failure_reason) && (
            <Panel title={request.status === "failed" ? "سبب الرفض" : "ملاحظات المراجعة"}>
              <div className="text-sm">{request.review_notes || request.failure_reason}</div>
            </Panel>
          )}

          {isPending && (
            <AnimatePresence>
              {rejecting && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                  <Panel title="سبب الرفض">
                    <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="اكتب سببًا واضحًا يظهر للطالب" />
                  </Panel>
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>

        <DialogFooter className="gap-2">
          {isPending ? (
            rejecting ? (
              <>
                <Button variant="outline" onClick={() => setRejecting(false)} disabled={busy}>إلغاء</Button>
                <Button variant="destructive" onClick={reject} disabled={busy || reason.trim().length < 3}>
                  {busy ? <Loader2 className="w-4 h-4 ml-2 animate-spin" /> : <XCircle className="w-4 h-4 ml-2" />}
                  تأكيد الرفض
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setRejecting(true)} disabled={busy}>
                  <XCircle className="w-4 h-4 ml-2" /> رفض
                </Button>
                <Button onClick={approve} disabled={busy} className="bg-emerald-600 hover:bg-emerald-700">
                  {busy ? <Loader2 className="w-4 h-4 ml-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 ml-2" />}
                  قبول الطلب
                </Button>
              </>
            )
          ) : (
            <Button variant="outline" onClick={onClose}>إغلاق</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-accent/30 p-3">
      <div className="text-xs font-bold text-muted-foreground mb-2">{title}</div>
      {children}
    </div>
  );
}
