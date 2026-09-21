import { useEffect, useState } from "react";
import { ClipboardCheck, Loader2, Save, MessageSquarePlus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  listInstructorQuizAttempts, getInstructorAttemptReview, saveInstructorGrading,
  saveInstructorFeedback, type InstructorAttemptRow,
} from "@/lib/instructor-grading-api";

const A_STATUS: Record<string, { label: string; cls: string }> = {
  needs_review: { label: "بحاجة لتصحيح", cls: "bg-orange-500/10 text-orange-600 border-orange-500/30" },
  graded: { label: "مُصحح", cls: "bg-green-500/10 text-green-600 border-green-500/30" },
  submitted: { label: "مُسلّم", cls: "bg-blue-500/10 text-blue-600 border-blue-500/30" },
};

interface ReviewQuestion {
  question_id: string;
  content: string;
  type: string;
  points: number;
  options: { id: string; content: string; is_correct: boolean }[];
  answer: { answer_text: string | null; selected_option_id: string | null; is_correct: boolean | null; points_earned: number | null } | null;
}

export default function InstructorQuizAttempts() {
  const [rows, setRows] = useState<InstructorAttemptRow[]>([]);
  const [search, setSearch] = useState("");
  const [reviewOnly, setReviewOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [review, setReview] = useState<{ attempt: any; questions: ReviewQuestion[] } | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [savingGrade, setSavingGrade] = useState(false);
  const [savingFeedback, setSavingFeedback] = useState(false);

  const load = () => {
    setLoading(true);
    listInstructorQuizAttempts({ userSearch: search || null, needsReviewOnly: reviewOnly })
      .then(setRows)
      .catch((e) => toast.error(e?.message || "تعذّر التحميل"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [reviewOnly]);

  const openReview = async (attemptId: string) => {
    setReviewOpen(true);
    setReviewLoading(true);
    try {
      const data = await getInstructorAttemptReview(attemptId);
      setReview(data);
      setFeedback(data?.attempt?.feedback ?? "");
    } catch (e: any) {
      toast.error(e?.message || "تعذّر تحميل المحاولة");
      setReviewOpen(false);
    } finally {
      setReviewLoading(false);
    }
  };

  const setCorrect = (qid: string, val: boolean | null) => {
    setReview((r) => {
      if (!r) return r;
      return {
        ...r,
        questions: r.questions.map((q) =>
          q.question_id === qid && q.answer
            ? { ...q, answer: { ...q.answer, is_correct: val } }
            : q
        ),
      };
    });
  };

  const saveGrade = async () => {
    if (!review) return;
    const updates = review.questions
      .filter((q) => q.answer && q.answer.is_correct !== null)
      .map((q) => ({ question_id: q.question_id, is_correct: q.answer!.is_correct }));
    if (updates.length === 0) return toast.error("حدد صواب/خطأ لسؤال واحد على الأقل");
    setSavingGrade(true);
    try {
      await saveInstructorGrading(review.attempt.id, updates);
      toast.success("تم حفظ التصحيح");
      setReviewOpen(false);
      load();
    } catch (e: any) {
      toast.error(e?.message || "تعذّر الحفظ");
    } finally {
      setSavingGrade(false);
    }
  };

  const saveFeedbackOnly = async () => {
    if (!review) return;
    setSavingFeedback(true);
    try {
      await saveInstructorFeedback(review.attempt.id, feedback);
      toast.success("تم حفظ التقييم");
      setReviewOpen(false);
      load();
    } catch (e: any) {
      toast.error(e?.message || "تعذّر الحفظ");
    } finally {
      setSavingFeedback(false);
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
          <ClipboardCheck className="w-7 h-7 text-primary" />
          محاولات الاختبارات
        </h1>
        <p className="text-muted-foreground text-sm mt-1">محاولات الطلاب في اختبارات كورساتك — صحّح وقيّم</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()}
          placeholder="بحث باسم/بريد الطالب…"
          className="max-w-xs"
        />
        <Button variant="outline" onClick={load}>بحث</Button>
        <div className="flex items-center gap-2">
          <Switch checked={reviewOnly} onCheckedChange={setReviewOnly} id="review-only" />
          <Label htmlFor="review-only">بحاجة لتصحيح فقط</Label>
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
          <CardContent className="py-12 text-center text-muted-foreground">لا توجد محاولات</CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-accent/40 text-muted-foreground">
                  <tr>
                    <th className="p-3 text-right font-medium">الطالب</th>
                    <th className="p-3 text-right font-medium">الاختبار</th>
                    <th className="p-3 text-right font-medium">الكورس</th>
                    <th className="p-3 text-right font-medium">النتيجة</th>
                    <th className="p-3 text-right font-medium">الحالة</th>
                    <th className="p-3 text-right font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.attempt_id} className="border-t border-border/60 hover:bg-accent/20">
                      <td className="p-3 font-medium">{r.student_name || "طالب"}</td>
                      <td className="p-3">
                        <div className="truncate max-w-40">{r.quiz_title}</div>
                        <div className="text-xs text-muted-foreground">محاولة {r.attempt_number}</div>
                      </td>
                      <td className="p-3 text-xs text-muted-foreground truncate max-w-32">{r.course_title}</td>
                      <td className="p-3">
                        {r.status === "graded" ? `${r.percentage ?? 0}%` : "—"}
                      </td>
                      <td className="p-3">
                        <div className="flex flex-col gap-1 items-start">
                          <Badge variant="outline" className={A_STATUS[r.status]?.cls ?? ""}>
                            {A_STATUS[r.status]?.label ?? r.status}
                          </Badge>
                          {r.has_feedback && (
                            <span className="text-[10px] text-muted-foreground">مُقيَّم ✓</span>
                          )}
                        </div>
                      </td>
                      <td className="p-3">
                        <Button size="sm" onClick={() => openReview(r.attempt_id)}>
                          تصحيح / تقييم
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent dir="rtl" className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>تصحيح المحاولة</DialogTitle>
          </DialogHeader>
          {reviewLoading || !review ? (
            <div className="py-10 text-center">
              <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                {review.attempt.student_name ?? ""} — {review.attempt.quiz_title ?? ""}
              </div>
              {review.questions.map((q, i) => (
                <div key={q.question_id} className="rounded-xl border border-border/60 p-3 space-y-2">
                  <div className="font-medium text-sm">
                    {i + 1}. {q.content} <span className="text-xs text-muted-foreground">({q.points} درجات)</span>
                  </div>
                  <div className="text-xs rounded-lg bg-accent/40 p-2">
                    <span className="font-semibold">إجابة الطالب: </span>
                    {q.answer?.answer_text ||
                      q.options?.find((o) => o.id === q.answer?.selected_option_id)?.content ||
                      "لا توجد إجابة"}
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">التصحيح:</span>
                    <Button
                      size="sm"
                      variant={q.answer?.is_correct === true ? "default" : "outline"}
                      onClick={() => setCorrect(q.question_id, true)}
                    >
                      صحيح
                    </Button>
                    <Button
                      size="sm"
                      variant={q.answer?.is_correct === false ? "destructive" : "outline"}
                      onClick={() => setCorrect(q.question_id, false)}
                    >
                      خطأ
                    </Button>
                  </div>
                </div>
              ))}

              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  <MessageSquarePlus className="w-4 h-4" /> تقييم / ملاحظات للطالب
                </Label>
                <Textarea
                  rows={3}
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="اكتب تقييمك وملاحظاتك…"
                />
              </div>

              <div className="flex justify-between gap-2">
                <Button variant="outline" onClick={saveFeedbackOnly} disabled={savingFeedback}>
                  حفظ التقييم فقط
                </Button>
                <Button onClick={saveGrade} disabled={savingGrade}>
                  {savingGrade ? <Loader2 className="w-4 h-4 ml-2 animate-spin" /> : <Save className="w-4 h-4 ml-2" />}
                  حفظ التصحيح + التقييم
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}