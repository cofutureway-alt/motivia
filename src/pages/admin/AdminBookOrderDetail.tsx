import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BookOpen,
  ChevronLeft,
  Clock,
  Loader2,
  MapPin,
  Package2,
  Phone,
  Printer,
  User,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  BookOrderFull,
  BookOrderStatus,
  STATUS_LABEL,
  STATUS_TONE,
  formatEGP,
  getBookOrderFull,
  nextAdminTransitions,
} from "@/lib/book-orders-management-api";
import { generateOrderSlipPdf } from "@/lib/book-order-slip-pdf";
import StatusChangeDialog from "@/components/admin/BookOrderStatusDialog";

function Badge({ status }: { status: BookOrderStatus }) {
  const t = STATUS_TONE[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ring-1 ${t.bg} ${t.text} ${t.ring}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${t.dot}`} />
      {STATUS_LABEL[status]}
    </span>
  );
}

export default function AdminBookOrderDetail() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<BookOrderFull | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const o = await getBookOrderFull(id);
      setOrder(o);
    } catch (e: any) {
      toast({ title: "تعذّر تحميل الطلب", description: e?.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) {
    return (
      <div className="p-12 flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin ml-2" /> جاري التحميل...
      </div>
    );
  }
  if (!order) {
    return (
      <Card className="p-8 text-center">
        <p className="text-muted-foreground">الطلب غير موجود.</p>
        <Button variant="outline" className="mt-4" onClick={() => nav("/admin/book-orders")}>
          <ChevronLeft className="h-4 w-4 ml-1" /> العودة
        </Button>
      </Card>
    );
  }

  const nexts = nextAdminTransitions(order.status);
  const addr = order.shipping_address;

  const doPrint = async () => {
    try { await generateOrderSlipPdf(order); }
    catch (e: any) { toast({ title: "تعذّر الطباعة", description: e?.message, variant: "destructive" }); }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <button onClick={() => nav("/admin/book-orders")} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-1">
            <ArrowRight className="h-3.5 w-3.5" /> العودة إلى الطلبات
          </button>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold font-mono">{order.order_number}</h1>
            <Badge status={order.status} />
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {new Date(order.created_at).toLocaleString("ar-EG", { dateStyle: "long", timeStyle: "short" })}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={doPrint}>
            <Printer className="h-4 w-4 ml-2" /> طباعة
          </Button>
          {nexts.length > 0 && (
            <Button onClick={() => setDialogOpen(true)}>تغيير الحالة</Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Items */}
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <BookOpen className="h-5 w-5 text-primary" />
              <h2 className="font-semibold">المنتجات</h2>
            </div>
            <div className="space-y-3">
              {order.items.map((it) => (
                <motion.div
                  key={it.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex gap-3 rounded-xl border border-border/60 p-3"
                >
                  <div className="h-16 w-12 rounded-md bg-muted overflow-hidden shrink-0">
                    {it.cover_image_url && (
                      <img src={it.cover_image_url} alt={it.title} className="h-full w-full object-cover" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{it.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {it.author || "—"} · {it.book_type === "physical" ? "مطبوع" : "رقمي"}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {formatEGP(it.unit_price_piastres)} × {it.quantity}
                    </div>
                  </div>
                  <div className="text-sm font-semibold shrink-0 self-center">
                    {formatEGP(it.unit_price_piastres * it.quantity)}
                  </div>
                </motion.div>
              ))}
            </div>

            <Separator className="my-4" />
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">إجمالي المنتجات</span>
                <span>{formatEGP(order.items_subtotal_piastres)}</span>
              </div>
              {order.has_physical_items && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">الشحن</span>
                  <span>{formatEGP(order.shipping_cost_piastres)}</span>
                </div>
              )}
              <div className="flex justify-between pt-2 border-t mt-2 text-base font-bold">
                <span>الإجمالي</span>
                <span>{formatEGP(order.total_piastres)}</span>
              </div>
            </div>
          </Card>

          {/* Timeline */}
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="h-5 w-5 text-primary" />
              <h2 className="font-semibold">سجل التغييرات</h2>
            </div>
            <ol className="relative border-r-2 border-border/60 pr-5 space-y-4">
              {order.history.map((h, i) => {
                const t = STATUS_TONE[h.to_status];
                return (
                  <motion.li
                    key={h.id}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="relative"
                  >
                    <span className={`absolute -right-[calc(1.25rem+7px)] top-1.5 h-3 w-3 rounded-full ring-4 ring-background ${t.dot}`} />
                    <div className="flex flex-wrap items-center gap-2">
                      {h.from_status && (
                        <>
                          <span className="text-xs text-muted-foreground">{STATUS_LABEL[h.from_status]}</span>
                          <ChevronLeft className="h-3 w-3 text-muted-foreground" />
                        </>
                      )}
                      <Badge status={h.to_status} />
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {new Date(h.created_at).toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" })}
                      {h.changed_by_name ? ` · بواسطة ${h.changed_by_name}` : " · النظام"}
                    </div>
                    {h.notes && (
                      <div className="mt-1.5 text-sm bg-muted/60 rounded-md p-2 border border-border/50">
                        {h.notes}
                      </div>
                    )}
                  </motion.li>
                );
              })}
            </ol>
          </Card>

          {order.refund_requests.length > 0 && (
            <Card className="p-5 border-violet-500/40">
              <h2 className="font-semibold mb-3">طلبات الاسترجاع</h2>
              <div className="space-y-2">
                {order.refund_requests.map((r) => (
                  <div key={r.id} className="rounded-md border border-border/60 p-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-xs text-muted-foreground">
                        {new Date(r.requested_at).toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" })}
                      </span>
                      <span className="text-xs font-semibold">
                        {r.status === "pending" ? "قيد المراجعة" : r.status === "approved" ? "مقبول" : "مرفوض"}
                      </span>
                    </div>
                    <p className="mt-1.5">{r.reason}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <User className="h-5 w-5 text-primary" />
              <h2 className="font-semibold">الطالب</h2>
            </div>
            <Link to={`/admin/students/${order.student.id}`} className="block group">
              <div className="font-medium group-hover:text-primary">{order.student.full_name || "—"}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{order.student.student_id_code || "بدون رقم"}</div>
            </Link>
            <Separator className="my-3" />
            <div className="space-y-1.5 text-sm">
              {order.student.phone && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="h-3.5 w-3.5" /> {order.student.phone}
                </div>
              )}
              {order.student.email && (
                <div className="text-xs text-muted-foreground truncate">{order.student.email}</div>
              )}
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <Package2 className="h-5 w-5 text-primary" />
              <h2 className="font-semibold">الدفع والشحن</h2>
            </div>
            <div className="text-sm space-y-1.5">
              <div className="flex justify-between">
                <span className="text-muted-foreground">طريقة الدفع</span>
                <span className="font-medium">{order.gateway_display_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">النوع</span>
                <span>{order.has_physical_items ? "مطبوع" : "رقمي"}</span>
              </div>
              {order.has_physical_items && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">منطقة الشحن</span>
                  <span>{order.shipping_zone_name || "—"}</span>
                </div>
              )}
            </div>
            {order.has_physical_items && addr && (
              <>
                <Separator className="my-3" />
                <div className="text-sm space-y-1">
                  <div className="flex items-center gap-1.5 text-primary text-xs font-semibold">
                    <MapPin className="h-3.5 w-3.5" /> عنوان التسليم
                  </div>
                  <div>{addr.full_name}</div>
                  <div className="text-muted-foreground">{addr.phone}</div>
                  <div>{addr.street}</div>
                  <div className="text-muted-foreground">{addr.city}</div>
                  {addr.notes && <div className="text-xs mt-1 italic">{addr.notes}</div>}
                </div>
              </>
            )}
          </Card>
        </div>
      </div>

      <StatusChangeDialog
        order={dialogOpen ? { id: order.id, number: order.order_number, current: order.status, gatewayKey: order.gateway_key } : null}
        onClose={() => setDialogOpen(false)}
        onChanged={() => {
          setDialogOpen(false);
          load();
        }}
      />
    </div>
  );
}
