import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Ticket,
  CheckCircle2,
  AlertCircle,
  Loader2,
  BookOpen,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { redeemPurchaseCode, type RedeemResult } from "@/lib/admin-purchase-codes-api";
import { EightPointStar } from "@/components/IslamicPatterns";

export default function PublicRedeemCode() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<RedeemResult | null>(null);

  useEffect(() => {
    if (authLoading) return;

    // Unauthenticated user -> save pending code and redirect to login
    if (!user) {
      if (code) {
        sessionStorage.setItem("pending_redeem_code", code);
      }
      navigate(`/login?redirect=/redeem/${code || ""}`);
      return;
    }

    // Authenticated user -> redeem code
    if (!code) {
      setLoading(false);
      return;
    }

    setLoading(true);
    redeemPurchaseCode(code)
      .then((res) => {
        setResult(res);
        sessionStorage.removeItem("pending_redeem_code");
      })
      .catch((e: any) => {
        setResult({
          success: false,
          error: e?.message || "حدث خطأ أثناء تفعيل الكود",
        });
      })
      .finally(() => {
        setLoading(false);
      });
  }, [code, user, authLoading, navigate]);

  return (
    <div className="min-h-screen bg-background flex flex-col" dir="rtl">
      <Navbar />

      <main className="flex-1 pt-28 pb-16 flex items-center justify-center">
        <div className="container mx-auto px-4 max-w-lg">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative overflow-hidden rounded-3xl border border-border bg-card p-8 md:p-10 shadow-2xl text-center space-y-6"
          >
            {/* Background pattern */}
            <EightPointStar
              size={120}
              className="absolute -top-10 -right-10 text-primary/[0.04] pointer-events-none"
            />

            {loading ? (
              <div className="py-12 space-y-4">
                <Loader2 className="w-10 h-10 text-primary animate-spin mx-auto" />
                <div className="font-bold text-lg">جارٍ تفعيل الكود...</div>
                <p className="text-xs text-muted-foreground">يرجى الانتظار لحظة</p>
              </div>
            ) : result?.success ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="space-y-6"
              >
                <div className="w-20 h-20 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center mx-auto shadow-inner">
                  <CheckCircle2 className="w-10 h-10" />
                </div>

                <div className="space-y-2">
                  <Badge variant="outline" className="gap-1 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-400/40">
                    <Sparkles className="w-3.5 h-3.5" />
                    تم التفعيل بنجاح
                  </Badge>
                  <h1 className="text-2xl font-black text-foreground">مبروك! تم تفعيل اشتراكك</h1>
                  <p className="text-sm font-semibold text-primary">
                    {result.target_title}
                  </p>
                </div>

                <p className="text-xs text-muted-foreground">
                  تم إضافة المحتوى إلى حسابك بنجاح ويمكنك البدء في التعلم فوراً.
                </p>

                <div className="pt-2 space-y-2">
                  <Button
                    onClick={() => {
                      if (result.target_type === "course") {
                        navigate(`/courses/${result.target_id}`);
                      } else {
                        navigate("/student/courses");
                      }
                    }}
                    className="w-full gap-2 shadow-lg"
                  >
                    <BookOpen className="w-4 h-4" />
                    الانتقال للمحتوى الآن
                  </Button>

                  <Button
                    variant="outline"
                    onClick={() => navigate("/student/courses")}
                    className="w-full text-xs"
                  >
                    انتقال إلى دوراتي
                  </Button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="space-y-6"
              >
                <div className="w-20 h-20 rounded-full bg-rose-500/10 text-rose-600 flex items-center justify-center mx-auto shadow-inner">
                  <AlertCircle className="w-10 h-10" />
                </div>

                <div className="space-y-2">
                  <h1 className="text-2xl font-black text-foreground">تعذّر تفعيل الكود</h1>
                  <p className="text-sm text-destructive font-semibold">
                    {result?.error || "الكود غير صحيح أو منتهي الصلاحية."}
                  </p>
                </div>

                <div className="pt-2 space-y-2">
                  <Button asChild className="w-full gap-2" variant="default">
                    <Link to="/redeem">
                      <Ticket className="w-4 h-4" />
                      إدخال كود آخر
                    </Link>
                  </Button>

                  <Button asChild variant="outline" className="w-full text-xs">
                    <Link to="/courses">
                      تصفح الدورات التعليمية
                    </Link>
                  </Button>
                </div>
              </motion.div>
            )}
          </motion.div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
