import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  Loader2,
  ImageIcon,
  X,
  AlertCircle,
  CheckCircle2,
  Copy,
  Check,
  Phone,
  Building2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import {
  ManualPaymentMethod,
  METHOD_LABEL,
  uploadPaymentProof,
  validateProofFile,
} from "@/lib/manual-payment-api";

interface Props {
  methods: ManualPaymentMethod[];
  onSubmit: (args: { methodId: string; senderNumber: string; proofPath: string }) => Promise<void>;
  submitLabel?: string;
  disabled?: boolean;
}

export default function ManualPaymentForm({ methods, onSubmit, submitLabel = "إرسال طلب الدفع", disabled }: Props) {
  const { user } = useAuth();
  const [selectedMethodId, setSelectedMethodId] = useState<string | null>(
    methods.length === 1 ? methods[0].id : null,
  );
  const [senderNumber, setSenderNumber] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const selectedMethod = methods.find((m) => m.id === selectedMethodId) ?? null;

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const pickFile = (f: File | null) => {
    if (!f) {
      setFile(null);
      setFileError(null);
      return;
    }
    const err = validateProofFile(f);
    if (err) {
      setFileError(err);
      setFile(null);
      return;
    }
    setFileError(null);
    setFile(f);
  };

  const copyAccount = async () => {
    if (!selectedMethod) return;
    try {
      await navigator.clipboard.writeText(selectedMethod.account_number);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  const canSubmit =
    !!selectedMethod &&
    senderNumber.replace(/\D/g, "").length >= 4 &&
    !!file &&
    !submitting &&
    !disabled;

  const handleSubmit = async () => {
    if (!canSubmit || !user || !file || !selectedMethod) return;
    setSubmitting(true);
    try {
      const path = await uploadPaymentProof(user.id, file);
      await onSubmit({
        methodId: selectedMethod.id,
        senderNumber: senderNumber.trim(),
        proofPath: path,
      });
    } catch (e: any) {
      toast.error(e?.message || "تعذّر إرسال الطلب");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Method sub-choice */}
      {methods.length > 1 && (
        <div className="space-y-2">
          <Label className="text-sm font-bold">اختر طريقة الدفع اليدوي</Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {methods.map((m) => {
              const sel = m.id === selectedMethodId;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSelectedMethodId(m.id)}
                  className={cn(
                    "text-right p-3 rounded-xl border-2 transition-all flex items-center gap-3",
                    sel ? "border-primary bg-primary/5" : "border-border hover:bg-accent/40",
                  )}
                >
                  <div
                    className={cn(
                      "w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
                      sel ? "bg-primary text-primary-foreground" : "bg-accent text-primary",
                    )}
                  >
                    {m.method_type === "vodafone_cash" ? (
                      <Phone className="w-4 h-4" />
                    ) : (
                      <Building2 className="w-4 h-4" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm">{METHOD_LABEL[m.method_type]}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{m.account_holder_name}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <AnimatePresence mode="wait">
        {selectedMethod && (
          <motion.div
            key={selectedMethod.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-4"
          >
            {/* Instructions */}
            <div className="rounded-xl bg-primary/5 border border-primary/20 p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-bold text-primary">
                <CheckCircle2 className="w-4 h-4" />
                حوّل المبلغ إلى الحساب التالي
              </div>
              <div className="grid grid-cols-1 gap-2 text-sm">
                <Row label={METHOD_LABEL[selectedMethod.method_type]} value={selectedMethod.account_holder_name} />
                <div className="flex items-center justify-between gap-2 bg-background rounded-lg p-3 border border-border">
                  <div className="min-w-0">
                    <div className="text-[11px] text-muted-foreground">
                      {selectedMethod.method_type === "vodafone_cash" ? "رقم فودافون كاش" : "حساب إنستاباي"}
                    </div>
                    <div className="font-bold font-mono text-base tabular-nums truncate" dir="ltr">
                      {selectedMethod.account_number}
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={copyAccount} type="button">
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                بعد التحويل، أدخل الرقم الذي حوّلت منه وارفع صورة الإيصال أدناه.
              </p>
            </div>

            {/* Sender number */}
            <div className="space-y-2">
              <Label htmlFor="sender-number" className="text-sm font-bold">
                الرقم الذي تم التحويل منه
              </Label>
              <Input
                id="sender-number"
                inputMode="tel"
                dir="ltr"
                value={senderNumber}
                onChange={(e) => setSenderNumber(e.target.value)}
                placeholder="01xxxxxxxxx"
                className="font-mono h-11"
              />
            </div>

            {/* File upload */}
            <div className="space-y-2">
              <Label className="text-sm font-bold">صورة إثبات التحويل (حتى 5 ميجابايت)</Label>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              />
              {!preview ? (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="w-full rounded-xl border-2 border-dashed border-border hover:border-primary/40 hover:bg-accent/40 transition-colors p-6 text-center flex flex-col items-center gap-2"
                >
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Upload className="w-5 h-5 text-primary" />
                  </div>
                  <div className="text-sm font-semibold">اضغط لاختيار صورة الإيصال</div>
                  <div className="text-xs text-muted-foreground">صورة واحدة فقط • JPG, PNG, WEBP</div>
                </button>
              ) : (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="relative rounded-xl overflow-hidden border border-border"
                >
                  <img src={preview} alt="proof" className="w-full max-h-72 object-contain bg-black/50" />
                  <div className="absolute top-2 left-2 flex gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      type="button"
                      onClick={() => fileRef.current?.click()}
                    >
                      <ImageIcon className="w-4 h-4 ml-1" />
                      تغيير
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      type="button"
                      onClick={() => pickFile(null)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </motion.div>
              )}
              {fileError && (
                <div className="text-xs flex items-center gap-1.5 text-destructive">
                  <AlertCircle className="w-3.5 h-3.5" /> {fileError}
                </div>
              )}
            </div>

            <Button
              size="lg"
              className="w-full font-bold"
              disabled={!canSubmit}
              onClick={handleSubmit}
              type="button"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 ml-2 animate-spin" />
              ) : (
                <Upload className="w-4 h-4 ml-2" />
              )}
              {submitLabel}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-bold">{value}</span>
    </div>
  );
}
