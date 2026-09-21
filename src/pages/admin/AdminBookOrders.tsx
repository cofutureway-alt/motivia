import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowUpRight,
  CalendarRange,
  ClipboardList,
  Filter,
  Loader2,
  Package2,
  Printer,
  RefreshCw,
  Search,
  Truck,
  X,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AdminBookOrderRow,
  AdminBookOrdersResult,
  BookOrderStatus,
  STATUS_LABEL,
  STATUS_TONE,
  adminListBookOrders,
  changeBookOrderStatus,
  formatEGP,
  getBookOrderFull,
  nextAdminTransitions,
} from "@/lib/book-orders-management-api";
import { generateOrderSlipPdf } from "@/lib/book-order-slip-pdf";
import StatusChangeDialog from "@/components/admin/BookOrderStatusDialog";

interface GatewayOpt { id: string; gateway_key: string; display_name: string }
interface ZoneOpt { id: string; name: string }

const STATUS_CARDS: Array<{ key: BookOrderStatus; label: string; icon: any }> = [
  { key: "pending_payment", label: "بانتظار الدفع", icon: ClipboardList },
  { key: "confirmed", label: "مؤكد", icon: Package2 },
  { key: "shipped", label: "قيد الشحن", icon: Truck },
  { key: "delivered", label: "تم التسليم", icon: Package2 },
  { key: "cancelled", label: "ملغي", icon: X },
  { key: "refund_requested", label: "طلب استرجاع", icon: RefreshCw },
];

function StatusBadge({ status }: { status: BookOrderStatus }) {
  const t = STATUS_TONE[status];
  return (
    <motion.span
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2 }}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${t.bg} ${t.text} ${t.ring}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${t.dot}`} />
      {STATUS_LABEL[status]}
    </motion.span>
  );
}

function CountCard({
  label,
  value,
  active,
  onClick,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  active: boolean;
  onClick: () => void;
  icon: any;
  tone: BookOrderStatus;
}) {
  const t = STATUS_TONE[tone];
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const from = display;
    const to = value;
    const dur = 500;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / dur);
      setDisplay(Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative overflow-hidden rounded-2xl border p-4 text-right transition-all ${
        active
          ? `${t.bg} ${t.ring} ring-2 border-transparent shadow-lg`
          : "border-border/60 bg-card hover:border-border hover:shadow-md"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className={`h-9 w-9 rounded-lg ${t.bg} flex items-center justify-center`}>
          <Icon className={`h-4 w-4 ${t.text}`} />
        </div>
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <div className="mt-3 text-3xl font-bold tabular-nums">{display}</div>
    </button>
  );
}

export default function AdminBookOrders() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AdminBookOrdersResult>({
    rows: [],
    counts: { total: 0 } as any,
  });
  const [statusFilter, setStatusFilter] = useState<BookOrderStatus | "all">("all");
  const [gatewayFilter, setGatewayFilter] = useState<string>("all");
  const [zoneFilter, setZoneFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [gateways, setGateways] = useState<GatewayOpt[]>([]);
  const [zones, setZones] = useState<ZoneOpt[]>([]);

  const [dialogOrder, setDialogOrder] = useState<{ id: string; number: string; current: BookOrderStatus; gatewayKey?: string | null } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await adminListBookOrders({
        status: statusFilter === "all" ? null : statusFilter,
        gatewayKey: gatewayFilter === "all" ? null : gatewayFilter,
        shippingZoneId: zoneFilter === "all" ? null : zoneFilter,
        from: from ? new Date(from).toISOString() : null,
        to: to ? new Date(to + "T23:59:59").toISOString() : null,
        search: search.trim() || null,
      });
      setData(res);
    } catch (e: any) {
      toast({ title: "تعذّر تحميل الطلبات", description: e?.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    (async () => {
      const [{ data: gw }, { data: zn }] = await Promise.all([
        (supabase as any).from("payment_gateways").select("id, gateway_key, display_name"),
        (supabase as any).from("shipping_zones").select("id, name").order("name"),
      ]);
      setGateways(gw ?? []);
      setZones(zn ?? []);
    })();
  }, []);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, gatewayFilter, zoneFilter, from, to]);

  useEffect(() => {
    const t = setTimeout(load, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const handleTransition = async (order: AdminBookOrderRow) => {
    setDialogOrder({ id: order.id, number: order.order_number, current: order.status, gatewayKey: order.gateway_key });
  };

  const handlePrint = async (orderId: string) => {
    const t = toast({ title: "جاري تجهيز البيان..." });
    try {
      const full = await getBookOrderFull(orderId);
      if (!full) throw new Error("لم يتم العثور على الطلب");
      await generateOrderSlipPdf(full);
      t.dismiss?.();
    } catch (e: any) {
      t.dismiss?.();
      toast({ title: "تعذّر توليد البيان", description: e?.message, variant: "destructive" });
    }
  };

  const clearFilters = () => {
    setStatusFilter("all");
    setGatewayFilter("all");
    setZoneFilter("all");
    setSearch("");
    setFrom("");
    setTo("");
  };

  const hasFilter = statusFilter !== "all" || gatewayFilter !== "all" || zoneFilter !== "all" || !!search || !!from || !!to;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Package2 className="h-6 w-6 text-primary" />
            طلبات الكتب
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            إدارة كاملة لحالة الطلبات، البحث والطباعة.
          </p>
        </div>
        <Button variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ml-2 ${loading ? "animate-spin" : ""}`} />
          تحديث
        </Button>
      </div>

      {/* Status count cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {STATUS_CARDS.map((c) => (
          <CountCard
            key={c.key}
            label={c.label}
            value={Number(data.counts?.[c.key] ?? 0)}
            active={statusFilter === c.key}
            onClick={() => setStatusFilter(statusFilter === c.key ? "all" : c.key)}
            icon={c.icon}
            tone={c.key}
          />
        ))}
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3">
          <div className="lg:col-span-2 relative">
            <Search className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="رقم الطلب أو اسم الطالب أو الهاتف"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pr-10"
            />
          </div>
          <Select value={gatewayFilter} onValueChange={setGatewayFilter}>
            <SelectTrigger><SelectValue placeholder="طريقة الدفع" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل طرق الدفع</SelectItem>
              {gateways.map((g) => (
                <SelectItem key={g.id} value={g.gateway_key}>{g.display_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={zoneFilter} onValueChange={setZoneFilter}>
            <SelectTrigger><SelectValue placeholder="منطقة الشحن" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل المناطق</SelectItem>
              {zones.map((z) => (
                <SelectItem key={z.id} value={z.id}>{z.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative">
            <CalendarRange className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="pr-10" placeholder="من" />
          </div>
          <div className="relative">
            <CalendarRange className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="pr-10" placeholder="إلى" />
          </div>
        </div>
        {hasFilter && (
          <div className="mt-3 flex items-center justify-between text-sm">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <Filter className="h-3.5 w-3.5" />
              فلاتر مطبقة
            </span>
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="h-3.5 w-3.5 ml-1" /> مسح الكل
            </Button>
          </div>
        )}
      </Card>

      {/* Table */}
      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-12 flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin ml-2" /> جاري التحميل...
          </div>
        ) : data.rows.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <Package2 className="h-10 w-10 mx-auto opacity-40" />
            <p className="mt-3">لا توجد طلبات مطابقة.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">رقم الطلب</TableHead>
                  <TableHead className="text-right">الطالب</TableHead>
                  <TableHead className="text-right hidden md:table-cell">التاريخ</TableHead>
                  <TableHead className="text-right hidden lg:table-cell">الشحن</TableHead>
                  <TableHead className="text-right hidden lg:table-cell">الدفع</TableHead>
                  <TableHead className="text-right">الإجمالي</TableHead>
                  <TableHead className="text-right">الحالة</TableHead>
                  <TableHead className="text-right">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <AnimatePresence initial={false}>
                  {data.rows.map((o, i) => {
                    const nexts = nextAdminTransitions(o.status);
                    return (
                      <motion.tr
                        key={o.id}
                        layout
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2, delay: Math.min(i * 0.015, 0.15) }}
                        className="border-b hover:bg-accent/40"
                      >
                        <TableCell className="font-mono text-sm">
                          <Link to={`/admin/book-orders/${o.id}`} className="text-primary hover:underline">
                            {o.order_number}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm font-medium">{o.student_name || "—"}</div>
                          <div className="text-xs text-muted-foreground">{o.student_phone || o.student_id_code || ""}</div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                          {new Date(o.created_at).toLocaleDateString("ar-EG", { dateStyle: "medium" })}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-sm">
                          {o.has_physical_items ? (
                            <span className="inline-flex items-center gap-1">
                              <Truck className="h-3.5 w-3.5 text-muted-foreground" />
                              {o.shipping_zone_name || "—"}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">رقمي</span>
                          )}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-sm">{o.gateway_display_name}</TableCell>
                        <TableCell className="font-semibold">{formatEGP(o.total_piastres)}</TableCell>
                        <TableCell><StatusBadge status={o.status} /></TableCell>
                        <TableCell>
                          <TooltipProvider>
                            <div className="flex items-center gap-1">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button asChild variant="ghost" size="icon">
                                    <Link to={`/admin/book-orders/${o.id}`}><ArrowUpRight className="h-4 w-4" /></Link>
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>عرض التفاصيل</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" onClick={() => handlePrint(o.id)}>
                                    <Printer className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>طباعة</TooltipContent>
                              </Tooltip>
                              {nexts.length > 0 && (
                                <Button size="sm" variant="outline" onClick={() => handleTransition(o)}>
                                  تغيير الحالة
                                </Button>
                              )}
                            </div>
                          </TooltipProvider>
                        </TableCell>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <StatusChangeDialog
        order={dialogOrder}
        onClose={() => setDialogOrder(null)}
        onChanged={() => {
          setDialogOrder(null);
          load();
        }}
      />
    </div>
  );
}
