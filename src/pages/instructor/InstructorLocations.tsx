import { useEffect, useState } from "react";
import { Landmark, Plus, Pencil, Trash2, ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  listMyLocations, upsertMyLocation, deleteMyLocation, type LocationRow,
} from "@/lib/instructor-api";

export default function InstructorLocations() {
  const [rows, setRows] = useState<LocationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<LocationRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ name: "", address: "", map_url: "", phone: "", is_active: true });
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    listMyLocations()
      .then(setRows)
      .catch((e) => toast.error(e?.message || "تعذّر تحميل الأماكن"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const openNew = () => {
    setEditing(null);
    setForm({ name: "", address: "", map_url: "", phone: "", is_active: true });
    setDialogOpen(true);
  };

  const openEdit = (r: LocationRow) => {
    setEditing(r);
    setForm({
      name: r.name,
      address: r.address ?? "",
      map_url: r.map_url ?? "",
      phone: r.phone ?? "",
      is_active: r.is_active,
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) return toast.error("اسم المكان مطلوب");
    setSaving(true);
    try {
      await upsertMyLocation(
        {
          name: form.name.trim(),
          address: form.address.trim() || null,
          map_url: form.map_url.trim() || null,
          phone: form.phone.trim() || null,
          is_active: form.is_active,
        },
        editing?.id ?? null
      );
      toast.success(editing ? "تم تحديث المكان" : "تمت إضافة المكان");
      setDialogOpen(false);
      load();
    } catch (e: any) {
      toast.error(e?.message || "تعذّر الحفظ");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (r: LocationRow) => {
    if (!confirm(`حذف "${r.name}"؟`)) return;
    try {
      await deleteMyLocation(r.id);
      toast.success("تم الحذف");
      load();
    } catch (e: any) {
      toast.error(e?.message || "تعذّر الحذف");
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <Landmark className="w-7 h-7 text-primary" />
            أماكن التواجد
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            أماكن شرحك التي ستظهر في صفحتك العامة أمام الطلاب
          </p>
        </div>
        <Button onClick={openNew}>
          <Plus className="w-4 h-4 ml-2" />
          مكان جديد
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            لم تضف أي أماكن تواجد بعد
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <Card key={r.id}>
              <CardContent className="p-4 flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-48">
                  <div className="font-semibold flex items-center gap-2">
                    {r.name}
                    {!r.is_active && <span className="text-xs text-muted-foreground">(غير مفعّل)</span>}
                  </div>
                  {r.address && <div className="text-xs text-muted-foreground mt-0.5">{r.address}</div>}
                  <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-3">
                    {r.phone}
                    {r.map_url && (
                      <a href={r.map_url} target="_blank" rel="noreferrer" className="text-blue-600 inline-flex items-center gap-1 underline">
                        الخريطة <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => openEdit(r)}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => remove(r)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "تعديل المكان" : "مكان تواجد جديد"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>الاسم *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="مثال: فرع مدينة نصر" />
            </div>
            <div className="space-y-2">
              <Label>العنوان</Label>
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>رابط الخريطة</Label>
              <Input value={form.map_url} onChange={(e) => setForm({ ...form, map_url: e.target.value })} placeholder="https://maps.google.com/…" />
            </div>
            <div className="space-y-2">
              <Label>هاتف</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="flex items-center justify-between">
              <Label>مفعّل (ظاهر للطلاب)</Label>
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
            </div>
            <Button onClick={save} disabled={saving} className="w-full">
              حفظ
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
