import { useEffect, useState } from "react";
import { motion, AnimatePresence, Reorder } from "framer-motion";
import { Layers, Plus, Edit3, Trash2, GripVertical, Upload, AlertTriangle, Loader2, X, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useLevels } from "@/hooks/useLeaderboard";
import { useAuth } from "@/contexts/AuthContext";

type Level = {
  id: string;
  name: string;
  icon_url: string | null;
  min_points: number;
  order_index: number;
};

const BUCKET = "card-assets";

export default function LeaderboardLevels() {
  const { data: levels, refetch, isLoading } = useLevels();
  const { profile } = useAuth();
  const [items, setItems] = useState<Level[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Level | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (levels) setItems(levels as Level[]);
  }, [levels]);

  const openNew = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (l: Level) => { setEditing(l); setModalOpen(true); };

  const contradicts = items.some((l, i) => i > 0 && l.min_points < items[i - 1].min_points);

  const fixOrdering = async () => {
    const sorted = [...items].sort((a, b) => a.min_points - b.min_points);
    for (let i = 0; i < sorted.length; i++) {
      await supabase.from("levels").update({ order_index: i }).eq("id", sorted[i].id);
    }
    toast.success("تم إصلاح الترتيب.");
    refetch();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("levels").delete().eq("id", deleteId);
    if (error) return toast.error(error.message);
    toast.success("تم حذف المستوى.");
    setDeleteId(null);
    refetch();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Layers className="w-5 h-5 text-indigo-500" /> المستويات
        </h2>
        <Button onClick={openNew} className="bg-indigo-600 hover:bg-indigo-700 text-white">
          <Plus className="w-4 h-4 ml-1" /> مستوى جديد
        </Button>
      </div>

      {contradicts && (
        <Card className="p-3 border-amber-500/40 bg-amber-500/5 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
          <div className="flex-1 text-sm">ترتيب البطاقات يتعارض مع قيم النقاط. المستوى الفعلي دائمًا يعتمد على الحد الأدنى للنقاط.</div>
          <Button size="sm" variant="outline" onClick={fixOrdering}>إصلاح الترتيب</Button>
        </Card>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : items.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">
          لا توجد مستويات بعد. أضف المستوى الأول لبدء التصنيف.
        </Card>
      ) : (
        <Reorder.Group axis="y" values={items} onReorder={setItems} className="space-y-2">
          {items.map((l, i) => {
            const next = items[i + 1];
            const range = next ? `من ${l.min_points} إلى ${next.min_points - 1}` : `${l.min_points}+`;
            return (
              <Reorder.Item key={l.id} value={l} whileDrag={{ scale: 1.02 }} transition={{ type: "spring", stiffness: 400, damping: 30 }}>
                <Card className="p-3 flex items-center gap-3">
                  <GripVertical className="w-5 h-5 text-muted-foreground cursor-grab" />
                  <div className="w-12 h-12 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center overflow-hidden shrink-0">
                    {l.icon_url ? <img src={l.icon_url} className="w-full h-full object-contain" alt="" /> : <Layers className="w-5 h-5 text-amber-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold truncate">{l.name}</div>
                    <div className="text-xs text-muted-foreground">{range} نقطة</div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => openEdit(l)}><Edit3 className="w-4 h-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => setDeleteId(l.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                </Card>
              </Reorder.Item>
            );
          })}
        </Reorder.Group>
      )}

      <LevelModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        editing={editing}
        existing={items}
        onSaved={() => refetch()}
        updatedBy={profile?.id ?? null}
      />

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف المستوى؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف هذا المستوى. الطلاب الذين كانوا فيه سينتقلون تلقائيًا للمستوى الأعلى الذي يؤهلون له.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive">حذف</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function LevelModal({
  open, onOpenChange, editing, existing, onSaved, updatedBy,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: Level | null;
  existing: Level[];
  onSaved: () => void;
  updatedBy: string | null;
}) {
  const [name, setName] = useState("");
  const [minPoints, setMinPoints] = useState(0);
  const [iconUrl, setIconUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(editing?.name ?? "");
      setMinPoints(editing?.min_points ?? 0);
      setIconUrl(editing?.icon_url ?? null);
    }
  }, [open, editing]);

  const duplicate = existing.some((l) => l.min_points === minPoints && l.id !== editing?.id);

  const handleFile = async (file: File) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
    if (img.width !== 512 || img.height !== 512) {
      URL.revokeObjectURL(url);
      toast.error("يجب أن تكون أبعاد الأيقونة 512×512 بكسل بالضبط.");
      return;
    }
    URL.revokeObjectURL(url);
    setUploading(true);
    try {
      const path = `levels/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false, contentType: file.type });
      if (error) throw error;
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      setIconUrl(data.publicUrl);
      toast.success("تم رفع الأيقونة.");
    } catch (e: any) {
      toast.error(e.message ?? "فشل الرفع");
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) return toast.error("الاسم مطلوب");
    if (minPoints < 0 || !Number.isInteger(minPoints)) return toast.error("الحد الأدنى للنقاط يجب أن يكون عددًا صحيحًا موجبًا");
    if (duplicate) return toast.error("يوجد مستوى آخر بنفس الحد الأدنى للنقاط");
    setSaving(true);
    const payload: any = { name, min_points: minPoints, icon_url: iconUrl, updated_by: updatedBy };
    let error;
    if (editing) {
      ({ error } = await supabase.from("levels").update(payload).eq("id", editing.id));
    } else {
      payload.order_index = existing.length;
      ({ error } = await supabase.from("levels").insert(payload));
    }
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(editing ? "تم التحديث" : "تم إنشاء المستوى");
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl">
        <DialogHeader>
          <DialogTitle>{editing ? "تعديل المستوى" : "مستوى جديد"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>اسم المستوى</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: مبتدئ" />
          </div>
          <div>
            <Label>الحد الأدنى للنقاط</Label>
            <Input type="number" value={minPoints} min={0} onChange={(e) => setMinPoints(parseInt(e.target.value || "0", 10))} />
            {duplicate && <p className="text-xs text-destructive mt-1">قيمة مكررة</p>}
          </div>
          <div>
            <Label>الأيقونة (512×512 بكسل بالضبط)</Label>
            <div className="flex items-center gap-3 mt-2">
              <div className="w-16 h-16 rounded-xl bg-muted flex items-center justify-center overflow-hidden">
                {iconUrl ? <img src={iconUrl} className="w-full h-full object-contain" alt="" /> : <Layers className="w-6 h-6 text-muted-foreground" />}
              </div>
              <label className="cursor-pointer">
                <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
                <span className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border hover:bg-accent text-sm">
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  رفع أيقونة
                </span>
              </label>
              {iconUrl && (
                <Button variant="ghost" size="icon" onClick={() => setIconUrl(null)}><X className="w-4 h-4" /></Button>
              )}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700">
            {saving ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <Save className="w-4 h-4 ml-1" />}
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
