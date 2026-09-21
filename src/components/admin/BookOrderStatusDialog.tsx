import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BookOrderStatus,
  STATUS_LABEL,
  changeBookOrderStatus,
  nextAdminTransitions,
} from "@/lib/book-orders-management-api";

export default function BookOrderStatusDialog({
  order,
  onClose,
  onChanged,
}: {
  order: { id: string; number: string; current: BookOrderStatus; gatewayKey?: string | null } | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [target, setTarget] = useState<BookOrderStatus | "">("");
  const [notes, setNotes] = useState("");
  const [notify, setNotify] = useState(true);
  const [cashCollected, setCashCollected] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (order) {
      const opts = nextAdminTransitions(order.current);
      setTarget(opts[0] ?? "");
      setNotes("");
      setNotify(true);
      setCashCollected(false);
    }
  }, [order]);

  if (!order) return null;
  const options = nextAdminTransitions(order.current);
  const isCod = order.gatewayKey === "cod";
  const showCashConfirm = isCod && target === "delivered";
  const isDeliveryFailed = target === "delivery_failed";
  const notesRequired = isDeliveryFailed;
  const blocked =
    !target ||
    (showCashConfirm && !cashCollected) ||
    (notesRequired && !notes.trim());

  const submit = async () => {
    if (!target) return;
    if (showCashConfirm && !cashCollected) {
      toast({ title: "يجب تأكيد تحصيل المبلغ نقداً", variant: "destructive" });
      return;
    }
    if (notesRequired && !notes.trim()) {
      toast({ title: "يجب إدخال سبب فشل التسليم", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await changeBookOrderStatus({
        orderId: order.id,
        newStatus: target as BookOrderStatus,
        notes: notes.trim() || null,
        notifyStudent: notify,
        cashCollected: showCashConfirm ? cashCollected : false,
      });
      toast({ title: "تم تحديث حالة الطلب" });
      onChanged();
    } catch (e: any) {
      toast({ title: "تعذّر التحديث", description: e?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!order} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>تغيير حالة الطلب</DialogTitle>
          <DialogDescription>
            الطلب <span className="font-mono">{order.number}</span> — الحالة الحالية:{" "}
            <span className="font-semibold">{STATUS_LABEL[order.current]}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div>
            <label className="text-sm font-medium mb-1.5 block">الحالة الجديدة</label>
            <Select value={target} onValueChange={(v) => setTarget(v as BookOrderStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {options.map((s) => (
                  <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {showCashConfirm && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-2">
              <p className="text-xs text-emerald-700 dark:text-emerald-300">
                هذا طلب دفع عند الاستلام. يجب تأكيد استلام المبلغ نقداً قبل تحديد الطلب كمُسلَّم.
              </p>
              <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                <Checkbox
                  checked={cashCollected}
                  onCheckedChange={(v) => setCashCollected(!!v)}
                />
                <span>تم تحصيل المبلغ نقداً بالكامل</span>
              </label>
            </div>
          )}

          <div>
            <label className="text-sm font-medium mb-1.5 block">
              {notesRequired ? "سبب فشل التسليم (مطلوب)" : "ملاحظات (اختياري)"}
            </label>
            <Textarea
              rows={3}
              placeholder={
                notesRequired
                  ? "مثال: العميل لم يستجب / عنوان خاطئ / رفض الاستلام..."
                  : "مثال: تم تسليم الشحنة لشركة الشحن..."
              }
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox checked={notify} onCheckedChange={(v) => setNotify(!!v)} />
            <span>إشعار الطالب بالتغيير</span>
          </label>
          <p className="text-xs text-muted-foreground -mt-2">
            سيتم إرسال إشعار للطالب عند تفعيل نظام الإشعارات.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>إلغاء</Button>
          <Button onClick={submit} disabled={saving || blocked}>
            {saving && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
            تأكيد
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
