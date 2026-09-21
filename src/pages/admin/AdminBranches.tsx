import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Landmark,
  Search,
  MapPin,
  Edit2,
  Trash2,
  MoveUp,
  MoveDown,
  Building2,
  Check,
  X,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
  adminFetchBranches,
  adminCreateBranch,
  adminUpdateBranch,
  adminDeleteBranch,
  adminReorderBranches,
  BranchRow,
} from "@/lib/branches-api";

export default function AdminBranches() {
  const [branches, setBranches] = useState<BranchRow[] | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  // Form modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<BranchRow | null>(null);
  const [governorate, setGovernorate] = useState("");
  const [branchName, setBranchName] = useState("");
  const [addressDetails, setAddressDetails] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  // Delete dialog state
  const [deleting, setDeleting] = useState<BranchRow | null>(null);
  const [deletePending, setDeletePending] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await adminFetchBranches();
      setBranches(data);
    } catch (e: any) {
      toast.error("تعذّر تحميل الفروع");
      setBranches([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openAdd = () => {
    setEditing(null);
    setGovernorate("");
    setBranchName("");
    setAddressDetails("");
    setIsActive(true);
    setModalOpen(true);
  };

  const openEdit = (b: BranchRow) => {
    setEditing(b);
    setGovernorate(b.governorate);
    setBranchName(b.branch_name);
    setAddressDetails(b.address_details);
    setIsActive(b.is_active);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!governorate.trim()) return toast.error("اكتب اسم المحافظة الأول");
    if (!branchName.trim()) return toast.error("اكتب اسم المكان أو السنتر");
    if (!addressDetails.trim()) return toast.error("اكتب العنوان بالتفصيل");

    setSaving(true);
    try {
      if (editing) {
        await adminUpdateBranch(editing.id, {
          governorate: governorate.trim(),
          branch_name: branchName.trim(),
          address_details: addressDetails.trim(),
          is_active: isActive,
        });
        toast.success("تم تعديل بيانات المكان بنجاح");
      } else {
        const nextOrder = (branches?.length ?? 0) + 1;
        await adminCreateBranch({
          governorate: governorate.trim(),
          branch_name: branchName.trim(),
          address_details: addressDetails.trim(),
          is_active: isActive,
          order_index: nextOrder,
        });
        toast.success("تم إضافة المكان بنجاح");
      }
      setModalOpen(false);
      load();
    } catch (err: any) {
      toast.error(err?.message || "مش عارفين نحفظ التغييرات دلوقتي، حاول تاني");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (b: BranchRow) => {
    try {
      const updated = !b.is_active;
      setBranches((prev) =>
        prev ? prev.map((x) => (x.id === b.id ? { ...x, is_active: updated } : x)) : null
      );
      await adminUpdateBranch(b.id, { is_active: updated });
      toast.success(updated ? "تم تفعيل المكان على الموقع" : "تم إخفاء المكان من الموقع");
    } catch (e: any) {
      toast.error("فشل تغيير حالة المكان، حاول تاني");
      load();
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setDeletePending(true);
    try {
      await adminDeleteBranch(deleting.id);
      toast.success("تم حذف المكان بنجاح");
      setDeleting(null);
      load();
    } catch (e: any) {
      toast.error("مش عارفين نحذف المكان دلوقتي، حاول تاني");
    } finally {
      setDeletePending(false);
    }
  };

  const handleMove = async (index: number, direction: "up" | "down") => {
    if (!branches) return;
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= branches.length) return;

    const newArr = [...branches];
    const temp = newArr[index];
    newArr[index] = newArr[targetIndex];
    newArr[targetIndex] = temp;

    const reordered = newArr.map((item, idx) => ({
      ...item,
      order_index: idx + 1,
    }));
    setBranches(reordered);

    try {
      await adminReorderBranches(
        reordered.map((item) => ({ id: item.id, order_index: item.order_index }))
      );
      toast.success("تم تحديث ترتيب الأماكن");
    } catch (e) {
      toast.error("فشل حفظ الترتيب، حاول تاني");
      load();
    }
  };

  const filtered = branches?.filter(
    (b) =>
      b.branch_name.toLowerCase().includes(query.toLowerCase()) ||
      b.governorate.toLowerCase().includes(query.toLowerCase()) ||
      b.address_details.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="max-w-7xl mx-auto space-y-6" dir="rtl">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row md:items-center md:justify-between gap-4"
      >
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
            <Landmark className="w-8 h-8 text-primary" />
            <span>أماكن التواجد (أماكن الشرح)</span>
          </h1>
          <p className="text-muted-foreground mt-1">
            ضيف ونظّم الأماكن والمراكز اللي بيشرح فيها المعلم وعنون كل مكان بالتفصيل.
          </p>
        </div>
        <Button onClick={openAdd} size="lg" className="shadow-md">
          <Plus className="w-4 h-4 ml-2" />
          إضافة مكان جديد
        </Button>
      </motion.div>

      {/* Search Input */}
      <div className="relative max-w-md">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="ادور باسم المكان، المحافظة، أو العنوان..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pr-10"
        />
      </div>

      {/* List Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-2xl" />
          ))}
        </div>
      ) : filtered && filtered.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <AnimatePresence mode="popLayout">
            {filtered.map((b, idx) => (
              <motion.div
                key={b.id}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.2 }}
              >
                <Card className="p-5 rounded-2xl border border-border/80 hover:border-primary/40 transition-all space-y-3 relative">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shrink-0">
                        <Building2 className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-bold text-lg text-foreground flex items-center gap-2">
                          <span>{b.branch_name}</span>
                          <Badge variant={b.is_active ? "default" : "secondary"}>
                            {b.is_active ? "متاح للشرح" : "مغلق"}
                          </Badge>
                        </h3>
                        <span className="text-xs text-muted-foreground font-semibold">
                          محافظة {b.governorate}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        disabled={idx === 0}
                        onClick={() => handleMove(idx, "up")}
                        title="تحريك لأعلى"
                      >
                        <MoveUp className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        disabled={idx === filtered.length - 1}
                        onClick={() => handleMove(idx, "down")}
                        title="تحريك لأسفل"
                      >
                        <MoveDown className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="flex items-start gap-2 text-sm text-muted-foreground bg-accent/30 p-3 rounded-xl">
                    <MapPin className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    <span className="leading-relaxed">{b.address_details}</span>
                  </div>

                  <div className="pt-2 border-t border-border/50 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground font-medium">عرض المكان بالموقع:</span>
                      <Switch
                        checked={b.is_active}
                        onCheckedChange={() => handleToggleActive(b)}
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEdit(b)}
                        className="h-8 gap-1 text-xs"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        تعديل
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleting(b)}
                        className="h-8 gap-1 text-xs text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        حذف
                      </Button>
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      ) : (
        <div className="text-center py-16 rounded-3xl border border-dashed border-border bg-card/40">
          <Building2 className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
          <h3 className="text-lg font-bold">مفيش أماكن متضافة لسة</h3>
          <p className="text-sm text-muted-foreground mb-4">دوس على إضافة مكان جديد عشان تبدأ تضيف أماكن الشرح.</p>
          <Button onClick={openAdd}>
            <Plus className="w-4 h-4 ml-2" />
            إضافة مكان جديد
          </Button>
        </div>
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg" dir="rtl">
          <form onSubmit={handleSave} className="space-y-4">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold">
                {editing ? "تعديل بيانات المكان" : "إضافة مكان جديد"}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <label className="text-sm font-bold">المحافظة</label>
                <Input
                  value={governorate}
                  onChange={(e) => setGovernorate(e.target.value)}
                  placeholder="زي: الجيزة، أسيوط، سوهاج…"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-bold">اسم المكان / السنتر</label>
                <Input
                  value={branchName}
                  onChange={(e) => setBranchName(e.target.value)}
                  placeholder="زي: سنتر IMA"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-bold">العنوان بالتفصيل</label>
                <Textarea
                  value={addressDetails}
                  onChange={(e) => setAddressDetails(e.target.value)}
                  rows={3}
                  placeholder="زي: الهرم، سهل حمزة، أعلى محلات اكتيف، داخل چوميرال مول"
                  required
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl border border-border bg-accent/20">
                <div>
                  <div className="text-sm font-bold">تفعيل المكان على الموقع</div>
                  <div className="text-xs text-muted-foreground">هيطهر في صفحة "أماكن التواجد" لما يكون متفعل</div>
                </div>
                <Switch checked={isActive} onCheckedChange={setIsActive} />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                إلغاء
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 animate-spin ml-2" />}
                {editing ? "حفظ التغييرات" : "إضافة المكان"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirm Delete Dialog */}
      <AlertDialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              حذف المكان
            </AlertDialogTitle>
            <AlertDialogDescription>
              متأكد إنك عاوز تحذف مكان "{deleting?.branch_name}" بمحافظة {deleting?.governorate}؟ مش هتعرف ترجع في الخطوة دي تاني.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletePending}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              disabled={deletePending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletePending && <Loader2 className="w-4 h-4 animate-spin ml-2" />}
              حذف نهائي
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
