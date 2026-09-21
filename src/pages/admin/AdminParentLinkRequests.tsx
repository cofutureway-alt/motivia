import { useEffect, useState } from "react";
import { Loader2, Check, X as XIcon, Clock, RotateCcw, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { AdminLinkRow, adminListParentLinkRequests, adminReviewParentLink } from "@/lib/parent-api";

const statusMeta: Record<string, { label: string; className: string; icon: any }> = {
  pending: { label: "قيد المراجعة", className: "bg-amber-500/15 text-amber-700", icon: Clock },
  approved: { label: "مقبول", className: "bg-emerald-500/15 text-emerald-700", icon: Check },
  rejected: { label: "مرفوض", className: "bg-rose-500/15 text-rose-700", icon: XIcon },
  revoked: { label: "ملغى", className: "bg-muted text-muted-foreground", icon: RotateCcw },
};

const AdminParentLinkRequests = () => {
  const [status, setStatus] = useState<string>("pending");
  const [rows, setRows] = useState<AdminLinkRow[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState("");

  const load = () => {
    setLoading(true);
    adminListParentLinkRequests(status === "all" ? undefined : status)
      .then(setRows).catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [status]);

  const doAction = async (id: string, action: "approve" | "reject" | "revoke") => {
    try {
      await adminReviewParentLink(id, action, note || undefined);
      toast.success("تم تنفيذ الإجراء");
      setNote("");
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const filtered = rows.filter((r) => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return [r.parent_name, r.parent_phone, r.student_name, r.student_code]
      .filter(Boolean).some((v) => String(v).toLowerCase().includes(s));
  });

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-black">طلبات ربط أولياء الأمور</h1>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث…" className="pr-9 h-9 w-56" />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">قيد المراجعة</SelectItem>
              <SelectItem value="approved">المقبولة</SelectItem>
              <SelectItem value="rejected">المرفوضة</SelectItem>
              <SelectItem value="revoked">الملغاة</SelectItem>
              <SelectItem value="all">الكل</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-muted-foreground py-12">لا توجد طلبات.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="text-right px-4 py-3">ولي الأمر</th>
                  <th className="text-right px-4 py-3">الطالب</th>
                  <th className="text-right px-4 py-3">صلة القرابة</th>
                  <th className="text-right px-4 py-3">الحالة</th>
                  <th className="text-right px-4 py-3">تاريخ الطلب</th>
                  <th className="text-right px-4 py-3">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const m = statusMeta[r.status];
                  const Icon = m.icon;
                  return (
                    <tr key={r.id} className="border-t border-border">
                      <td className="px-4 py-3">
                        <div className="font-semibold">{r.parent_name || "—"}</div>
                        <div className="text-xs text-muted-foreground" dir="ltr">{r.parent_phone}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold">{r.student_name || "—"}</div>
                        <div className="text-xs text-muted-foreground font-mono">{r.student_code}</div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{r.relationship || "—"}</td>
                      <td className="px-4 py-3">
                        <Badge className={`gap-1 ${m.className}`} variant="outline">
                          <Icon className="w-3 h-3" />{m.label}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums" dir="ltr">
                        {new Date(r.created_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          {r.status === "pending" && (
                            <>
                              <ReviewDialog trigger={<Button size="sm" variant="default"><Check className="w-4 h-4" /></Button>}
                                title="قبول الطلب" desc={`سيتمكن ${r.parent_name} من مشاهدة بيانات الطالب.`}
                                note={note} setNote={setNote} onConfirm={() => doAction(r.id, "approve")} />
                              <ReviewDialog trigger={<Button size="sm" variant="destructive"><XIcon className="w-4 h-4" /></Button>}
                                title="رفض الطلب" desc="سيتم رفض الطلب وإعلام ولي الأمر."
                                note={note} setNote={setNote} onConfirm={() => doAction(r.id, "reject")} />
                            </>
                          )}
                          {r.status === "approved" && (
                            <ReviewDialog trigger={<Button size="sm" variant="outline"><RotateCcw className="w-4 h-4" /></Button>}
                              title="إلغاء الربط" desc="سيفقد ولي الأمر إمكانية عرض بيانات الطالب."
                              note={note} setNote={setNote} onConfirm={() => doAction(r.id, "revoke")} />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};

const ReviewDialog = ({
  trigger, title, desc, note, setNote, onConfirm,
}: { trigger: React.ReactNode; title: string; desc: string; note: string; setNote: (s: string) => void; onConfirm: () => void }) => (
  <AlertDialog>
    <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{desc}</AlertDialogDescription>
      </AlertDialogHeader>
      <div className="space-y-2">
        <label className="text-sm">ملاحظة (اختياري)</label>
        <Input value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <AlertDialogFooter>
        <AlertDialogCancel>إلغاء</AlertDialogCancel>
        <AlertDialogAction onClick={onConfirm}>تأكيد</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

export default AdminParentLinkRequests;
