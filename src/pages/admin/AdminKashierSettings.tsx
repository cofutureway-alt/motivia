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
  adminGetKashierConfig,
  adminSaveKashierConfig,
  KashierConfig,
} from "@/lib/kashier-api";
import GatewayMethodsPanel from "@/components/admin/GatewayMethodsPanel";

const WEBHOOK_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/kashier-webhook`;

export default function AdminKashierSettings() {
  const navigate = useNavigate();
  const [cfg, setCfg] = useState<KashierConfig>({
    merchant_id: "",
    api_key: "",
    secret_key: "",
    mode: "test",
  });
  const [gatewayEnabled, setGatewayEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showApi, setShowApi] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [{ data: gw }, remoteCfg] = await Promise.all([
        (supabase as any)
          .from("payment_gateways")
          .select("is_enabled")
          .eq("gateway_key", "kashier")
          .maybeSingle(),
        adminGetKashierConfig(),
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
    if (!cfg.merchant_id.trim() || !cfg.api_key.trim() || !cfg.secret_key.trim()) {
      toast.error("أدخل جميع بيانات Kashier قبل الحفظ");
      return;
    }
    setSaving(true);
    try {
      await adminSaveKashierConfig({
        merchant_id: cfg.merchant_id.trim(),
        api_key: cfg.api_key.trim(),
        secret_key: cfg.secret_key.trim(),
        mode: cfg.mode === "live" ? "live" : "test",
      });
      toast.success("تم حفظ إعدادات Kashier");
    } catch (e: any) {
      toast.error(e?.message ?? "تعذّر الحفظ");
    } finally {
      setSaving(false);
    }
  };

  const toggleEnabled = async (next: boolean) => {
    if (next && (!cfg.merchant_id || !cfg.api_key || !cfg.secret_key)) {
      toast.error("أكمل إعدادات Kashier قبل تفعيل البوابة");
      return;
    }
    const { error } = await (supabase as any)
      .from("payment_gateways")
      .update({ is_enabled: next })
      .eq("gateway_key", "kashier");
    if (error) return toast.error(error.message);
    setGatewayEnabled(next);
    toast.success(next ? "تم تفعيل بوابة Kashier" : "تم إيقاف بوابة Kashier");
  };

  const copyWebhook = async () => {
    try {
      await navigator.clipboard.writeText(WEBHOOK_URL);
      toast.success("تم نسخ رابط الـ Webhook");
    } catch {
      toast.error("تعذّر النسخ — انسخ الرابط يدويًا");
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
            <h1 className="text-2xl font-bold">إعدادات Kashier</h1>
            <p className="text-sm text-muted-foreground">
              بوابة دفع إلكتروني (بطاقات، محافظ، تقسيط) — Hosted Payment Page.
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
              عند التفعيل ستظهر Kashier للطلاب في شراء الدورات وشحن المحفظة.
            </div>
          </div>
          <Switch checked={gatewayEnabled} onCheckedChange={toggleEnabled} />
        </div>

        <div className="p-5 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {(["test", "live"] as const).map((m) => {
              const sel = cfg.mode === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setCfg((c) => ({ ...c, mode: m }))}
                  className={cn(
                    "p-4 rounded-xl border-2 text-right transition-all",
                    sel ? "border-primary bg-primary/5" : "border-border hover:bg-accent/40",
                  )}
                >
                  <div className="font-bold">{m === "test" ? "وضع الاختبار (Test)" : "الوضع الحقيقي (Live)"}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {m === "test"
                      ? "استخدم بيانات Kashier التجريبية وبطاقات الاختبار."
                      : "يعالج مدفوعات فعلية عبر البطاقات والمحافظ."}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="space-y-2">
            <Label>Merchant ID</Label>
            <Input
              dir="ltr"
              className="font-mono"
              value={cfg.merchant_id}
              onChange={(e) => setCfg((c) => ({ ...c, merchant_id: e.target.value }))}
              placeholder="MID-..."
            />
          </div>

          <div className="space-y-2">
            <Label>API Key (Payment API Key — للـ Webhook)</Label>
            <div className="relative">
              <Input
                dir="ltr"
                type={showApi ? "text" : "password"}
                className="font-mono pr-10"
                value={cfg.api_key}
                onChange={(e) => setCfg((c) => ({ ...c, api_key: e.target.value }))}
                placeholder="•••••••••••"
              />
              <button
                type="button"
                onClick={() => setShowApi((s) => !s)}
                className="absolute inset-y-0 right-2 flex items-center text-muted-foreground hover:text-foreground"
              >
                {showApi ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              يُستخدم للتحقق من توقيع الـ Webhook القادم من Kashier.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Secret Key (لتوقيع الطلب / Order Hash)</Label>
            <div className="relative">
              <Input
                dir="ltr"
                type={showSecret ? "text" : "password"}
                className="font-mono pr-10"
                value={cfg.secret_key}
                onChange={(e) => setCfg((c) => ({ ...c, secret_key: e.target.value }))}
                placeholder="•••••••••••"
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
              يبقى دائمًا في الخادم فقط ولا يُرسل إلى المتصفح. يُستخدم لحساب HMAC-SHA256 على مسار الطلب قبل التوجيه.
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

      <GatewayMethodsPanel gatewayKey="kashier" />



      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-2xl border border-border bg-card overflow-hidden"
      >
        <div className="p-5 border-b border-border flex items-center gap-3">
          <Info className="w-5 h-5 text-primary" />
          <div className="font-bold">إعداد Kashier في لوحة تحكم التاجر</div>
        </div>
        <div className="p-5 space-y-4 text-sm">
          <p className="text-muted-foreground leading-relaxed">
            أدخل الرابط التالي كـ Webhook في إعدادات حساب Kashier الخاص بك حتى يستطيع تأكيد المدفوعات:
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
            <li>سيقوم Kashier بإرسال تأكيد كل معاملة إلى هذا الرابط تلقائيًا.</li>
            <li>يتم التحقق من التوقيع (x-kashier-signature) قبل قبول أي تأكيد.</li>
            <li>هذا هو المكان الوحيد الذي يتم فيه اعتماد نجاح المعاملة (شحن المحفظة / تسجيل الطالب في الدورة).</li>
          </ul>
          <a
            href="https://developers.kashier.io/"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            وثائق Kashier الرسمية
          </a>
        </div>
      </motion.section>
    </div>
  );
}
