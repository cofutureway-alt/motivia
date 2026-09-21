import { useEffect, useState } from "react";
import { ClipboardEdit, Loader2, Check } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  listInstructorAssignmentSubmissions, gradeInstructorAssignment, finalizeInstructorSubmission,
  type InstructorSubmissionRow,
} from "@/lib/instructor-grading-api";

export default function InstructorAssignmentSubmissions() {
  const [rows, setRows] = useState<InstructorSubmissionRow[]>([]);
  const [search, setSearch] = useState("");
  const [ungradedOnly, setUngradedOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [grading, setGrading] = useState<InstructorSubmissionRow | null>(null);
  const [gradeVal, setGradeVal] = useState("");
  const [feedback, setFeedback] = useState("");
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    listInstructorAssignmentSubmissions({ userSearch: search || null, ungradedOnly })
      .then(setRows)
      .catch((e) => toast.error(e?.message || "تعذّر التحميل"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [ungradedOnly]);

  const openGrade = (r: InstructorSubmissionRow) => {
    setGrading(r);
    setGradeVal(r.grade != null ? String(r.grade) : "");
    setFeedback("");
  };

  const submitGrade = async () => {
    if (!grading) return;
    const g = parseFloat(gradeVal);
    if (isNaN(g) || g < 0) return toast.error("أدخل درجة صحيحة");
    setSaving(true);
    try {
      await gradeInstructorAssignment(grading.submission_id, g, null, feedback || null);
      toast.success("تم حفظ الدرجة");
      setGrading(null);
      load();
    } catch (e: any) {
      toast.error(e?.message || "تعذّر الحفظ");
    } finally {
      setSaving(false);
    }
  };

  const finalize = async (r: InstructorSubmissionRow) => {
    try {
      await finalizeInstructorSubmission(r.submission_id);
      toast.success("تم احتسابها كغير مسلّمة (صفر)");
      load();
    } catch (e: any) {
      toast.error(e?.message || "تعذّر التنفيذ");
    }
  };

  const outcomeBadge = (r: InstructorSubmissionRow) => {
    const oc = r.outcome ?? r.computed_outcome;
    if (!oc) return null;
    if (oc === "passed")
      return <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30">ناجح</Badge>;
    if (oc === "failed")
      return <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/30">راسب</Badge>;
    if (oc === "not_submitted")
      return <Badge variant="outline" className="bg-slate-500/10 text-slate-600 border-slate-500/30">غير مسلّمة</Badge>;
    return null;
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
          <ClipboardEdit className="w-7 h-7 text-primary" />
          تسليمات الواجبات
        </h1>
        <p className="text-muted-foreground text-sm mt-1">تسليمات الطلاب على واجبات كورساتك — رقّم وقيّم</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()}
          placeholder="بحث باسم/بريد/كود الطالب…"
          className="max-w-xs"
        />
        <Button variant="outline" onClick={load}>بحث</Button>
        <div className="flex items-center gap-2">
          <Switch checked={ungradedOnly} onCheckedChange={setUngradedOnly} id="ungraded-only" />
          <Label htmlFor="ungraded-only">غير مُصححة فقط</Label>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">لا توجد تسليمات</CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-accent/40 text-muted-foreground">
                  <tr>
                    <th className="p-3 text-right font-medium">الطالب</th>
                    <th className="p-3 text-right font-medium">الواجب</th>
                    <th className="p-3 text-right font-medium">الكورس</th>
                    <th className="p-3 text-right font-medium">الدرجة</th>
                    <th className="p-3 text-right font-medium">النتيجة</th>
                    <th className="p-3 text-right font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.submission_id} className="border-t border-border/60 hover:bg-accent/20">
                      <td className="p-3 font-medium">
                        {r.student_name || "طالب"}
                        {r.student_student_id && (
                          <div className="text-xs text-muted-foreground">{r.student_student_id}</div>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="truncate max-w-40">{r.assignment_title}</div>
                        {r.total_grade != null && (
                          <div className="text-xs text-muted-foreground">من {r.total_grade}</div>
                        )}
                      </td>
                      <td className="p-3 text-xs text-muted-foreground truncate max-w-32">{r.course_title}</td>
                      <td className="p-3 font-bold">
                        {r.grade != null ? r.grade : <span className="text-muted-foreground font-normal">—</span>}
                      </td>
                      <td className="p-3">{outcomeBadge(r)}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <Button size="sm" onClick={() => openGrade(r)}>
                            <Check className="w-4 h-4 ml-1" />
                            رقمنة
                          </Button>
                          {r.outcome == null && r.computed_outcome == null && (
                            <Button variant="outline" size="sm" onClick={() => finalize(r)}>
                              احتساب كغير مسلّمة
                            </Button>
                          )}
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

      <Dialog open={!!grading} onOpenChange={(v) => !v && setGrading(null)}>
        <DialogContent dir="rtl" className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>رقمنة الواجب</DialogTitle>
          </DialogHeader>
          {grading && (
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">
                {grading.student_name} — {grading.assignment_title}
                {grading.total_grade != null && ` (الدرجة الكاملة: ${grading.total_grade})`}
              </div>
              <Input
                type="number"
                min={0}
                max={grading.total_grade ?? undefined}
                value={gradeVal}
                onChange={(e) => setGradeVal(e.target.value)}
                placeholder={`من ${grading.total_grade ?? 100}`}
              />
              <textarea
                rows={3}
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="تقييم / ملاحظات (اختياري)"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
              />
              <Button onClick={submitGrade} disabled={saving} className="w-full">
                {saving && <Loader2 className="w-4 h-4 ml-2 animate-spin" />}
                حفظ الدرجة
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}