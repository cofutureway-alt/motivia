import { useEffect, useState } from "react";
import { Landmark, Plus, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import {
  formatEGP, fetchInstructorOverview, listMyWithdrawals, listWithdrawalMethods,
  listMyPayoutMethods, requestMyWithdrawal, getRevenueSplitSettings,
  type MyWithdrawalRow, type WithdrawalMethodRow, type PayoutMethodRow, type RevenueSplitSettings,
} from "@/lib/instructor-api";

const W_STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "قيد المراجعة", cls: "bg-orange-500/10 text-orange-600 border-orange-500/30" },
  approved: { label: "تمت الموافقة", cls: "bg-blue-500/10 text-blue-600 border-blue-500/30" },
  paid: { label: "تم التحويل", cls: "bg-green-500/10 text-green-600 border-green-500/30" },
  rejected: { label: "مرفوض", cls: "bg-red-500/10 text-red-600 border-red-500/30" },
};

export default function InstructorWithdrawals() {
  const { user } = useAuth();
  const [stats, setStats] = useState<any>(null);
  const [rows, setRows] = useState<MyWithdrawalRow[]>([]);
  const [methods, setMethods] = useState<WithdrawalMethodRow[]>([]);
  const [payouts, setPayouts] = useState<PayoutMethodRow[]>([]);
  const [settings, setSettings] = useState<RevenueSplitSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [methodKey, setMethodKey] = useState<string>("");
  const [payoutId, setPayoutId] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [inline, setInline] = useState({ handle: "", phone: "", bank_name: "", iban: "", holder: "" });
  const load = () => {
    setLoading(true);
    Promise.all([
      fetchInstructorOverview(),
      listMyWithdrawals(),
      listWithdrawalMethods(true),
      listMyPayoutMethods(),
      getRevenueSplitSettings(),
    ])
      .then(([o, r, m, p, s]) => {
        setStats(o);
        setRows(r);
        setMethods(m);
        setPayouts(p);
        setSettings(s);
      })
      .catch((e) => toast.error(e?.message || "تعذّر تحميل البيانات"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [user?.id]);

  const openDialog = () => {
    setMethodKey(methods[0]?.method_key ?? "");
    setPayoutId("");
    setAmount("");
    setInline({ handle: "", phone: "", bank_name: "", iban: "", holder: "" });
    setDialogOpen(true);
  };

  const buildDetails = (): Record<string, any> => {
    if (payoutId) return {};
    if (methodKey === "instapay") return { handle: inline.handle };
    if (methodKey === "ewallet") return { phone: inline.phone };
    if (methodKey === "bank") return { bank_name: inline.bank_name, iban: inline.iban, holder: inline.holder };
    return {};
  };

  const submit = async () => {
    if (!methodKey) return toast.error("اختر طريقة السحب");
    if (!payoutId) {
      const d = buildDetails();
      if (methodKey === "instapay" && !d.handle) return toast.error("أدخل عنوان إنستا باي");
      if (methodKey === "ewallet" && !d.phone) return toast.error("أدخل رقم المحفظة");
      if (methodKey === "bank" && (!d.bank_name || !d.iban || !d.holder))
        return toast.error("أكمل بيانات الحساب البنكي");
    }
    const minP = settings?.min_withdrawal_piastres ?? 10000;
    const amountP = amount.trim() === "" ? null : Math.round(parseFloat(amount) * 100);
    if (amountP !== null && (isNaN(amountP) || amountP < minP)) {
      return toast.error(`الحد الأدنى للسحب هو ${minP / 100} جنيه`);
    }
    setSubmitting(true);
    try {
      await requestMyWithdrawal({
        methodKey,
        payoutMethodId: payoutId || null,
        details: payoutId ? {} : buildDetails(),
        amountPiastres: amountP,
      });
      toast.success("تم إرسال طلب السحب — سيتم مراجعته من الإدارة");
      setDialogOpen(false);
      load();
    } catch (e: any) {
      toast.error(e?.message || "تعذّر إرسال الطلب");
    } finally {
      setSubmitting(false);
    }
  };

  const available = Number(stats?.earnings_available_piastres ?? 0);

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <Landmark className="w-7 h-7 text-primary" />
            طلبات السحب
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {settings ? `الحد الأدنى للسحب: ${settings.min_withdrawal_piastres / 100} جنيه` : ""}
          </p>
        </div>
        <Button onClick={openDialog} disabled={loading || methods.length === 0 || available <= 0}>
          <Plus className="w-4 h-4 ml-2" />
          طلب سحب جديد
        </Button>
      </div>

      <Card>
        <CardContent className="p-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-muted-foreground">رصيدك المتاح للسحب</div>
            <div className="text-2xl font-bold text-green-600">{formatEGP(available)}</div>
          </div>
          {methods.length === 0 && !loading && (
            <span className="text-xs text-destructive">لا توجد طرق سحب مفعّلة حاليًا</span>
          )}
        </CardContent>
      </Card>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            لا توجد طلبات سحب بعد
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-accent/40 text-muted-foreground">
                  <tr>
                    <th className="p-3 text-right font-medium">المبلغ</th>
                    <th className="p-3 text-right font-medium">الطريقة</th>
                    <th className="p-3 text-right font-medium">الحالة</th>
                    <th className="p-3 text-right font-medium">التاريخ</th>
                    <th className="p-3 text-right font-medium">ملاحظات</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t border-border/60 hover:bg-accent/20">
                      <td className="p-3 font-bold">{formatEGP(r.amount_piastres)}</td>
                      <td className="p-3">
                        {methods.find((m) => m.method_key === r.method_key)?.display_name ?? r.method_key}
                      </td>
                      <td className="p-3">
                        <Badge variant="outline" className={W_STATUS[r.status]?.cls ?? ""}>
                          {W_STATUS[r.status]?.label ?? r.status}
                        </Badge>
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">
                        {new Date(r.created_at).toLocaleString("ar-EG")}
                      </td>
                      <td className="p-3 text-xs max-w-64">
                        {r.rejection_reason && (
                          <span className="text-red-600 block">سبب الرفض: {r.rejection_reason}</span>
                        )}
                        {r.admin_note && <span className="text-muted-foreground block">ملاحظة: {r.admin_note}</span>}
                        {r.proof_url && (
                          <a href={r.proof_url} target="_blank" rel="noreferrer" className="text-blue-600 underline block">
                            إثبات الدفع
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>طلب سحب جديد</DialogTitle>
            <DialogDescription>
              الرصيد المتاح: <span className="font-bold text-green-600">{formatEGP(available)}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>طريقة السحب</Label>
              <Select value={methodKey} onValueChange={(v) => { setMethodKey(v); setPayoutId(""); }}>
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

            {payouts.filter((p) => p.method_key === methodKey).length > 0 && (
              <div className="space-y-2">
                <Label>بيانات محفوظة (اختياري)</Label>
                <Select value={payoutId} onValueChange={setPayoutId}>
                  <SelectTrigger dir="rtl">
                    <SelectValue placeholder="أدخل بيانات جديدة أو اختر محفوظة" />
                  </SelectTrigger>
                  <SelectContent dir="rtl">
                    {payouts
                      .filter((p) => p.method_key === methodKey)
                      .map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.label || p.method_key}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {!payoutId && methodKey === "instapay" && (
              <div className="space-y-2">
                <Label>عنوان إنستا باي (IPA)</Label>
                <Input
                  value={inline.handle}
                  onChange={(e) => setInline({ ...inline, handle: e.target.value })}
                  placeholder="example@instapay"
                />
              </div>
            )}
            {!payoutId && methodKey === "ewallet" && (
              <div className="space-y-2">
                <Label>رقم المحفظة</Label>
                <Input
                  value={inline.phone}
                  onChange={(e) => setInline({ ...inline, phone: e.target.value })}
                  placeholder="01xxxxxxxxx"
                />
              </div>
            )}
            {!payoutId && methodKey === "bank" && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>اسم البنك</Label>
                  <Input value={inline.bank_name} onChange={(e) => setInline({ ...inline, bank_name: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>رقم الحساب / IBAN</Label>
                  <Input value={inline.iban} onChange={(e) => setInline({ ...inline, iban: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>اسم صاحب الحساب</Label>
                  <Input value={inline.holder} onChange={(e) => setInline({ ...inline, holder: e.target.value })} />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>المبلغ (جنيه) — اتركه فارغًا لسحب كامل الرصيد</Label>
              <Input
                type="number"
                min={0}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={`${(available / 100).toFixed(2)}`}
              />
            </div>

            <Button onClick={submit} disabled={submitting} className="w-full">
              {submitting && <Loader2 className="w-4 h-4 ml-2 animate-spin" />}
              إرسال الطلب
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
