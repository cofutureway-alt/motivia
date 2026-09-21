import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Ticket,
  Plus,
  Search,
  Trash2,
  QrCode,
  Download,
  Loader2,
  X,
  Check,
  Copy,
  Sparkles,
  AlertTriangle,
  FileSpreadsheet,
  FileArchive,
  RefreshCw,
  Clock,
  Layers,
  BookOpen,
  Filter,
} from "lucide-react";
import { toast } from "sonner";
import QRCode from "qrcode";
import JSZip from "jszip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
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
import {
  listPurchaseCodes,
  generatePurchaseCodesBatch,
  deletePurchaseCodes,
  deleteUsedPurchaseCodes,
  deleteExpiredPurchaseCodes,
  type PurchaseCodeRow,
  type CharsetConfig,
} from "@/lib/admin-purchase-codes-api";
import { supabase } from "@/integrations/supabase/client";

// ─────────────────────────────────────────────────────────────────────────────
// Status Badge Component
// ─────────────────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: PurchaseCodeRow["status"] }) {
  if (status === "active") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-300/40">
        <Check className="w-3 h-3" />
        نشط
      </span>
    );
  }
  if (status === "used_up") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-300/40">
        <RefreshCw className="w-3 h-3" />
        مستنفد
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-300/40">
      <Clock className="w-3 h-3" />
      منتهي الصلاحية
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page Component
// ─────────────────────────────────────────────────────────────────────────────

export default function AdminPurchaseCodes() {
  // ── State ──────────────────────────────────────────────────────────────────
  const [rows, setRows]               = useState<PurchaseCodeRow[]>([]);
  const [total, setTotal]             = useState(0);
  const [page, setPage]               = useState(0);
  const [loading, setLoading]         = useState(true);
  const [activeTab, setActiveTab]     = useState<string>("all");
  const [search, setSearch]           = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busy, setBusy]               = useState(false);

  // Modal States
  const [generateOpen, setGenerateOpen] = useState(false);
  const [exportOpen, setExportOpen]     = useState(false);
  const [singleQr, setSingleQr]         = useState<{ code: string; url: string; dataUrl: string } | null>(null);
  const [confirm, setConfirm]           = useState<null | {
    kind: "delete_selected" | "delete_used" | "delete_expired" | "delete_single";
    id?: string;
  }>(null);

  // Search debounce
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setPage(0); }, [activeTab, debouncedSearch]);

  // Load data
  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    listPurchaseCodes({
      search: debouncedSearch || undefined,
      status: activeTab === "all" ? undefined : activeTab,
      limit: 50,
      offset: page * 50,
    })
      .then((data) => {
        if (cancelled) return;
        setRows(data);
        setTotal(data[0]?.total_count ?? 0);
      })
      .catch((e) => {
        if (!cancelled) {
          toast.error(e?.message || "تعذّر تحميل أكواد الشراء");
          setRows([]);
          setTotal(0);
        }
      })
      .finally(() => !cancelled && setLoading(false));

    return () => { cancelled = true; };
  }, [activeTab, debouncedSearch, page]);

  useEffect(() => { load(); }, [load]);

  const reload = () => {
    setSelectedIds(new Set());
    load();
  };

  // Bulk selections
  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelectedIds((prev) =>
      prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.id))
    );
  };

  // Actions
  const handleDoDelete = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      if (confirm.kind === "delete_single" && confirm.id) {
        await deletePurchaseCodes([confirm.id]);
        toast.success("تم حذف الكود بنجاح");
      } else if (confirm.kind === "delete_selected") {
        await deletePurchaseCodes(Array.from(selectedIds));
        toast.success(`تم حذف ${selectedIds.size} كود بنجاح`);
      } else if (confirm.kind === "delete_used") {
        const deletedCount = await deleteUsedPurchaseCodes();
        toast.success(`تم حذف ${deletedCount} كود مستنفد`);
      } else if (confirm.kind === "delete_expired") {
        const deletedCount = await deleteExpiredPurchaseCodes();
        toast.success(`تم حذف ${deletedCount} كود منتهي الصلاحية`);
      }
      reload();
    } catch (e: any) {
      toast.error(e?.message || "فشلت عملية الحذف");
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const openQrModal = async (code: string) => {
    const origin = window.location.origin;
    const url = `${origin}/redeem/${code}`;
    try {
      const dataUrl = await QRCode.toDataURL(url, { width: 300, margin: 2 });
      setSingleQr({ code, url, dataUrl });
    } catch {
      toast.error("تعذّر إنشاء كود QR");
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success("تم نسخ الكود");
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6" dir="rtl">
      {/* ── Header ── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-center justify-between gap-4"
      >
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
            <Ticket className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-black">إدارة أكواد الشراء</h1>
            <p className="text-xs md:text-sm text-muted-foreground">
              توليد، تصدير، وتتبّع أكواد تفعيل الكورسات والباقات مجانًا.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={() => setExportOpen(true)}
            className="gap-2 text-xs border-primary/30 text-primary hover:bg-primary/5"
          >
            <Download className="w-4 h-4" />
            تصدير الأكواد (CSV / QR)
          </Button>

          <Button onClick={() => setGenerateOpen(true)} className="gap-2 shadow-md text-xs">
            <Plus className="w-4 h-4" />
            إنشاء أكواد جديدة
          </Button>
        </div>
      </motion.div>

      {/* ── Tabs & Quick Cleanups ── */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-center justify-between gap-3"
      >
        {/* Status Tabs */}
        <div className="flex gap-1 bg-secondary/50 rounded-2xl p-1.5 w-fit">
          {[
            { id: "all",      label: "الكل" },
            { id: "active",   label: "نشط" },
            { id: "used_up",  label: "مستنفد" },
            { id: "expired",  label: "منتهي الصلاحية" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
                activeTab === tab.id
                  ? "text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {activeTab === tab.id && (
                <motion.span
                  layoutId="code-tab-bg"
                  className="absolute inset-0 rounded-xl bg-primary"
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                />
              )}
              <span className="relative z-10">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Quick Cleanup Actions */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfirm({ kind: "delete_used" })}
            className="gap-1.5 text-amber-600 hover:text-amber-700 hover:bg-amber-500/10 text-xs"
          >
            <Trash2 className="w-3.5 h-3.5" />
            حذف كل الأكواد المستخدمة
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfirm({ kind: "delete_expired" })}
            className="gap-1.5 text-rose-600 hover:text-rose-700 hover:bg-rose-500/10 text-xs"
          >
            <Trash2 className="w-3.5 h-3.5" />
            حذف كل الأكواد منتهية الصلاحية
          </Button>
        </div>
      </motion.div>

      {/* ── Search Input ── */}
      <div className="relative max-w-md">
        <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث بالكود أو اسم الدورة/الباقة..."
          className="pr-10 text-xs"
          dir="rtl"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* ── Bulk Actions Bar ── */}
      <AnimatePresence>
        {selectedIds.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="flex items-center justify-between rounded-2xl border border-primary/30 bg-primary/5 p-3 px-4"
          >
            <div className="text-xs font-semibold text-foreground">
              تم تحديد {selectedIds.size} كود
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setConfirm({ kind: "delete_selected" })}
                className="gap-1.5 text-xs"
              >
                <Trash2 className="w-3.5 h-3.5" />
                حذف المحدد
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())} className="text-xs">
                إلغاء
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Table ── */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr className="text-right">
                <th className="py-3 px-4 w-10">
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-primary cursor-pointer"
                    checked={rows.length > 0 && selectedIds.size === rows.length}
                    ref={(el) => {
                      if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < rows.length;
                    }}
                    onChange={toggleAll}
                  />
                </th>
                <th className="py-3 px-4 font-bold">الكود</th>
                <th className="py-3 px-4 font-bold">الهدف (الكورس/الباقة)</th>
                <th className="py-3 px-4 font-bold">الاستخدام</th>
                <th className="py-3 px-4 font-bold">الحالة</th>
                <th className="py-3 px-4 font-bold hidden md:table-cell">تاريخ الانتهاء</th>
                <th className="py-3 px-4 font-bold text-left">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-t border-border/60">
                    <td className="p-4"><Skeleton className="h-4 w-4" /></td>
                    <td className="p-4"><Skeleton className="h-5 w-24" /></td>
                    <td className="p-4"><Skeleton className="h-5 w-40" /></td>
                    <td className="p-4"><Skeleton className="h-4 w-16" /></td>
                    <td className="p-4"><Skeleton className="h-5 w-16" /></td>
                    <td className="p-4 hidden md:table-cell"><Skeleton className="h-4 w-24" /></td>
                    <td className="p-4"><Skeleton className="h-8 w-16 ml-auto" /></td>
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-muted-foreground">
                    <Ticket className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <div>لا توجد أكواد مطابقة</div>
                  </td>
                </tr>
              ) : (
                <AnimatePresence initial={false}>
                  {rows.map((r, i) => (
                    <motion.tr
                      key={r.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ delay: i * 0.015 }}
                      className="border-t border-border/60 hover:bg-accent/30 transition-colors"
                    >
                      <td className="p-3 px-4">
                        <input
                          type="checkbox"
                          className="w-4 h-4 accent-primary cursor-pointer"
                          checked={selectedIds.has(r.id)}
                          onChange={() => toggleOne(r.id)}
                        />
                      </td>

                      {/* Code */}
                      <td className="p-3 px-4">
                        <div className="flex items-center gap-1.5 font-mono font-bold text-sm text-foreground">
                          <span>{r.code}</span>
                          <button
                            onClick={() => copyCode(r.code)}
                            className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                            title="نسخ الكود"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>

                      {/* Target */}
                      <td className="p-3 px-4">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={r.target_type === "bundle" ? "secondary" : "outline"}
                            className="text-[10px] shrink-0"
                          >
                            {r.target_type === "bundle" ? "باقة" : "كورس"}
                          </Badge>
                          <span className="font-semibold truncate max-w-[200px]" title={r.target_title}>
                            {r.target_title}
                          </span>
                        </div>
                      </td>

                      {/* Usage */}
                      <td className="p-3 px-4">
                        <div className="space-y-1 w-24">
                          <div className="flex justify-between text-[11px] font-mono">
                            <span>{r.use_count}</span>
                            <span className="text-muted-foreground">/ {r.max_uses}</span>
                          </div>
                          <Progress value={Math.min(100, (r.use_count / r.max_uses) * 100)} className="h-1.5" />
                        </div>
                      </td>

                      {/* Status */}
                      <td className="p-3 px-4">
                        <StatusBadge status={r.status} />
                      </td>

                      {/* Expiry */}
                      <td className="p-3 px-4 hidden md:table-cell text-muted-foreground">
                        {r.expires_at ? (
                          new Date(r.expires_at).toLocaleDateString("ar-EG", {
                            year: "numeric", month: "short", day: "numeric",
                          })
                        ) : (
                          <span className="text-muted-foreground/60">بدون تاريخ انتهاء</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="p-3 px-4">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openQrModal(r.code)}
                            title="رمز QR"
                          >
                            <QrCode className="w-4 h-4 text-primary" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setConfirm({ kind: "delete_single", id: r.id })}
                            className="text-destructive hover:text-destructive"
                            title="حذف"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Generate Batch Modal ── */}
      <GenerateBatchModal
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        onGenerated={reload}
      />

      {/* ── Export Codes Modal (Targeted CSV & QR ZIP) ── */}
      <ExportCodesModal
        open={exportOpen}
        onOpenChange={setExportOpen}
      />

      {/* ── Single QR Modal ── */}
      <Dialog open={!!singleQr} onOpenChange={(o) => !o && setSingleQr(null)}>
        <DialogContent className="sm:max-w-sm text-center" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-center gap-2 text-center">
              <QrCode className="w-5 h-5 text-primary" />
              رمز QR للكود: <span className="font-mono text-primary">{singleQr?.code}</span>
            </DialogTitle>
          </DialogHeader>

          {singleQr && (
            <div className="py-4 space-y-4 flex flex-col items-center">
              <div className="p-4 bg-white rounded-2xl shadow-inner border border-border">
                <img src={singleQr.dataUrl} alt={`QR Code ${singleQr.code}`} className="w-48 h-48 object-contain" />
              </div>
              <div className="text-xs text-muted-foreground font-mono bg-secondary/50 p-2 rounded-xl w-full break-all">
                {singleQr.url}
              </div>
              <Button
                asChild
                className="w-full gap-2"
                onClick={() => {
                  const a = document.createElement("a");
                  a.href = singleQr.dataUrl;
                  a.download = `QR-${singleQr.code}.png`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                }}
              >
                <a href={singleQr.dataUrl} download={`QR-${singleQr.code}.png`}>
                  <Download className="w-4 h-4" />
                  تنزيل صورة QR
                </a>
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Confirm AlertDialog ── */}
      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-right flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              تأكيد عملية الحذف
            </AlertDialogTitle>
            <AlertDialogDescription className="text-right">
              {confirm?.kind === "delete_single" && "هل أنت تأكد من حذف هذا الكود نهائياً؟"}
              {confirm?.kind === "delete_selected" && `هل أنت تأكد من حذف ${selectedIds.size} كود محدد نهائياً؟`}
              {confirm?.kind === "delete_used" && "سيتم حذف كل الأكواد التي استُنفد حد استخدامها بالكامل. لا يمكن التراجع."}
              {confirm?.kind === "delete_expired" && "سيتم حذف كل الأكواد المنتهي تاريخ صلاحيتها. لا يمكن التراجع."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              className="bg-destructive hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                handleDoDelete();
              }}
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "تأكيد الحذف"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Export Codes Modal (Targeted CSV & QR ZIP Download)
// ─────────────────────────────────────────────────────────────────────────────

function ExportCodesModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [targetKind, setTargetKind]         = useState<"all" | "course" | "bundle">("all");
  const [coursesList, setCoursesList]       = useState<{ id: string; title: string }[]>([]);
  const [bundlesList, setBundlesList]       = useState<{ id: string; title: string }[]>([]);
  const [selectedTargetId, setSelectedTargetId] = useState("");
  const [statusFilter, setStatusFilter]     = useState<"active" | "all">("active");
  const [quantity, setQuantity]             = useState<number>(50);

  const [loadingTargets, setLoadingTargets] = useState(false);
  const [exporting, setExporting]           = useState(false);
  const [zipProgress, setZipProgress]       = useState(0);

  useEffect(() => {
    if (!open) return;
    setLoadingTargets(true);
    Promise.all([
      (supabase as any).from("courses").select("id, title").eq("status", "published").order("title"),
      (supabase as any).from("bundles").select("id, title").eq("status", "published").order("title"),
    ]).then(([{ data: cData }, { data: bData }]) => {
      const c = (cData ?? []) as { id: string; title: string }[];
      const b = (bData ?? []) as { id: string; title: string }[];
      setCoursesList(c);
      setBundlesList(b);
      setLoadingTargets(false);
    });
  }, [open]);

  useEffect(() => {
    if (targetKind === "course" && coursesList.length) setSelectedTargetId(coursesList[0].id);
    if (targetKind === "bundle" && bundlesList.length) setSelectedTargetId(bundlesList[0].id);
    if (targetKind === "all") setSelectedTargetId("");
  }, [targetKind, coursesList, bundlesList]);

  const fetchCodesForExport = async () => {
    let query = (supabase as any)
      .from("purchase_codes")
      .select("id, code, target_type, target_id, max_uses, use_count, expires_at, created_at, updated_at")
      .order("created_at", { ascending: false });

    if (targetKind !== "all" && selectedTargetId) {
      query = query.eq("target_type", targetKind).eq("target_id", selectedTargetId);
    } else if (targetKind !== "all" && !selectedTargetId) {
      query = query.eq("target_type", targetKind);
    }

    if (quantity > 0) {
      query = query.limit(quantity * 3); // fetch enough rows before status filtering
    }

    const { data, error } = await query;
    if (error) throw error;
    const rawCodes = data ?? [];

    const filtered = rawCodes.filter((c: any) => {
      const isUsedUp = c.use_count >= c.max_uses;
      const isExpired = c.expires_at && new Date(c.expires_at) < new Date();
      const status = isUsedUp ? "used_up" : isExpired ? "expired" : "active";
      return statusFilter === "all" ? true : status === "active";
    });

    const sliced = quantity > 0 ? filtered.slice(0, quantity) : filtered;

    const coursesMap = new Map(coursesList.map((c) => [c.id, c.title]));
    const bundlesMap = new Map(bundlesList.map((b) => [b.id, b.title]));

    return sliced.map((c: any) => ({
      code: c.code,
      target_type: c.target_type,
      target_title:
        c.target_type === "course"
          ? coursesMap.get(c.target_id) || "دورة تعليمية"
          : bundlesMap.get(c.target_id) || "باقة تعليمية",
      max_uses: c.max_uses,
      use_count: c.use_count,
      status: c.use_count >= c.max_uses ? "مستنفد" : c.expires_at && new Date(c.expires_at) < new Date() ? "منتهي الصلاحية" : "نشط",
      expires_at: c.expires_at,
      created_at: c.created_at,
    }));
  };

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const codes = await fetchCodesForExport();
      if (!codes.length) {
        toast.error("لا توجد أكواد مطابقة للشروط المحددة للتصدير");
        return;
      }

      const headers = ["الكود", "نوع الهدف", "اسم الهدف", "حد الاستخدام", "المستخدم", "الحالة", "تاريخ الانتهاء", "تاريخ الإنشاء"];
      const escape = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const rows = codes.map((c: any) =>
        [
          c.code,
          c.target_type === "bundle" ? "باقة" : "كورس",
          c.target_title,
          c.max_uses,
          c.use_count,
          c.status,
          c.expires_at ? new Date(c.expires_at).toISOString().slice(0, 10) : "بدون تاريخ",
          c.created_at ? new Date(c.created_at).toISOString().slice(0, 10) : "—",
        ]
          .map(escape)
          .join(",")
      );

      const csvContent = "\uFEFF" + [headers.map(escape).join(","), ...rows].join("\r\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const nowIso = new Date().toISOString().slice(0, 10);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `purchase-codes-${nowIso}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(`تم تصدير ${codes.length} كود إلى ملف CSV`);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "فشلت عملية تصدير CSV");
    } finally {
      setExporting(false);
    }
  };

  const handleExportQrZip = async () => {
    setExporting(true);
    setZipProgress(0);
    try {
      const codes = await fetchCodesForExport();
      if (!codes.length) {
        toast.error("لا توجد أكواد مطابقة للشروط المحددة للتصدير");
        return;
      }

      const zip = new JSZip();
      const folder = zip.folder("qr-codes");
      const origin = window.location.origin;
      const totalCodes = codes.length;

      for (let i = 0; i < totalCodes; i++) {
        const item = codes[i];
        const redeemUrl = `${origin}/redeem/${item.code}`;
        const dataUrl = await QRCode.toDataURL(redeemUrl, { width: 300, margin: 2 });
        const base64Data = dataUrl.replace(/^data:image\/png;base64,/, "");

        folder?.file(`${item.code}.png`, base64Data, { base64: true });
        setZipProgress(Math.round(((i + 1) / totalCodes) * 100));
      }

      const content = await zip.generateAsync({ type: "blob" });
      const nowIso = new Date().toISOString().slice(0, 10);
      const url = URL.createObjectURL(content);
      const a = document.createElement("a");
      a.href = url;
      a.download = `QR-Codes-${nowIso}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(`تم تنزيل ${totalCodes} رمز QR في ملف ZIP`);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "فشلت عملية تنزيل QR ZIP");
    } finally {
      setExporting(false);
      setZipProgress(0);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-right">
            <Download className="w-5 h-5 text-primary" />
            تصدير أكواد الشراء وتنزيل QR
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Target Filter */}
          <div className="space-y-2">
            <Label className="text-xs font-bold">تخصيص الهدف (الكورس / الباقة)</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={targetKind === "all" ? "default" : "outline"}
                onClick={() => setTargetKind("all")}
                className="flex-1 text-xs"
              >
                الكل
              </Button>
              <Button
                type="button"
                size="sm"
                variant={targetKind === "course" ? "default" : "outline"}
                onClick={() => setTargetKind("course")}
                className="flex-1 gap-1 text-xs"
              >
                <BookOpen className="w-3.5 h-3.5" />
                دورة
              </Button>
              <Button
                type="button"
                size="sm"
                variant={targetKind === "bundle" ? "default" : "outline"}
                onClick={() => setTargetKind("bundle")}
                className="flex-1 gap-1 text-xs"
              >
                <Layers className="w-3.5 h-3.5" />
                باقة
              </Button>
            </div>

            {targetKind !== "all" && (
              loadingTargets ? (
                <Skeleton className="h-9 rounded-lg" />
              ) : (
                <select
                  value={selectedTargetId}
                  onChange={(e) => setSelectedTargetId(e.target.value)}
                  className="w-full h-9 rounded-lg border border-input bg-background px-3 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                  dir="rtl"
                >
                  {(targetKind === "course" ? coursesList : bundlesList).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </select>
              )
            )}
          </div>

          {/* Status Filter */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold">حالة الأكواد المراد تصديرها</Label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "active" | "all")}
              className="w-full h-9 rounded-lg border border-input bg-background px-3 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
              dir="rtl"
            >
              <option value="active">الأكواد النشطة فقط (المتاحة للشراء)</option>
              <option value="all">كل الأكواد (النشطة، المستنفدة، والمنتهية)</option>
            </select>
          </div>

          {/* Quantity Selector */}
          <div className="space-y-1.5">
            <Label htmlFor="export-qty" className="text-xs font-bold">عدد الأكواد المراد تصديرها</Label>
            <Input
              id="export-qty"
              type="number"
              min={1}
              max={1000}
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
              className="text-xs"
              dir="ltr"
            />
            <p className="text-[11px] text-muted-foreground">
              حدد العدد المطلوب لتصديره، أو أدخل 0 لتصدير كل الأكواد المطابقة.
            </p>
          </div>

          {/* Export Buttons */}
          <div className="space-y-2 pt-3 border-t border-border">
            <Button
              onClick={handleExportCsv}
              disabled={exporting}
              variant="outline"
              className="w-full gap-2 text-xs"
            >
              {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4 text-emerald-600" />}
              تنزيل ملف CSV
            </Button>

            <Button
              onClick={handleExportQrZip}
              disabled={exporting}
              className="w-full gap-2 text-xs"
            >
              {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileArchive className="w-4 h-4" />}
              {exporting && zipProgress > 0 ? `جارٍ تجهيز رموز QR (${zipProgress}%)` : "تنزيل رموز QR (ZIP)"}
            </Button>

            {exporting && zipProgress > 0 && <Progress value={zipProgress} className="h-2" />}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Generate Batch Modal Component
// ─────────────────────────────────────────────────────────────────────────────

function GenerateBatchModal({
  open,
  onOpenChange,
  onGenerated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onGenerated: () => void;
}) {
  const [step, setStep] = useState<"form" | "result">("form");
  const [targetType, setTargetType] = useState<"course" | "bundle">("course");
  const [coursesList, setCoursesList] = useState<{ id: string; title: string }[]>([]);
  const [bundlesList, setBundlesList] = useState<{ id: string; title: string }[]>([]);
  const [loadingTargets, setLoadingTargets] = useState(false);

  // Form State
  const [quantity, setQuantity]   = useState(10);
  const [codeLength, setCodeLength] = useState(8);
  const [maxUses, setMaxUses]     = useState(1);
  const [expiresAt, setExpiresAt] = useState("");
  const [selectedTargetId, setSelectedTargetId] = useState("");

  // Charset Checkboxes
  const [charsetConfig, setCharsetConfig] = useState<CharsetConfig>({
    digitsOnly: true,
    digitsAndSymbols: false,
    digitsLettersSymbols: false,
  });

  const [generating, setGenerating] = useState(false);
  const [zipping, setZipping]       = useState(false);
  const [zipProgress, setZipProgress] = useState(0);

  const [createdBatch, setCreatedBatch] = useState<{
    batch_id: string;
    codes: { code: string; target_title: string; max_uses: number; expires_at: string | null }[];
  } | null>(null);

  // Load published courses & bundles
  useEffect(() => {
    if (!open) return;
    setStep("form");
    setCreatedBatch(null);
    setLoadingTargets(true);

    Promise.all([
      (supabase as any).from("courses").select("id, title").eq("status", "published").order("title"),
      (supabase as any).from("bundles").select("id, title").eq("status", "published").order("title"),
    ]).then(([{ data: cData }, { data: bData }]) => {
      const c = (cData ?? []) as { id: string; title: string }[];
      const b = (bData ?? []) as { id: string; title: string }[];
      setCoursesList(c);
      setBundlesList(b);
      if (targetType === "course" && c.length) setSelectedTargetId(c[0].id);
      if (targetType === "bundle" && b.length) setSelectedTargetId(b[0].id);
      setLoadingTargets(false);
    });
  }, [open]);

  useEffect(() => {
    if (targetType === "course" && coursesList.length) setSelectedTargetId(coursesList[0].id);
    if (targetType === "bundle" && bundlesList.length) setSelectedTargetId(bundlesList[0].id);
  }, [targetType, coursesList, bundlesList]);

  // Checkbox toggle logic
  const handleCharsetToggle = (key: keyof CharsetConfig) => {
    setCharsetConfig((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      if (!next.digitsOnly && !next.digitsAndSymbols && !next.digitsLettersSymbols) {
        next.digitsOnly = true;
      }
      return next;
    });
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTargetId) {
      toast.error("يرجى اختيار الدورة أو الباقة الموجه لها الكود");
      return;
    }

    const currentList = targetType === "course" ? coursesList : bundlesList;
    const targetObj = currentList.find((t) => t.id === selectedTargetId);
    if (!targetObj) return;

    setGenerating(true);
    try {
      const res = await generatePurchaseCodesBatch({
        quantity,
        codeLength,
        charsetConfig,
        target_type: targetType,
        target_id: selectedTargetId,
        target_title: targetObj.title,
        max_uses: maxUses,
        expires_at: expiresAt || null,
      });

      setCreatedBatch(res);
      setStep("result");
      onGenerated();
      toast.success(`تم إنشاء ${res.codes.length} كود بنجاح`);
    } catch (err: any) {
      toast.error(err?.message || "فشلت عملية توليد الأكواد");
    } finally {
      setGenerating(false);
    }
  };

  // Download CSV
  const downloadCsv = () => {
    if (!createdBatch) return;
    const header = ["الكود", "الهدف", "حد الاستخدام", "المستخدم", "الحالة", "تاريخ الانتهاء", "تاريخ الإنشاء"];
    const nowIso = new Date().toISOString().slice(0, 10);

    const escape = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = createdBatch.codes.map((c) =>
      [
        c.code,
        c.target_title,
        c.max_uses,
        0,
        "نشط",
        c.expires_at ? new Date(c.expires_at).toISOString().slice(0, 10) : "بدون تاريخ",
        nowIso,
      ]
        .map(escape)
        .join(",")
    );

    const csvContent = "\uFEFF" + [header.map(escape).join(","), ...lines].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `purchase-codes-batch-${nowIso}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Download QR Codes ZIP
  const downloadQrZip = async () => {
    if (!createdBatch) return;
    setZipping(true);
    setZipProgress(0);

    try {
      const zip = new JSZip();
      const folder = zip.folder("qr-codes");
      const origin = window.location.origin;
      const totalCodes = createdBatch.codes.length;

      for (let i = 0; i < totalCodes; i++) {
        const item = createdBatch.codes[i];
        const redeemUrl = `${origin}/redeem/${item.code}`;
        const dataUrl = await QRCode.toDataURL(redeemUrl, { width: 300, margin: 2 });
        const base64Data = dataUrl.replace(/^data:image\/png;base64,/, "");

        folder?.file(`${item.code}.png`, base64Data, { base64: true });
        setZipProgress(Math.round(((i + 1) / totalCodes) * 100));
      }

      const content = await zip.generateAsync({ type: "blob" });
      const nowIso = new Date().toISOString().slice(0, 10);
      const url = URL.createObjectURL(content);
      const a = document.createElement("a");
      a.href = url;
      a.download = `QR-Codes-${nowIso}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("تم تنزيل أرشيف ZIP بنجاح");
    } catch (e: any) {
      toast.error(e?.message || "تعذّر تنزيل ملف ZIP");
    } finally {
      setZipping(false);
      setZipProgress(0);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-right">
            <Sparkles className="w-5 h-5 text-primary" />
            {step === "form" ? "إنشاء أكواد شراء جديدة" : "تم توليد دفعة الأكواد"}
          </DialogTitle>
        </DialogHeader>

        {step === "form" ? (
          <form onSubmit={handleGenerate} className="space-y-4 mt-2">
            {/* Target Selector */}
            <div className="space-y-2">
              <Label className="text-xs font-bold">الهدف (الدورة أو الباقة)</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={targetType === "course" ? "default" : "outline"}
                  onClick={() => setTargetType("course")}
                  className="flex-1 gap-1.5 text-xs"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  دورة منشورة
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={targetType === "bundle" ? "default" : "outline"}
                  onClick={() => setTargetType("bundle")}
                  className="flex-1 gap-1.5 text-xs"
                >
                  <Layers className="w-3.5 h-3.5" />
                  باقة منشورة
                </Button>
              </div>

              {loadingTargets ? (
                <Skeleton className="h-9 rounded-lg" />
              ) : (
                <select
                  value={selectedTargetId}
                  onChange={(e) => setSelectedTargetId(e.target.value)}
                  className="w-full h-9 rounded-lg border border-input bg-background px-3 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                  dir="rtl"
                >
                  {(targetType === "course" ? coursesList : bundlesList).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Quantity and Code Length */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="code-qty" className="text-xs font-bold">عدد الأكواد (1-500)</Label>
                <Input
                  id="code-qty"
                  type="number"
                  min={1}
                  max={500}
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                  className="text-xs"
                  dir="ltr"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="code-len" className="text-xs font-bold">طول الكود (4-20)</Label>
                <Input
                  id="code-len"
                  type="number"
                  min={4}
                  max={20}
                  value={codeLength}
                  onChange={(e) => setCodeLength(Number(e.target.value))}
                  className="text-xs"
                  dir="ltr"
                />
              </div>
            </div>

            {/* Character Set Checkboxes */}
            <div className="space-y-2 rounded-xl bg-secondary/40 p-3 border border-border">
              <Label className="text-xs font-bold block mb-1">نوع رموز الكود (يمكن دمج الخيارات)</Label>

              <div className="space-y-2">
                <div className="flex items-center space-x-2 space-x-reverse">
                  <Checkbox
                    id="cb-digits"
                    checked={charsetConfig.digitsOnly}
                    onCheckedChange={() => handleCharsetToggle("digitsOnly")}
                  />
                  <label htmlFor="cb-digits" className="text-xs font-medium cursor-pointer">
                    أرقام فقط (0–9)
                  </label>
                </div>

                <div className="flex items-center space-x-2 space-x-reverse">
                  <Checkbox
                    id="cb-symbols"
                    checked={charsetConfig.digitsAndSymbols}
                    onCheckedChange={() => handleCharsetToggle("digitsAndSymbols")}
                  />
                  <label htmlFor="cb-symbols" className="text-xs font-medium cursor-pointer">
                    أرقام ورموز (0–9 و - _)
                  </label>
                </div>

                <div className="flex items-center space-x-2 space-x-reverse">
                  <Checkbox
                    id="cb-all"
                    checked={charsetConfig.digitsLettersSymbols}
                    onCheckedChange={() => handleCharsetToggle("digitsLettersSymbols")}
                  />
                  <label htmlFor="cb-all" className="text-xs font-medium cursor-pointer">
                    أرقام وحروف ورموز (0–9 و A-Z و - _)
                  </label>
                </div>
              </div>
            </div>

            {/* Usage limit and Expiry Date */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="code-maxuses" className="text-xs font-bold">حد الاستخدام لكل كود</Label>
                <Input
                  id="code-maxuses"
                  type="number"
                  min={1}
                  value={maxUses}
                  onChange={(e) => setMaxUses(Number(e.target.value))}
                  className="text-xs"
                  dir="ltr"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="code-expires" className="text-xs font-bold">تاريخ الانتهاء (اختياري)</Label>
                <Input
                  id="code-expires"
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  className="text-xs"
                  dir="ltr"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2 justify-end">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={generating}>
                إلغاء
              </Button>
              <Button type="submit" disabled={generating} className="gap-2">
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {generating ? "جارٍ التوليد…" : "توليد الأكواد"}
              </Button>
            </div>
          </form>
        ) : (
          <div className="space-y-5 py-2 text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center mx-auto">
              <Check className="w-7 h-7" />
            </div>
            <div>
              <div className="font-bold text-lg">تم إنشاء {createdBatch?.codes.length} كود بنجاح</div>
              <p className="text-xs text-muted-foreground mt-1">
                الأكواد جاهزة الآن للاستخدام والتصدير والتنزيل كرموز QR.
              </p>
            </div>

            <div className="space-y-2">
              <Button onClick={downloadCsv} className="w-full gap-2" variant="outline">
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                تنزيل ملف CSV
              </Button>

              <Button onClick={downloadQrZip} disabled={zipping} className="w-full gap-2">
                {zipping ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileArchive className="w-4 h-4" />}
                {zipping ? `جارٍ تجهيز ملف ZIP (${zipProgress}%)` : "تنزيل رموز QR (ZIP)"}
              </Button>

              {zipping && <Progress value={zipProgress} className="h-2" />}
            </div>

            <div className="pt-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)} className="w-full text-xs">
                إغلاق
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
