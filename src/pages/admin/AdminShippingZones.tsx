import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Truck, Plus, RotateCcw, Trash2, Save, Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatPiastres, parseEgpToPiastres, piastresToEgpNumber } from "@/lib/money";
import { getEffectiveShippingPrice } from "@/lib/shipping";

interface Zone {
  id: string;
  name: string;
  is_governorate: boolean;
  shipping_price_piastres: number | null;
}

export default function AdminShippingZones() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [defaultPrice, setDefaultPrice] = useState<number>(5000);
  const [defaultDraft, setDefaultDraft] = useState<string>("50");
  const [savingDefault, setSavingDefault] = useState(false);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [creating, setCreating] = useState(false);
  const [toDelete, setToDelete] = useState<Zone | null>(null);

  const load = async () => {
    setLoading(true);
    const [{ data: zs }, { data: st }] = await Promise.all([
      (supabase as any).from("shipping_zones").select("*").order("is_governorate", { ascending: false }).order("name"),
      (supabase as any).from("shipping_settings").select("*").eq("id", 1).maybeSingle(),
    ]);
    setZones((zs as Zone[]) ?? []);
    const d = (st as any)?.default_shipping_price_piastres ?? 5000;
    setDefaultPrice(d);
    setDefaultDraft(piastresToEgpNumber(d));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const stats = useMemo(() => {
    const overridden = zones.filter((z) => z.shipping_price_piastres !== null).length;
    return { total: zones.length, gov: zones.filter((z) => z.is_governorate).length, custom: zones.filter((z) => !z.is_governorate).length, overridden };
  }, [zones]);

  const saveDefault = async () => {
    const p = parseEgpToPiastres(defaultDraft);
    if (p === null) {
      toast.error("سعر غير صالح");
      return;
    }
    setSavingDefault(true);
    const { error } = await (supabase as any).from("shipping_settings").update({ default_shipping_price_piastres: p }).eq("id", 1);
    setSavingDefault(false);
    if (error) {
      toast.error("تعذّر الحفظ");
      return;
    }
    setDefaultPrice(p);
    toast.success("تم حفظ السعر الافتراضي");
  };

  const setZoneDraft = (id: string, v: string) => setDrafts((d) => ({ ...d, [id]: v }));

  const saveZone = async (z: Zone) => {
    const raw = drafts[z.id] ?? (z.shipping_price_piastres !== null ? piastresToEgpNumber(z.shipping_price_piastres) : "");
    let update: any;
    if (raw.trim() === "") {
      update = { shipping_price_piastres: null };
    } else {
      const p = parseEgpToPiastres(raw);
      if (p === null) {
        toast.error("سعر غير صالح");
        return;
      }
      update = { shipping_price_piastres: p };
    }
    const { error } = await (supabase as any).from("shipping_zones").update(update).eq("id", z.id);
    if (error) {
      toast.error("تعذّر الحفظ");
      return;
    }
    toast.success("تم الحفظ");
    setDrafts((d) => { const n = { ...d }; delete n[z.id]; return n; });
    load();
  };

  const resetZone = async (z: Zone) => {
    const { error } = await (supabase as any).from("shipping_zones").update({ shipping_price_piastres: null }).eq("id", z.id);
    if (error) { toast.error("تعذّر إعادة التعيين"); return; }
    toast.success("أُعيد للسعر الافتراضي");
    setDrafts((d) => { const n = { ...d }; delete n[z.id]; return n; });
    load();
  };

  const createZone = async () => {
    if (!newName.trim()) { toast.error("أدخل اسم المنطقة"); return; }
    let price: number | null = null;
    if (newPrice.trim() !== "") {
      const p = parseEgpToPiastres(newPrice);
      if (p === null) { toast.error("سعر غير صالح"); return; }
      price = p;
    }
    setCreating(true);
    const { error } = await (supabase as any).from("shipping_zones").insert({
      name: newName.trim(),
      is_governorate: false,
      shipping_price_piastres: price,
    });
    setCreating(false);
    if (error) { toast.error("تعذّر الإضافة"); return; }
    toast.success("تمت الإضافة");
    setAddOpen(false); setNewName(""); setNewPrice("");
    load();
  };

  const deleteZone = async () => {
    if (!toDelete) return;
    const { error } = await (supabase as any).from("shipping_zones").delete().eq("id", toDelete.id);
    if (error) { toast.error("تعذّر الحذف"); return; }
    toast.success("تم الحذف");
    setToDelete(null);
    load();
  };

  return (
    <div className="space-y-8" dir="rtl">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <Truck className="w-7 h-7 text-primary" />
            مناطق الشحن
          </h1>
          <p className="text-sm text-muted-foreground mt-1">اضبط سعر الشحن الافتراضي أو خصّص سعراً لكل منطقة على حدة.</p>
        </div>
        <Button onClick={() => setAddOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" /> إضافة منطقة يدوياً
        </Button>
      </motion.div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "إجمالي المناطق", value: stats.total },
          { label: "المحافظات", value: stats.gov },
          { label: "مناطق مخصصة", value: stats.custom },
          { label: "بأسعار خاصة", value: stats.overridden },
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
            <Card className="p-4">
              <div className="text-xs text-muted-foreground">{s.label}</div>
              <div className="text-2xl font-bold mt-1">{s.value.toLocaleString("ar-EG")}</div>
            </Card>
          </motion.div>
        ))}
      </div>

      <Card className="p-5 space-y-3">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-primary" />
          <h2 className="font-bold">السعر الافتراضي للشحن</h2>
        </div>
        <p className="text-xs text-muted-foreground">يُطبَّق تلقائياً على كل منطقة لم تُخصَّص لها قيمة. أيّ تعديل هنا يسري فوراً على كل المناطق الوارثة.</p>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Input
              type="number"
              min={0}
              step="0.01"
              value={defaultDraft}
              onChange={(e) => setDefaultDraft(e.target.value)}
              className="pl-14"
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">ج.م</span>
          </div>
          <Button onClick={saveDefault} disabled={savingDefault} className="gap-2">
            {savingDefault ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            حفظ
          </Button>
          <div className="text-sm text-muted-foreground">الحالي: <span className="font-semibold text-foreground">{formatPiastres(defaultPrice)}</span></div>
        </div>
      </Card>

      <Card className="p-4 md:p-5">
        <div className="rounded-xl border border-border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">المنطقة</TableHead>
                <TableHead className="text-right">النوع</TableHead>
                <TableHead className="text-right">السعر الفعلي</TableHead>
                <TableHead className="text-right">سعر المنطقة</TableHead>
                <TableHead className="text-right">الإجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={5} className="py-16 text-center"><Loader2 className="w-6 h-6 mx-auto animate-spin text-muted-foreground" /></TableCell></TableRow>
              ) : zones.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="py-16 text-center text-muted-foreground">لا توجد مناطق</TableCell></TableRow>
              ) : (
                <AnimatePresence initial={false}>
                  {zones.map((z, i) => {
                    const inherited = z.shipping_price_piastres === null;
                    const effective = getEffectiveShippingPrice(z, defaultPrice);
                    const draft = drafts[z.id] ?? (z.shipping_price_piastres !== null ? piastresToEgpNumber(z.shipping_price_piastres) : "");
                    return (
                      <motion.tr
                        key={z.id}
                        layout
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2, delay: Math.min(i * 0.015, 0.2) }}
                        className="border-b border-border/60"
                      >
                        <TableCell className="font-medium">{z.name}</TableCell>
                        <TableCell>
                          {z.is_governorate ? (
                            <Badge variant="secondary">محافظة</Badge>
                          ) : (
                            <Badge variant="outline">مخصصة</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{formatPiastres(effective)}</span>
                            {inherited && <Badge variant="outline" className="text-xs">افتراضي</Badge>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="relative w-32">
                            <Input
                              type="number"
                              min={0}
                              step="0.01"
                              placeholder="افتراضي"
                              value={draft}
                              onChange={(e) => setZoneDraft(z.id, e.target.value)}
                              className="pl-10 h-9"
                            />
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">ج.م</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button size="sm" variant="secondary" onClick={() => saveZone(z)} className="gap-1">
                              <Save className="w-3.5 h-3.5" /> حفظ
                            </Button>
                            {!inherited && (
                              <Button size="sm" variant="ghost" onClick={() => resetZone(z)} className="gap-1" title="إعادة تعيين للسعر الافتراضي">
                                <RotateCcw className="w-3.5 h-3.5" /> افتراضي
                              </Button>
                            )}
                            {!z.is_governorate && (
                              <Button size="sm" variant="ghost" onClick={() => setToDelete(z)} className="text-destructive hover:text-destructive" title="حذف">
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader><DialogTitle>إضافة منطقة يدوياً</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-semibold">اسم المنطقة</label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="مثال: قرية X" />
            </div>
            <div>
              <label className="text-sm font-semibold">سعر مبدئي (اختياري)</label>
              <div className="relative">
                <Input type="number" min={0} step="0.01" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} placeholder="اتركه فارغاً للاستخدام الافتراضي" className="pl-12" />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">ج.م</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>إلغاء</Button>
            <Button onClick={createZone} disabled={creating}>
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : "إضافة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف المنطقة</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف «{toDelete?.name}»؟ لا يمكن التراجع.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={deleteZone} className="bg-destructive text-destructive-foreground">حذف</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
