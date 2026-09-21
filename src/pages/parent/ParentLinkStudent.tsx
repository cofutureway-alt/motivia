import { useEffect, useState } from "react";
import { Loader2, LinkIcon, Check, Clock, X as XIcon, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { listMyLinkRequests, ParentLinkRequest, requestStudentLink } from "@/lib/parent-api";

const statusMeta: Record<string, { label: string; icon: any; className: string }> = {
  pending: { label: "قيد المراجعة", icon: Clock, className: "bg-amber-500/15 text-amber-700 border-amber-500/30" },
  approved: { label: "مقبول", icon: Check, className: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30" },
  rejected: { label: "مرفوض", icon: XIcon, className: "bg-rose-500/15 text-rose-700 border-rose-500/30" },
  revoked: { label: "ملغى", icon: RotateCcw, className: "bg-muted text-muted-foreground" },
};

const ParentLinkStudent = () => {
  const [code, setCode] = useState("");
  const [relationship, setRelationship] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [requests, setRequests] = useState<ParentLinkRequest[]>([]);

  const load = () => listMyLinkRequests().then(setRequests).catch((e) => toast.error(e.message));
  useEffect(() => { load(); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.trim().length < 4) return toast.error("أدخل رقم الطالب المكوّن من 6 أرقام");
    setSubmitting(true);
    try {
      const res = await requestStudentLink(code.trim(), relationship || undefined, note || undefined);
      if (res.success) {
        toast.success("تم إرسال طلب الربط، بانتظار موافقة الإدارة");
        setCode(""); setRelationship(""); setNote("");
        load();
      } else if (res.reason === "pending") {
        toast.info("لديك طلب سابق قيد المراجعة لهذا الطالب");
      } else if (res.reason === "approved") {
        toast.info("هذا الطالب مربوط بحسابك بالفعل");
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h1 className="text-2xl font-black">ربط طالب جديد</h1>

      <Card className="p-6">
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm font-bold">رقم الطالب (6 أرقام)</Label>
            <Input value={code} onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ""))}
              maxLength={6} dir="ltr" className="font-mono text-center text-lg tracking-widest" placeholder="######" />
            <p className="text-xs text-muted-foreground">اطلب من ابنك رقمه الظاهر في صفحة حسابه.</p>
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-bold">صلة القرابة (اختياري)</Label>
            <Input value={relationship} onChange={(e) => setRelationship(e.target.value)} placeholder="أب / أم / وليّ" />
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-bold">ملاحظة للإدارة (اختياري)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><LinkIcon className="w-4 h-4 ml-2" />إرسال الطلب</>}
          </Button>
        </form>
      </Card>

      <div className="space-y-3">
        <h2 className="font-bold text-lg">طلباتي السابقة</h2>
        {requests.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">لا توجد طلبات بعد.</Card>
        ) : requests.map((r) => {
          const meta = statusMeta[r.status];
          const Icon = meta.icon;
          return (
            <Card key={r.id} className="p-4 flex items-center justify-between gap-4 flex-wrap">
              <div>
                <div className="font-bold">{r.student_name || "—"}</div>
                <div className="text-xs text-muted-foreground font-mono">{r.student_code}</div>
                {r.admin_note && <div className="text-xs text-muted-foreground mt-1">ملاحظة الإدارة: {r.admin_note}</div>}
              </div>
              <Badge className={`gap-1 ${meta.className}`} variant="outline">
                <Icon className="w-3 h-3" /> {meta.label}
              </Badge>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default ParentLinkStudent;
