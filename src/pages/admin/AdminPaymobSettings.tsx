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
  adminGetPaymobConfig,
  adminSavePaymobConfig,
  PaymobConfig,
} from "@/lib/paymob-api";
import GatewayMethodsPanel from "@/components/admin/GatewayMethodsPanel";

const WEBHOOK_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/paymob-webhook`;

export default function AdminPaymobSettings() {
  const navigate = useNavigate();
  const [cfg, setCfg] = useState<PaymobConfig>({
    secret_key: "",
    public_key: "",
    hmac_secret: "",
    classic_api_key: "",
  });
  const [gatewayEnabled, setGatewayEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [showHmac, setShowHmac] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [{ data: gw }, remoteCfg] = await Promise.all([
        (supabase as any)
          .from("payment_gateways")
          .select("is_enabled")
          .eq("gateway_key", "paymob")
          .maybeSingle(),
        adminGetPaymobConfig(),
      ]);
      setGatewayEnabled(!!gw?.is_enabled);
      if (remoteCfg) setCfg(remoteCfg);
    } catch (e: any) {
      toast.error(e?.message ?? "تعذّر تحميل الإعدادات");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    if (!cfg.secret_key.trim() || !cfg.public_key.trim() || !cfg.hmac_secret.trim()) {
      toast.error("أدخل Secret Key و Public Key و HMAC Secret");
      return;
    }
    setSaving(true);
    try {
      await adminSavePaymobConfig({
        secret_key: cfg.secret_key.trim(),
        public_key: cfg.public_key.trim(),
        hmac_secret: cfg.hmac_secret.trim(),
        classic_api_key: cfg.classic_api_key?.trim() || undefined,
      });
      toast.success("تم حفظ إعدادات PayMob");
    } catch (e: any) {
      toast.error(e?.message ?? "تعذّر الحفظ");
    } finally {
      setSaving(false);
    }
  };

  const toggleEnabled = async (next: boolean) => {
    if (next && (!cfg.secret_key || !cfg.public_key || !cfg.hmac_secret)) {
      toast.error("أكمل إعدادات PayMob قبل تفعيل البوابة");
      return;
    }
    const { error } = await (supabase as any)
      .from("payment_gateways")
      .update({ is_enabled: next })
      .eq("gateway_key", "paymob");
    if (error) return toast.error(error.message);
    setGatewayEnabled(next);
    toast.success(next ? "تم تفعيل بوابة PayMob" : "تم إيقاف بوابة PayMob");
  };

  const copyWebhook = async () => {
    try {
      await navigator.clipboard.writeText(WEBHOOK_URL);
      toast.success("تم نسخ رابط الـ Webhook");
    } catch {
      toast.error("تعذّر النسخ");
    }
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
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between gap-3 flex-wrap"
      >
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <CreditCard className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">إعدادات PayMob</h1>
            <p className="text-sm text-muted-foreground">
              بوابة دفع إلكتروني — Intention API + Unified Checkout.
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={() => navigate("/admin/payment-gateways")}>
          <ArrowRight className="w-4 h-4 ml-2" />
          رجوع
        </Button>
      </motion.div>

      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="rounded-2xl border border-border bg-card overflow-hidden"
      >
        <div className="p-5 border-b border-border flex items-center gap-4">
          <div
            className={cn(
              "w-11 h-11 rounded-lg flex items-center justify-center",
              gatewayEnabled ? "bg-emerald-500/10 text-emerald-600" : "bg-accent text-muted-foreground",
            )}
          >
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <div className="font-bold">حالة البوابة</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              عند التفعيل ستظهر PayMob للطلاب في شراء الدورات وشحن المحفظة.
            </div>
          </div>
          <Switch checked={gatewayEnabled} onCheckedChange={toggleEnabled} />
        </div>

        <div className="p-5 space-y-5">
          <div className="space-y-2">
            <Label>Secret Key</Label>
            <div className="relative">
              <Input
                dir="ltr"
                type={showSecret ? "text" : "password"}
                className="font-mono pr-10"
                value={cfg.secret_key}
                onChange={(e) => setCfg((c) => ({ ...c, secret_key: e.target.value }))}
                placeholder="egy_sk_live_..."
              />
              <button
                type="button"
                onClick={() => setShowSecret((s) => !s)}
                className="absolute inset-y-0 right-2 flex items-center text-muted-foreground hover:text-foreground"
              >
                {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              يُستخدم فقط في الخادم لاستدعاء واجهة Intention API. لا يُرسل أبدًا إلى المتصفح.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Public Key</Label>
            <Input
              dir="ltr"
              className="font-mono"
              value={cfg.public_key}
              onChange={(e) => setCfg((c) => ({ ...c, public_key: e.target.value }))}
              placeholder="egy_pk_live_..."
            />
            <p className="text-xs text-muted-foreground">
              يُستخدم في رابط Unified Checkout لعرض صفحة الدفع.
            </p>
          </div>

          <div className="space-y-2">
            <Label>HMAC Secret</Label>
            <div className="relative">
              <Input
                dir="ltr"
                type={showHmac ? "text" : "password"}
                className="font-mono pr-10"
                value={cfg.hmac_secret}
                onChange={(e) => setCfg((c) => ({ ...c, hmac_secret: e.target.value }))}
                placeholder="•••••••••••"
              />
              <button
                type="button"
                onClick={() => setShowHmac((s) => !s)}
                className="absolute inset-y-0 right-2 flex items-center text-muted-foreground hover:text-foreground"
              >
                {showHmac ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              من لوحة PayMob → Profile. يُستخدم فقط للتحقق من توقيع الـ Webhook (HMAC-SHA512).
            </p>
          </div>

          <div className="space-y-2">
            <Label>Classic API Key (اختياري — للاسترجاع)</Label>
            <Input
              dir="ltr"
              type="password"
              className="font-mono"
              value={cfg.classic_api_key ?? ""}
              onChange={(e) => setCfg((c) => ({ ...c, classic_api_key: e.target.value }))}
              placeholder="ZXlKMGVYQWlPaUpLVjFRaUxDSmhiR2NpT2lKSVV6VXhNaUo5..."
            />
            <p className="text-xs text-muted-foreground">
              مطلوب فقط لتفعيل الاسترجاع التلقائي عبر واجهة PayMob (Accept API classic key).
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

      <GatewayMethodsPanel gatewayKey="paymob" />

      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-2xl border border-border bg-card overflow-hidden"
      >
        <div className="p-5 border-b border-border flex items-center gap-3">
          <Info className="w-5 h-5 text-primary" />
          <div className="font-bold">إعداد PayMob في لوحة تحكم التاجر</div>
        </div>
        <div className="p-5 space-y-4 text-sm">
          <p className="text-muted-foreground leading-relaxed">
            أدخل الرابط التالي كـ <strong>Transaction Processed Callback</strong> في إعدادات PayMob:
          </p>
          <div className="rounded-xl border border-border bg-accent/40 p-3 flex items-center gap-3 justify-between flex-wrap">
            <code dir="ltr" className="font-mono text-xs break-all flex-1 min-w-0">
              {WEBHOOK_URL}
            </code>
            <Button size="sm" variant="outline" onClick={copyWebhook}>
              نسخ الرابط
            </Button>
          </div>
          <ul className="list-disc pr-5 space-y-1 text-muted-foreground text-xs leading-relaxed">
            <li>يتم التحقق من التوقيع HMAC-SHA512 قبل قبول أي تأكيد.</li>
            <li>هذا هو المكان الوحيد الذي يُعتمد فيه نجاح المعاملة (شحن المحفظة / تسجيل الطالب).</li>
          </ul>
          <a
            href="https://developers.paymob.com/"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            وثائق PayMob الرسمية
          </a>
        </div>
      </motion.section>
    </div>
  );
}
