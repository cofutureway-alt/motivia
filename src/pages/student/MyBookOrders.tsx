import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookOpen,
  ChevronLeft,
  Loader2,
  Package2,
  RefreshCw,
  ShoppingBag,
  XCircle,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  MyBookOrderRow,
  BookOrderStatus,
  STATUS_LABEL,
  STATUS_TONE,
  changeBookOrderStatus,
  formatEGP,
  listMyBookOrders,
  requestBookOrderRefund,
} from "@/lib/book-orders-management-api";

function StatusBadge({ status }: { status: BookOrderStatus }) {
  const t = STATUS_TONE[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${t.bg} ${t.text} ${t.ring}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${t.dot}`} />
      {STATUS_LABEL[status]}
    </span>
  );
}

export default function MyBookOrders() {
  const [rows, setRows] = useState<MyBookOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const [cancelOrder, setCancelOrder] = useState<MyBookOrderRow | null>(null);
  const [refundOrder, setRefundOrder] = useState<MyBookOrderRow | null>(null);
  const [refundReason, setRefundReason] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      setRows(await listMyBookOrders());
    } catch (e: any) {
      toast({ title: "تعذّر تحميل طلباتك", description: e?.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const doCancel = async () => {
    if (!cancelOrder) return;
    setBusy(cancelOrder.id);
    try {
      await changeBookOrderStatus({
        orderId: cancelOrder.id,
        newStatus: "cancelled",
        notes: "إلغاء بواسطة الطالب",
      });
      toast({
        title: "تم إلغاء الطلب",
        description: cancelOrder.gateway_key === "wallet"
          ? "تم استرداد المبلغ إلى محفظتك."
          : "سيتم التواصل معك بشأن المبلغ إن كان قد تم دفعه.",
      });
      setCancelOrder(null);
      load();
    } catch (e: any) {
      toast({ title: "تعذّر الإلغاء", description: e?.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const doRefund = async () => {
    if (!refundOrder) return;
    if (refundReason.trim().length < 5) {
      toast({ title: "الرجاء توضيح السبب", variant: "destructive" });
      return;
    }
    setBusy(refundOrder.id);
    try {
      await requestBookOrderRefund(refundOrder.id, refundReason.trim());
      toast({ title: "تم تسجيل طلب الاسترجاع", description: "سيقوم فريقنا بمراجعة طلبك قريبًا." });
      setRefundOrder(null);
      setRefundReason("");
      load();
    } catch (e: any) {
      toast({ title: "تعذّر التسجيل", description: e?.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShoppingBag className="h-6 w-6 text-primary" />
            طلباتي
          </h1>
          <p className="text-sm text-muted-foreground mt-1">تتبّع طلباتك من الكتب.</p>
        </div>
        <Button variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ml-2 ${loading ? "animate-spin" : ""}`} /> تحديث
        </Button>
      </div>

      {loading ? (
        <Card className="p-12 flex items-center justify-center text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin ml-2" /> جاري التحميل...
        </Card>
      ) : rows.length === 0 ? (
        <Card className="p-12 text-center">
          <Package2 className="h-12 w-12 mx-auto opacity-40" />
          <p className="mt-3 text-muted-foreground">لا توجد طلبات بعد.</p>
          <Button asChild className="mt-4">
            <a href="/books"><BookOpen className="h-4 w-4 ml-2" /> تصفّح الكتب</a>
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          <AnimatePresence initial={false}>
            {rows.map((o, i) => {
              const canCancel = o.status === "pending_payment" || o.status === "confirmed";
              const canRefund = o.status === "delivered";
              return (
                <motion.div
                  key={o.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ delay: Math.min(i * 0.03, 0.2) }}
                >
                  <Card className="p-4 md:p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-xs text-muted-foreground">رقم الطلب</div>
                        <div className="font-mono font-semibold">{o.order_number}</div>
                      </div>
                      <StatusBadge status={o.status} />
                    </div>
                    <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                      <div>
                        <div className="text-xs text-muted-foreground">التاريخ</div>
                        <div>{new Date(o.created_at).toLocaleDateString("ar-EG", { dateStyle: "medium" })}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">القطع</div>
                        <div>{o.items_count}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">الدفع</div>
                        <div>{o.gateway_display_name}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">الإجمالي</div>
                        <div className="font-bold">{formatEGP(o.total_piastres)}</div>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {o.items_preview.slice(0, 3).map((it, idx) => (
                        <span key={idx} className="text-xs px-2 py-1 rounded-full bg-muted">
                          {it.title} ×{it.quantity}
                        </span>
                      ))}
                      {o.items_preview.length > 3 && (
                        <span className="text-xs px-2 py-1 rounded-full bg-muted">+{o.items_preview.length - 3}</span>
                      )}
                    </div>

                    {(canCancel || canRefund) && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {canCancel && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCancelOrder(o)}
                            disabled={busy === o.id}
                          >
                            <XCircle className="h-4 w-4 ml-1" />
                            إلغاء الطلب
                          </Button>
                        )}
                        {canRefund && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => { setRefundOrder(o); setRefundReason(""); }}
                            disabled={busy === o.id}
                          >
                            <RefreshCw className="h-4 w-4 ml-1" />
                            طلب استرجاع
                          </Button>
                        )}
                      </div>
                    )}
                  </Card>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Cancel dialog */}
      <Dialog open={!!cancelOrder} onOpenChange={(o) => !o && setCancelOrder(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>تأكيد إلغاء الطلب</DialogTitle>
            <DialogDescription>
              الطلب <span className="font-mono">{cancelOrder?.order_number}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="text-sm text-muted-foreground space-y-2">
            <p>سيتم إلغاء الطلب وإعادة الكتب إلى المخزون.</p>
            {cancelOrder?.gateway_key === "wallet" ? (
              <p className="text-emerald-600 dark:text-emerald-400 font-medium">
                سيتم استرداد {cancelOrder ? formatEGP(cancelOrder.total_piastres) : ""} إلى محفظتك فورًا.
              </p>
            ) : cancelOrder?.gateway_key !== "cod" && cancelOrder?.gateway_key !== "manual" ? (
              <p>سيتم التواصل معك بشأن استرداد المبلغ (إن كان قد تم الدفع).</p>
            ) : (
              <p>لم يتم استلام أي مبلغ لهذا الطلب.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOrder(null)} disabled={!!busy}>
              تراجع
            </Button>
            <Button variant="destructive" onClick={doCancel} disabled={!!busy}>
              {busy && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
              تأكيد الإلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Refund dialog */}
      <Dialog open={!!refundOrder} onOpenChange={(o) => !o && setRefundOrder(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>طلب استرجاع</DialogTitle>
            <DialogDescription>
              الطلب <span className="font-mono">{refundOrder?.order_number}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="text-sm font-medium">سبب طلب الاسترجاع</label>
            <Textarea
              rows={4}
              placeholder="اذكر السبب بوضوح (٥ أحرف على الأقل)..."
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              سيقوم فريقنا بمراجعة طلبك والرد عليك قريبًا.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRefundOrder(null)} disabled={!!busy}>
              إلغاء
            </Button>
            <Button onClick={doRefund} disabled={!!busy || refundReason.trim().length < 5}>
              {busy && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
              إرسال الطلب
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
