import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  CreditCard,
  Loader2,
  Pencil,
  Copy,
  Trash2,
  Star,
  Plus,
  FileDown,
  Check,
  X,
  Image as ImageIcon,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { renderCardToDataURL } from "@/components/admin/cards/CardCanvas";
import CardExportModal from "@/components/admin/cards/CardExportModal";

interface Tpl {
  id: string;
  name: string;
  is_default: boolean;
  front_design: any;
  back_design: any;
  updated_at: string;
}

const AdminCards = () => {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<Tpl[]>([]);
  const [loading, setLoading] = useState(true);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<Tpl | null>(null);
  const [exportTpl, setExportTpl] = useState<Tpl | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("card_templates")
      .select("*")
      .order("is_default", { ascending: false })
      .order("updated_at", { ascending: false });
    if (error) toast.error("تعذّر تحميل الكروت");
    setTemplates((data ?? []) as Tpl[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Render thumbnails progressively
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const t of templates) {
        if (cancelled) return;
        if (thumbs[t.id]) continue;
        try {
          const url = await renderCardToDataURL(t.front_design);
          if (cancelled) return;
          setThumbs((prev) => ({ ...prev, [t.id]: url }));
        } catch (e) {
          console.error("thumb failed", e);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [templates, thumbs]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const { data, error } = await (supabase as any)
        .from("card_templates")
        .insert({
          name: `كارت جديد ${new Date().toLocaleDateString("ar-EG")}`,
          is_default: false,
          front_design: {},
          back_design: {},
        })
        .select("id")
        .single();
      if (error) throw error;
      navigate(`/admin/cards/${data.id}/edit`);
    } catch (e: any) {
      toast.error(e?.message ?? "تعذّر إنشاء كارت");
    } finally { setCreating(false); }
  };

  const handleDuplicate = async (t: Tpl) => {
    setBusyId(t.id);
    try {
      const { error } = await (supabase as any)
        .from("card_templates")
        .insert({
          name: `${t.name} (نسخة)`,
          is_default: false,
          front_design: t.front_design ?? {},
          back_design: t.back_design ?? {},
        });
      if (error) throw error;
      toast.success("تم النسخ");
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "تعذّر النسخ");
    } finally { setBusyId(null); }
  };

  const handleDelete = async (t: Tpl) => {
    if (t.is_default) {
      toast.error("لا يمكن حذف الكارت الافتراضي، اختر كارتاً آخر ليكون الافتراضي أولاً");
      setConfirmDelete(null);
      return;
    }
    setBusyId(t.id);
    try {
      const { error } = await (supabase as any).from("card_templates").delete().eq("id", t.id);
      if (error) throw error;
      toast.success("تم الحذف");
      setTemplates((prev) => prev.filter((x) => x.id !== t.id));
      setThumbs((prev) => { const n = { ...prev }; delete n[t.id]; return n; });
    } catch (e: any) {
      toast.error(e?.message ?? "تعذّر الحذف");
    } finally { setBusyId(null); setConfirmDelete(null); }
  };

  const handleSetDefault = async (t: Tpl) => {
    if (t.is_default) return;
    setBusyId(t.id);
    try {
      // Unset current default first to respect the partial-unique index
      const { error: e1 } = await (supabase as any)
        .from("card_templates")
        .update({ is_default: false })
        .eq("is_default", true);
      if (e1) throw e1;
      const { error: e2 } = await (supabase as any)
        .from("card_templates")
        .update({ is_default: true })
        .eq("id", t.id);
      if (e2) throw e2;
      toast.success("تم التعيين كافتراضي");
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "تعذّر التعيين");
    } finally { setBusyId(null); }
  };

  const startRename = (t: Tpl) => {
    setRenaming(t.id);
    setRenameValue(t.name);
  };

  const commitRename = async (t: Tpl) => {
    const v = renameValue.trim();
    if (!v || v === t.name) { setRenaming(null); return; }
    setBusyId(t.id);
    try {
      const { error } = await (supabase as any)
        .from("card_templates")
        .update({ name: v })
        .eq("id", t.id);
      if (error) throw error;
      setTemplates((prev) => prev.map((x) => (x.id === t.id ? { ...x, name: v } : x)));
      toast.success("تم التسمية");
    } catch (e: any) {
      toast.error(e?.message ?? "تعذّر التعديل");
    } finally {
      setBusyId(null);
      setRenaming(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6" dir="rtl">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-center justify-between gap-3"
      >
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
            <CreditCard className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-black">مكتبة كروت الطلاب</h1>
            <p className="text-xs md:text-sm text-muted-foreground">
              أنشئ عدة تصاميم، حدّد الافتراضي، وصدّر كروت الطلاب PDF.
            </p>
          </div>
        </div>
        <Button onClick={handleCreate} disabled={creating} className="gap-2">
          {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          إنشاء كارت جديد
        </Button>
      </motion.div>

      {loading ? (
        <div className="rounded-2xl border border-border/60 bg-card p-16 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : templates.length === 0 ? (
        <div className="rounded-2xl border border-border/60 bg-card p-16 text-center space-y-4">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
            <CreditCard className="w-8 h-8" />
          </div>
          <p className="text-muted-foreground">لا توجد كروت بعد</p>
          <Button onClick={handleCreate} disabled={creating} className="gap-2">
            <Plus className="w-4 h-4" /> إنشاء أول كارت
          </Button>
        </div>
      ) : (
        <motion.div
          layout
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          <AnimatePresence initial={false}>
            {templates.map((t, i) => {
              const isRenaming = renaming === t.id;
              const isBusy = busyId === t.id;
              return (
                <motion.article
                  key={t.id}
                  layout
                  initial={{ opacity: 0, y: 12, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ delay: Math.min(i * 0.04, 0.2), type: "spring", stiffness: 200, damping: 24 }}
                  className={`group rounded-2xl border-2 bg-card overflow-hidden flex flex-col ${
                    t.is_default ? "border-primary shadow-lg shadow-primary/10" : "border-border"
                  }`}
                >
                  {/* Thumbnail */}
                  <div className="aspect-[1011/638] w-full bg-muted/30 relative overflow-hidden">
                    {thumbs[t.id] ? (
                      <motion.img
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        src={thumbs[t.id]}
                        alt={t.name}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                        <ImageIcon className="w-10 h-10 opacity-30" />
                      </div>
                    )}
                    {t.is_default && (
                      <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
                        <Star className="w-3 h-3 fill-current" /> افتراضي
                      </div>
                    )}
                  </div>

                  {/* Body */}
                  <div className="p-4 flex-1 flex flex-col gap-3">
                    {isRenaming ? (
                      <div className="flex items-center gap-1">
                        <Input
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitRename(t);
                            if (e.key === "Escape") setRenaming(null);
                          }}
                          autoFocus
                          className="h-9 text-sm"
                        />
                        <Button size="icon" variant="ghost" onClick={() => commitRename(t)} disabled={isBusy}>
                          <Check className="w-4 h-4 text-emerald-600" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => setRenaming(null)} disabled={isBusy}>
                          <X className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold truncate flex-1">{t.name}</h3>
                        <Button size="icon" variant="ghost" onClick={() => startRename(t)} title="إعادة تسمية" className="h-7 w-7">
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    )}

                    <div className="flex items-center gap-1 flex-wrap text-[10px] text-muted-foreground">
                      <Badge variant="secondary" className="text-[9px] font-mono">
                        {new Date(t.updated_at).toLocaleDateString("ar-EG")}
                      </Badge>
                    </div>

                    {/* Actions */}
                    <div className="mt-auto space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <Link to={`/admin/cards/${t.id}/edit`}>
                          <Button size="sm" variant="outline" className="w-full gap-1.5 h-8">
                            <Pencil className="w-3.5 h-3.5" /> تعديل
                          </Button>
                        </Link>
                        <Button
                          size="sm"
                          onClick={() => setExportTpl(t)}
                          className="w-full gap-1.5 h-8"
                        >
                          <FileDown className="w-3.5 h-3.5" /> تصدير
                        </Button>
                      </div>
                      <div className="grid grid-cols-3 gap-1.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleSetDefault(t)}
                          disabled={t.is_default || isBusy}
                          className="h-8 text-[10px] gap-1"
                          title="تعيين كافتراضي"
                        >
                          <Star className={`w-3 h-3 ${t.is_default ? "fill-primary text-primary" : ""}`} />
                          افتراضي
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDuplicate(t)}
                          disabled={isBusy}
                          className="h-8 text-[10px] gap-1"
                        >
                          <Copy className="w-3 h-3" /> نسخ
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setConfirmDelete(t)}
                          disabled={isBusy || t.is_default}
                          className="h-8 text-[10px] gap-1 text-destructive hover:text-destructive"
                          title={t.is_default ? "لا يمكن حذف الافتراضي" : "حذف"}
                        >
                          <Trash2 className="w-3 h-3" /> حذف
                        </Button>
                      </div>
                    </div>
                  </div>
                </motion.article>
              );
            })}
          </AnimatePresence>
        </motion.div>
      )}

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-right">حذف الكارت؟</AlertDialogTitle>
            <AlertDialogDescription className="text-right">
              سيتم حذف تصميم <span className="font-bold">"{confirmDelete?.name}"</span> نهائيًا. لا يمكن التراجع.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                if (confirmDelete) handleDelete(confirmDelete);
              }}
            >
              حذف نهائي
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {exportTpl && (
        <CardExportModal
          open={!!exportTpl}
          onOpenChange={(o) => !o && setExportTpl(null)}
          templateName={exportTpl.name}
          frontDesign={exportTpl.front_design}
          backDesign={exportTpl.back_design}
        />
      )}
    </div>
  );
};

export default AdminCards;
