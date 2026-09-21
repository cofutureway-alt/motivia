import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ShieldCheck,
  Coins,
  ShoppingCart,
  CheckCircle2,
  Info,
  ExternalLink,
  X,
  Sparkles,
  ArrowLeft,
  Receipt,
  BellRing,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { formatPiastres } from "@/lib/money";

const SALES_LIMIT_EGP = 20000;
const SALES_LIMIT_PIASTRES = SALES_LIMIT_EGP * 100;
const PURCHASES_LIMIT_COUNT = 100;

interface SalesMetrics {
  totalSalesPiastres: number;
  totalSalesEgp: number;
  successfulPurchasesCount: number;
  loading: boolean;
}

export const usePlatformDueMetrics = () => {
  const [metrics, setMetrics] = useState<SalesMetrics>({
    totalSalesPiastres: 0,
    totalSalesEgp: 0,
    successfulPurchasesCount: 0,
    loading: true,
  });

  useEffect(() => {
    let isCancelled = false;

    const fetchMetrics = async () => {
      try {
        const { data, error } = await (supabase as any)
          .from("payment_transactions")
          .select("amount_piastres, status")
          .eq("status", "success");

        if (error) throw error;

        const transactions = (data || []) as { amount_piastres: number }[];
        const count = transactions.length;
        const totalPiastres = transactions.reduce(
          (sum, t) => sum + (Number(t.amount_piastres) || 0),
          0
        );

        if (!isCancelled) {
          setMetrics({
            totalSalesPiastres: totalPiastres,
            totalSalesEgp: Math.round(totalPiastres / 100),
            successfulPurchasesCount: count,
            loading: false,
          });
        }
      } catch (err) {
        console.error("Error fetching platform metrics:", err);
        if (!isCancelled) {
          setMetrics((prev) => ({ ...prev, loading: false }));
        }
      }
    };

    fetchMetrics();

    return () => {
      isCancelled = true;
    };
  }, []);

  return metrics;
};

interface AdminDueAlertModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const AdminDueAlertModal = ({ open, onOpenChange }: AdminDueAlertModalProps) => {
  const navigate = useNavigate();
  const { totalSalesEgp, totalSalesPiastres, successfulPurchasesCount, loading } =
    usePlatformDueMetrics();

  const salesPercent = Math.min(100, Math.round((totalSalesEgp / SALES_LIMIT_EGP) * 100));
  const purchasesPercent = Math.min(
    100,
    Math.round((successfulPurchasesCount / PURCHASES_LIMIT_COUNT) * 100)
  );

  const remainingSalesEgp = Math.max(0, SALES_LIMIT_EGP - totalSalesEgp);
  const remainingPurchases = Math.max(0, PURCHASES_LIMIT_COUNT - successfulPurchasesCount);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden border-amber-500/40 bg-gradient-to-b from-card via-card to-background shadow-2xl sm:rounded-2xl" dir="rtl">
        {/* Glow & Decorative Header Accent */}
        <div className="relative bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 p-6 text-white overflow-hidden">
          <div className="absolute -right-8 -bottom-8 w-40 h-40 bg-white/10 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute left-10 top-0 w-32 h-32 bg-black/10 rounded-full blur-xl pointer-events-none" />

          <div className="relative z-10 flex items-start gap-4">
            <div className="p-3 bg-white/20 backdrop-blur-md rounded-2xl border border-white/30 text-white shadow-lg shrink-0 animate-pulse">
              <AlertTriangle className="w-8 h-8 text-amber-100" />
            </div>

            <div className="space-y-1 text-right flex-1">
              <div className="flex items-center gap-2">
                <Badge className="bg-white/25 hover:bg-white/30 text-white border-white/40 text-xs font-semibold px-2.5 py-0.5 rounded-full backdrop-blur-sm">
                  إشعار إداري هام
                </Badge>
                <Badge className="bg-amber-950/40 text-amber-200 border-amber-400/30 text-xs font-medium px-2 py-0.5 rounded-full">
                  تنبيه التوقف الجزئي
                </Badge>
              </div>
              <DialogTitle className="text-xl sm:text-2xl font-bold tracking-tight text-white leading-tight">
                تنبيه بخصوص شروط استمرار خدمات المنصة
              </DialogTitle>
              <DialogDescription className="text-amber-100/90 text-sm leading-relaxed">
                يرجى الاطلاع على شروط التسوية وسداد المستحقات المتبقية لضمان استمرارية الخدمات.
              </DialogDescription>
            </div>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {/* Main Statement Box */}
          <div className="p-4 rounded-xl bg-amber-500/10 border-2 border-amber-500/30 text-foreground space-y-2 relative overflow-hidden">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-sm sm:text-base font-semibold leading-relaxed text-amber-950 dark:text-amber-200">
                المنصة ستتوقف جزئياً عند تحقيق أحد الشرطين: مبيعات بإجمالي{" "}
                <span className="font-extrabold text-amber-600 dark:text-amber-400 underline decoration-amber-500 decoration-2 underline-offset-4">
                  20 ألف جنية
                </span>{" "}
                أو{" "}
                <span className="font-extrabold text-amber-600 dark:text-amber-400 underline decoration-amber-500 decoration-2 underline-offset-4">
                  100 عملية شراء
                </span>{" "}
                حتى يتم سداد كل المستحقات المتبقية.
              </p>
            </div>
          </div>

          {/* Condition Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Condition 1: Sales Amount */}
            <div className="p-4 rounded-xl border border-border/80 bg-muted/40 hover:bg-muted/60 transition-all space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-amber-500/15 text-amber-600">
                    <Coins className="w-4 h-4" />
                  </div>
                  <span className="font-bold text-sm">الشرط الأول: إجمالي المبيعات</span>
                </div>
                <Badge variant="outline" className="font-mono text-xs border-amber-500/30 text-amber-600 bg-amber-500/5">
                  {SALES_LIMIT_EGP.toLocaleString()} ج.م
                </Badge>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-medium text-muted-foreground">
                  <span>المبيعات الحالية: <strong className="text-foreground">{loading ? "..." : `${totalSalesEgp.toLocaleString()} ج.م`}</strong></span>
                  <span>الهدف: 20,000 ج.م</span>
                </div>
                {/* Custom Styled Progress Bar */}
                <div className="h-2.5 w-full bg-secondary/80 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full transition-all duration-700"
                    style={{ width: `${salesPercent}%` }}
                  />
                </div>
                <div className="flex justify-between text-[11px] text-muted-foreground pt-0.5">
                  <span>النسبة: {salesPercent}%</span>
                  <span>المتبقي للحد: {loading ? "..." : `${remainingSalesEgp.toLocaleString()} ج.م`}</span>
                </div>
              </div>
            </div>

            {/* Condition 2: Completed Purchases Count */}
            <div className="p-4 rounded-xl border border-border/80 bg-muted/40 hover:bg-muted/60 transition-all space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-orange-500/15 text-orange-600">
                    <ShoppingCart className="w-4 h-4" />
                  </div>
                  <span className="font-bold text-sm">الشرط الثاني: عدد المبيعات</span>
                </div>
                <Badge variant="outline" className="font-mono text-xs border-orange-500/30 text-orange-600 bg-orange-500/5">
                  {PURCHASES_LIMIT_COUNT} عملية
                </Badge>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-medium text-muted-foreground">
                  <span>العمليات المكتملة: <strong className="text-foreground">{loading ? "..." : `${successfulPurchasesCount} عملية`}</strong></span>
                  <span>الهدف: 100 عملية</span>
                </div>
                {/* Custom Styled Progress Bar */}
                <div className="h-2.5 w-full bg-secondary/80 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-orange-500 to-amber-600 rounded-full transition-all duration-700"
                    style={{ width: `${purchasesPercent}%` }}
                  />
                </div>
                <div className="flex justify-between text-[11px] text-muted-foreground pt-0.5">
                  <span>النسبة: {purchasesPercent}%</span>
                  <span>المتبقي للحد: {loading ? "..." : `${remainingPurchases} عملية`}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Student Guarantee / Reassurance Section (Green / Emerald Box) */}
          <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-950 dark:text-emerald-200 space-y-2">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-600 shrink-0 mt-0.5">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div className="space-y-1 text-right">
                <h4 className="font-bold text-sm text-emerald-900 dark:text-emerald-100 flex items-center gap-1.5">
                  <span>ضمان استمرارية تجربة الطلاب</span>
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 inline" />
                </h4>
                <p className="text-xs sm:text-sm text-emerald-800/90 dark:text-emerald-200/90 leading-relaxed font-medium">
                  <strong>هذا الإجراء لن يؤثر نهائياً على تجربة الطلاب:</strong> يستمر جميع الطلاب المسجلين بالوصول الكامل لجميع الدروس، المحاضرات، حل الواجبات والاختبارات ومتابعة دراستهم دون أي انقطاع.
                </p>
              </div>
            </div>
          </div>

          {/* Scope Explanation */}
          <div className="text-xs text-muted-foreground bg-muted/30 p-3.5 rounded-lg border border-border/60 space-y-1">
            <p className="font-semibold text-foreground">ملاحظة تنظيمية:</p>
            <p className="leading-relaxed">
              التوقف الجزئي عند بلوغ الحد يقتصر على بعض العمليات الإدارية وتفعيل العمليات الجديدة لحين استكمال سداد المستحقات المتبقية.
            </p>
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="p-4 bg-muted/40 border-t border-border/60 flex flex-col-reverse sm:flex-row items-center justify-end gap-3">

          <Button
            onClick={() => onOpenChange(false)}
            className="w-full sm:w-auto bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white shadow-md shadow-amber-500/20 font-bold text-sm px-6"
          >
            فهمت ذلك ومتابعة العمل
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

interface AdminDueAlertBannerProps {
  onOpenDetails: () => void;
}

export const AdminDueAlertBanner = ({ onOpenDetails }: AdminDueAlertBannerProps) => {
  const [dismissed, setDismissed] = useState(false);
  const { totalSalesEgp, successfulPurchasesCount } = usePlatformDueMetrics();

  if (dismissed) {
    return (
      <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-1.5 text-xs flex items-center justify-between text-amber-900 dark:text-amber-200">
        <div className="flex items-center gap-2 truncate">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
          <span className="truncate font-medium">
            تنبيه إداري: المنصة ستتوقف جزئياً عند 20 ألف ج.م مبيعات أو 100 عملية شراء حتى سداد المستحقات (لن يؤثر على الطلاب).
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onOpenDetails}
          className="h-6 px-2 text-xs font-bold text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 shrink-0 mr-2"
        >
          عرض التفاصيل
        </Button>
      </div>
    );
  }

  return (
    <div className="relative bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 text-white shadow-md">
      <div className="max-w-7xl mx-auto px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-sm">
        <div className="flex items-center gap-3 flex-1 min-w-[280px]">
          <div className="p-1.5 bg-white/20 rounded-lg backdrop-blur-sm shrink-0 animate-pulse">
            <AlertTriangle className="w-4 h-4 text-white" />
          </div>
          <div className="space-y-0.5 text-right">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-extrabold text-white tracking-wide">
                تنبيه إداري هام:
              </span>
              <span className="text-amber-100 font-medium">
                المنصة ستتوقف جزئياً عند تحقيق أحد الشرطين (مبيعات بإجمالي 20 ألف جنية أو 100 عملية شراء) حتى سداد كل المستحقات المتبقية.
              </span>
            </div>
            <div className="text-xs text-amber-100/90 font-normal">
              🛡️ <strong>هذا الإجراء لن يؤثر نهائياً على تجربة الطلاب أو وصولهم للدروس.</strong>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            onClick={onOpenDetails}
            className="bg-white text-amber-900 hover:bg-amber-50 font-bold text-xs shadow-sm h-8 px-3.5 rounded-lg"
          >
            عرض التفاصيل
            <ArrowLeft className="w-3.5 h-3.5 mr-1" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setDismissed(true)}
            className="h-8 w-8 text-white/80 hover:text-white hover:bg-white/10 rounded-lg"
            title="تصغير الشريط"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};
