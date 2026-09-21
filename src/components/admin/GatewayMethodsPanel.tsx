import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  GatewayKey,
  GatewayMethodRow,
  addGatewayMethod,
  deleteGatewayMethod,
  getGatewayIdByKey,
  listGatewayMethods,
  syncFawaterakMethods,
  updateGatewayMethod,
} from "@/lib/gateway-methods";

interface Props {
  gatewayKey: GatewayKey;
}

const FAWATERAK_STALE_HOURS = 24;
const KASHIER_BNPL = new Set(["valu", "souhoola", "aman", "contact"]);

function isStale(row: GatewayMethodRow): boolean {
  if (!row.last_seen_at) return true;
  const seen = new Date(row.last_seen_at).getTime();
  return Date.now() - seen > FAWATERAK_STALE_HOURS * 3600 * 1000;
}

export default function GatewayMethodsPanel({ gatewayKey }: Props) {
  const [gatewayId, setGatewayId] = useState<string | null>(null);
  const [rows, setRows] = useState<GatewayMethodRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [addKey, setAddKey] = useState("");
  const [addName, setAddName] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingDesc, setEditingDesc] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const gid = await getGatewayIdByKey(gatewayKey);
      setGatewayId(gid);
      if (gid) setRows(await listGatewayMethods(gid));
      else setRows([]);
    } catch (e: any) {
      toast.error(e?.message ?? "تعذّر تحميل الطرق");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gatewayKey]);

  const toggle = async (row: GatewayMethodRow, next: boolean) => {
    setBusyId(row.id);
    const prev = row.is_enabled;
    setRows((r) => r.map((x) => (x.id === row.id ? { ...x, is_enabled: next } : x)));
    try {
      await updateGatewayMethod(row.id, { is_enabled: next });
    } catch (e: any) {
      setRows((r) => r.map((x) => (x.id === row.id ? { ...x, is_enabled: prev } : x)));
      toast.error(e?.message ?? "تعذّر التحديث");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (row: GatewayMethodRow) => {
    if (!confirm(`حذف "${row.display_name}" نهائيًا من هذه البوابة؟`)) return;
    setBusyId(row.id);
    try {
      await deleteGatewayMethod(row.id);
      setRows((r) => r.filter((x) => x.id !== row.id));
      toast.success("تم الحذف");
    } catch (e: any) {
      toast.error(e?.message ?? "تعذّر الحذف");
    } finally {
      setBusyId(null);
    }
  };

  const saveRename = async (row: GatewayMethodRow) => {
    const name = editingName.trim();
    const desc = editingDesc.trim();
    if (!name) {
      toast.error("الاسم مطلوب");
      return;
    }
    setBusyId(row.id);
    try {
      await updateGatewayMethod(row.id, { display_name: name, description: desc || null });
      setRows((r) =>
        r.map((x) => (x.id === row.id ? { ...x, display_name: name, description: desc || null } : x)),
      );
      setEditingId(null);
    } catch (e: any) {
      toast.error(e?.message ?? "تعذّر الحفظ");
    } finally {
      setBusyId(null);
    }
  };

  const add = async () => {
    if (!gatewayId) return;
    const k = addKey.trim();
    const n = addName.trim();
    if (!k || !n) {
      toast.error("أدخل المعرّف والاسم");
      return;
    }
    if (rows.some((r) => r.method_key === k)) {
      toast.error("هذا المعرّف مضاف بالفعل");
      return;
    }
    setAdding(true);
    try {
      const created = await addGatewayMethod({
        gatewayId,
        methodKey: k,
        displayName: n,
        orderIndex: rows.length,
      });
      setRows((r) => [...r, created]);
      setAddKey("");
      setAddName("");
      toast.success("تمت الإضافة");
    } catch (e: any) {
      toast.error(e?.message ?? "تعذّر الإضافة");
    } finally {
      setAdding(false);
    }
  };

  const doSync = async () => {
    setSyncing(true);
    try {
      const res = await syncFawaterakMethods();
      toast.success(`تمت المزامنة: ${res.synced} طريقة`);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "تعذّر المزامنة");
    } finally {
      setSyncing(false);
    }
  };

  const enabledCount = rows.filter((r) => r.is_enabled).length;
  const canAddCustom = gatewayKey === "paymob";
  const canSync = gatewayKey === "fawaterak";

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.08 }}
      className="rounded-2xl border border-border bg-card overflow-hidden"
    >
      <div className="p-5 border-b border-border flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="font-bold">طرق الدفع المتاحة</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {gatewayKey === "kashier" &&
              "فعّل أو أوقف كل طريقة من طرق دفع Kashier. المفاتيح ثابتة حسب توثيق Kashier."}
            {gatewayKey === "paymob" &&
              "أضف Integration IDs من لوحة PayMob مع اسم واضح للطالب، وفعّل ما تريد إتاحته."}
            {gatewayKey === "fawaterak" &&
              "طرق الدفع تُدار في حساب فواتيرك. اضغط تحديث القائمة لجلبها، ثم فعّل ما تريد عرضه للطلاب."}
          </div>
        </div>
        {canSync && (
          <Button variant="outline" onClick={doSync} disabled={syncing}>
            {syncing ? (
              <Loader2 className="w-4 h-4 ml-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 ml-2" />
            )}
            تحديث القائمة من فواتيرك
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </div>
      ) : (
        <div className="p-5 space-y-4">
          {enabledCount === 0 && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400"
            >
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                لا توجد طرق دفع مفعّلة لهذه البوابة، لن يتمكن الطلاب من الدفع من خلالها حتى تفعّل طريقة واحدة على الأقل.
              </span>
            </motion.div>
          )}

          <AnimatePresence initial={false}>
            {rows.map((row) => {
              const stale = canSync && isStale(row);
              const editing = editingId === row.id;
              return (
                <motion.div
                  key={row.id}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                  className={cn(
                    "rounded-xl border p-3 flex items-center gap-3 flex-wrap",
                    row.is_enabled
                      ? "border-emerald-500/30 bg-emerald-500/[0.03]"
                      : "border-border bg-accent/30",
                  )}
                >
                  <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    {row.is_enabled ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : (
                      <XCircle className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    {editing ? (
                      <div className="space-y-2 w-full">
                        <Input
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          className="h-8"
                          placeholder="الاسم الظاهر للطالب"
                          autoFocus
                        />
                        <Input
                          value={editingDesc}
                          onChange={(e) => setEditingDesc(e.target.value)}
                          className="h-8"
                          placeholder="وصف قصير (اختياري) — يظهر أسفل الاسم"
                        />
                        <div className="flex items-center gap-2">
                          <Button size="sm" onClick={() => saveRename(row)} disabled={busyId === row.id}>
                            حفظ
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditingId(null)}
                            disabled={busyId === row.id}
                          >
                            إلغاء
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(row.id);
                          setEditingName(row.display_name);
                          setEditingDesc(row.description ?? "");
                        }}
                        className="text-right block w-full"
                      >
                        <div className="font-semibold truncate hover:text-primary transition-colors">
                          {row.display_name}
                        </div>
                        {row.description && (
                          <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                            {row.description}
                          </div>
                        )}
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-mono mt-1 flex-wrap">
                          <span dir="ltr">{row.method_key}</span>
                          {gatewayKey === "kashier" && (
                            <span
                              className={cn(
                                "inline-flex items-center px-1.5 py-0.5 rounded not-italic font-sans text-[10px]",
                                KASHIER_BNPL.has(row.method_key)
                                  ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30"
                                  : "bg-primary/10 text-primary border border-primary/20",
                              )}
                            >
                              {KASHIER_BNPL.has(row.method_key)
                                ? `BNPL — يُرسل كـ bnpl[${row.method_key}]`
                                : "طريقة مباشرة"}
                            </span>
                          )}
                          {stale && (
                            <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 not-italic font-sans">
                              <Clock className="w-3 h-3" />
                              غير متاح حاليًا من فواتيرك
                            </span>
                          )}
                        </div>
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Switch
                      checked={row.is_enabled}
                      onCheckedChange={(v) => toggle(row, v)}
                      disabled={busyId === row.id}
                    />
                    <button
                      type="button"
                      onClick={() => remove(row)}
                      disabled={busyId === row.id}
                      className="w-8 h-8 rounded-lg border border-border text-muted-foreground hover:text-destructive hover:border-destructive/40 flex items-center justify-center transition-colors"
                      aria-label="حذف"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {rows.length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-6 border border-dashed border-border rounded-xl">
              {canSync
                ? "لا توجد طرق. اضغط \"تحديث القائمة من فواتيرك\" لجلبها."
                : canAddCustom
                  ? "لم تُضف أي طريقة دفع بعد."
                  : "لا توجد طرق."}
            </div>
          )}

          {canAddCustom && gatewayId && (
            <motion.div
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="rounded-xl border border-dashed border-border p-3 space-y-2"
            >
              <div className="text-sm font-bold">إضافة طريقة دفع</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <Input
                  dir="ltr"
                  className="font-mono"
                  placeholder="Integration ID (مثال: 123456)"
                  value={addKey}
                  onChange={(e) => setAddKey(e.target.value)}
                />
                <Input
                  placeholder="الاسم الظاهر (مثال: بطاقات فيزا/ماستركارد)"
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                />
              </div>
              <div className="flex justify-end">
                <Button onClick={add} disabled={adding}>
                  {adding ? (
                    <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4 ml-2" />
                  )}
                  إضافة
                </Button>
              </div>
            </motion.div>
          )}
        </div>
      )}
    </motion.section>
  );
}
