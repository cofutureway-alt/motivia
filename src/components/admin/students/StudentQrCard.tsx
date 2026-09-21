import { useMemo, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { motion } from "framer-motion";
import { Copy, Loader2, QrCode, RefreshCw, ExternalLink, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  qrToken: string | null | undefined;
  onTokenChanged: (newToken: string) => void;
  studentId: string;
}

export default function StudentQrCard({ qrToken, onTokenChanged, studentId }: Props) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const publicUrl = useMemo(() => {
    if (!qrToken) return "";
    return `${window.location.origin}/s/${qrToken}`;
  }, [qrToken]);

  const regenerate = async () => {
    if (!confirm("سيتم إبطال الرمز الحالي فورًا وإنشاء رمز جديد. المتابعة؟")) return;
    setBusy(true);
    try {
      const { data, error } = await (supabase as any).rpc("admin_regenerate_qr_token", {
        _uid: studentId,
      });
      if (error) throw error;
      onTokenChanged(data as string);
      toast.success("تم إنشاء رمز جديد وإبطال القديم");
    } catch (e: any) {
      toast.error(e?.message ?? "تعذّر التوليد");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      toast.success("تم نسخ الرابط");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("تعذّر النسخ");
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 22 }}
      className="rounded-2xl border border-border bg-card p-5 flex flex-col sm:flex-row items-center gap-5"
    >
      <div className="relative">
        <div className="rounded-xl bg-white p-3 border border-border shadow-sm">
          {qrToken ? (
            <QRCodeCanvas
              value={publicUrl}
              size={140}
              level="M"
              includeMargin={false}
              bgColor="#ffffff"
              fgColor="#0f172a"
            />
          ) : (
            <div className="w-[140px] h-[140px] flex items-center justify-center text-muted-foreground">
              <QrCode className="w-10 h-10" />
            </div>
          )}
        </div>
      </div>
      <div className="flex-1 min-w-0 space-y-2 text-center sm:text-right">
        <div className="flex items-center gap-2 justify-center sm:justify-start">
          <QrCode className="w-4 h-4 text-primary" />
          <div className="font-black">رمز QR الخاص بالطالب</div>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          يفتح صفحة إحصائيات عامّة للطالب دون الحاجة لتسجيل دخول. يمكن التحكّم بالبيانات الظاهرة من
          إعدادات → إعدادات QR الطالب.
        </p>
        <div
          className="text-[11px] font-mono bg-muted/60 rounded-md px-2 py-1.5 truncate max-w-full"
          dir="ltr"
          title={publicUrl}
        >
          {publicUrl || "—"}
        </div>
        <div className="flex flex-wrap gap-2 justify-center sm:justify-start pt-1">
          <Button size="sm" variant="secondary" onClick={copy} className="gap-1.5">
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            نسخ الرابط
          </Button>
          {publicUrl && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => window.open(publicUrl, "_blank")}
              className="gap-1.5"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              فتح
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={regenerate}
            disabled={busy}
            className="gap-1.5 text-amber-600 hover:text-amber-700"
          >
            {busy ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            إعادة إنشاء الرمز
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
