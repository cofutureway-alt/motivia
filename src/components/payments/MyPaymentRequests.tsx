import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Clock, CheckCircle2, XCircle, Receipt, Image as ImageIcon, ExternalLink, Inbox, ChevronDown, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatPiastres } from "@/lib/money";
import { normalizeEgPhone } from "@/lib/phone";
import {
  OwnPaymentRequest,
  METHOD_LABEL,
  listOwnPaymentRequests,
  getProofSignedUrl,
} from "@/lib/manual-payment-api";

const STATUS_META: Record<string, { label: string; color: string; bg: string; Icon: any }> = {
  pending_review: { label: "قيد المراجعة", color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10 border-amber-500/30", Icon: Clock },
  pending_gateway: { label: "بانتظار الدفع", color: "text-sky-600 dark:text-sky-400", bg: "bg-sky-500/10 border-sky-500/30", Icon: Loader2 },
  success:        { label: "تم القبول",     color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/30", Icon: CheckCircle2 },
  failed:         { label: "مرفوض",         color: "text-rose-600 dark:text-rose-400", bg: "bg-rose-500/10 border-rose-500/30", Icon: XCircle },
};

const FALLBACK_STATUS_META = {
  label: "غير معروف",
  color: "text-muted-foreground",
  bg: "bg-muted border-border",
  Icon: Receipt,
};

function formatDateAr(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("ar-EG", { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

interface Props {
  reloadKey?: number;
}

export default function MyPaymentRequests({ reloadKey }: Props) {
  const [items, setItems] = useState<OwnPaymentRequest[] | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

  const load = async () => {
    try {
      const data = await listOwnPaymentRequests();
      setItems(data);
    } catch {
      setItems([]);
    }
  };
  useEffect(() => { load(); }, [reloadKey]);

  const toggleExpand = async (r: OwnPaymentRequest) => {
    const next = expandedId === r.transaction_id ? null : r.transaction_id;
    setExpandedId(next);
    if (next && r.proof_image_url && !signedUrls[r.transaction_id]) {
      const url = await getProofSignedUrl(r.proof_image_url);
      if (url) setSignedUrls((prev) => ({ ...prev, [r.transaction_id]: url }));
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-border/60 bg-card overflow-hidden"
    >
      <div className="flex items-center gap-3 p-5 md:p-6 border-b border-border/50">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Receipt className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-bold">طلبات الدفع الخاصة بي</h2>
          <p className="text-xs text-muted-foreground">شراء الدورات وشحن المحفظة عبر بوابات الدفع</p>
        </div>
      </div>

      {items === null ? (
        <div className="p-5 space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (<Skeleton key={i} className="h-16 w-full rounded-lg" />))}
        </div>
      ) : items.length === 0 ? (
        <div className="p-10 flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-3">
            <Inbox className="w-6 h-6 text-muted-foreground" />
          </div>
          <div className="font-bold">لا توجد طلبات دفع بعد</div>
        </div>
      ) : (
        <div className="divide-y divide-border/50">
          {items.map((r, i) => {
            const meta = STATUS_META[r.status] ?? FALLBACK_STATUS_META;
            const Icon = meta.Icon;
            const expanded = expandedId === r.transaction_id;
            const amount = r.purpose === "wallet_topup" ? r.topup_amount_piastres ?? 0 : r.amount_piastres;
            const wa = r.method_whatsapp ? `https://wa.me/${normalizeEgPhone(r.method_whatsapp)}` : null;

            return (
              <motion.div
                key={r.transaction_id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.03, 0.3) }}
              >
                <button
                  type="button"
                  onClick={() => toggleExpand(r)}
                  className="w-full text-right p-4 flex items-center gap-3 hover:bg-accent/40 transition-colors"
                >
                  <div className={cn("w-10 h-10 rounded-lg border flex items-center justify-center shrink-0", meta.bg, meta.color)}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm truncate">
                        {r.purpose === "wallet_topup" ? "شحن المحفظة" : r.course_title || "شراء دورة"}
                      </span>
                      <span className={cn("text-[11px] font-semibold px-2 py-0.5 rounded-full border", meta.bg, meta.color)}>
                        {meta.label}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                      <span className="font-mono">{r.reference_number}</span>
                      <span>·</span>
                      <span>{formatDateAr(r.created_at)}</span>
                    </div>
                  </div>
                  <div className="text-left shrink-0">
                    <div className="font-bold tabular-nums">{formatPiastres(amount)}</div>
                  </div>
                  <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", expanded && "rotate-180")} />
                </button>

                <AnimatePresence initial={false}>
                  {expanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="rounded-xl bg-accent/40 p-3 text-sm space-y-1">
                          <Row label="البوابة" value={r.gateway_display_name} />
                          {r.method_type && <Row label="الطريقة" value={METHOD_LABEL[r.method_type] ?? r.method_type} />}
                          {r.method_account_number && <Row label="حساب الاستلام" value={r.method_account_number} mono />}
                          {r.sender_number && <Row label="رقم المُحوِّل" value={r.sender_number} mono />}
                        </div>
                        <div className="rounded-xl bg-accent/40 p-3 text-sm">
                          {r.proof_image_url ? (
                            signedUrls[r.transaction_id] ? (
                              <a
                                href={signedUrls[r.transaction_id]}
                                target="_blank"
                                rel="noreferrer"
                                className="block rounded-lg overflow-hidden border border-border"
                              >
                                <img
                                  src={signedUrls[r.transaction_id]}
                                  alt="proof"
                                  className="w-full h-40 object-cover"
                                />
                              </a>
                            ) : (
                              <div className="h-40 flex items-center justify-center text-muted-foreground">
                                <ImageIcon className="w-6 h-6" />
                              </div>
                            )
                          ) : (
                            <div className="text-muted-foreground text-xs">لا يوجد إيصال</div>
                          )}
                        </div>

                        {r.status === "failed" && (r.review_notes || r.failure_reason) && (
                          <div className="md:col-span-2 rounded-xl border border-rose-500/30 bg-rose-500/5 p-3 text-sm">
                            <div className="font-bold text-rose-700 dark:text-rose-300 mb-1">سبب الرفض</div>
                            <div className="text-foreground">{r.review_notes || r.failure_reason}</div>
                            {wa && (
                              <Button asChild variant="outline" size="sm" className="mt-3">
                                <a href={wa} target="_blank" rel="noreferrer">
                                  <ExternalLink className="w-4 h-4 ml-1.5" />
                                  تواصل مع الدعم عبر واتساب
                                </a>
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className={cn("font-semibold text-sm truncate", mono && "font-mono")} dir={mono ? "ltr" : undefined}>{value}</span>
    </div>
  );
}
