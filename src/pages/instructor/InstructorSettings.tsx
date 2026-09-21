import { useEffect, useState } from "react";
import { Settings2, Plus, Trash2, ShieldCheck, BookMarked, Layers, CreditCard } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useInstructorSelf } from "@/hooks/use-instructor-self";
import {
  listMyPayoutMethods, upsertMyPayoutMethod, deleteMyPayoutMethod,
  listWithdrawalMethods, type PayoutMethodRow, type WithdrawalMethodRow,
} from "@/lib/instructor-api";

export default function InstructorSettings() {
  const { user } = useAuth();
  const { self, loading: selfLoading, reload } = useInstructorSelf();
  const [payouts, setPayouts] = useState<PayoutMethodRow[]>([]);
  const [methods, setMethods] = useState<WithdrawalMethodRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PayoutMethodRow | null>(null);
  const [form, setForm] = useState({ method_key: "", label: "", value1: "", value2: "", holder: "" });
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([listMyPayoutMethods(), listWithdrawalMethods(true)])
      .then(([p, m]) => {
        setPayouts(p);
        setMethods(m);
      })
      .catch((e) => toast.error(e?.message || "تعذّر التحميل"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [user?.id]);

  const openNew = () => {
    setEditing(null);
    setForm({ method_key: methods[0]?.method_key ?? "", label: "", value1: "", value2: "", holder: "" });
    setDialogOpen(true);
  };

  const openEdit = (p: PayoutMethodRow) => {
    setEditing(p);
    setForm({
      method_key: p.method_key,
      label: p.label ?? "",
      value1: p.details.handle ?? p.details.phone ?? p.details.bank_name ?? "",
      value2: p.details.iban ?? "",
      holder: p.details.holder ?? "",
    });
    setDialogOpen(true);
  };

  const savePayout = async () => {
    if (!form.method_key) return toast.error("اختر الطريقة");
    const details: Record<string, any> = {};
    if (form.method_key === "instapay") details.handle = form.value1;
    else if (form.method_key === "ewallet") details.phone = form.value1;
    else {
      details.bank_name = form.value1;
      details.iban = form.value2;
      details.holder = form.holder;
      if (!form.value1 || !form.value2 || !form.holder) return toast.error("أكمل بيانات الحساب البنكي");
    }
    if (!Object.values(details).every((v) => String(v).trim())) return toast.error("أكمل البيانات");

    setSaving(true);
    try {
      await upsertMyPayoutMethod(
        {
          method_key: form.method_key,
          label: form.label.trim() || methods.find((m) => m.method_key === form.method_key)?.display_name || "",
          details,
        },
        editing?.id ?? null
      );
      toast.success("تم الحفظ");
      setDialogOpen(false);
      load();
    } catch (e: any) {
      toast.error(e?.message || "تعذّر الحفظ");
    } finally {
      setSaving(false);
    }
  };

  const removePayout = async (p: PayoutMethodRow) => {
    if (!confirm("حذف هذه البيانات؟")) return;
    try {
      await deleteMyPayoutMethod(p.id);
      toast.success("تم الحذف");
      load();
    } catch (e: any) {
      toast.error(e?.message || "تعذّر الحذف");
    }
  };

  const detailText = (p: PayoutMethodRow) => {
    const d = p.details ?? {};
    return [d.handle, d.phone, d.bank_name, d.iban, d.holder].filter(Boolean).join(" — ");
  };

  const PERM_LABELS: { key: string; label: string }[] = [
    { key: "can_create_courses", label: "إنشاء كورسات" },
    { key: "can_create_bundles", label: "إنشاء باقات" },
    { key: "can_create_books", label: "إنشاء كتب" },
    { key: "can_manage_locations", label: "إدارة أماكن التواجد" },
    { key: "can_manage_students", label: "إدارة الطلاب" },
  ];

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
          <Settings2 className="w-7 h-7 text-primary" />
          إعداداتي
        </h1>
        <p className="text-muted-foreground text-sm mt-1">بيانات السحب المحفوظة وصلاحياتك وموادك ومراحلك</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-primary" />
              بيانات السحب المحفوظة
            </span>
            <Button size="sm" onClick={openNew} disabled={methods.length === 0}>
              <Plus className="w-4 h-4 ml-1" />
              إضافة
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading ? (
            <Skeleton className="h-16 rounded-xl" />
          ) : payouts.length === 0 ? (
            <div className="text-sm text-muted-foreground py-3 text-center">
              لا توجد بيانات سحب محفوظة — يمكنك إدخالها مباشرة عند إنشاء طلب سحب
            </div>
          ) : (
            payouts.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border/60 p-3">
                <Badge variant="secondary">
                  {methods.find((m) => m.method_key === p.method_key)?.display_name ?? p.method_key}
                </Badge>
                <span className="text-sm flex-1 min-w-40 truncate">{p.label || detailText(p)}</span>
                <span className="text-xs text-muted-foreground truncate max-w-64">{detailText(p)}</span>
                <Button variant="outline" size="sm" onClick={() => openEdit(p)}>تعديل</Button>
                <Button variant="destructive" size="sm" onClick={() => removePayout(p)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="w-4 h-4 text-primary" />
              صلاحياتي
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {selfLoading ? (
              <Skeleton className="h-20 rounded-xl" />
            ) : (
              <>
                {PERM_LABELS.map((p) => {
                  const enabled =
                    (self?.permissions as any)?.[p.key] ?? (p.key === "can_create_bundles" ? false : true);
                  return (
                    <div key={p.key} className="flex items-center justify-between text-sm rounded-lg border border-border/50 px-3 py-2">
                      <span>{p.label}</span>
                      {enabled ? (
                        <Badge className="bg-green-500/10 text-green-600 border-green-500/30" variant="outline">
                          مسموح
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">غير مسموح</Badge>
                      )}
                    </div>
                  );
                })}
                {self?.permissions?.courses_percent_override != null && (
                  <div className="text-xs text-muted-foreground pt-1">
                    نسبتك الخاصة للدورات: {Number(self.permissions.courses_percent_override)}%
                  </div>
                )}
                {self?.permissions?.books_percent_override != null && (
                  <div className="text-xs text-muted-foreground">
                    نسبتك الخاصة للكتب: {Number(self.permissions.books_percent_override)}%
                  </div>
                )}
                <p className="text-xs text-muted-foreground">تعديل الصلاحيات يتم من إدارة المنصة</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BookMarked className="w-4 h-4 text-primary" />
              موادّي ومراحلي
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {selfLoading ? (
              <Skeleton className="h-20 rounded-xl" />
            ) : (
              <>
                <div>
                  <div className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1">
                    <BookMarked className="w-3 h-3" /> المواد
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {self?.subjects.length ? (
                      self.subjects.map((s) => <Badge key={s.id} variant="secondary">{s.name}</Badge>)
                    ) : (
                      <span className="text-xs text-muted-foreground">لم تختر مواد بعد</span>
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1">
                    <Layers className="w-3 h-3" /> المراحل
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {self?.stages.length ? (
                      self.stages.map((s) => <Badge key={s.id} variant="secondary">{s.name}</Badge>)
                    ) : (
                      <span className="text-xs text-muted-foreground">لم تختر مراحل بعد</span>
                    )}
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "تعديل بيانات السحب" : "بيانات سحب جديدة"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>الطريقة</Label>
              <Select value={form.method_key} onValueChange={(v) => setForm({ ...form, method_key: v })}>
                <SelectTrigger dir="rtl">
                  <SelectValue placeholder="اختر الطريقة" />
                </SelectTrigger>
                <SelectContent dir="rtl">
                  {methods.map((m) => (
                    <SelectItem key={m.method_key} value={m.method_key}>
                      {m.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>اسم مميز (اختياري)</Label>
              <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
            </div>
            {form.method_key === "instapay" && (
              <div className="space-y-2">
                <Label>عنوان إنستا باي (IPA)</Label>
                <Input value={form.value1} onChange={(e) => setForm({ ...form, value1: e.target.value })} />
              </div>
            )}
            {form.method_key === "ewallet" && (
              <div className="space-y-2">
                <Label>رقم المحفظة</Label>
                <Input value={form.value1} onChange={(e) => setForm({ ...form, value1: e.target.value })} />
              </div>
            )}
            {form.method_key === "bank" && (
              <>
                <div className="space-y-2">
                  <Label>اسم البنك</Label>
                  <Input value={form.value1} onChange={(e) => setForm({ ...form, value1: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>رقم الحساب / IBAN</Label>
                  <Input value={form.value2} onChange={(e) => setForm({ ...form, value2: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>اسم صاحب الحساب</Label>
                  <Input value={form.holder} onChange={(e) => setForm({ ...form, holder: e.target.value })} />
                </div>
              </>
            )}
            <Button onClick={savePayout} disabled={saving} className="w-full">
              حفظ
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}