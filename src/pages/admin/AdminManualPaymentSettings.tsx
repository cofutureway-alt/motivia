import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  Building2,
  Loader2,
  Phone,
  Plus,
  Save,
  ShieldAlert,
  Trash2,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { normalizeEgPhone, isValidEgPhone } from "@/lib/phone";
import {
  ManualPaymentMethod,
  ManualMethodType,
  METHOD_LABEL,
  listAllManualMethods,
} from "@/lib/manual-payment-api";
import { cn } from "@/lib/utils";

export default function AdminManualPaymentSettings() {
  const navigate = useNavigate();
  const [methods, setMethods] = useState<ManualPaymentMethod[] | null>(null);
  const [editing, setEditing] = useState<ManualPaymentMethod | null>(null);
  const [creating, setCreating] = useState(false);
  const [toDelete, setToDelete] = useState<ManualPaymentMethod | null>(null);

  const load = async () => {
    try {
      const data = await listAllManualMethods();
      setMethods(data);
    } catch (e: any) {
      toast.error(e?.message || "تعذّر تحميل طرق الدفع");
    }
  };

  useEffect(() => { load(); }, []);

  const toggleEnabled = async (m: ManualPaymentMethod, next: boolean) => {
    const { error } = await (supabase as any)
      .from("manual_payment_methods").update({ is_enabled: next }).eq("id", m.id);
    if (error) return toast.error(error.message);
    setMethods((prev) => prev?.map((x) => (x.id === m.id ? { ...x, is_enabled: next } : x)) ?? null);
    toast.success(next ? "تم التفعيل" : "تم الإيقاف");
  };

  const deleteMethod = async () => {
    if (!toDelete) return;
    const { error } = await (supabase as any).from("manual_payment_methods").delete().eq("id", toDelete.id);
    if (error) return toast.error(error.message);
    setMethods((prev) => prev?.filter((x) => x.id !== toDelete.id) ?? null);
    toast.success("تم الحذف");
    setToDelete(null);
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between gap-3"
      >
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <Phone className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">إعدادات الدفع اليدوي</h1>
            <p className="text-sm text-muted-foreground">فودافون كاش / إنستاباي — يمكن تفعيل أكثر من طريقة معًا.</p>
          </div>
        </div>
        <Button variant="outline" onClick={() => navigate("/admin/payment-gateways")}>
          <ArrowRight className="w-4 h-4 ml-2" />
          رجوع
        </Button>
      </motion.div>

      <section className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="p-5 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="font-bold">طرق الدفع المُعرّفة</h2>
            <p className="text-xs text-muted-foreground mt-1">
              يجب تفعيل طريقة واحدة على الأقل قبل تفعيل بوابة الدفع اليدوي.
            </p>
          </div>
          <Button onClick={() => setCreating(true)}>
            <Plus className="w-4 h-4 ml-2" /> إضافة طريقة دفع
          </Button>
        </div>

        {methods === null ? (
          <div className="p-10 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : methods.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground text-sm">
            لا توجد طرق دفع بعد. أضف أول طريقة لبدء استقبال المدفوعات اليدوية.
          </div>
        ) : (
          <div className="divide-y divide-border">
            <AnimatePresence>
              {methods.map((m) => (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  className="p-5 flex items-center gap-4"
                >
                  <div className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center shrink-0",
                    m.is_enabled ? "bg-primary/10 text-primary" : "bg-accent text-muted-foreground",
                  )}>
                    {m.method_type === "vodafone_cash" ? <Phone className="w-5 h-5" /> : <Building2 className="w-5 h-5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{METHOD_LABEL[m.method_type]}</span>
                      <span className="text-xs text-muted-foreground">— {m.account_holder_name}</span>
                    </div>
                    <div className="text-xs text-muted-foreground font-mono mt-0.5" dir="ltr">{m.account_number}</div>
                    <a
                      href={`https://wa.me/${normalizeEgPhone(m.support_whatsapp_number)}`}
                      target="_blank" rel="noreferrer"
                      className="text-xs text-primary inline-flex items-center gap-1 mt-1 hover:underline"
                    >
                      <ExternalLink className="w-3 h-3" />
                      واتساب الدعم: {m.support_whatsapp_number}
                    </a>
                  </div>
                  <Switch checked={m.is_enabled} onCheckedChange={(v) => toggleEnabled(m, v)} />
                  <Button size="sm" variant="ghost" onClick={() => setEditing(m)}>تعديل</Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setToDelete(m)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </section>

      {(creating || editing) && (
        <MethodFormModal
          open
          initial={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { setCreating(false); setEditing(null); load(); }}
        />
      )}

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف طريقة الدفع</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف هذه الطريقة نهائيًا. الطلبات القديمة المرتبطة بها ستبقى.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={deleteMethod}>
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function MethodFormModal({
  open, onClose, initial, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  initial: ManualPaymentMethod | null;
  onSaved: () => void;
}) {
  const [type, setType] = useState<ManualMethodType>(initial?.method_type ?? "vodafone_cash");
  const [accountNumber, setAccountNumber] = useState(initial?.account_number ?? "");
  const [holderName, setHolderName] = useState(initial?.account_holder_name ?? "");
  const [whatsapp, setWhatsapp] = useState(initial?.support_whatsapp_number ?? "");
  const [saving, setSaving] = useState(false);

  const normalizedWA = whatsapp ? normalizeEgPhone(whatsapp) : "";
  const waPreview = normalizedWA ? `https://wa.me/${normalizedWA}` : null;
  const waValid = whatsapp ? isValidEgPhone(whatsapp) : false;

  const canSave = accountNumber.trim().length >= 4 && holderName.trim().length >= 2 && waValid;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    const payload = {
      method_type: type,
      account_number: accountNumber.trim(),
      account_holder_name: holderName.trim(),
      support_whatsapp_number: normalizedWA,
    };
    const { error } = initial
      ? await (supabase as any).from("manual_payment_methods").update(payload).eq("id", initial.id)
      : await (supabase as any).from("manual_payment_methods").insert(payload);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(initial ? "تم التحديث" : "تمت الإضافة");
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{initial ? "تعديل طريقة دفع" : "إضافة طريقة دفع"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-2">
            {(["vodafone_cash", "instapay"] as ManualMethodType[]).map((t) => {
              const sel = type === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={cn(
                    "p-3 rounded-xl border-2 flex items-center gap-2 transition-all",
                    sel ? "border-primary bg-primary/5" : "border-border",
                  )}
                >
                  {t === "vodafone_cash" ? <Phone className="w-4 h-4 text-primary" /> : <Building2 className="w-4 h-4 text-primary" />}
                  <span className="font-semibold text-sm">{METHOD_LABEL[t]}</span>
                </button>
              );
            })}
          </div>
          <div className="space-y-2">
            <Label>رقم الحساب / الهاتف</Label>
            <Input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} dir="ltr" className="font-mono" />
          </div>
          <div className="space-y-2">
            <Label>اسم صاحب الحساب</Label>
            <Input value={holderName} onChange={(e) => setHolderName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>رقم واتساب الدعم (مصري)</Label>
            <Input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} dir="ltr" className="font-mono" placeholder="01xxxxxxxxx" />
            {waPreview && (
              <a href={waPreview} target="_blank" rel="noreferrer" className="text-xs text-primary inline-flex items-center gap-1 hover:underline">
                <ExternalLink className="w-3 h-3" />
                {waPreview}
              </a>
            )}
            {whatsapp && !waValid && (
              <div className="text-xs text-destructive flex items-center gap-1">
                <ShieldAlert className="w-3 h-3" /> رقم غير صحيح
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button disabled={!canSave || saving} onClick={save}>
            {saving ? <Loader2 className="w-4 h-4 ml-2 animate-spin" /> : <Save className="w-4 h-4 ml-2" />}
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
