import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight,
  CreditCard,
  Loader2,
  Save,
  Eye,
  EyeOff,
  ShieldCheck,
  ExternalLink,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import {
  adminGetFawaterakConfig,
  adminSaveFawaterakConfig,
  FawaterakConfig,
} from "@/lib/fawaterak-api";
import GatewayMethodsPanel from "@/components/admin/GatewayMethodsPanel";

const WEBHOOK_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fawaterak-webhook`;

export default function AdminFawaterakSettings() {
  const navigate = useNavigate();
  const [cfg, setCfg] = useState<FawaterakConfig>({
    api_token: "",
    vendor_key: "",
    mode: "staging",
  });
  const [gatewayEnabled, setGatewayEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [showVendor, setShowVendor] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [{ data: gw }, remoteCfg] = await Promise.all([
        (supabase as any)
          .from("payment_gateways")
          .select("is_enabled")
          .eq("gateway_key", "fawaterak")
          .maybeSingle(),
        adminGetFawaterakConfig(),
      ]);
      setGatewayEnabled(!!gw?.is_enabled);
      if (remoteCfg) setCfg(remoteCfg);
    } catch (e: any) {
      toast.error(e?.message ?? "تعذّر تحميل الإعدادات");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!cfg.api_token.trim() || !cfg.vendor_key.trim()) {
      toast.error("أدخل API Token و Vendor Key");
      return;
    }
    setSaving(true);
    try {
      await adminSaveFawaterakConfig({
        api_token: cfg.api_token.trim(),
        vendor_key: cfg.vendor_key.trim(),
        mode: cfg.mode,
      });
      toast.success("تم حفظ إعدادات فواتيرك");
    } catch (e: any) {
      toast.error(e?.message ?? "تعذّر الحفظ");
    } finally {
      setSaving(false);
    }
  };

  const toggleEnabled = async (next: boolean) => {
    if (next && (!cfg.api_token || !cfg.vendor_key)) {
      toast.error("أكمل إعدادات فواتيرك قبل تفعيل البوابة");
      return;
    }
    const { error } = await (supabase as any)
      .from("payment_gateways")
      .update({ is_enabled: next })
      .eq("gateway_key", "fawaterak");
    if (error) return toast.error(error.message);
    setGatewayEnabled(next);
    toast.success(next ? "تم تفعيل بوابة فواتيرك" : "تم إيقاف بوابة فواتيرك");
  };

  const copyWebhook = async () => {
    try {
      await navigator.clipboard.writeText(WEBHOOK_URL);
      toast.success("تم نسخ رابط الـ Webhook");
    } catch { toast.error("تعذّر النسخ"); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <CreditCard className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">إعدادات فواتيرك</h1>
            <p className="text-sm text-muted-foreground">
              بوابة دفع إلكتروني — إنشاء فاتورة عبر Fawaterak Invoice API.
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={() => navigate("/admin/payment-gateways")}>
          <ArrowRight className="w-4 h-4 ml-2" />
          رجوع
        </Button>
      </motion.div>

      <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="p-5 border-b border-border flex items-center gap-4">
          <div className={cn("w-11 h-11 rounded-lg flex items-center justify-center", gatewayEnabled ? "bg-emerald-500/10 text-emerald-600" : "bg-accent text-muted-foreground")}>
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <div className="font-bold">حالة البوابة</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              عند التفعيل ستظهر فواتيرك للطلاب في شراء الدورات وشحن المحفظة.
            </div>
          </div>
          <Switch checked={gatewayEnabled} onCheckedChange={toggleEnabled} />
        </div>

        <div className="p-5 space-y-5">
          <div className="space-y-2">
            <Label>وضع التشغيل</Label>
            <div className="flex gap-2">
              {(["staging", "production"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setCfg((c) => ({ ...c, mode: m }))}
                  className={cn(
                    "flex-1 px-4 py-2 rounded-lg border-2 text-sm font-semibold transition-colors",
                    cfg.mode === m ? "border-primary bg-primary/5 text-primary" : "border-border hover:bg-accent/40",
                  )}
                >
                  {m === "staging" ? "تجريبي (Staging)" : "إنتاج (Production)"}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>API Token</Label>
            <div className="relative">
              <Input
                dir="ltr"
                type={showToken ? "text" : "password"}
                className="font-mono pr-10"
                value={cfg.api_token}
                onChange={(e) => setCfg((c) => ({ ...c, api_token: e.target.value }))}
                placeholder="Bearer token from Fawaterak dashboard"
              />
              <button type="button" onClick={() => setShowToken((s) => !s)} className="absolute inset-y-0 right-2 flex items-center text-muted-foreground hover:text-foreground">
                {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              يُستخدم فقط في الخادم للاتصال بواجهات فواتيرك (getPaymentmethods & invoiceInitPay).
            </p>
          </div>

          <div className="space-y-2">
            <Label>Vendor Key</Label>
            <div className="relative">
              <Input
                dir="ltr"
                type={showVendor ? "text" : "password"}
                className="font-mono pr-10"
                value={cfg.vendor_key}
                onChange={(e) => setCfg((c) => ({ ...c, vendor_key: e.target.value }))}
                placeholder="•••••••••••"
              />
              <button type="button" onClick={() => setShowVendor((s) => !s)} className="absolute inset-y-0 right-2 flex items-center text-muted-foreground hover:text-foreground">
                {showVendor ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              يُستخدم فقط للتحقق من تأكيدات الدفع (HMAC-SHA256) — لا يُستخدم أبدًا لإنشاء الفواتير.
            </p>
          </div>

          <div className="flex justify-end">
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 ml-2 animate-spin" /> : <Save className="w-4 h-4 ml-2" />}
              حفظ الإعدادات
            </Button>
          </div>
        </div>
      </motion.section>

      <GatewayMethodsPanel gatewayKey="fawaterak" />



      <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="p-5 border-b border-border flex items-center gap-3">
          <Info className="w-5 h-5 text-primary" />
          <div className="font-bold">إعداد Webhook في لوحة فواتيرك</div>
        </div>
        <div className="p-5 space-y-4 text-sm">
          <p className="text-muted-foreground leading-relaxed">
            أدخل الرابط التالي كـ <strong>Payment Webhook URL</strong> في لوحة فواتيرك:
          </p>
          <div className="rounded-xl border border-border bg-accent/40 p-3 flex items-center gap-3 justify-between flex-wrap">
            <code dir="ltr" className="font-mono text-xs break-all flex-1 min-w-0">{WEBHOOK_URL}</code>
            <Button size="sm" variant="outline" onClick={copyWebhook}>نسخ الرابط</Button>
          </div>
          <ul className="list-disc pr-5 space-y-1 text-muted-foreground text-xs leading-relaxed">
            <li>يتم التحقق من التوقيع HMAC-SHA256 قبل قبول أي تأكيد.</li>
            <li>يصل الـ Webhook من فواتيرك فقط عند نجاح الدفع (Paid).</li>
            <li>يتم اعتبار المعاملات المعلقة لأكثر من ساعتين "فاشلة" تلقائيًا عند فتح الصفحات ذات الصلة.</li>
          </ul>
          <a href="https://fawaterak.readme.io/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline">
            <ExternalLink className="w-3.5 h-3.5" />
            وثائق فواتيرك الرسمية
          </a>
        </div>
      </motion.section>
    </div>
  );
}
