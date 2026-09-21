import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, Ban, ShieldCheck, Trash2, Eye, Users, Clock, Check, X as XIcon, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  AdminParentLinkRow, AdminParentRow,
  adminDeleteParent, adminGetParentLinks, adminListParents, adminSetParentBanned,
  adminReviewParentLink,
} from "@/lib/parent-api";

const statusMeta: Record<string, { label: string; className: string; icon: any }> = {
  pending: { label: "قيد المراجعة", className: "bg-amber-500/15 text-amber-700 dark:text-amber-300", icon: Clock },
  approved: { label: "مقبول", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", icon: Check },
  rejected: { label: "مرفوض", className: "bg-rose-500/15 text-rose-700 dark:text-rose-300", icon: XIcon },
  revoked: { label: "ملغى", className: "bg-muted text-muted-foreground", icon: RotateCcw },
};

const AdminParents = () => {
  const [rows, setRows] = useState<AdminParentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [detail, setDetail] = useState<AdminParentRow | null>(null);
  const [detailLinks, setDetailLinks] = useState<AdminParentLinkRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [confirm, setConfirm] = useState<null | { kind: "ban" | "unban" | "delete"; parent: AdminParentRow }>(null);
  const [note, setNote] = useState("");

  const load = () => {
    setLoading(true);
    adminListParents().then(setRows).catch((e) => toast.error(e.message)).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) =>
      [r.full_name, r.phone_number, r.email].filter(Boolean).some((v) => String(v).toLowerCase().includes(s))
    );
  }, [rows, q]);

  const openDetail = async (p: AdminParentRow) => {
    setDetail(p);
    setDetailLoading(true);
    try {
      const links = await adminGetParentLinks(p.parent_user_id);
      setDetailLinks(links);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setDetailLoading(false);
    }
  };

  const refreshDetail = async () => {
    if (!detail) return;
    try {
      setDetailLinks(await adminGetParentLinks(detail.parent_user_id));
    } catch (e: any) { toast.error(e.message); }
  };

  const doAction = async (id: string, action: "approve" | "reject" | "revoke") => {
    try {
      await adminReviewParentLink(id, action, note || undefined);
      toast.success("تم تنفيذ الإجراء");
      setNote("");
      await refreshDetail();
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const doBan = async (p: AdminParentRow, banned: boolean) => {
    try {
      await adminSetParentBanned(p.parent_user_id, banned);
      toast.success(banned ? "تم حظر الحساب" : "تم رفع الحظر");
      setRows((rs) => rs.map((r) => (r.parent_user_id === p.parent_user_id ? { ...r, is_banned: banned } : r)));
    } catch (e: any) { toast.error(e.message); }
  };

  const doDelete = async (p: AdminParentRow) => {
    try {
      await adminDeleteParent(p.parent_user_id);
      toast.success("تم حذف الحساب");
      setRows((rs) => rs.filter((r) => r.parent_user_id !== p.parent_user_id));
      if (detail?.parent_user_id === p.parent_user_id) setDetail(null);
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-black">إدارة أولياء الأمور</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {rows.length} ولي أمر مسجّل
          </p>
        </div>
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث بالاسم أو الهاتف…" className="pr-9 h-9 w-64" />
        </div>
      </div>

      <Card className="overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-muted-foreground py-16">لا يوجد أولياء أمور.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="p-3 text-right font-semibold">ولي الأمر</th>
                  <th className="p-3 text-right font-semibold">الهاتف</th>
                  <th className="p-3 text-center font-semibold">الأطفال</th>
                  <th className="p-3 text-center font-semibold">قيد المراجعة</th>
                  <th className="p-3 text-center font-semibold">إجمالي الطلبات</th>
                  <th className="p-3 text-center font-semibold">الحالة</th>
                  <th className="p-3 text-center font-semibold">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.parent_user_id} className="border-t border-border hover:bg-muted/30">
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        {r.avatar_url ? (
                          <img src={r.avatar_url} className="w-8 h-8 rounded-full object-cover" alt="" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                            {(r.full_name?.[0] ?? "و").toUpperCase()}
                          </div>
                        )}
                        <div className="flex flex-col">
                          <span className="font-semibold">{r.full_name || "بدون اسم"}</span>
                          {r.email && <span className="text-xs text-muted-foreground">{r.email}</span>}
                        </div>
                      </div>
                    </td>
                    <td className="p-3 font-mono text-xs">{r.phone_number || "—"}</td>
                    <td className="p-3 text-center">
                      <Badge variant="secondary" className="gap-1"><Users className="w-3 h-3" />{r.approved_children_count}</Badge>
                    </td>
                    <td className="p-3 text-center">
                      {r.pending_requests_count > 0 ? (
                        <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300">{r.pending_requests_count}</Badge>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </td>
                    <td className="p-3 text-center">{r.total_requests_count}</td>
                    <td className="p-3 text-center">
                      {r.is_banned ? (
                        <Badge className="bg-rose-500/15 text-rose-700 dark:text-rose-300">محظور</Badge>
                      ) : (
                        <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">نشط</Badge>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center justify-center gap-1">
                        <Button size="icon" variant="ghost" onClick={() => openDetail(r)} title="عرض الروابط">
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          size="icon" variant="ghost"
                          onClick={() => setConfirm({ kind: r.is_banned ? "unban" : "ban", parent: r })}
                          title={r.is_banned ? "رفع الحظر" : "حظر"}
                          className={r.is_banned ? "text-emerald-600" : "text-amber-600"}
                        >
                          {r.is_banned ? <ShieldCheck className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
                        </Button>
                        <Button size="icon" variant="ghost" className="text-destructive"
                          onClick={() => setConfirm({ kind: "delete", parent: r })} title="حذف">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Detail dialog: all links & requests for one parent */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>روابط ولي الأمر — {detail?.full_name || "بدون اسم"}</DialogTitle>
            <DialogDescription>
              {detail?.phone_number} {detail?.email && `• ${detail.email}`}
            </DialogDescription>
          </DialogHeader>

          {detailLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : detailLinks.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">لا توجد روابط أو طلبات.</div>
          ) : (
            <div className="space-y-3 max-h-[60vh] overflow-y-auto">
              {detailLinks.map((l) => {
                const meta = statusMeta[l.status] ?? statusMeta.pending;
                const Icon = meta.icon;
                return (
                  <div key={l.id} className="border border-border rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div>
                        <div className="font-semibold">{l.student_name || "طالب غير معروف"}</div>
                        <div className="text-xs text-muted-foreground font-mono">
                          {l.student_code || "—"} {l.student_phone && `• ${l.student_phone}`}
                        </div>
                      </div>
                      <Badge className={`gap-1 ${meta.className}`}><Icon className="w-3 h-3" />{meta.label}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground flex flex-wrap gap-3">
                      {l.relationship && <span>الصلة: {l.relationship}</span>}
                      <span>أُنشئ: {new Date(l.created_at).toLocaleDateString("ar-EG")}</span>
                      {l.reviewed_at && <span>تمت المراجعة: {new Date(l.reviewed_at).toLocaleDateString("ar-EG")}</span>}
                    </div>
                    {l.request_note && (
                      <div className="text-xs bg-muted/50 rounded p-2">
                        <span className="font-semibold">ملاحظة الطلب:</span> {l.request_note}
                      </div>
                    )}
                    {l.admin_note && (
                      <div className="text-xs bg-muted/50 rounded p-2">
                        <span className="font-semibold">ملاحظة الإدارة:</span> {l.admin_note}
                      </div>
                    )}
                    <div className="flex gap-2 pt-1 flex-wrap">
                      {l.status === "pending" && (
                        <>
                          <Button size="sm" className="h-8" onClick={() => doAction(l.id, "approve")}>
                            <Check className="w-3.5 h-3.5 ms-1" />قبول
                          </Button>
                          <Button size="sm" variant="destructive" className="h-8" onClick={() => doAction(l.id, "reject")}>
                            <XIcon className="w-3.5 h-3.5 ms-1" />رفض
                          </Button>
                        </>
                      )}
                      {l.status === "approved" && (
                        <Button size="sm" variant="outline" className="h-8" onClick={() => doAction(l.id, "revoke")}>
                          <RotateCcw className="w-3.5 h-3.5 ms-1" />إلغاء الربط
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
              <div>
                <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="ملاحظة اختيارية للإجراء التالي…" className="h-9" />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirmation */}
      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.kind === "delete" && "حذف حساب ولي الأمر نهائيًا؟"}
              {confirm?.kind === "ban" && "حظر حساب ولي الأمر؟"}
              {confirm?.kind === "unban" && "رفع الحظر عن الحساب؟"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === "delete" && "سيتم حذف الحساب وجميع بياناته بشكل نهائي ولا يمكن التراجع."}
              {confirm?.kind === "ban" && "لن يتمكن ولي الأمر من الدخول حتى يتم رفع الحظر."}
              {confirm?.kind === "unban" && "سيتمكن ولي الأمر من الدخول مجددًا."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className={confirm?.kind === "delete" ? "bg-destructive hover:bg-destructive/90" : ""}
              onClick={() => {
                if (!confirm) return;
                if (confirm.kind === "delete") doDelete(confirm.parent);
                else doBan(confirm.parent, confirm.kind === "ban");
                setConfirm(null);
              }}
            >
              تأكيد
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminParents;
