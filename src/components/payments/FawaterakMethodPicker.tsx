import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { AlertCircle, ArrowRight, CreditCard, Loader2 } from "lucide-react";
import { listFawaterakMethods, FawaterakMethod } from "@/lib/fawaterak-api";
import { cn } from "@/lib/utils";

interface Props {
  onPick: (method: FawaterakMethod) => void;
  disabled?: boolean;
}

// Fetches Fawaterak's enabled methods and lets the student pick one.
// Auto-selects when only one method is available. Redirect-capable methods
// are surfaced first per project guidance.
export default function FawaterakMethodPicker({ onPick, disabled }: Props) {
  const [methods, setMethods] = useState<FawaterakMethod[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const list = await listFawaterakMethods();
        const sorted = [...list].sort((a, b) => Number(b.redirect) - Number(a.redirect));
        setMethods(sorted);
        if (sorted.length === 1) onPick(sorted[0]);
      } catch (e: any) {
        setError(e?.message ?? "تعذّر جلب طرق دفع فواتيرك");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <div className="text-sm flex items-center gap-2 text-destructive">
        <AlertCircle className="w-4 h-4" /> {error}
      </div>
    );
  }
  if (!methods) {
    return (
      <div className="flex items-center justify-center py-6 gap-2 text-muted-foreground text-sm">
        <Loader2 className="w-4 h-4 animate-spin" />
        جارِ تحميل طرق الدفع...
      </div>
    );
  }
  if (methods.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        لا توجد طرق دفع مفعّلة في حساب فواتيرك.
      </div>
    );
  }
  if (methods.length === 1) {
    return (
      <div className="flex items-center justify-center py-2 gap-2 text-muted-foreground text-xs">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        تجهيز {methods[0].name_ar || methods[0].name_en}...
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="text-sm font-bold">اختر طريقة الدفع داخل فواتيرك</div>
      {methods.map((m) => (
        <motion.button
          key={m.payment_id}
          type="button"
          disabled={disabled}
          onClick={() => onPick(m)}
          initial={{ opacity: 0, x: 6 }}
          animate={{ opacity: 1, x: 0 }}
          className={cn(
            "w-full flex items-center gap-3 rounded-xl border border-border bg-card p-3 text-right hover:border-primary hover:bg-primary/5 transition-colors",
            disabled && "opacity-50 cursor-not-allowed",
          )}
        >
          <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 overflow-hidden">
            {m.logo ? (
              <img src={m.logo} alt="" className="w-full h-full object-contain" />
            ) : (
              <CreditCard className="w-5 h-5" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold">{m.name_ar || m.name_en}</div>
            <div className="text-[11px] text-muted-foreground">
              {m.redirect ? "تحويل لصفحة دفع" : "دفع بكود / إيصال"}
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-muted-foreground" />
        </motion.button>
      ))}
    </div>
  );
}
