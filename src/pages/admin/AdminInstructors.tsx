import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  GraduationCap, Plus, UserPlus, Search, Loader2, Settings2, Wallet, BookOpen, Users,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  adminListInstructors, adminCreateInstructor, adminPromoteToInstructor,
  type AdminInstructorRow,
} from "@/lib/admin-instructors-api";
import { listAllUsers as listUsers, type AdminUserRow } from "@/lib/admin-users-api";
import { formatEGP } from "@/lib/instructor-api";

export default function AdminInstructors() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<AdminInstructorRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ full_name: "", phone: "", password: "", real_email: "" });
  const [creating, setCreating] = useState(false);

  // Promote dialog
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [promoteSearch, setPromoteSearch] = useState("");
  const [promoteResults, setPromoteResults] = useState<AdminUserRow[]>([]);
  const [promoteSearching, setPromoteSearching] = useState(false);
  const [promoting, setPromoting] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    adminListInstructors(search)
      .then(setRows)
      .catch((e) => toast.error(e?.message || "تعذّر التحميل"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const doCreate = async () => {
    if (!createForm.full_name.trim() || !createForm.phone.trim() || !createForm.password)
      return toast.error("أكمل الاسم والهاتف وكلمة المرور");
    setCreating(true);
    try {
      await adminCreateInstructor({
        full_name: createForm.full_name.trim(),
        phone_number: createForm.phone.trim(),
        password: createForm.password,
        real_email: createForm.real_email.trim() || undefined,
      });
      toast.success("تم إنشاء حساب المعلم");
      setCreateOpen(false);
      setCreateForm({ full_name: "", phone: "", password: "", real_email: "" });
      load();
    } catch (e: any) {
      toast.error(e?.message || "تعذّر إنشاء الحساب");
    } finally {
      setCreating(false);
    }
  };

  const doPromoteSearch = async () => {
    setPromoteSearching(true);
    try {
      const res = await listUsers({ search: promoteSearch, role: "student", limit: 20 });
      setPromoteResults(res);
    } catch (e: any) {
      toast.error(e?.message || "تعذّر البحث");
    } finally {
      setPromoteSearching(false);
    }
  };

  const doPromote = async (userId: string, name: string) => {
    if (!confirm(`ترقية "${name}" إلى معلم؟`)) return;
    setPromoting(userId);
    try {
      await adminPromoteToInstructor(userId);
      toast.success("تمت الترقية — أدعوه لاختيار موادّه عند أول دخول");
      setPromoteOpen(false);
      load();
    } catch (e: any) {
      toast.error(e?.message || "تعذّرت الترقية");
    } finally {
      setPromoting(null);
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <GraduationCap className="w-7 h-7 text-primary" />
            المعلمون
          </h1>
          <p className="text-muted-foreground text-sm mt-1">إدارة حسابات المعلمين وصلاحياتهم وأرباحهم</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setPromoteOpen(true)}>
            <UserPlus className="w-4 h-4 ml-2" />
            ترقية طالب
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4 ml-2" />
            معلم جديد
          </Button>
        </div>
      </div>

      <div className="flex gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()}
          placeholder="بحث بالاسم / الهاتف…"
          className="max-w-xs"
        />
        <Button variant="outline" onClick={load}>
          <Search className="w-4 h-4" />
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">لا يوجد معلمون بعد</CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <Card key={r.instructor_id}>
              <CardContent className="p-4 flex flex-wrap items-center gap-4">
                <Avatar className="w-11 h-11">
                  <AvatarImage src={r.avatar_url ?? undefined} />
                  <AvatarFallback className="bg-primary/10 text-primary">
                    {r.full_name?.[0] ?? "م"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-40">
                  <div className="font-semibold">{r.full_name || "بدون اسم"}</div>
                  <div className="text-xs text-muted-foreground" dir="ltr">{r.phone_number ?? "—"}</div>
                </div>
                <div className="flex flex-wrap gap-3 text-xs">
                  <span className="flex items-center gap-1 rounded-lg bg-blue-500/10 text-blue-600 px-2 py-1">
                    <BookOpen className="w-3 h-3" /> {r.courses_count} كورس
                  </span>
                  <span className="flex items-center gap-1 rounded-lg bg-emerald-500/10 text-emerald-600 px-2 py-1">
                    <Users className="w-3 h-3" /> {r.enrollments_count} تسجيل
                  </span>
                  <span className="flex items-center gap-1 rounded-lg bg-amber-500/10 text-amber-600 px-2 py-1">
                    <BookOpen className="w-3 h-3" /> {r.book_sales_count} كتاب
                  </span>
                  <span className="flex items-center gap-1 rounded-lg bg-orange-500/10 text-orange-600 px-2 py-1">
                    <Wallet className="w-3 h-3" /> معلّق {formatEGP(r.earnings_pending_piastres)}
                  </span>
                  <span className="flex items-center gap-1 rounded-lg bg-green-500/10 text-green-600 px-2 py-1">
                    <Wallet className="w-3 h-3" /> متاح {formatEGP(r.earnings_available_piastres)}
                  </span>
                  <span className="flex items-center gap-1 rounded-lg bg-slate-500/10 text-slate-600 px-2 py-1">
                    <Wallet className="w-3 h-3" /> مسحوب {formatEGP(r.earnings_withdrawn_piastres)}
                  </span>
                  {r.pending_withdrawals > 0 && (
                    <Badge variant="outline" className="text-red-600 border-red-500/30">
                      {r.pending_withdrawals} طلب سحب
                    </Badge>
                  )}
                </div>
                <Button size="sm" variant="outline" onClick={() => navigate(`/admin/instructors/${r.instructor_id}`)}>
                  <Settings2 className="w-4 h-4 ml-1" />
                  الإعدادات
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create instructor dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>إنشاء حساب معلم جديد</DialogTitle>
            <DialogDescription>
              سيتم إنشاء حساب بالدور "معلم" — يمكنه الدخول بعد اختيار موادّه ومراحله
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>الاسم الكامل *</Label>
              <Input value={createForm.full_name} onChange={(e) => setCreateForm({ ...createForm, full_name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>رقم الهاتف (مصري) *</Label>
              <Input dir="ltr" placeholder="01xxxxxxxxx" value={createForm.phone} onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>كلمة المرور *</Label>
              <Input type="password" value={createForm.password} onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>بريد حقيقي (اختياري)</Label>
              <Input type="email" value={createForm.real_email} onChange={(e) => setCreateForm({ ...createForm, real_email: e.target.value })} />
            </div>
            <Button onClick={doCreate} disabled={creating} className="w-full">
              {creating && <Loader2 className="w-4 h-4 ml-2 animate-spin" />}
              إنشاء الحساب
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Promote student dialog */}
      <Dialog open={promoteOpen} onOpenChange={setPromoteOpen}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>ترقية طالب موجود إلى معلم</DialogTitle>
            <DialogDescription>ابحث عن الطالب ثم اضغط ترقية</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                value={promoteSearch}
                onChange={(e) => setPromoteSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && doPromoteSearch()}
                placeholder="اسم أو هاتف الطالب…"
              />
              <Button variant="outline" onClick={doPromoteSearch} disabled={promoteSearching}>
                {promoteSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              </Button>
            </div>
            <div className="max-h-64 overflow-y-auto space-y-1.5">
              {promoteResults.map((u) => (
                <div key={u.id} className="flex items-center justify-between rounded-xl border border-border/60 p-2.5">
                  <div>
                    <div className="text-sm font-medium">{u.full_name || "بدون اسم"}</div>
                    <div className="text-xs text-muted-foreground" dir="ltr">{u.phone_number ?? u.email ?? "—"}</div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => doPromote(u.id, u.full_name ?? "")}
                    disabled={promoting === u.id}
                  >
                    {promoting === u.id && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}
                    ترقية
                  </Button>
                </div>
              ))}
              {promoteResults.length === 0 && !promoteSearching && (
                <div className="text-xs text-muted-foreground text-center py-4">ابحث أولاً عن طالب</div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}