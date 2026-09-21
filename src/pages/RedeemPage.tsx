import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Ticket,
  CheckCircle2,
  AlertCircle,
  Loader2,
  BookOpen,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { redeemPurchaseCode, type RedeemResult } from "@/lib/admin-purchase-codes-api";
import { EightPointStar } from "@/components/IslamicPatterns";

export default function RedeemPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [inputCode, setInputCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RedeemResult | null>(null);

  // Check pending redeem code from unauthenticated QR scan
  useEffect(() => {
    const pending = sessionStorage.getItem("pending_redeem_code");
    if (pending) {
      setInputCode(pending);
      if (user) {
        handleRedeem(pending);
      }
    }
  }, [user]);

  const handleRedeem = async (codeToUse?: string) => {
    const targetCode = (codeToUse || inputCode).trim();
    if (!targetCode) {
      toast.error("يرجى إدخال كود الشراء");
      return;
    }

    if (!user) {
      sessionStorage.setItem("pending_redeem_code", targetCode);
      navigate(`/login?redirect=/redeem`);
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const res = await redeemPurchaseCode(targetCode);
      setResult(res);
      sessionStorage.removeItem("pending_redeem_code");
      if (res.success) {
        toast.success(res.message || "تم تفعيل الكود بنجاح!");
      }
    } catch (e: any) {
      setResult({
        success: false,
        error: e?.message || "حدث خطأ أثناء تفعيل الكود",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col" dir="rtl">
      <Navbar />

      <main className="flex-1 pt-28 pb-16 flex items-center justify-center">
        <div className="container mx-auto px-4 max-w-lg">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative overflow-hidden rounded-3xl border border-border bg-card p-8 md:p-10 shadow-2xl space-y-6"
          >
            {/* Background pattern */}
            <EightPointStar
              size={120}
              className="absolute -top-10 -left-10 text-primary/[0.04] pointer-events-none"
            />

            <div className="text-center space-y-2">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto shadow-sm">
                <Ticket className="w-7 h-7" />
              </div>
              <h1 className="text-2xl md:text-3xl font-black text-foreground">تفعيل كود الشراء</h1>
              <p className="text-xs md:text-sm text-muted-foreground">
                أدخل الكود الخاص بك لتسجيل الدورة أو الباقة مجاناً.
              </p>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleRedeem();
              }}
              className="space-y-4 pt-2"
            >
              <div className="space-y-2">
                <Label htmlFor="redeem-code-input" className="text-xs font-bold">
                  كود التفعيل (الشراء)
                </Label>
                <Input
                  id="redeem-code-input"
                  value={inputCode}
                  onChange={(e) => setInputCode(e.target.value)}
                  placeholder="أدخل الكود هنا (مثال: A1B2C3D4)"
                  className="font-mono text-center text-lg uppercase tracking-wider h-12"
                  dir="ltr"
                  disabled={loading}
                />
              </div>

              <Button type="submit" disabled={loading} className="w-full h-11 text-sm font-bold gap-2 shadow-lg">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {loading ? "جارٍ التحقق والتفعيل…" : "تحقق واشترِ"}
              </Button>
            </form>

            {/* Result Feedback */}
            <AnimatePresence mode="wait">
              {result && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className={`p-4 rounded-2xl border text-center space-y-3 ${
                    result.success
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-200"
                      : "bg-rose-500/10 border-rose-500/30 text-rose-800 dark:text-rose-200"
                  }`}
                >
                  {result.success ? (
                    <>
                      <div className="flex items-center justify-center gap-2 font-bold text-base">
                        <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                        <span>تم تفعيل الكود بنجاح!</span>
                      </div>
                      <p className="text-xs">
                        تم تسجيلك في: <strong>{result.target_title}</strong>
                      </p>
                      <Button
                        size="sm"
                        onClick={() => {
                          if (result.target_type === "course") {
                            navigate(`/courses/${result.target_id}`);
                          } else {
                            navigate("/student/courses");
                          }
                        }}
                        className="w-full gap-2 mt-2"
                      >
                        <BookOpen className="w-4 h-4" />
                        الانتقال إلى المحتوى
                      </Button>
                    </>
                  ) : (
                    <div className="flex items-center justify-center gap-2 text-xs font-semibold">
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                      <span>{result.error || "تعذّر تفعيل الكود"}</span>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
