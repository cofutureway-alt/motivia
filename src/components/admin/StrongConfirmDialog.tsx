import { useEffect, useState } from "react";
import { Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface StrongConfirmDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description: React.ReactNode;
  confirmWord?: string;
  destructive?: boolean;
  onConfirm: () => Promise<void> | void;
  confirmLabel?: string;
}

/**
 * Shared strong-confirmation dialog (Phase 35 pattern).
 * Requires the admin to type "تأكيد" (or a custom word) before enabling the confirm button.
 * Used by AdminWallets, AdminPaymentGateways, and any admin flow that mutates balances.
 */
export default function StrongConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmWord = "تأكيد",
  destructive,
  onConfirm,
  confirmLabel = "تنفيذ",
}: StrongConfirmDialogProps) {
  const [typed, setTyped] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setTyped("");
      setLoading(false);
    }
  }, [open]);

  const matches = typed.trim() === confirmWord;

  return (
    <Dialog open={open} onOpenChange={(o) => !loading && onOpenChange(o)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div
              className={cn(
                "w-11 h-11 rounded-full flex items-center justify-center",
                destructive
                  ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                  : "bg-primary/10 text-primary",
              )}
            >
              <ShieldAlert className="w-5 h-5" />
            </div>
            <DialogTitle className="text-lg">{title}</DialogTitle>
          </div>
          <DialogDescription asChild>
            <div className="text-sm text-foreground/80 leading-relaxed space-y-2">
              {description}
            </div>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 pt-2">
          <Label className="text-xs text-muted-foreground">
            للتأكيد اكتب كلمة{" "}
            <span className="font-bold text-foreground">{confirmWord}</span> بالأسفل:
          </Label>
          <Input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={confirmWord}
            className="text-center font-bold tracking-widest"
            autoFocus
            dir="rtl"
          />
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            إلغاء
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            disabled={!matches || loading}
            onClick={async () => {
              try {
                setLoading(true);
                await onConfirm();
                onOpenChange(false);
              } catch (e: any) {
                toast.error(e?.message ?? "فشل تنفيذ العملية");
              } finally {
                setLoading(false);
              }
            }}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : null}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
