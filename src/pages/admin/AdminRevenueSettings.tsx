import { useEffect, useState } from "react";
import { Percent, Plus, Trash2, Loader2, CreditCard, Clock, Landmark } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  getRevenueSplitSettings, formatEGP, type RevenueSplitSettings,
} from "@/lib/instructor-api";
import {
  adminSaveRevenueSplitSettings, adminListWithdrawalMethods, adminUpdateWithdrawalMethod,
  type AdminWithdrawalMethodRow,
} from "@/lib/admin-instructors-api";

type Expense = RevenueSplitSettings["expenses"][number];

export default function AdminRevenueSettings() {
  const [s, setS] = useState<RevenueSplitSettings | null>(null);
  const [methods, setMethods] = useState<AdminWithdrawalMethodRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newExpense, setNewExpense] = useState<Expense>({ label: "", type: "percent", percent: 0, instructor_borne_percent: 50 });

  const load = () => {
    setLoading(true);
    Promise.all([getRevenueSplitSettings(), adminListWithdrawalMethods()])
      .then(([rs, m]) => {
        setS({ ...rs, expenses: rs.expenses ?? [] });
        setMethods(m);
      })
      .catch((e) => toast.error(e?.message || "تعذّر التحميل"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    if (!s) return;
    setSaving(true);
    try {
      await adminSaveRevenueSplitSettings({
        is_enabled: s.is_enabled,
        courses_instructor_percent: s.courses_instructor_percent,
        books_instructor_percent: s.books_instructor_percent,
        bundles_instructor_percent: s.bundles_instructor_percent,
        hold_days: s.hold_days,
        min_withdrawal_piastres: s.min_withdrawal_piastres,
        expenses: s.expenses,
      });
      toast.success("تم حفظ إعدادات الأرباح");
      load();
    } catch (e: any) {
      toast.error(e?.message || "تعذّر الحفظ");
    } finally {
      setSaving(false);
    }
  };

  const addExpense = () => {
    if (!s) return;
    if (!newExpense.label.trim()) return toast.error("اسم المصروف مطلوب");
    setS({ ...s, expenses: [...s.expenses, { ...newExpense, label: newExpense.label.trim() }] });
    setNewExpense({ label: "", type: "percent", percent: 0, instructor_borne_percent: 50 });
  };

  const removeExpense = (i: number) => {
    if (!s) return;
    setS({ ...s, expenses: s.expenses.filter((_, idx) => idx !== i) });
  };

  const toggleMethod = async (m: AdminWithdrawalMethodRow) => {
    try {
      await adminUpdateWithdrawalMethod(m.id, { is_enabled: !m.is_enabled });
      toast.success(m.is_enabled ? "تم تعطيل الطريقة" : "تم تفعيل الطريقة");
      load();
    } catch (e: any) {
      toast.error(e?.message || "تعذّر التنفيذ");
    }
  };

  const renameMethod = async (m: AdminWithdrawalMethodRow, displayName: string) => {
    try {
      await adminUpdateWithdrawalMethod(m.id, { display_name: displayName });
      setMethods((arr) => arr.map((x) => (x.id === m.id ? { ...x, display_name: displayName } : x)));
    } catch (e: any) {
      toast.error(e?.message || "تعذّر التعديل");
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <Percent className="w-7 h-7 text-primary" />
            إعدادات تقسيم الأرباح
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            النسب العامة وفترة التعليق وحد السحب والمصاريف — يمكن تجاوزها لكل معلم من صفحته
          </p>
        </div>
        <Button onClick={save} disabled={saving || loading}>
          {saving ? <Loader2 className="w-4 h-4 ml-2 animate-spin" /> : null}
          حفظ الإعدادات
        </Button>
      </div>

      {loading || !s ? (
        <Skeleton className="h-72 rounded-2xl" />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">الإعدادات العامة</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border border-border/50 px-3 py-2.5">
                <Label className="cursor-pointer">تفعيل تقسيم الأرباح مع المعلمين</Label>
                <Switch checked={s.is_enabled} onCheckedChange={(v) => setS({ ...s, is_enabled: v })} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>نسبة المعلم من الدورات (%)</Label>
                  <Input
                    type="number" min={0} max={100}
                    value={s.courses_instructor_percent}
                    onChange={(e) => setS({ ...s, courses_instructor_percent: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>نسبة المعلم من الكتب (%)</Label>
                  <Input
                    type="number" min={0} max={100}
                    value={s.books_instructor_percent}
                    onChange={(e) => setS({ ...s, books_instructor_percent: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>نسبة المعلم من باقاته (%)</Label>
                  <Input
                    type="number" min={0} max={100}
                    value={s.bundles_instructor_percent}
                    onChange={(e) => setS({ ...s, bundles_instructor_percent: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" /> أيام تعليق الأرباح قبل إتاحتها
                  </Label>
                  <Input
                    type="number" min={0}
                    value={s.hold_days}
                    onChange={(e) => setS({ ...s, hold_days: parseInt(e.target.value, 10) || 0 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>الحد الأدنى للسحب (جنيه)</Label>
                  <Input
                    type="number" min={0}
                    value={s.min_withdrawal_piastres / 100}
                    onChange={(e) =>
                      setS({ ...s, min_withdrawal_piastres: Math.round((parseFloat(e.target.value) || 0) * 100) })
                    }
                  />
                  <p className="text-xs text-muted-foreground">الحالي: {formatEGP(s.min_withdrawal_piastres)}</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                💡 باقات الأدمن أرباحها للأدمن بالكامل، أما باقات المعلم فتُحسب بالنسبة المحددة هنا بعد خصم المصاريف.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">قائمة المصاريف (ضرائب…) — تُخصم قبل التقسيم</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {s.expenses.map((ex, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 p-3">
                  <Badge variant="secondary">{ex.label}</Badge>
                  <span className="text-sm">
                    {ex.type === "percent"
                      ? `${ex.percent}% من الصافي`
                      : `مبلغ ثابت ${formatEGP((ex.percent ?? 0) * 100)}`}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    يتحمل المعلم {ex.instructor_borne_percent ?? "—"}% منه
                  </span>
                  <Button variant="ghost" size="sm" className="mr-auto text-destructive" onClick={() => removeExpense(i)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
              {s.expenses.length === 0 && (
                <div className="text-sm text-muted-foreground text-center py-2">لا توجد مصاريف مضافة</div>
              )}
              <div className="flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-border p-3">
                <div className="space-y-1">
                  <Label className="text-xs">الاسم</Label>
                  <Input
                    value={newExpense.label}
                    onChange={(e) => setNewExpense({ ...newExpense, label: e.target.value })}
                    placeholder="ضريبة…"
                    className="w-36"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">النوع</Label>
                  <Select value={newExpense.type} onValueChange={(v) => setNewExpense({ ...newExpense, type: v as any })}>
                    <SelectTrigger dir="rtl" className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent dir="rtl">
                      <SelectItem value="percent">نسبة %</SelectItem>
                      <SelectItem value="fixed">مبلغ ثابت</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">القيمة</Label>
                  <Input
                    type="number" min={0}
                    value={newExpense.percent ?? 0}
                    onChange={(e) => setNewExpense({ ...newExpense, percent: parseFloat(e.target.value) || 0 })}
                    className="w-24"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">تحمّل المعلم %</Label>
                  <Input
                    type="number" min={0} max={100}
                    value={newExpense.instructor_borne_percent ?? 50}
                    onChange={(e) =>
                      setNewExpense({ ...newExpense, instructor_borne_percent: parseFloat(e.target.value) || 0 })
                    }
                    className="w-24"
                  />
                </div>
                <Button variant="outline" onClick={addExpense}>
                  <Plus className="w-4 h-4 ml-1" /> إضافة
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CreditCard className="w-4 h-4 text-primary" />
                طرق السحب المتاحة للمعلمين
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {methods.map((m) => (
                <div key={m.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border/60 p-3">
                  <Landmark className="w-4 h-4 text-muted-foreground" />
                  <Input value={m.display_name} onChange={(e) => renameMethod(m, e.target.value)} className="w-44" />
                  <Badge variant="outline" className="text-muted-foreground">{m.method_key}</Badge>
                  <div className="mr-auto flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{m.is_enabled ? "مفعّلة" : "معطّلة"}</span>
                    <Switch checked={m.is_enabled} onCheckedChange={() => toggleMethod(m)} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}