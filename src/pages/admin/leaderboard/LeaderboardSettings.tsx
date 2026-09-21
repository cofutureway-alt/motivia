import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Coins, Info, Save, Loader2, ShoppingCart, Package, Plus, Trash2,
  AlertTriangle, RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { toast } from "sonner";
import {
  usePointsConfig, useSavePointsConfig, EVENT_KEYS, EVENT_LABELS,
  usePurchaseThresholds, useSavePurchaseThresholds, useResetLeaderboard,
} from "@/hooks/useLeaderboard";

export default function LeaderboardSettings() {
  return (
    <Tabs defaultValue="events" dir="rtl">
      <TabsList className="grid grid-cols-3 max-w-2xl">
        <TabsTrigger value="events"><Coins className="w-4 h-4 ml-1" /> نقاط الأحداث</TabsTrigger>
        <TabsTrigger value="thresholds"><ShoppingCart className="w-4 h-4 ml-1" /> عتبات الشراء</TabsTrigger>
        <TabsTrigger value="reset" className="text-destructive"><RotateCcw className="w-4 h-4 ml-1" /> إعادة تعيين</TabsTrigger>
      </TabsList>
      <TabsContent value="events" className="mt-6"><EventPointsTab /></TabsContent>
      <TabsContent value="thresholds" className="mt-6"><ThresholdsTab /></TabsContent>
      <TabsContent value="reset" className="mt-6"><ResetTab /></TabsContent>
    </Tabs>
  );
}

function EventPointsTab() {
  const { data: config } = usePointsConfig();
  const save = useSavePointsConfig();
  const [values, setValues] = useState<Record<string, number>>({});
  const [flash, setFlash] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (config) {
      const v: Record<string, number> = {};
      config.forEach((c: any) => (v[c.event_key] = c.points_value));
      setValues(v);
    }
  }, [config]);

  const handleSave = async () => {
    const changed = EVENT_KEYS.filter((k) => {
      const orig = config?.find((c: any) => c.event_key === k)?.points_value ?? 0;
      return orig !== values[k];
    });
    if (changed.length === 0) return toast.info("لا يوجد تغييرات");
    try {
      await save.mutateAsync(changed.map((k) => ({ event_key: k, points_value: values[k] })));
      const f: Record<string, boolean> = {};
      changed.forEach((k) => (f[k] = true));
      setFlash(f);
      setTimeout(() => setFlash({}), 900);
      toast.success("تم الحفظ");
    } catch (e: any) {
      toast.error(e.message ?? "فشل الحفظ");
    }
  };

  return (
    <Card className="p-6 space-y-5">
      <TooltipProvider>
        <div className="space-y-3">
          {EVENT_KEYS.map((k) => {
            const info = EVENT_LABELS[k];
            return (
              <div key={k} className="flex items-center gap-3 py-2 border-b border-border/40 last:border-0">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button className="text-muted-foreground hover:text-foreground"><Info className="w-4 h-4" /></button>
                  </TooltipTrigger>
                  <TooltipContent><p className="max-w-xs text-xs">{info.hint}</p></TooltipContent>
                </Tooltip>
                <Label className="flex-1 text-right font-medium">{info.label}</Label>
                <motion.div
                  animate={flash[k] ? { backgroundColor: ["hsl(250 90% 65% / 0)", "hsl(250 90% 65% / 0.3)", "hsl(250 90% 65% / 0)"] } : {}}
                  transition={{ duration: 0.9 }}
                  className="rounded-lg"
                >
                  <Input
                    type="number"
                    value={values[k] ?? 0}
                    onChange={(e) => setValues({ ...values, [k]: parseInt(e.target.value || "0", 10) })}
                    className="w-28 text-center font-bold"
                  />
                </motion.div>
                <span className="text-xs text-muted-foreground w-10">نقطة</span>
              </div>
            );
          })}
        </div>
      </TooltipProvider>

      <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground flex gap-2">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        التغييرات تسري على الأحداث المستقبلية فقط. لن تُعاد كتابة سجلات النقاط الماضية.
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={save.isPending} className="bg-indigo-600 hover:bg-indigo-700">
          {save.isPending ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <Save className="w-4 h-4 ml-1" />}
          حفظ
        </Button>
      </div>
    </Card>
  );
}

function ThresholdsTab() {
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <ThresholdList kind="courses" title="عتبات شراء الكورسات" icon={ShoppingCart} />
      <ThresholdList kind="bundles" title="عتبات شراء الباقات" icon={Package} />
      <div className="md:col-span-2 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground flex gap-2">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        عند وصول الطالب لعدد الكورسات/الباقات المشتراة الموضّح، تُمنح النقاط مرة واحدة فقط. الحذف لا يستعيد النقاط المُمنوحة سابقًا.
      </div>
    </div>
  );
}

type Row = { id: string | null; threshold_count: number; points_value: number };

function ThresholdList({ kind, title, icon: Icon }: { kind: "courses" | "bundles"; title: string; icon: any }) {
  const { data } = usePurchaseThresholds(kind);
  const save = useSavePurchaseThresholds();
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    if (data) setRows(data.map((r: any) => ({ id: r.id, threshold_count: r.threshold_count, points_value: r.points_value })));
  }, [data]);

  const addRow = () => setRows([...rows, { id: null, threshold_count: 1, points_value: 0 }]);
  const updateRow = (i: number, patch: Partial<Row>) => setRows(rows.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  const removeRow = (i: number) => setRows(rows.filter((_, idx) => idx !== i));

  const handleSave = async () => {
    // dedupe thresholds
    const seen = new Set<number>();
    for (const r of rows) {
      if (seen.has(r.threshold_count)) return toast.error(`عدد ${r.threshold_count} مكرر`);
      seen.add(r.threshold_count);
      if (r.threshold_count <= 0) return toast.error("العدد يجب أن يكون أكبر من صفر");
    }
    try {
      await save.mutateAsync({ kind, rows });
      toast.success("تم الحفظ");
    } catch (e: any) {
      toast.error(e.message ?? "فشل الحفظ");
    }
  };

  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bold flex items-center gap-2"><Icon className="w-4 h-4 text-indigo-500" /> {title}</h3>
        <Button variant="outline" size="sm" onClick={addRow}><Plus className="w-4 h-4 ml-1" /> عتبة جديدة</Button>
      </div>
      <div className="space-y-2">
        <AnimatePresence initial={false}>
          {rows.map((r, i) => (
            <motion.div
              key={r.id ?? `new-${i}`}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="flex items-center gap-2"
            >
              <div className="flex-1">
                <Label className="text-xs text-muted-foreground">عدد المشتريات</Label>
                <Input type="number" min={1} value={r.threshold_count} onChange={(e) => updateRow(i, { threshold_count: parseInt(e.target.value || "0", 10) })} />
              </div>
              <div className="flex-1">
                <Label className="text-xs text-muted-foreground">النقاط</Label>
                <Input type="number" value={r.points_value} onChange={(e) => updateRow(i, { points_value: parseInt(e.target.value || "0", 10) })} />
              </div>
              <Button variant="ghost" size="icon" className="mt-5" onClick={() => removeRow(i)}>
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            </motion.div>
          ))}
        </AnimatePresence>
        {rows.length === 0 && <div className="text-center text-sm text-muted-foreground py-4">لا توجد عتبات.</div>}
      </div>
      <div className="flex justify-end pt-2">
        <Button onClick={handleSave} disabled={save.isPending} className="bg-indigo-600 hover:bg-indigo-700">
          {save.isPending ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <Save className="w-4 h-4 ml-1" />}
          حفظ
        </Button>
      </div>
    </Card>
  );
}

const CONFIRM_PHRASE = "احذف كل النقاط";

function ResetTab() {
  const reset = useResetLeaderboard();
  const [confirm, setConfirm] = useState("");
  const canReset = confirm.trim() === CONFIRM_PHRASE;

  const handleReset = async () => {
    if (!canReset) return;
    try {
      const rows = await reset.mutateAsync();
      toast.success(`تم حذف نقاط جميع الطلاب بنجاح. (${rows} سجل)`);
      setConfirm("");
    } catch (e: any) {
      toast.error(e.message ?? "فشل التنفيذ");
    }
  };

  return (
    <Card className="p-6 border-destructive/40 bg-destructive/5 space-y-5">
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-xl bg-destructive/15 flex items-center justify-center shrink-0">
          <AlertTriangle className="w-6 h-6 text-destructive" />
        </div>
        <div>
          <h3 className="font-bold text-lg text-destructive">إعادة تعيين نقاط جميع الطلاب</h3>
          <p className="text-sm text-muted-foreground mt-1">
            هذا الإجراء يحذف جميع نقاط الطلاب لكل الوقت ويعيد المستويات إلى نقطة الصفر.
            <br />لا يمكن التراجع عن هذا الإجراء. <span className="font-semibold text-foreground">الشارات المكتسبة لن تُحذف — فقط النقاط والمستويات.</span>
          </p>
        </div>
      </div>

      <div>
        <Label className="text-sm">للتأكيد، اكتب: <span className="font-mono font-bold">{CONFIRM_PHRASE}</span></Label>
        <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} className="mt-2 max-w-md" dir="rtl" />
      </div>

      <motion.div whileHover={canReset ? { x: [0, -3, 3, -3, 3, 0] } : {}} transition={{ duration: 0.4 }}>
        <Button
          variant="destructive"
          disabled={!canReset || reset.isPending}
          onClick={handleReset}
          className="w-full sm:w-auto"
        >
          {reset.isPending ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <RotateCcw className="w-4 h-4 ml-1" />}
          تنفيذ الحذف
        </Button>
      </motion.div>
    </Card>
  );
}
