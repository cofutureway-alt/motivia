import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart3,
  BookOpen,
  Package,
  Calendar as CalendarIcon,
  CheckCircle2,
  CreditCard,
  Download,
  FileText,
  Filter,
  Loader2,
  Printer,
  Receipt,
  Search,
  Ticket,
  TrendingUp,
  Users as UsersIcon,
  Wallet as WalletIcon,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { formatPiastres } from "@/lib/money";
import { cn } from "@/lib/utils";
import { generateInvoicePdf } from "@/lib/invoice-pdf";

// ==================================================================
// Types
// ==================================================================
interface PaymentRow {
  id: string;
  reference_number: string;
  user_id: string;
  course_id: string | null;
  bundle_id: string | null;
  book_order_id: string | null;
  purpose: "course_purchase" | "bundle_purchase" | "book_order" | "wallet_topup";
  amount_piastres: number;
  status: "success" | "failed";
  failure_reason: string | null;
  created_at: string;
  gateway_id: string;
  courses: { title: string | null } | null;
  bundles: { title: string | null } | null;
  book_orders:
    | { order_number: string | null; book_order_items: { count: number }[] | null }
    | null;
  profiles: {
    full_name: string | null;
    student_id: string | null;
    phone_number: string | null;
  } | null;
  gateway: { display_name: string | null } | null;
}

interface CourseOpt {
  id: string;
  title: string;
}

type RangePreset = "30d" | "3m" | "1y" | "custom";

const PURPOSE_LABEL: Record<PaymentRow["purpose"], string> = {
  course_purchase: "شراء دورة",
  bundle_purchase: "شراء باقة",
  book_order: "طلب كتب",
  wallet_topup: "شحن محفظة",
};

// ==================================================================
// Range utilities
// ==================================================================
function presetToRange(p: RangePreset, custom: { from?: Date; to?: Date }) {
  const now = new Date();
  const to = new Date(now);
  to.setHours(23, 59, 59, 999);
  if (p === "custom") {
    return {
      from: custom.from ?? subDays(now, 30),
      to: custom.to ?? to,
    };
  }
  const from = new Date(now);
  from.setHours(0, 0, 0, 0);
  if (p === "30d") from.setDate(from.getDate() - 30);
  else if (p === "3m") from.setMonth(from.getMonth() - 3);
  else if (p === "1y") from.setFullYear(from.getFullYear() - 1);
  return { from, to };
}
function subDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() - n);
  x.setHours(0, 0, 0, 0);
  return x;
}
function dayKey(d: Date | string) {
  const x = typeof d === "string" ? new Date(d) : d;
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ==================================================================
// Count-up hook (animation for numeric summary values)
// ==================================================================
function useCountUp(target: number, duration = 700) {
  const [value, setValue] = useState(0);
  const startRef = useRef<number | null>(null);
  const fromRef = useRef(0);
  useEffect(() => {
    startRef.current = null;
    fromRef.current = value;
    let raf = 0;
    const tick = (t: number) => {
      if (startRef.current === null) startRef.current = t;
      const elapsed = t - startRef.current;
      const p = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(fromRef.current + (target - fromRef.current) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);
  return value;
}

// ==================================================================
// Page
// ==================================================================
export default function AdminBilling() {
  // ---- Filter state ----
  const [preset, setPreset] = useState<RangePreset>("30d");
  const [customRange, setCustomRange] = useState<{ from?: Date; to?: Date }>({});
  const [statusFilter, setStatusFilter] = useState<"all" | "success" | "failed">(
    "all",
  );
  const [courseId, setCourseId] = useState<string>("");
  const [studentSearch, setStudentSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(studentSearch.trim()), 300);
    return () => clearTimeout(t);
  }, [studentSearch]);

  const range = useMemo(() => presetToRange(preset, customRange), [preset, customRange]);

  // ---- Data ----
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [courses, setCourses] = useState<CourseOpt[]>([]);
  const [totalStudentBalance, setTotalStudentBalance] = useState(0);
  const [totalDiscountSavings, setTotalDiscountSavings] = useState(0);
  const [fundingBreakdown, setFundingBreakdown] = useState({
    admin: 0,
    cards: 0,
  });
  const [topCardValues, setTopCardValues] = useState<
    Array<{ value_piastres: number; count: number }>
  >([]);

  const loadCourses = useCallback(async () => {
    const { data } = await supabase
      .from("courses")
      .select("id, title")
      .eq("is_paid", true)
      .order("title");
    setCourses((data ?? []) as CourseOpt[]);
  }, []);

  const loadAggregates = useCallback(async () => {
    // Total student balances (all wallets combined liability)
    const { data: wal } = await (supabase as any)
      .from("wallets")
      .select("balance_piastres");
    const bal = ((wal ?? []) as { balance_piastres: number }[]).reduce(
      (s, w) => s + (w.balance_piastres || 0),
      0,
    );
    setTotalStudentBalance(bal);

    // Funding source breakdown (all-time)
    const { data: wtx } = await (supabase as any)
      .from("wallet_transactions")
      .select("type, amount_piastres")
      .in("type", ["admin_charge", "bulk_charge", "card_redemption"]);
    let admin = 0;
    let cards = 0;
    for (const t of (wtx ?? []) as { type: string; amount_piastres: number }[]) {
      if (t.type === "card_redemption") cards += t.amount_piastres || 0;
      else admin += t.amount_piastres || 0;
    }
    setFundingBreakdown({ admin, cards });

    // Most-used card values
    const { data: cardsData } = await (supabase as any)
      .from("top_up_cards")
      .select("value_piastres")
      .eq("is_redeemed", true);
    const counts = new Map<number, number>();
    for (const c of (cardsData ?? []) as { value_piastres: number }[]) {
      counts.set(c.value_piastres, (counts.get(c.value_piastres) ?? 0) + 1);
    }
    const arr = Array.from(counts.entries())
      .map(([value_piastres, count]) => ({ value_piastres, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    setTopCardValues(arr);

    // Discount savings — sum from the discount_savings_summary view (course + bundle)
    const { data: sav } = await (supabase as any)
      .from("discount_savings_summary")
      .select("discount_amount_piastres");
    const totalSav = ((sav ?? []) as { discount_amount_piastres: number }[]).reduce(
      (s, r) => s + (r.discount_amount_piastres || 0),
      0,
    );
    setTotalDiscountSavings(totalSav);
  }, []);

  const loadPayments = useCallback(async () => {
    setLoading(true);
    let q = (supabase as any)
      .from("payment_transactions")
      .select(
        `id, reference_number, user_id, course_id, bundle_id, book_order_id, purpose,
         amount_piastres, status, failure_reason, created_at, gateway_id,
         courses:course_id (title),
         bundles:bundle_id (title),
         book_orders:book_order_id (order_number, book_order_items(count)),
         profiles:user_id (full_name, student_id, phone_number),
         gateway:gateway_id (display_name)`,
      )
      .gte("created_at", range.from.toISOString())
      .lte("created_at", range.to.toISOString())
      .neq("purpose", "wallet_topup")
      .order("created_at", { ascending: false })
      .limit(1000);

    if (statusFilter !== "all") q = q.eq("status", statusFilter);
    if (courseId) q = q.eq("course_id", courseId);

    const { data, error } = await q;
    if (error) {
      toast.error(error.message ?? "تعذّر تحميل المعاملات");
      setLoading(false);
      return;
    }
    let list = (data ?? []) as PaymentRow[];

    // Client-side student search (name / phone / student_id)
    if (debouncedSearch) {
      const s = debouncedSearch.toLowerCase();
      const digitOnly = /^[0-9]{1,6}$/.test(debouncedSearch)
        ? debouncedSearch.padStart(6, "0")
        : null;
      list = list.filter((r) => {
        const p = r.profiles;
        if (!p) return false;
        return (
          (p.full_name ?? "").toLowerCase().includes(s) ||
          (p.phone_number ?? "").toLowerCase().includes(s) ||
          (p.student_id ?? "").toLowerCase().includes(s) ||
          (digitOnly ? p.student_id === digitOnly : false)
        );
      });
    }

    setRows(list);
    setLoading(false);
  }, [range.from, range.to, statusFilter, courseId, debouncedSearch]);

  useEffect(() => {
    loadCourses();
    loadAggregates();
  }, [loadCourses, loadAggregates]);
  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  // ---- Derived stats for the current filter ----
  const successRows = useMemo(() => rows.filter((r) => r.status === "success"), [rows]);
  const failedRows = useMemo(() => rows.filter((r) => r.status === "failed"), [rows]);
  const totalRevenue = useMemo(
    () => successRows.reduce((s, r) => s + (r.amount_piastres || 0), 0),
    [successRows],
  );
  const averageOrder = useMemo(
    () => (successRows.length > 0 ? Math.round(totalRevenue / successRows.length) : 0),
    [totalRevenue, successRows],
  );

  // Daily series for chart
  const chartData = useMemo(() => {
    // fill every day in the range so the axis stays continuous
    const days: string[] = [];
    const cursor = new Date(range.from);
    cursor.setHours(0, 0, 0, 0);
    const end = new Date(range.to);
    end.setHours(0, 0, 0, 0);
    while (cursor <= end) {
      days.push(dayKey(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    const map = new Map<string, { count: number; revenue: number }>();
    for (const d of days) map.set(d, { count: 0, revenue: 0 });
    for (const r of successRows) {
      const k = dayKey(r.created_at);
      const cur = map.get(k);
      if (cur) {
        cur.count += 1;
        cur.revenue += r.amount_piastres || 0;
      }
    }
    return days.map((d) => ({
      day: d.slice(5), // MM-DD label
      count: map.get(d)!.count,
      revenue_egp: +(map.get(d)!.revenue / 100).toFixed(2),
    }));
  }, [successRows, range.from, range.to]);

  // Book order item count helper (embedded aggregate returns [{count: N}])
  const bookItemCount = (r: PaymentRow) =>
    r.book_orders?.book_order_items?.[0]?.count ?? 0;

  // Product label for the transactions table (per-purpose)
  const productLabel = (r: PaymentRow): string => {
    switch (r.purpose) {
      case "course_purchase":
        return r.courses?.title ?? "دورة محذوفة";
      case "bundle_purchase":
        return r.bundles?.title
          ? `باقة: ${r.bundles.title}`
          : "باقة محذوفة";
      case "book_order": {
        const n = bookItemCount(r);
        return `طلب كتب (${n} عناصر)${r.book_orders?.order_number ? ` — ${r.book_orders.order_number}` : ""}`;
      }
      case "wallet_topup":
        return "شحن محفظة";
      default:
        return "—";
    }
  };

  // Top-selling courses (course_purchase only) — sorted by successful revenue
  const topCourses = useMemo(() => {
    const map = new Map<
      string,
      { course_id: string; title: string; count: number; revenue: number }
    >();
    for (const r of successRows) {
      if (r.purpose !== "course_purchase" || !r.course_id) continue;
      const cur = map.get(r.course_id) ?? {
        course_id: r.course_id,
        title: r.courses?.title ?? "دورة محذوفة",
        count: 0,
        revenue: 0,
      };
      cur.count += 1;
      cur.revenue += r.amount_piastres || 0;
      map.set(r.course_id, cur);
    }
    return Array.from(map.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);
  }, [successRows]);

  // Top-selling bundles
  const topBundles = useMemo(() => {
    const map = new Map<
      string,
      { bundle_id: string; title: string; count: number; revenue: number }
    >();
    for (const r of successRows) {
      if (r.purpose !== "bundle_purchase" || !r.bundle_id) continue;
      const cur = map.get(r.bundle_id) ?? {
        bundle_id: r.bundle_id,
        title: r.bundles?.title ?? "باقة محذوفة",
        count: 0,
        revenue: 0,
      };
      cur.count += 1;
      cur.revenue += r.amount_piastres || 0;
      map.set(r.bundle_id, cur);
    }
    return Array.from(map.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);
  }, [successRows]);

  // Book-orders revenue breakdown — need per-book aggregation. Fetch book_order_items
  // for successful book_order rows in the current filter.
  const [topBooks, setTopBooks] = useState<
    Array<{ book_id: string; title: string; count: number; revenue: number }>
  >([]);
  const [booksTotalRevenue, setBooksTotalRevenue] = useState(0);
  const [bundlesTotalRevenue, setBundlesTotalRevenue] = useState(0);

  useEffect(() => {
    const bundleSum = successRows
      .filter((r) => r.purpose === "bundle_purchase")
      .reduce((s, r) => s + (r.amount_piastres || 0), 0);
    setBundlesTotalRevenue(bundleSum);

    const bookRows = successRows.filter(
      (r) => r.purpose === "book_order" && r.book_order_id,
    );
    const booksSum = bookRows.reduce((s, r) => s + (r.amount_piastres || 0), 0);
    setBooksTotalRevenue(booksSum);

    if (bookRows.length === 0) {
      setTopBooks([]);
      return;
    }
    const orderIds = bookRows.map((r) => r.book_order_id!) as string[];
    let cancelled = false;
    (async () => {
      const { data } = await (supabase as any)
        .from("book_order_items")
        .select("book_id, quantity, unit_price_piastres, books:book_id(title)")
        .in("order_id", orderIds);
      if (cancelled) return;
      const map = new Map<
        string,
        { book_id: string; title: string; count: number; revenue: number }
      >();
      for (const it of (data ?? []) as Array<{
        book_id: string;
        quantity: number;
        unit_price_piastres: number;
        books: { title: string | null } | null;
      }>) {
        const cur = map.get(it.book_id) ?? {
          book_id: it.book_id,
          title: it.books?.title ?? "كتاب محذوف",
          count: 0,
          revenue: 0,
        };
        cur.count += it.quantity || 0;
        cur.revenue += (it.unit_price_piastres || 0) * (it.quantity || 0);
        map.set(it.book_id, cur);
      }
      setTopBooks(
        Array.from(map.values())
          .sort((a, b) => b.revenue - a.revenue)
          .slice(0, 10),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [successRows]);

  // Count-up values
  const revenueCounter = useCountUp(totalRevenue);
  const balanceCounter = useCountUp(totalStudentBalance);
  const totalCounter = useCountUp(rows.length);
  const successCounter = useCountUp(successRows.length);
  const failedCounter = useCountUp(failedRows.length);
  const avgCounter = useCountUp(averageOrder);

  // ---- CSV Export ----
  const exportCsv = () => {
    const header = [
      "reference_number",
      "purpose",
      "student_name",
      "student_id",
      "student_phone",
      "product",
      "amount_egp",
      "status",
      "failure_reason",
      "date",
    ];
    const lines = rows.map((r) =>
      [
        r.reference_number,
        PURPOSE_LABEL[r.purpose] ?? r.purpose,
        r.profiles?.full_name ?? "",
        r.profiles?.student_id ?? "",
        r.profiles?.phone_number ?? "",
        productLabel(r),
        (r.amount_piastres / 100).toFixed(2),
        r.status,
        r.failure_reason ?? "",
        r.created_at,
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const csv = "\uFEFF" + [header.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `billing-${dayKey(range.from)}-to-${dayKey(range.to)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`تم تصدير ${rows.length} معاملة`);
  };

  const [invoicingId, setInvoicingId] = useState<string | null>(null);
  const printInvoice = async (r: PaymentRow) => {
    try {
      setInvoicingId(r.id);
      await generateInvoicePdf({
        referenceNumber: r.reference_number,
        studentName: r.profiles?.full_name ?? "—",
        studentIdCode: r.profiles?.student_id,
        studentPhone: r.profiles?.phone_number,
        courseTitle: productLabel(r),
        amountPiastres: r.amount_piastres,
        status: r.status,
        gatewayName: r.gateway?.display_name,
        createdAt: r.created_at,
      });
      toast.success("تم تجهيز الفاتورة");
    } catch (e: any) {
      toast.error(e?.message ?? "تعذّر توليد الفاتورة");
    } finally {
      setInvoicingId(null);
    }
  };

  // ==================================================================
  // Render
  // ==================================================================
  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4"
      >
        <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <Receipt className="w-6 h-6" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">الفوترة والمدفوعات</h1>
          <p className="text-sm text-muted-foreground">
            تقارير الإيرادات، المعاملات، والفواتير المطبوعة.
          </p>
        </div>
        <Button variant="outline" onClick={exportCsv} disabled={loading || rows.length === 0}>
          <Download className="w-4 h-4 ml-2" />
          تصدير CSV
        </Button>
      </motion.div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <SummaryCard
          icon={<TrendingUp className="w-5 h-5" />}
          label="إجمالي الأرباح (نطاق الفلتر)"
          value={formatPiastres(revenueCounter)}
          tone="emerald"
        />
        <SummaryCard
          icon={<WalletIcon className="w-5 h-5" />}
          label="إجمالي أرصدة الطلبة (الحالي)"
          value={formatPiastres(balanceCounter)}
          hint="التزام قائم — أموال محصّلة لم تُستخدم بعد"
          tone="sky"
        />
        <SummaryCard
          icon={<Receipt className="w-5 h-5" />}
          label="إجمالي المدفوعات"
          value={String(totalCounter)}
          sub={
            <div className="flex gap-3 text-xs mt-1">
              <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="w-3 h-3" /> ناجحة: {successCounter}
              </span>
              <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400">
                <XCircle className="w-3 h-3" /> فاشلة: {failedCounter}
              </span>
            </div>
          }
          tone="primary"
        />
        <SummaryCard
          icon={<BarChart3 className="w-5 h-5" />}
          label="متوسط قيمة الطلب"
          value={formatPiastres(avgCounter)}
          hint="على المعاملات الناجحة داخل الفلتر"
          tone="violet"
        />
        <SummaryCard
          icon={<TrendingUp className="w-5 h-5" />}
          label="إجمالي وفورات الخصومات"
          value={formatPiastres(totalDiscountSavings)}
          hint="مجموع الفرق بين السعر الأصلي والمدفوع (دورات + باقات)"
          tone="amber"
        />
      </div>

      {/* Filters */}
      <section className="rounded-2xl border border-border bg-card p-4 sm:p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <h2 className="font-bold">التصفية</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Date range preset */}
          <div className="space-y-1.5">
            <Label className="text-xs">النطاق الزمني</Label>
            <Select value={preset} onValueChange={(v) => setPreset(v as RangePreset)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30d">آخر 30 يومًا</SelectItem>
                <SelectItem value="3m">آخر 3 شهور</SelectItem>
                <SelectItem value="1y">آخر سنة</SelectItem>
                <SelectItem value="custom">نطاق مخصص</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {preset === "custom" && (
            <div className="space-y-1.5 md:col-span-2">
              <Label className="text-xs">نطاق مخصص</Label>
              <div className="flex gap-2">
                <DateField
                  label="من"
                  value={customRange.from}
                  onChange={(d) => setCustomRange((r) => ({ ...r, from: d }))}
                />
                <DateField
                  label="إلى"
                  value={customRange.to}
                  onChange={(d) => setCustomRange((r) => ({ ...r, to: d }))}
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">الحالة</Label>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                <SelectItem value="success">ناجحة فقط</SelectItem>
                <SelectItem value="failed">فاشلة فقط</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">الدورة</Label>
            <Select
              value={courseId || "all"}
              onValueChange={(v) => setCourseId(v === "all" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الدورات</SelectItem>
                {courses.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5 md:col-span-2 lg:col-span-full">
            <Label className="text-xs">بحث عن طالب (اسم / هاتف / رقم طالب)</Label>
            <div className="relative">
              <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pr-9"
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                placeholder="اكتب للبحث..."
              />
              {studentSearch && (
                <button
                  onClick={() => setStudentSearch("")}
                  className="absolute left-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-accent"
                  aria-label="مسح البحث"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Sales trend chart */}
      <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-4 h-4 text-primary" />
          <h2 className="font-bold">اتجاه المبيعات</h2>
          <span className="text-xs text-muted-foreground mr-auto">
            {rangeLabel(range)}
          </span>
        </div>
        <motion.div
          key={`chart-${preset}-${dayKey(range.from)}-${dayKey(range.to)}`}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="h-[280px]"
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="day"
                stroke="hsl(var(--muted-foreground))"
                fontSize={11}
                tickMargin={4}
              />
              <YAxis
                yAxisId="revenue"
                stroke="hsl(var(--primary))"
                fontSize={11}
                tickFormatter={(v) => `${v} ج`}
                width={55}
              />
              <YAxis
                yAxisId="count"
                orientation="right"
                stroke="hsl(var(--muted-foreground))"
                fontSize={11}
                width={30}
              />
              <RTooltip
                contentStyle={{
                  background: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelFormatter={(l) => `يوم ${l}`}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line
                yAxisId="revenue"
                type="monotone"
                dataKey="revenue_egp"
                name="الإيرادات (ج.م)"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={false}
                animationDuration={800}
              />
              <Line
                yAxisId="count"
                type="monotone"
                dataKey="count"
                name="عدد المعاملات"
                stroke="#10b981"
                strokeWidth={2}
                dot={false}
                animationDuration={800}
              />
            </LineChart>
          </ResponsiveContainer>
        </motion.div>
      </section>

      {/* Two-column: funding source + card values */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <FundingSourceSection breakdown={fundingBreakdown} />
        <TopCardValuesSection rows={topCardValues} />
      </div>

      {/* Top selling courses */}
      <TopCoursesSection rows={topCourses} />

      {/* Books & Bundles revenue breakdowns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TopProductsSection
          title="أعلى الكتب مبيعًا"
          totalLabel="إجمالي إيرادات الكتب"
          totalRevenue={booksTotalRevenue}
          rows={topBooks.map((b) => ({
            key: b.book_id,
            title: b.title,
            count: b.count,
            revenue: b.revenue,
            countLabel: "نسخ مباعة",
          }))}
          icon={<BookOpen className="w-4 h-4 text-primary" />}
          emptyText="لا توجد مبيعات كتب في هذا النطاق."
        />
        <TopProductsSection
          title="أعلى الباقات مبيعًا"
          totalLabel="إجمالي إيرادات الباقات"
          totalRevenue={bundlesTotalRevenue}
          rows={topBundles.map((b) => ({
            key: b.bundle_id,
            title: b.title,
            count: b.count,
            revenue: b.revenue,
            countLabel: "عدد المبيعات",
          }))}
          icon={<Package className="w-4 h-4 text-primary" />}
          emptyText="لا توجد مبيعات باقات في هذا النطاق."
        />
      </div>

      {/* Transactions table */}
      <TransactionsTable
        rows={rows}
        loading={loading}
        onPrintInvoice={printInvoice}
        productLabel={productLabel}
        invoicingId={invoicingId}
      />
    </div>
  );
}

// ==================================================================
// Sub-components
// ==================================================================
function SummaryCard({
  icon,
  label,
  value,
  hint,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  sub?: React.ReactNode;
  tone: "primary" | "emerald" | "sky" | "violet" | "amber";
}) {
  const toneClasses = {
    primary: "bg-primary/10 text-primary",
    emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    sky: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
    violet: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  }[tone];
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-border bg-card p-4"
    >
      <div className="flex items-center gap-2 mb-2">
        <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center", toneClasses)}>
          {icon}
        </div>
        <div className="text-xs font-semibold text-muted-foreground">{label}</div>
      </div>
      <div className="text-2xl font-bold tracking-tight">{value}</div>
      {sub}
      {hint && <div className="text-[11px] text-muted-foreground mt-1">{hint}</div>}
    </motion.div>
  );
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value?: Date;
  onChange: (d: Date | undefined) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "flex-1 justify-start text-xs font-normal",
            !value && "text-muted-foreground",
          )}
        >
          <CalendarIcon className="w-3.5 h-3.5 ml-2" />
          {value ? value.toLocaleDateString("ar-EG") : label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value}
          onSelect={onChange}
          initialFocus
          className="p-3 pointer-events-auto"
        />
      </PopoverContent>
    </Popover>
  );
}

function rangeLabel({ from, to }: { from: Date; to: Date }) {
  return `${from.toLocaleDateString("ar-EG")} — ${to.toLocaleDateString("ar-EG")}`;
}

function FundingSourceSection({ breakdown }: { breakdown: { admin: number; cards: number } }) {
  const total = breakdown.admin + breakdown.cards;
  const data =
    total === 0
      ? []
      : [
          { name: "شحن إداري", value: breakdown.admin, fill: "hsl(var(--primary))" },
          { name: "كروت شحن", value: breakdown.cards, fill: "#10b981" },
        ];
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-border bg-card p-4 sm:p-5"
    >
      <div className="flex items-center gap-2 mb-4">
        <CreditCard className="w-4 h-4 text-primary" />
        <h2 className="font-bold">مصدر الشحن (الإجمالي)</h2>
      </div>
      {total === 0 ? (
        <div className="text-sm text-muted-foreground py-8 text-center">
          لا توجد معاملات شحن بعد.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-[1fr,180px] gap-4 items-center">
          <div className="space-y-3">
            <StackedBar
              admin={breakdown.admin}
              cards={breakdown.cards}
              total={total}
            />
            <div className="grid grid-cols-2 gap-3">
              <BreakdownStat
                label="شحن إداري"
                color="hsl(var(--primary))"
                amount={breakdown.admin}
                pct={total ? (breakdown.admin / total) * 100 : 0}
              />
              <BreakdownStat
                label="كروت شحن"
                color="#10b981"
                amount={breakdown.cards}
                pct={total ? (breakdown.cards / total) * 100 : 0}
              />
            </div>
          </div>
          <div className="h-[160px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  innerRadius={40}
                  outerRadius={70}
                  paddingAngle={2}
                >
                  {data.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Pie>
                <RTooltip formatter={(v: any) => formatPiastres(v as number)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </motion.section>
  );
}

function StackedBar({
  admin,
  cards,
  total,
}: {
  admin: number;
  cards: number;
  total: number;
}) {
  const aPct = total ? (admin / total) * 100 : 0;
  const cPct = total ? (cards / total) * 100 : 0;
  return (
    <div className="h-3 w-full rounded-full overflow-hidden bg-muted flex">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${aPct}%` }}
        transition={{ duration: 0.7, ease: "easeOut" }}
        className="h-full bg-primary"
      />
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${cPct}%` }}
        transition={{ duration: 0.7, ease: "easeOut", delay: 0.1 }}
        className="h-full bg-emerald-500"
      />
    </div>
  );
}

function BreakdownStat({
  label,
  color,
  amount,
  pct,
}: {
  label: string;
  color: string;
  amount: number;
  pct: number;
}) {
  return (
    <div className="rounded-lg bg-accent/40 p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span
          className="inline-block w-2.5 h-2.5 rounded-full"
          style={{ background: color }}
        />
        {label}
      </div>
      <div className="font-bold mt-1">{formatPiastres(amount)}</div>
      <div className="text-[11px] text-muted-foreground">{pct.toFixed(1)}%</div>
    </div>
  );
}

function TopCardValuesSection({
  rows,
}: {
  rows: Array<{ value_piastres: number; count: number }>;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-border bg-card p-4 sm:p-5"
    >
      <div className="flex items-center gap-2 mb-4">
        <Ticket className="w-4 h-4 text-primary" />
        <h2 className="font-bold">أكثر فئات الكروت استخدامًا</h2>
      </div>
      {rows.length === 0 ? (
        <div className="text-sm text-muted-foreground py-8 text-center">
          لا توجد كروت مستخدمة بعد.
        </div>
      ) : (
        <div className="h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
              <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <YAxis
                type="category"
                dataKey="value_piastres"
                stroke="hsl(var(--muted-foreground))"
                fontSize={11}
                tickFormatter={(v) => formatPiastres(v)}
                width={90}
              />
              <RTooltip
                contentStyle={{
                  background: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(v: any) => [`${v} مرة`, "عدد الاستخدامات"]}
                labelFormatter={(v: any) => `فئة ${formatPiastres(v as number)}`}
              />
              <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </motion.section>
  );
}

function TopCoursesSection({
  rows,
}: {
  rows: Array<{ course_id: string; title: string; count: number; revenue: number }>;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-border bg-card overflow-hidden"
    >
      <div className="p-4 sm:p-5 border-b border-border flex items-center gap-2">
        <Trophy className="w-4 h-4 text-primary" />
        <h2 className="font-bold">أعلى الدورات مبيعًا (حسب الإيرادات)</h2>
      </div>
      {rows.length === 0 ? (
        <div className="p-8 text-sm text-muted-foreground text-center">
          لا توجد مبيعات ناجحة في هذا النطاق.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-accent/40 text-xs">
              <tr>
                <th className="text-right p-3 font-semibold w-10">#</th>
                <th className="text-right p-3 font-semibold">الدورة</th>
                <th className="text-right p-3 font-semibold">عدد المبيعات</th>
                <th className="text-right p-3 font-semibold">إجمالي الإيرادات</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <motion.tr
                  key={r.course_id}
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="border-t border-border"
                >
                  <td className="p-3 text-muted-foreground">{i + 1}</td>
                  <td className="p-3 font-medium">{r.title}</td>
                  <td className="p-3">{r.count}</td>
                  <td className="p-3 font-bold text-emerald-600 dark:text-emerald-400">
                    {formatPiastres(r.revenue)}
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </motion.section>
  );
}

function Trophy(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  );
}

function TransactionsTable({
  rows,
  loading,
  onPrintInvoice,
  productLabel,
  invoicingId,
}: {
  rows: PaymentRow[];
  loading: boolean;
  onPrintInvoice: (r: PaymentRow) => void;
  productLabel: (r: PaymentRow) => string;
  invoicingId: string | null;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="p-4 sm:p-5 border-b border-border flex flex-col sm:flex-row sm:items-center gap-2">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-primary" />
          <h2 className="font-bold">المعاملات</h2>
        </div>
        <span className="text-xs text-muted-foreground sm:mr-auto">
          {loading ? "جارٍ التحميل..." : `${rows.length} معاملة`}
        </span>
      </div>

      {loading ? (
        <div className="p-4 space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">
          لا توجد معاملات مطابقة للفلاتر الحالية.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead className="bg-accent/40 text-xs">
              <tr>
                <th className="text-right p-3 font-semibold">الطالب</th>
                <th className="text-right p-3 font-semibold">المنتج / نوع العملية</th>
                <th className="text-right p-3 font-semibold">المبلغ</th>
                <th className="text-right p-3 font-semibold">الحالة</th>
                <th className="text-right p-3 font-semibold">المرجع</th>
                <th className="text-right p-3 font-semibold">التاريخ</th>
                <th className="text-right p-3 font-semibold">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {rows.map((r, i) => (
                  <motion.tr
                    key={r.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ delay: Math.min(i * 0.015, 0.4) }}
                    className="border-t border-border hover:bg-accent/30"
                  >
                    <td className="p-3">
                      <div className="font-medium">
                        {r.profiles?.full_name ?? "—"}
                      </div>
                      <div className="text-xs text-muted-foreground font-mono" dir="ltr">
                        {r.profiles?.student_id ?? ""}
                      </div>
                    </td>
                    <td className="p-3">
                      <div>{productLabel(r)}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {PURPOSE_LABEL[r.purpose] ?? r.purpose}
                      </div>
                    </td>
                    <td className="p-3 font-bold">{formatPiastres(r.amount_piastres)}</td>
                    <td className="p-3">
                      {r.status === "success" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="w-3 h-3" /> ناجحة
                        </span>
                      ) : (
                        <div className="space-y-1">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400">
                            <XCircle className="w-3 h-3" /> فاشلة
                          </span>
                          {r.failure_reason && (
                            <div className="text-[11px] text-muted-foreground max-w-[200px]">
                              {r.failure_reason}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="p-3 font-mono text-xs" dir="ltr">
                      {r.reference_number}
                    </td>
                    <td className="p-3 text-xs" dir="ltr">
                      {new Date(r.created_at).toLocaleString("ar-EG", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </td>
                    <td className="p-3">
                      {r.status === "success" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onPrintInvoice(r)}
                          disabled={invoicingId === r.id}
                        >
                          {invoicingId === r.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Printer className="w-3.5 h-3.5 ml-1" />
                          )}
                          طباعة الفاتورة
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function TopProductsSection({
  title,
  totalLabel,
  totalRevenue,
  rows,
  icon,
  emptyText,
}: {
  title: string;
  totalLabel: string;
  totalRevenue: number;
  rows: Array<{
    key: string;
    title: string;
    count: number;
    revenue: number;
    countLabel: string;
  }>;
  icon: React.ReactNode;
  emptyText: string;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-border bg-card overflow-hidden"
    >
      <div className="p-4 sm:p-5 border-b border-border flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="font-bold">{title}</h2>
        </div>
        <div className="text-xs text-muted-foreground">
          {totalLabel}:{" "}
          <span className="font-bold text-emerald-600 dark:text-emerald-400">
            {formatPiastres(totalRevenue)}
          </span>
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="p-8 text-sm text-muted-foreground text-center">
          {emptyText}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-accent/40 text-xs">
              <tr>
                <th className="text-right p-3 font-semibold w-10">#</th>
                <th className="text-right p-3 font-semibold">العنوان</th>
                <th className="text-right p-3 font-semibold">
                  {rows[0]?.countLabel ?? "العدد"}
                </th>
                <th className="text-right p-3 font-semibold">الإيرادات</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <motion.tr
                  key={r.key}
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="border-t border-border"
                >
                  <td className="p-3 text-muted-foreground">{i + 1}</td>
                  <td className="p-3 font-medium">{r.title}</td>
                  <td className="p-3">{r.count}</td>
                  <td className="p-3 font-bold text-emerald-600 dark:text-emerald-400">
                    {formatPiastres(r.revenue)}
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </motion.section>
  );
}
