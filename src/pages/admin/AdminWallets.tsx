import { useEffect, useMemo, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Ticket,
  Wallet as WalletIcon,
  Plus,
  Download,
  Search,
  Loader2,
  ArrowUpCircle,
  ArrowDownCircle,
  Users as UsersIcon,
  X,
  ShieldAlert,
  CheckCircle2,
  Filter,
  Copy,
  Check,
  Trash2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { formatPiastres, parseEgpToPiastres } from "@/lib/money";
import { cn } from "@/lib/utils";
import StrongConfirmDialog from "@/components/admin/StrongConfirmDialog";

// ============================================================
// Types
// ============================================================
interface TopUpCard {
  id: string;
  code: string;
  value_piastres: number;
  expires_at: string | null;
  is_redeemed: boolean;
  redeemed_by: string | null;
  redeemed_at: string | null;
  batch_id: string | null;
  created_at: string;
  redeemer_name?: string | null;
}

type TxType =
  | "card_redemption"
  | "admin_charge"
  | "admin_deduct"
  | "bulk_charge"
  | "bulk_deduct"
  | "purchase"
  | "admin_reset";

const TYPE_LABEL: Record<TxType, string> = {
  card_redemption: "شحن بكارت",
  admin_charge: "شحن يدوي",
  admin_deduct: "خصم يدوي",
  bulk_charge: "شحن جماعي",
  bulk_deduct: "خصم جماعي",
  purchase: "شراء كورس",
  admin_reset: "تصفير الرصيد",
};
const CREDIT_TYPES: TxType[] = ["card_redemption", "admin_charge", "bulk_charge"];

interface WalletTx {
  id: string;
  reference_number: string;
  wallet_id: string;
  user_id: string;
  student_name: string | null;
  student_phone: string | null;
  student_id_code: string | null;
  type: TxType;
  amount_piastres: number;
  balance_after_piastres: number;
  performed_by: string | null;
  performed_by_name: string | null;
  notes: string | null;
  created_at: string;
  total_count: number;
}

interface StudentSearchResult {
  id: string;
  full_name: string;
  phone_number: string | null;
  student_id: string | null;
  avatar_url: string | null;
}

// ============================================================
// Utils
// ============================================================
function toCsv(rows: TopUpCard[]): string {
  const header = ["code", "value_egp", "status", "expires_at", "created_at"];
  const lines = rows.map((r) => {
    const status = r.is_redeemed
      ? "redeemed"
      : r.expires_at && new Date(r.expires_at) < new Date()
      ? "expired"
      : "active";
    return [
      r.code,
      (r.value_piastres / 100).toFixed(2),
      status,
      r.expires_at ?? "",
      r.created_at,
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",");
  });
  return "\uFEFF" + [header.join(","), ...lines].join("\n");
}

function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function cardStatus(c: TopUpCard): "active" | "redeemed" | "expired" {
  if (c.is_redeemed) return "redeemed";
  if (c.expires_at && new Date(c.expires_at) < new Date()) return "expired";
  return "active";
}

const STATUS_META = {
  active: { label: "نشطة", cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30" },
  redeemed: { label: "تم الاستخدام", cls: "bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/30" },
  expired: { label: "منتهية الصلاحية", cls: "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30" },
};

// (StrongConfirmDialog moved to src/components/admin/StrongConfirmDialog.tsx)

// ============================================================
// Cards Tab
// ============================================================
function CardsTab() {
  const [cards, setCards] = useState<TopUpCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [genOpen, setGenOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "redeemed" | "expired">("all");
  const [valueFilter, setValueFilter] = useState<Set<number>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  // Generate form
  const [gQty, setGQty] = useState("10");
  const [gValue, setGValue] = useState("50");
  const [gExpires, setGExpires] = useState("");
  const [genLoading, setGenLoading] = useState(false);
  const [lastBatch, setLastBatch] = useState<TopUpCard[] | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("top_up_cards")
      .select("*, redeemer:profiles!top_up_cards_redeemed_by_fkey(full_name)")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    setCards(
      (data ?? []).map((r: any) => ({
        ...r,
        redeemer_name: r.redeemer?.full_name ?? null,
      })) as TopUpCard[]
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const distinctValues = useMemo(
    () => Array.from(new Set(cards.map((c) => c.value_piastres))).sort((a, b) => a - b),
    [cards]
  );

  const filtered = useMemo(() => {
    return cards.filter((c) => {
      if (statusFilter !== "all" && cardStatus(c) !== statusFilter) return false;
      if (valueFilter.size > 0 && !valueFilter.has(c.value_piastres)) return false;
      return true;
    });
  }, [cards, statusFilter, valueFilter]);

  const handleGenerate = async () => {
    const qty = Math.floor(Number(gQty));
    const valuePi = parseEgpToPiastres(gValue);
    if (!Number.isFinite(qty) || qty < 1 || qty > 50) {
      toast.error("الكمية يجب أن تكون بين 1 و 50");
      return;
    }
    if (!valuePi || valuePi <= 0) {
      toast.error("قيمة الكارت غير صحيحة");
      return;
    }
    setGenLoading(true);
    try {
      const { data, error } = await (supabase.rpc as any)("admin_generate_top_up_cards", {
        p_quantity: qty,
        p_value_piastres: valuePi,
        p_expires_at: gExpires ? new Date(gExpires).toISOString() : null,
      });
      if (error) throw error;
      const batchId = data.batch_id as string;
      const { data: rows } = await supabase
        .from("top_up_cards")
        .select("*")
        .eq("batch_id", batchId)
        .order("code");
      const batch = (rows ?? []) as TopUpCard[];
      setLastBatch(batch);
      downloadCsv(`cards-batch-${batchId.slice(0, 8)}.csv`, toCsv(batch));
      toast.success(`تم إنشاء ${qty} كارت وتنزيل ملف CSV`);
      setGenOpen(false);
      setGQty("10");
      setGValue("50");
      setGExpires("");
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "فشل إنشاء الكروت");
    } finally {
      setGenLoading(false);
    }
  };

  const copyCode = async (code: string) => {
    await navigator.clipboard.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(null), 1500);
  };

  const toggleAll = () =>
    setSelectedIds((p) =>
      p.size === filtered.length ? new Set() : new Set(filtered.map((c) => c.id))
    );
  const toggleOne = (id: string) =>
    setSelectedIds((p) => {
      const n = new Set(p);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const runBulkDelete = async () => {
    setBulkBusy(true);
    try {
      const ids = Array.from(selectedIds);
      const { error } = await supabase.from("top_up_cards").delete().in("id", ids);
      if (error) throw error;
      toast.success(`تم حذف ${ids.length} كارت`);
      setCards((cs) => cs.filter((c) => !selectedIds.has(c.id)));
      setSelectedIds(new Set());
      setBulkDeleteOpen(false);
    } catch (e: any) {
      toast.error(e?.message ?? "تعذّر الحذف");
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">كروت الشحن</h2>
          <p className="text-sm text-muted-foreground">
            إنشاء كروت شحن جديدة وإدارة الكروت الموجودة ({cards.length})
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setExportOpen(true)} disabled={cards.length === 0}>
            <Download className="w-4 h-4 ml-2" />
            تصدير CSV
          </Button>
          <Button onClick={() => setGenOpen(true)}>
            <Plus className="w-4 h-4 ml-2" />
            إنشاء كروت شحن
          </Button>
        </div>
      </div>

      {/* Last batch preview */}
      <AnimatePresence>
        {lastBatch && lastBatch.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="rounded-2xl border border-primary/30 bg-primary/5 p-4"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-primary" />
                <span className="font-bold">آخر دفعة تم إنشاؤها ({lastBatch.length})</span>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setLastBatch(null)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
              {lastBatch.map((c) => (
                <button
                  key={c.id}
                  onClick={() => copyCode(c.code)}
                  className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-background border hover:border-primary transition-colors"
                >
                  <span className="font-mono font-bold tracking-widest">{c.code}</span>
                  {copied === c.code ? (
                    <Check className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <Copy className="w-4 h-4 text-muted-foreground" />
                  )}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border p-3">
        <Filter className="w-4 h-4 text-muted-foreground" />
        <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="الحالة" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الحالات</SelectItem>
            <SelectItem value="active">نشطة</SelectItem>
            <SelectItem value="redeemed">تم الاستخدام</SelectItem>
            <SelectItem value="expired">منتهية الصلاحية</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex flex-wrap gap-1 items-center">
          <span className="text-xs text-muted-foreground ml-1">القيم:</span>
          {distinctValues.map((v) => {
            const active = valueFilter.has(v);
            return (
              <button
                key={v}
                onClick={() => {
                  const s = new Set(valueFilter);
                  if (active) s.delete(v);
                  else s.add(v);
                  setValueFilter(s);
                }}
                className={cn(
                  "px-2.5 py-1 rounded-full text-xs border transition",
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border hover:border-primary/40"
                )}
              >
                {formatPiastres(v)}
              </button>
            );
          })}
          {valueFilter.size > 0 && (
            <button
              onClick={() => setValueFilter(new Set())}
              className="text-xs text-muted-foreground underline"
            >
              مسح
            </button>
          )}
        </div>
        <div className="ms-auto text-xs text-muted-foreground">
          عرض {filtered.length} من {cards.length}
        </div>
      </div>

      {/* Bulk actions */}
      <AnimatePresence>
        {selectedIds.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-3"
          >
            <div className="text-sm font-semibold">تم تحديد {selectedIds.size} كارت</div>
            <div className="flex gap-2">
              <Button size="sm" variant="destructive" onClick={() => setBulkDeleteOpen(true)} className="gap-1.5">
                <Trash2 className="w-4 h-4" /> حذف المحدد
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>إلغاء</Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Table */}
      <div className="rounded-2xl border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-right">
                <th className="p-3 w-10">
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-primary cursor-pointer"
                    checked={filtered.length > 0 && selectedIds.size === filtered.length}
                    ref={(el) => { if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < filtered.length; }}
                    onChange={toggleAll}
                  />
                </th>
                <th className="p-3 font-semibold">الكود</th>
                <th className="p-3 font-semibold">القيمة</th>
                <th className="p-3 font-semibold">الحالة</th>
                <th className="p-3 font-semibold">تم الاستخدام بواسطة</th>
                <th className="p-3 font-semibold">تاريخ الإنشاء</th>
                <th className="p-3 font-semibold">تاريخ الانتهاء</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-t">
                    <td colSpan={7} className="p-3">
                      <Skeleton className="h-6 w-full" />
                    </td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted-foreground">
                    <Ticket className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    لا توجد كروت
                  </td>
                </tr>
              ) : (
                filtered.map((c, idx) => {
                  const st = cardStatus(c);
                  return (
                    <motion.tr
                      key={c.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(idx * 0.02, 0.3) }}
                      className="border-t hover:bg-muted/30"
                    >
                      <td className="p-3 w-10">
                        <input
                          type="checkbox"
                          className="w-4 h-4 accent-primary cursor-pointer"
                          checked={selectedIds.has(c.id)}
                          onChange={() => toggleOne(c.id)}
                        />
                      </td>
                      <td className="p-3 font-mono font-bold tracking-widest">
                        <button
                          onClick={() => copyCode(c.code)}
                          className="inline-flex items-center gap-2 hover:text-primary"
                        >
                          {c.code}
                          {copied === c.code ? (
                            <Check className="w-3.5 h-3.5 text-emerald-500" />
                          ) : (
                            <Copy className="w-3.5 h-3.5 opacity-40" />
                          )}
                        </button>
                      </td>
                      <td className="p-3 font-semibold">{formatPiastres(c.value_piastres)}</td>
                      <td className="p-3">
                        <span
                          className={cn(
                            "inline-flex px-2 py-0.5 rounded-full text-xs border",
                            STATUS_META[st].cls
                          )}
                        >
                          {STATUS_META[st].label}
                        </span>
                      </td>
                      <td className="p-3 text-muted-foreground">{c.redeemer_name ?? "—"}</td>
                      <td className="p-3 text-muted-foreground">
                        {new Date(c.created_at).toLocaleDateString("ar-EG")}
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {c.expires_at ? new Date(c.expires_at).toLocaleDateString("ar-EG") : "—"}
                      </td>
                    </motion.tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Generate dialog */}
      <Dialog open={genOpen} onOpenChange={setGenOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>إنشاء دفعة كروت شحن</DialogTitle>
            <DialogDescription>
              كل كارت يحصل على كود عشوائي فريد. الحد الأقصى 50 كارت في الدفعة.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>عدد الكروت (1 – 50)</Label>
              <Input
                type="number"
                min={1}
                max={50}
                value={gQty}
                onChange={(e) => setGQty(e.target.value)}
              />
            </div>
            <div>
              <Label>القيمة (جنيه مصري)</Label>
              <Input
                type="number"
                min={1}
                step="0.01"
                value={gValue}
                onChange={(e) => setGValue(e.target.value)}
              />
            </div>
            <div>
              <Label>تاريخ الانتهاء (اختياري)</Label>
              <Input
                type="datetime-local"
                value={gExpires}
                onChange={(e) => setGExpires(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">اتركه فارغًا لكروت بدون انتهاء صلاحية.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGenOpen(false)} disabled={genLoading}>
              إلغاء
            </Button>
            <Button onClick={handleGenerate} disabled={genLoading}>
              {genLoading && <Loader2 className="w-4 h-4 animate-spin ml-2" />}
              إنشاء وتنزيل CSV
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Export dialog */}
      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        cards={cards}
        distinctValues={distinctValues}
      />

      <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>حذف {selectedIds.size} كارت نهائيًا؟</DialogTitle>
            <DialogDescription>
              سيتم حذف الكروت المحددة نهائيًا من قاعدة البيانات. لا يمكن التراجع.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDeleteOpen(false)} disabled={bulkBusy}>إلغاء</Button>
            <Button variant="destructive" onClick={runBulkDelete} disabled={bulkBusy}>
              {bulkBusy && <Loader2 className="w-4 h-4 animate-spin ml-2" />}
              حذف نهائي
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ExportDialog({
  open,
  onOpenChange,
  cards,
  distinctValues,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  cards: TopUpCard[];
  distinctValues: number[];
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [includeUsed, setIncludeUsed] = useState(false);

  useEffect(() => {
    if (open) {
      setSelected(new Set(distinctValues));
      setIncludeUsed(false);
    }
  }, [open, distinctValues]);

  const preview = useMemo(() => {
    return cards.filter((c) => {
      if (!selected.has(c.value_piastres)) return false;
      if (!includeUsed && cardStatus(c) !== "active") return false;
      return true;
    });
  }, [cards, selected, includeUsed]);

  const handleDownload = () => {
    if (preview.length === 0) {
      toast.error("لا توجد كروت مطابقة للتصدير");
      return;
    }
    downloadCsv(`cards-export-${Date.now()}.csv`, toCsv(preview));
    toast.success(`تم تصدير ${preview.length} كارت`);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>تصدير كروت CSV</DialogTitle>
          <DialogDescription>اختر القيم المطلوبة وقواعد التضمين.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="mb-2 block">القيم</Label>
            <div className="space-y-2 max-h-52 overflow-y-auto rounded-xl border p-3">
              {distinctValues.map((v) => (
                <label key={v} className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={selected.has(v)}
                    onCheckedChange={(checked) => {
                      const s = new Set(selected);
                      if (checked) s.add(v);
                      else s.delete(v);
                      setSelected(s);
                    }}
                  />
                  <span className="font-semibold">{formatPiastres(v)}</span>
                </label>
              ))}
              {distinctValues.length === 0 && (
                <p className="text-xs text-muted-foreground">لا توجد كروت.</p>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between rounded-xl border p-3">
            <div>
              <Label className="cursor-pointer">تضمين الكروت المستخدمة أو منتهية الصلاحية</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                للأغراض الأرشيفية فقط. الافتراضي: تصدير الكروت النشطة فقط.
              </p>
            </div>
            <Switch checked={includeUsed} onCheckedChange={setIncludeUsed} />
          </div>
          <div className="rounded-lg bg-muted/50 p-3 text-sm">
            سيتم تصدير <span className="font-bold text-foreground">{preview.length}</span> كارت
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
          <Button onClick={handleDownload}>
            <Download className="w-4 h-4 ml-2" />
            تنزيل CSV
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Wallet Logs Tab
// ============================================================
function WalletLogsTab() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | TxType>("all");
  const [txs, setTxs] = useState<WalletTx[]>([]);
  const [loading, setLoading] = useState(true);

  // Selected student
  const [studentSearch, setStudentSearch] = useState("");
  const [studentResults, setStudentResults] = useState<StudentSearchResult[]>([]);
  const [studentSearching, setStudentSearching] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<StudentSearchResult | null>(null);
  const [selectedBalance, setSelectedBalance] = useState<number | null>(null);

  // Action dialogs
  const [actionForm, setActionForm] = useState<{
    open: boolean;
    kind: "charge" | "deduct" | null;
    amount: string;
  }>({ open: false, kind: null, amount: "" });
  const [confirmAction, setConfirmAction] = useState<null | {
    kind: "charge" | "deduct";
    amountPi: number;
  }>(null);

  // Bulk
  const [bulkForm, setBulkForm] = useState<{
    open: boolean;
    kind: "charge" | "deduct" | null;
    amount: string;
  }>({ open: false, kind: null, amount: "" });
  const [confirmBulk, setConfirmBulk] = useState<null | {
    kind: "charge" | "deduct";
    amountPi: number;
  }>(null);
  const [bulkResult, setBulkResult] = useState<null | {
    success_count: number;
    skipped_count: number;
    skipped_users: Array<{ full_name: string; reason: string }>;
    kind: "charge" | "deduct";
  }>(null);

  const loadTxs = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (supabase.rpc as any)("admin_list_wallet_transactions", {
      _user_search: search || null,
      _type: typeFilter === "all" ? null : typeFilter,
      _limit: 200,
      _offset: 0,
    });
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    setTxs((data ?? []) as WalletTx[]);
    setLoading(false);
  }, [search, typeFilter]);

  useEffect(() => {
    loadTxs();
  }, [loadTxs]);

  // Student search (debounced)
  useEffect(() => {
    if (!studentSearch.trim()) {
      setStudentResults([]);
      return;
    }
    let cancelled = false;
    setStudentSearching(true);
    const t = setTimeout(async () => {
      const { data, error } = await (supabase.rpc as any)("admin_list_students", {
        _search: studentSearch,
        _known_filters: {},
        _custom_filters: {},
        _limit: 8,
        _offset: 0,
      });
      if (cancelled) return;
      if (!error) {
        setStudentResults(
          (data ?? []).map((r: any) => ({
            id: r.id,
            full_name: r.full_name,
            phone_number: r.phone_number,
            student_id: r.student_id,
            avatar_url: r.avatar_url,
          }))
        );
      }
      setStudentSearching(false);
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [studentSearch]);

  const loadStudentBalance = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from("wallets")
      .select("balance_piastres")
      .eq("user_id", userId)
      .maybeSingle();
    setSelectedBalance(data?.balance_piastres ?? 0);
  }, []);

  const pickStudent = (s: StudentSearchResult) => {
    setSelectedStudent(s);
    setStudentSearch("");
    setStudentResults([]);
    loadStudentBalance(s.id);
  };

  const openAction = (kind: "charge" | "deduct") => {
    if (!selectedStudent) return;
    setActionForm({ open: true, kind, amount: "" });
  };

  const proceedAction = () => {
    const pi = parseEgpToPiastres(actionForm.amount);
    if (!pi || pi <= 0) {
      toast.error("قيمة غير صحيحة");
      return;
    }
    setActionForm({ open: false, kind: null, amount: "" });
    setConfirmAction({ kind: actionForm.kind!, amountPi: pi });
  };

  const executeAction = async () => {
    if (!confirmAction || !selectedStudent) return;
    const { data, error } = await (supabase.rpc as any)("admin_adjust_wallet", {
      p_user_id: selectedStudent.id,
      p_amount_piastres: confirmAction.amountPi,
      p_type: confirmAction.kind === "charge" ? "admin_charge" : "admin_deduct",
    });
    if (error) throw new Error(error.message);
    if (data?.success) {
      toast.success(
        confirmAction.kind === "charge"
          ? `تم شحن ${formatPiastres(confirmAction.amountPi)}`
          : `تم خصم ${formatPiastres(confirmAction.amountPi)}`
      );
      setSelectedBalance(data.new_balance_piastres);
      setConfirmAction(null);
      loadTxs();
    }
  };

  const openBulk = (kind: "charge" | "deduct") => {
    setBulkForm({ open: true, kind, amount: "" });
  };
  const proceedBulk = () => {
    const pi = parseEgpToPiastres(bulkForm.amount);
    if (!pi || pi <= 0) {
      toast.error("قيمة غير صحيحة");
      return;
    }
    setBulkForm({ open: false, kind: null, amount: "" });
    setConfirmBulk({ kind: bulkForm.kind!, amountPi: pi });
  };
  const executeBulk = async () => {
    if (!confirmBulk) return;
    const { data, error } = await (supabase.rpc as any)("admin_bulk_adjust_wallets", {
      p_amount_piastres: confirmBulk.amountPi,
      p_type: confirmBulk.kind === "charge" ? "bulk_charge" : "bulk_deduct",
    });
    if (error) throw new Error(error.message);
    setBulkResult({
      success_count: data.success_count,
      skipped_count: data.skipped_count,
      skipped_users: data.skipped_users ?? [],
      kind: confirmBulk.kind,
    });
    setConfirmBulk(null);
    loadTxs();
    if (selectedStudent) loadStudentBalance(selectedStudent.id);
  };

  return (
    <div className="space-y-6">
      {/* Manual action panel */}
      <div className="rounded-2xl border p-5 space-y-4 bg-card">
        <div className="flex items-center gap-2">
          <UsersIcon className="w-5 h-5 text-primary" />
          <h3 className="font-bold text-lg">تعديل رصيد طالب</h3>
        </div>

        <div className="relative">
          <div className="relative">
            <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="ابحث بالاسم أو رقم الهاتف أو رقم الطالب"
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
              className="pr-10"
            />
          </div>
          {studentResults.length > 0 && (
            <div className="absolute z-20 mt-1 w-full rounded-xl border bg-popover shadow-lg max-h-72 overflow-y-auto">
              {studentResults.map((s) => (
                <button
                  key={s.id}
                  onClick={() => pickStudent(s)}
                  className="w-full text-right px-4 py-3 hover:bg-accent border-b last:border-0"
                >
                  <div className="font-semibold">{s.full_name}</div>
                  <div className="text-xs text-muted-foreground">
                    {s.phone_number ?? "—"} · #{s.student_id ?? "—"}
                  </div>
                </button>
              ))}
            </div>
          )}
          {studentSearching && (
            <Loader2 className="w-4 h-4 animate-spin absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          )}
        </div>

        <AnimatePresence>
          {selectedStudent && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="rounded-xl border-2 border-primary/30 bg-primary/5 p-4 flex flex-col sm:flex-row sm:items-center gap-4"
            >
              <div className="flex-1">
                <div className="text-xs text-muted-foreground mb-1">الطالب المحدد</div>
                <div className="font-bold text-lg">{selectedStudent.full_name}</div>
                <div className="text-xs text-muted-foreground">
                  {selectedStudent.phone_number ?? "—"} · #{selectedStudent.student_id ?? "—"}
                </div>
              </div>
              <div className="text-center">
                <div className="text-xs text-muted-foreground mb-1">الرصيد الحالي</div>
                <div className="text-2xl font-bold text-primary">
                  {selectedBalance === null ? "—" : formatPiastres(selectedBalance)}
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => openAction("charge")} className="bg-emerald-600 hover:bg-emerald-700">
                  <ArrowUpCircle className="w-4 h-4 ml-2" />
                  شحن
                </Button>
                <Button variant="destructive" onClick={() => openAction("deduct")}>
                  <ArrowDownCircle className="w-4 h-4 ml-2" />
                  خصم
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setSelectedStudent(null);
                    setSelectedBalance(null);
                  }}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="pt-2 border-t flex flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => openBulk("charge")} className="flex-1">
            <ArrowUpCircle className="w-4 h-4 ml-2 text-emerald-600" />
            شحن رصيد لكل المستخدمين
          </Button>
          <Button variant="outline" onClick={() => openBulk("deduct")} className="flex-1">
            <ArrowDownCircle className="w-4 h-4 ml-2 text-rose-600" />
            خصم رصيد من كل المستخدمين
          </Button>
        </div>
      </div>

      {/* Log table */}
      <div>
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="بحث في السجل (اسم / هاتف / رقم طالب)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pr-10"
            />
          </div>
          <Select value={typeFilter} onValueChange={(v: any) => setTypeFilter(v)}>
            <SelectTrigger className="w-full sm:w-52">
              <SelectValue placeholder="نوع العملية" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الأنواع</SelectItem>
              {(Object.keys(TYPE_LABEL) as TxType[]).map((k) => (
                <SelectItem key={k} value={k}>
                  {TYPE_LABEL[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="rounded-2xl border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-right">
                  <th className="p-3 font-semibold">الطالب</th>
                  <th className="p-3 font-semibold">النوع</th>
                  <th className="p-3 font-semibold">القيمة</th>
                  <th className="p-3 font-semibold">الرصيد بعد</th>
                  <th className="p-3 font-semibold">المرجع</th>
                  <th className="p-3 font-semibold">بواسطة</th>
                  <th className="p-3 font-semibold">التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="border-t">
                      <td colSpan={7} className="p-3">
                        <Skeleton className="h-6 w-full" />
                      </td>
                    </tr>
                  ))
                ) : txs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-muted-foreground">
                      <WalletIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      لا توجد عمليات
                    </td>
                  </tr>
                ) : (
                  txs.map((t, idx) => {
                    const isCredit = CREDIT_TYPES.includes(t.type);
                    const isReset = t.type === "admin_reset";
                    const sign = isReset ? "" : isCredit ? "+" : "−";
                    const color = isReset
                      ? "text-foreground"
                      : isCredit
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-rose-600 dark:text-rose-400";
                    return (
                      <motion.tr
                        key={t.id}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: Math.min(idx * 0.015, 0.2) }}
                        className="border-t hover:bg-muted/30"
                      >
                        <td className="p-3">
                          <div className="font-semibold">{t.student_name ?? "—"}</div>
                          <div className="text-xs text-muted-foreground">
                            {t.student_phone ?? "—"}
                          </div>
                        </td>
                        <td className="p-3">
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs bg-muted">
                            {TYPE_LABEL[t.type]}
                          </span>
                        </td>
                        <td className={cn("p-3 font-bold", color)}>
                          {sign}
                          {formatPiastres(t.amount_piastres)}
                        </td>
                        <td className="p-3 font-semibold">
                          {formatPiastres(t.balance_after_piastres)}
                        </td>
                        <td className="p-3 font-mono text-xs">{t.reference_number}</td>
                        <td className="p-3 text-muted-foreground text-xs">
                          {t.performed_by_name ?? (t.type === "card_redemption" ? "الطالب نفسه" : "—")}
                        </td>
                        <td className="p-3 text-muted-foreground text-xs">
                          {new Date(t.created_at).toLocaleString("ar-EG")}
                        </td>
                      </motion.tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Manual amount dialog */}
      <Dialog
        open={actionForm.open}
        onOpenChange={(o) => setActionForm((s) => ({ ...s, open: o }))}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {actionForm.kind === "charge" ? "شحن رصيد" : "خصم رصيد"} —{" "}
              {selectedStudent?.full_name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label>القيمة (جنيه مصري)</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={actionForm.amount}
              onChange={(e) => setActionForm((s) => ({ ...s, amount: e.target.value }))}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionForm({ open: false, kind: null, amount: "" })}>
              إلغاء
            </Button>
            <Button onClick={proceedAction}>متابعة</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <StrongConfirmDialog
        open={!!confirmAction}
        onOpenChange={(o) => !o && setConfirmAction(null)}
        title={confirmAction?.kind === "charge" ? "تأكيد شحن الرصيد" : "تأكيد خصم الرصيد"}
        destructive={confirmAction?.kind === "deduct"}
        confirmLabel={confirmAction?.kind === "charge" ? "شحن" : "خصم"}
        description={
          confirmAction && selectedStudent && selectedBalance !== null ? (
            <>
              <p>
                سيتم {confirmAction.kind === "charge" ? "شحن" : "خصم"}{" "}
                <span className="font-bold text-foreground">
                  {formatPiastres(confirmAction.amountPi)}
                </span>{" "}
                {confirmAction.kind === "charge" ? "إلى" : "من"} محفظة{" "}
                <span className="font-bold text-foreground">{selectedStudent.full_name}</span>.
              </p>
              <p>
                الرصيد الحالي:{" "}
                <span className="font-semibold text-foreground">{formatPiastres(selectedBalance)}</span>
                {" — "}
                الرصيد بعد العملية:{" "}
                <span className="font-semibold text-foreground">
                  {formatPiastres(
                    confirmAction.kind === "charge"
                      ? selectedBalance + confirmAction.amountPi
                      : selectedBalance - confirmAction.amountPi
                  )}
                </span>
              </p>
            </>
          ) : null
        }
        onConfirm={executeAction}
      />

      {/* Bulk dialogs */}
      <Dialog open={bulkForm.open} onOpenChange={(o) => setBulkForm((s) => ({ ...s, open: o }))}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {bulkForm.kind === "charge"
                ? "شحن رصيد لكل المستخدمين"
                : "خصم رصيد من كل المستخدمين"}
            </DialogTitle>
            <DialogDescription>سيتم تطبيق نفس القيمة على كل الطلاب غير المحظورين.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label>القيمة (جنيه مصري)</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={bulkForm.amount}
              onChange={(e) => setBulkForm((s) => ({ ...s, amount: e.target.value }))}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkForm({ open: false, kind: null, amount: "" })}>
              إلغاء
            </Button>
            <Button onClick={proceedBulk}>متابعة</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <StrongConfirmDialog
        open={!!confirmBulk}
        onOpenChange={(o) => !o && setConfirmBulk(null)}
        title={confirmBulk?.kind === "charge" ? "تأكيد الشحن الجماعي" : "تأكيد الخصم الجماعي"}
        destructive
        confirmLabel={confirmBulk?.kind === "charge" ? "تنفيذ الشحن الجماعي" : "تنفيذ الخصم الجماعي"}
        description={
          confirmBulk ? (
            <>
              <p>
                سيتم {confirmBulk.kind === "charge" ? "شحن" : "خصم"}{" "}
                <span className="font-bold text-foreground">{formatPiastres(confirmBulk.amountPi)}</span>{" "}
                {confirmBulk.kind === "charge" ? "لكل" : "من كل"} حساب طالب على المنصة (باستثناء الحسابات المحظورة).
              </p>
              <p className="text-rose-600 dark:text-rose-400 text-xs">
                لا يمكن التراجع عن هذه العملية. سيتم تخطي الحسابات التي{" "}
                {confirmBulk.kind === "charge" ? "يتجاوز رصيدها الحد الأقصى" : "لا يكفي رصيدها"}.
              </p>
            </>
          ) : null
        }
        onConfirm={executeBulk}
      />

      {/* Bulk result summary */}
      <Dialog open={!!bulkResult} onOpenChange={(o) => !o && setBulkResult(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>ملخص العملية الجماعية</DialogTitle>
          </DialogHeader>
          {bulkResult && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border p-3 bg-emerald-500/5 border-emerald-500/30">
                  <div className="text-xs text-muted-foreground">تم بنجاح</div>
                  <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                    {bulkResult.success_count}
                  </div>
                </div>
                <div className="rounded-xl border p-3 bg-amber-500/5 border-amber-500/30">
                  <div className="text-xs text-muted-foreground">تم التخطي</div>
                  <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                    {bulkResult.skipped_count}
                  </div>
                </div>
              </div>
              {bulkResult.skipped_users.length > 0 && (
                <div>
                  <div className="text-sm font-semibold mb-2">الحسابات المتخطاة:</div>
                  <div className="max-h-52 overflow-y-auto rounded-xl border divide-y">
                    {bulkResult.skipped_users.map((u, i) => (
                      <div key={i} className="p-2.5 text-sm flex justify-between">
                        <span>{u.full_name}</span>
                        <span className="text-xs text-muted-foreground">
                          {u.reason === "over_max"
                            ? "الرصيد سيتجاوز الحد الأقصى"
                            : "الرصيد غير كافٍ"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setBulkResult(null)}>حسنًا</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// Page
// ============================================================
export default function AdminWallets() {
  const [tab, setTab] = useState("cards");
  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl sm:text-3xl font-black flex items-center gap-3">
          <WalletIcon className="w-7 h-7 text-primary" />
          إدارة المحافظ والكروت
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          توليد كروت الشحن وإدارة أرصدة المحافظ وسجل العمليات.
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="cards" className="gap-2">
            <Ticket className="w-4 h-4" />
            كروت الشحن
          </TabsTrigger>
          <TabsTrigger value="logs" className="gap-2">
            <WalletIcon className="w-4 h-4" />
            سجل المحافظ
          </TabsTrigger>
        </TabsList>
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="mt-6"
          >
            <TabsContent value="cards">
              {tab === "cards" && <CardsTab />}
            </TabsContent>
            <TabsContent value="logs">
              {tab === "logs" && <WalletLogsTab />}
            </TabsContent>
          </motion.div>
        </AnimatePresence>
      </Tabs>
    </div>
  );
}
