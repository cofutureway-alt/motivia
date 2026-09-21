import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, AlertCircle, CheckCircle2, RefreshCw } from "lucide-react";
import {
  adminApproveRefund,
  adminManuallyCompleteRefund,
  adminRejectRefund,
  processKashierRefund,
  processPaymobRefund,
  type RefundRequestRow,
} from "@/lib/refund-requests-api";
import { formatEGP } from "@/lib/book-orders-management-api";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  request: RefundRequestRow | null;
}

export default function RefundReviewDialog({ open, onOpenChange, request }: Props) {
  const qc = useQueryClient();
  const [rejectNotes, setRejectNotes] = useState("");
  const [manualRef, setManualRef] = useState("");
  const [manualNotes, setManualNotes] = useState("");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-refund-requests"] });

  const approveMut = useMutation({
    mutationFn: async () => {
      if (!request) throw new Error("no request");
      const res = await adminApproveRefund(request.id);
      // Route to gateway API when needed.
      if (res.needs_gateway_call && res.gateway_key === "kashier") {
        await processKashierRefund(request.id);
      } else if (res.needs_gateway_call && res.gateway_key === "paymob") {
        await processPaymobRefund(request.id);
      }
      return res;
    },
    onSuccess: (res) => {
      invalidate();
      if (res.completed) toast.success("تم إتمام الاسترجاع فورًا إلى محفظة الطالب");
      else if (res.needs_manual_confirm)
        toast.success("تم اعتماد الطلب — بانتظار تنفيذ الاسترجاع يدويًا");
      else if (res.needs_dashboard_action)
        toast.success("تم اعتماد الطلب — أكمل الاسترجاع من لوحة Fawaterak");
      else if (res.needs_gateway_call) toast.success("تم إرسال طلب الاسترجاع إلى البوابة");
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "فشل الاعتماد"),
  });

  const rejectMut = useMutation({
    mutationFn: async () => {
      if (!request) throw new Error("no request");
      return adminRejectRefund(request.id, rejectNotes);
    },
    onSuccess: () => {
      toast.success("تم رفض طلب الاسترجاع");
      invalidate();
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "فشل الرفض"),
  });

  const retryMut = useMutation({
    mutationFn: async () => {
      if (!request) throw new Error("no request");
      if (request.gateway_key === "kashier") return processKashierRefund(request.id);
      if (request.gateway_key === "paymob") return processPaymobRefund(request.id);
      throw new Error("إعادة المحاولة غير متاحة لهذه البوابة");
    },
    onSuccess: () => {
      toast.success("تمت إعادة تنفيذ الاسترجاع");
      invalidate();
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "فشلت إعادة المحاولة"),
  });

  const manualMut = useMutation({
    mutationFn: async () => {
      if (!request) throw new Error("no request");
      return adminManuallyCompleteRefund(request.id, manualRef, manualNotes);
    },
    onSuccess: () => {
      toast.success("تم تسجيل إتمام الاسترجاع");
      invalidate();
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "فشل التسجيل"),
  });

  if (!request) return null;

  const pending = request.status === "pending";
  const canRetry =
    request.status === "processing" &&
    (request.gateway_key === "kashier" || request.gateway_key === "paymob");
  const needsManualComplete =
    (request.status === "approved" || request.status === "processing") &&
    (request.gateway_key === "cod" ||
      request.gateway_key === "manual" ||
      request.gateway_key === "fawaterak");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>مراجعة طلب استرجاع</DialogTitle>
          <DialogDescription>
            الطلب {request.order_number} — {formatEGP(request.total_piastres)} —{" "}
            {request.gateway_display_name}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border p-3 text-sm">
            <div className="text-muted-foreground">سبب الطلب</div>
            <div className="mt-1 whitespace-pre-wrap">{request.reason}</div>
          </div>

          {request.processing_error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <div className="font-medium">آخر خطأ من البوابة</div>
                <div>{request.processing_error}</div>
              </div>
            </div>
          )}

          {pending && (
            <>
              <div className="rounded-lg border bg-muted/40 p-3 text-sm space-y-1">
                <div className="font-medium">ماذا سيحدث عند الاعتماد؟</div>
                <ul className="list-disc pr-5 text-muted-foreground text-xs space-y-1">
                  <li>محفظة الطالب: إعادة القيمة فورًا للرصيد.</li>
                  <li>Kashier / PayMob: تنفيذ استرجاع تلقائي عبر واجهة البوابة.</li>
                  <li>Fawaterak: يتحول للحالة «قيد التنفيذ» وينتظر تأكيد اللوحة عبر Webhook.</li>
                  <li>الدفع اليدوي / الدفع عند الاستلام: يتم تسجيل الاعتماد وتأكيد الإتمام يدويًا لاحقًا.</li>
                </ul>
              </div>
              <div>
                <Label htmlFor="rej">سبب الرفض (لو أردت الرفض)</Label>
                <Textarea
                  id="rej"
                  value={rejectNotes}
                  onChange={(e) => setRejectNotes(e.target.value)}
                  placeholder="اكتب سبب الرفض قبل الضغط على «رفض»"
                  rows={3}
                />
              </div>
            </>
          )}

          {needsManualComplete && (
            <div className="space-y-3 rounded-lg border p-3">
              <div className="text-sm font-medium">تأكيد إتمام الاسترجاع يدويًا</div>
              <div>
                <Label htmlFor="ref">مرجع الاسترجاع (اختياري)</Label>
                <Input
                  id="ref"
                  value={manualRef}
                  onChange={(e) => setManualRef(e.target.value)}
                  placeholder="مثلاً رقم تحويل بنكي أو مرجع Fawaterak"
                />
              </div>
              <div>
                <Label htmlFor="notes">ملاحظات (اختياري)</Label>
                <Textarea
                  id="notes"
                  value={manualNotes}
                  onChange={(e) => setManualNotes(e.target.value)}
                  rows={2}
                />
              </div>
              <Button
                className="w-full"
                onClick={() => manualMut.mutate()}
                disabled={manualMut.isPending}
              >
                {manualMut.isPending ? (
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="ml-2 h-4 w-4" />
                )}
                تأكيد الإتمام
              </Button>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          {pending && (
            <>
              <Button
                variant="destructive"
                onClick={() => rejectMut.mutate()}
                disabled={rejectMut.isPending || rejectNotes.trim().length < 3}
              >
                {rejectMut.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                رفض الطلب
              </Button>
              <Button onClick={() => approveMut.mutate()} disabled={approveMut.isPending}>
                {approveMut.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                اعتماد الاسترجاع
              </Button>
            </>
          )}
          {canRetry && (
            <Button onClick={() => retryMut.mutate()} disabled={retryMut.isPending}>
              {retryMut.isPending ? (
                <Loader2 className="ml-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="ml-2 h-4 w-4" />
              )}
              إعادة محاولة الاسترجاع
            </Button>
          )}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            إغلاق
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
