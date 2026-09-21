import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Award, Plus, Edit3, Trash2, Upload, X, Save, Loader2, Info, Users, Search,
  Sparkles, ShieldCheck, ShieldOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  useBadges, useBadgeEarnedCounts, useBadgeConditions, useSaveBadge, useDeleteBadge,
  useEvaluateBadgeForAll, useStudentsWhoEarnedBadge,
  CONDITION_META, type BadgeConditionType, type BadgeRow, type BadgeConditionRow,
} from "@/hooks/useBadges";
import { useLevels } from "@/hooks/useLeaderboard";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const BUCKET = "card-assets";

export default function LeaderboardBadges() {
  const { data: badges, isLoading, refetch } = useBadges();
  const { data: counts } = useBadgeEarnedCounts();
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("all");
  const [modalBadge, setModalBadge] = useState<BadgeRow | null | undefined>(undefined); // undefined = closed
  const [deleteBadge, setDeleteBadge] = useState<BadgeRow | null>(null);
  const [studentsFor, setStudentsFor] = useState<BadgeRow | null>(null);
  const del = useDeleteBadge();

  const filtered = (badges ?? []).filter((b) => {
    if (filter === "active") return b.is_active;
    if (filter === "inactive") return !b.is_active;
    return true;
  });

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Award className="w-5 h-5 text-amber-500" /> الشارات
        </h2>
        <Button onClick={() => setModalBadge(null)} className="bg-amber-600 hover:bg-amber-700 text-white">
          <Plus className="w-4 h-4 ml-1" /> شارة جديدة
        </Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {(["all", "active", "inactive"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === f ? "bg-primary text-primary-foreground" : "bg-accent hover:bg-accent/80"
            }`}
          >
            {f === "all" ? "الكل" : f === "active" ? "نشطة" : "غير نشطة"}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">
          {filter === "all" ? "لم يتم إنشاء أي شارة بعد." : "لا شارات ضمن هذا الفلتر."}
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence>
            {filtered.map((b) => (
              <motion.div
                key={b.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                whileHover={{ y: -2 }}
              >
                <Card className="p-4 relative overflow-hidden">
                  <div className="flex items-start gap-3">
                    <div className={`w-20 h-20 rounded-2xl border shrink-0 overflow-hidden flex items-center justify-center ${
                      b.is_active ? "border-amber-500/40 bg-amber-500/10" : "border-border bg-muted grayscale"
                    }`}>
                      {b.icon_url ? (
                        <img src={b.icon_url} alt={b.name} className="w-full h-full object-contain" />
                      ) : (
                        <Award className="w-8 h-8 text-amber-500" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-bold truncate">{b.name}</h3>
                        <Badge variant={b.is_active ? "default" : "secondary"} className="shrink-0">
                          {b.is_active ? (
                            <><ShieldCheck className="w-3 h-3 ml-1" /> نشطة</>
                          ) : (
                            <><ShieldOff className="w-3 h-3 ml-1" /> غير نشطة</>
                          )}
                        </Badge>
                      </div>
                      {b.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{b.description}</p>
                      )}
                      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Users className="w-3.5 h-3.5" />
                          {counts?.[b.id] ?? 0} طالب
                        </span>
                        {b.points_reward ? (
                          <span className="inline-flex items-center gap-1 text-amber-600">
                            <Sparkles className="w-3.5 h-3.5" />
                            +{b.points_reward} نقطة
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2 mt-3 pt-3 border-t border-border/50">
                    <Button size="sm" variant="outline" onClick={() => setStudentsFor(b)} className="flex-1">
                      <Users className="w-3.5 h-3.5 ml-1" /> عرض الطلاب
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setModalBadge(b)}>
                      <Edit3 className="w-4 h-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setDeleteBadge(b)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {modalBadge !== undefined && (
        <BadgeEditorModal
          open
          onOpenChange={(o) => !o && setModalBadge(undefined)}
          editing={modalBadge}
          onSaved={() => { refetch(); setModalBadge(undefined); }}
        />
      )}

      <AlertDialog open={!!deleteBadge} onOpenChange={(o) => !o && setDeleteBadge(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف الشارة "{deleteBadge?.name}"؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف الشارة وسجل حصول الطلاب عليها. لن يتم استرجاع نقاط المكافأة التي تم منحها عند الحصول عليها.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive"
              onClick={async () => {
                if (!deleteBadge) return;
                try {
                  await del.mutateAsync(deleteBadge.id);
                  toast.success("تم حذف الشارة");
                } catch (e: any) {
                  toast.error(e.message ?? "فشل الحذف");
                }
                setDeleteBadge(null);
              }}
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <StudentsForBadgeModal
        badge={studentsFor}
        onClose={() => setStudentsFor(null)}
      />
    </div>
  );
}

// ---- Editor Modal ----

type CondDraft = {
  key: string;
  condition_type: BadgeConditionType;
  target_int: number | null;
  target_uuid: string | null;
};

function BadgeEditorModal({
  open, onOpenChange, editing, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: BadgeRow | null;
  onSaved: () => void;
}) {
  const { data: conds } = useBadgeConditions(editing?.id);
  const { data: allBadges } = useBadges();
  const { data: levels } = useLevels();
  const save = useSaveBadge();
  const evalAll = useEvaluateBadgeForAll();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [iconUrl, setIconUrl] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(true);
  const [pointsReward, setPointsReward] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [conditions, setConditions] = useState<CondDraft[]>([]);

  useEffect(() => {
    if (open) {
      setName(editing?.name ?? "");
      setDescription(editing?.description ?? "");
      setIconUrl(editing?.icon_url ?? null);
      setIsActive(editing?.is_active ?? true);
      setPointsReward(editing?.points_reward != null ? String(editing.points_reward) : "");
      setConditions(
        (conds ?? []).map((c) => ({
          key: c.id,
          condition_type: c.condition_type,
          target_int: c.target_int,
          target_uuid: c.target_uuid,
        }))
      );
    }
  }, [open, editing, conds]);

  const addCondition = () => setConditions((cs) => [...cs, {
    key: crypto.randomUUID(), condition_type: "points_at_least", target_int: 100, target_uuid: null,
  }]);

  const updateCondition = (key: string, patch: Partial<CondDraft>) =>
    setConditions((cs) => cs.map((c) => (c.key === key ? { ...c, ...patch } : c)));

  const removeCondition = (key: string) =>
    setConditions((cs) => cs.filter((c) => c.key !== key));

  const handleFile = async (file: File) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    await new Promise((r, j) => { img.onload = r; img.onerror = j; });
    if (img.width !== 512 || img.height !== 512) {
      URL.revokeObjectURL(url);
      toast.error("يجب أن تكون أبعاد الأيقونة 512×512 بكسل بالضبط.");
      return;
    }
    URL.revokeObjectURL(url);
    setUploading(true);
    try {
      const path = `badges/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false, contentType: file.type });
      if (error) throw error;
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      setIconUrl(data.publicUrl);
      toast.success("تم رفع الأيقونة");
    } catch (e: any) {
      toast.error(e.message ?? "فشل الرفع");
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) return toast.error("اسم الشارة مطلوب");
    if (!iconUrl) return toast.error("أيقونة الشارة مطلوبة");
    if (conditions.length === 0) return toast.error("يجب إضافة شرط واحد على الأقل");

    for (const c of conditions) {
      const meta = CONDITION_META[c.condition_type];
      if (meta.kind === "int" && (c.target_int == null || c.target_int < 0)) {
        return toast.error(`الشرط "${meta.label}" يحتاج قيمة صحيحة`);
      }
      if (meta.kind !== "int" && !c.target_uuid) {
        return toast.error(`الشرط "${meta.label}" يحتاج اختيار قيمة`);
      }
    }

    try {
      const rewardVal = pointsReward.trim() === "" ? null : parseInt(pointsReward, 10);
      const badgeId = await save.mutateAsync({
        badge: {
          id: editing?.id,
          name: name.trim(),
          description: description.trim() || null,
          icon_url: iconUrl,
          points_reward: Number.isFinite(rewardVal as number) ? rewardVal : null,
          is_active: isActive,
        },
        conditions: conditions.map((c) => ({
          condition_type: c.condition_type,
          target_int: CONDITION_META[c.condition_type].kind === "int" ? c.target_int : null,
          target_uuid: CONDITION_META[c.condition_type].kind !== "int" ? c.target_uuid : null,
        })),
      });
      toast.success(editing ? "تم تحديث الشارة" : "تم إنشاء الشارة");
      // fire-and-forget evaluator
      evalAll.mutate(badgeId, {
        onSuccess: (n) => n > 0 && toast.success(`تم منح الشارة لـ ${n} طالب مؤهل بالفعل`),
      });
      onSaved();
    } catch (e: any) {
      toast.error(e.message ?? "فشل الحفظ");
    }
  };

  const otherBadges = (allBadges ?? []).filter((b) => b.id !== editing?.id && b.is_active);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Award className="w-5 h-5 text-amber-500" />
            {editing ? "تعديل الشارة" : "شارة جديدة"}
          </DialogTitle>
          <DialogDescription>
            حدد اسم الشارة وأيقونتها ثم أضف الشروط التي يجب تحقيقها للحصول عليها.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Basics */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>اسم الشارة</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: نجم الاختبارات" />
            </div>
            <div>
              <Label>نقاط المكافأة (اختياري)</Label>
              <Input
                type="number"
                min={0}
                value={pointsReward}
                onChange={(e) => setPointsReward(e.target.value)}
                placeholder="0"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                تُضاف مرة واحدة عند الحصول على الشارة.
              </p>
            </div>
          </div>

          <div>
            <Label>وصف الشارة</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch checked={isActive} onCheckedChange={setIsActive} />
              <span className="text-sm font-medium">نشطة</span>
            </div>
          </div>

          <div>
            <Label>الأيقونة (512×512 بكسل بالضبط)</Label>
            <div className="flex items-center gap-3 mt-2">
              <div className="w-20 h-20 rounded-2xl bg-muted border flex items-center justify-center overflow-hidden">
                {iconUrl ? (
                  <img src={iconUrl} className="w-full h-full object-contain" alt="" />
                ) : (
                  <Award className="w-8 h-8 text-muted-foreground" />
                )}
              </div>
              <label className="cursor-pointer">
                <input
                  type="file" accept="image/*" className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                />
                <span className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border hover:bg-accent text-sm">
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  رفع أيقونة
                </span>
              </label>
              {iconUrl && (
                <Button variant="ghost" size="icon" onClick={() => setIconUrl(null)}>
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Conditions */}
          <div className="border-t pt-4 space-y-3">
            <Card className="p-3 flex items-center gap-2 bg-amber-500/5 border-amber-500/30">
              <Info className="w-4 h-4 text-amber-600 shrink-0" />
              <p className="text-xs">
                يجب على الطالب تحقيق <strong>كل</strong> الشروط معًا للحصول على الشارة.
              </p>
            </Card>

            <div className="flex items-center justify-between">
              <h3 className="font-bold">الشروط</h3>
              <Button size="sm" variant="outline" onClick={addCondition}>
                <Plus className="w-4 h-4 ml-1" /> شرط إضافي
              </Button>
            </div>

            {conditions.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">أضف شرطًا واحدًا على الأقل.</p>
            )}

            <div className="space-y-2">
              {conditions.map((c) => {
                const meta = CONDITION_META[c.condition_type];
                return (
                  <Card key={c.key} className="p-3 space-y-2">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-2">
                        <Select
                          value={c.condition_type}
                          onValueChange={(v) => updateCondition(c.key, {
                            condition_type: v as BadgeConditionType,
                            target_int: CONDITION_META[v as BadgeConditionType].kind === "int" ? 1 : null,
                            target_uuid: CONDITION_META[v as BadgeConditionType].kind !== "int" ? null : null,
                          })}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {(Object.keys(CONDITION_META) as BadgeConditionType[]).map((k) => (
                              <SelectItem key={k} value={k}>{CONDITION_META[k].label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        {meta.kind === "int" && (
                          <Input
                            type="number" min={0}
                            value={c.target_int ?? ""}
                            onChange={(e) => updateCondition(c.key, { target_int: parseInt(e.target.value || "0", 10) })}
                            placeholder="القيمة المطلوبة"
                          />
                        )}
                        {meta.kind === "level" && (
                          <Select value={c.target_uuid ?? ""} onValueChange={(v) => updateCondition(c.key, { target_uuid: v })}>
                            <SelectTrigger><SelectValue placeholder="اختر المستوى" /></SelectTrigger>
                            <SelectContent>
                              {(levels ?? []).map((l: any) => (
                                <SelectItem key={l.id} value={l.id}>{l.name} ({l.min_points}+)</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        {meta.kind === "badge" && (
                          <Select value={c.target_uuid ?? ""} onValueChange={(v) => updateCondition(c.key, { target_uuid: v })}>
                            <SelectTrigger><SelectValue placeholder="اختر الشارة" /></SelectTrigger>
                            <SelectContent>
                              {otherBadges.length === 0 ? (
                                <div className="p-2 text-xs text-muted-foreground">لا توجد شارات أخرى</div>
                              ) : otherBadges.map((b) => (
                                <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => removeCondition(c.key)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                    {meta.hint && <p className="text-[11px] text-muted-foreground">{meta.hint}</p>}
                  </Card>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button
            onClick={handleSave}
            disabled={save.isPending}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            {save.isPending ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <Save className="w-4 h-4 ml-1" />}
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StudentsForBadgeModal({ badge, onClose }: { badge: BadgeRow | null; onClose: () => void }) {
  const { data, isLoading } = useStudentsWhoEarnedBadge(badge?.id);
  const [search, setSearch] = useState("");
  const [sortAsc, setSortAsc] = useState(false);

  const filtered = (data ?? [])
    .filter((r: any) => !search || (r.profiles?.full_name ?? "").toLowerCase().includes(search.toLowerCase()))
    .sort((a: any, b: any) =>
      sortAsc
        ? new Date(a.awarded_at).getTime() - new Date(b.awarded_at).getTime()
        : new Date(b.awarded_at).getTime() - new Date(a.awarded_at).getTime()
    );

  return (
    <Dialog open={!!badge} onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            {filtered.length} طالب حصل على "{badge?.name}"
          </DialogTitle>
        </DialogHeader>
        <div className="flex gap-2 items-center">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="ابحث بالاسم..." value={search} onChange={(e) => setSearch(e.target.value)} className="pr-9" />
          </div>
          <Button variant="outline" size="sm" onClick={() => setSortAsc((s) => !s)}>
            {sortAsc ? "الأقدم أولاً" : "الأحدث أولاً"}
          </Button>
        </div>
        <div className="max-h-[50vh] overflow-y-auto space-y-2">
          {isLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-6">لا نتائج</p>
          ) : filtered.map((r: any) => (
            <div key={r.profiles?.id ?? Math.random()} className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent">
              <Avatar className="w-9 h-9">
                <AvatarImage src={r.profiles?.avatar_url ?? undefined} />
                <AvatarFallback>{r.profiles?.full_name?.[0] ?? "?"}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{r.profiles?.full_name ?? "بدون اسم"}</div>
                <div className="text-xs text-muted-foreground">
                  #{r.profiles?.student_id ?? "—"} · حصل عليها {new Date(r.awarded_at).toLocaleDateString("ar-EG")}
                </div>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
