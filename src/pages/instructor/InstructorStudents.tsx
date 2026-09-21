import { useEffect, useState } from "react";
import { Users, Pencil, Loader2, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  listInstructorStudents, updateInstructorStudent, type InstructorStudentRow,
} from "@/lib/instructor-api";

export default function InstructorStudents() {
  const [rows, setRows] = useState<InstructorStudentRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<InstructorStudentRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ full_name: "", phone_number: "" });
  const [saving, setSaving] = useState(false);

  const load = (s?: string) => {
    setLoading(true);
    listInstructorStudents(s ?? null)
      .then(setRows)
      .catch((e) => toast.error(e?.message || "تعذّر تحميل الطلاب"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const doSearch = () => load(search);

  const openEdit = (r: InstructorStudentRow) => {
    setEditing(r);
    setForm({ full_name: r.full_name ?? "", phone_number: r.phone_number ?? "" });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await updateInstructorStudent(editing.user_id, form.full_name, form.phone_number);
      toast.success("تم تحديث بيانات الطالب");
      setDialogOpen(false);
      load(search);
    } catch (e: any) {
      toast.error(e?.message || "تعذّر الحفظ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
          <Users className="w-7 h-7 text-primary" />
          الطلاب
        </h1>
        <p className="text-muted-foreground text-sm mt-1">الطلاب المسجلون في كورساتك</p>
      </div>

      <div className="flex gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && doSearch()}
          placeholder="بحث بالاسم / الهاتف / الكود…"
          className="max-w-xs"
        />
        <Button variant="outline" onClick={doSearch}>
          <Search className="w-4 h-4" />
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">لا يوجد طلاب مسجلون بعد</CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-accent/40 text-muted-foreground">
                  <tr>
                    <th className="p-3 text-right font-medium">الطالب</th>
                    <th className="p-3 text-right font-medium">الهاتف</th>
                    <th className="p-3 text-right font-medium">الكود</th>
                    <th className="p-3 text-right font-medium">كورساته</th>
                    <th className="p-3 text-right font-medium">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.user_id} className="border-t border-border/60 hover:bg-accent/20">
                      <td className="p-3 font-medium">{r.full_name || "طالب"}</td>
                      <td className="p-3 text-muted-foreground" dir="ltr">{r.phone_number ?? "—"}</td>
                      <td className="p-3 text-muted-foreground">{r.student_id ?? "—"}</td>
                      <td className="p-3">{r.enrolled_courses}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          {r.is_banned && <Badge variant="outline" className="text-red-600 border-red-500/30">محظور</Badge>}
                          <Button variant="outline" size="sm" onClick={() => openEdit(r)}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                        </div>
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
        <DialogContent dir="rtl" className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>تعديل بيانات الطالب</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>الاسم</Label>
              <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>رقم الهاتف</Label>
              <Input value={form.phone_number} onChange={(e) => setForm({ ...form, phone_number: e.target.value })} dir="ltr" />
            </div>
            <Button onClick={save} disabled={saving} className="w-full">
              {saving && <Loader2 className="w-4 h-4 ml-2 animate-spin" />}
              حفظ
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}