import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Users, GraduationCap, IdCard, Loader2, BookOpen, Trophy, XCircle, ClipboardList, FileText, ListChecks } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { getChildSnapshot, listMyChildren, ParentChild } from "@/lib/parent-api";

interface Snap {
  full_name?: string | null;
  avatar_url?: string | null;
  student_id?: string | null;
  stage_name?: string | null;
  phone_number?: string | null;
  enrolled_courses_count?: number;
  enrolled_courses?: any[];
  quiz_attempts?: any[];
  quiz_stats?: { total_attempts: number; passed: number; failed: number; graded_total: number };
  assignment_stats?: { total: number; completed: number; passed: number; failed: number };
}

const Stat = ({ label, value, tone = "neutral" }: { label: string; value: any; tone?: "neutral" | "success" | "danger" | "primary" }) => (
  <div className={`rounded-xl border p-4 text-center ${
    tone === "success" ? "bg-emerald-500/10 border-emerald-500/30" :
    tone === "danger" ? "bg-rose-500/10 border-rose-500/30" :
    tone === "primary" ? "bg-primary/10 border-primary/30" : "bg-card"
  }`}>
    <div className="text-2xl font-black tabular-nums">{value}</div>
    <div className="text-xs text-muted-foreground mt-1">{label}</div>
  </div>
);

const ParentDashboard = () => {
  const [children, setChildren] = useState<ParentChild[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [snap, setSnap] = useState<Snap | null>(null);
  const [loadingSnap, setLoadingSnap] = useState(false);

  useEffect(() => {
    listMyChildren().then((list) => {
      setChildren(list);
      if (list.length > 0) setSelectedId(list[0].student_user_id);
    }).catch((e) => toast.error(e.message));
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setLoadingSnap(true);
    getChildSnapshot(selectedId)
      .then((d) => setSnap(d as any))
      .catch((e) => toast.error(e.message))
      .finally(() => setLoadingSnap(false));
  }, [selectedId]);

  if (children === null) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  if (children.length === 0) {
    return (
      <Card className="p-10 text-center max-w-lg mx-auto">
        <Users className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
        <div className="text-xl font-bold mb-2">لم يتم ربط أي طالب بعد</div>
        <p className="text-sm text-muted-foreground mb-4">
          اطلب من ابنك رقم الطالب المكوّن من 6 أرقام لبدء الربط، ستراجعه الإدارة قبل التفعيل.
        </p>
        <Link to="/parent/link">
          <Button>ربط طالب</Button>
        </Link>
      </Card>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-black">لوحة ولي الأمر</h1>
        <Link to="/parent/link"><Button variant="outline" size="sm">ربط طالب جديد</Button></Link>
      </div>

      {/* Children switcher */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {children.map((c) => {
          const active = c.student_user_id === selectedId;
          return (
            <button
              key={c.student_user_id}
              onClick={() => setSelectedId(c.student_user_id)}
              className={`shrink-0 flex items-center gap-3 rounded-2xl border-2 px-4 py-3 transition-all ${
                active ? "border-primary bg-primary/5" : "border-border hover:bg-accent/50"
              }`}
            >
              <Avatar className="w-10 h-10">
                <AvatarImage src={c.avatar_url ?? undefined} />
                <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                  {c.full_name?.[0]?.toUpperCase() || "ط"}
                </AvatarFallback>
              </Avatar>
              <div className="text-right">
                <div className="font-bold text-sm">{c.full_name || "طالب"}</div>
                <div className="text-xs text-muted-foreground font-mono">{c.student_id}</div>
              </div>
            </button>
          );
        })}
      </div>

      {loadingSnap ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : snap ? (
        <div className="space-y-5">
          <Card className="p-6">
            <div className="flex items-center gap-4 flex-wrap">
              <Avatar className="w-20 h-20 border-4 border-primary/20">
                <AvatarImage src={snap.avatar_url ?? undefined} />
                <AvatarFallback className="bg-primary text-primary-foreground text-2xl font-black">
                  {snap.full_name?.[0]?.toUpperCase() || "ط"}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <h2 className="text-2xl font-black">{snap.full_name}</h2>
                <div className="flex flex-wrap gap-2 mt-2">
                  {snap.student_id && (
                    <Badge variant="secondary" className="gap-1"><IdCard className="w-3 h-3" /><span className="font-mono">{snap.student_id}</span></Badge>
                  )}
                  {snap.stage_name && (
                    <Badge variant="outline" className="gap-1"><GraduationCap className="w-3 h-3" />{snap.stage_name}</Badge>
                  )}
                </div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-black text-primary">{snap.enrolled_courses_count ?? 0}</div>
                <div className="text-xs text-muted-foreground">دورة مسجّل بها</div>
              </div>
            </div>
          </Card>

          {snap.quiz_stats && (
            <section className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-bold text-muted-foreground">
                <ClipboardList className="w-4 h-4" /> إحصائيات الاختبارات
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Stat label="إجمالي المحاولات" value={snap.quiz_stats.total_attempts} />
                <Stat label="ناجحة" value={snap.quiz_stats.passed} tone="success" />
                <Stat label="راسبة" value={snap.quiz_stats.failed} tone="danger" />
                <Stat label="نسبة النجاح"
                  value={`${snap.quiz_stats.graded_total ? Math.round((snap.quiz_stats.passed / snap.quiz_stats.graded_total) * 100) : 0}%`}
                  tone="primary" />
              </div>
            </section>
          )}

          {snap.assignment_stats && (
            <section className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-bold text-muted-foreground">
                <FileText className="w-4 h-4" /> إحصائيات الواجبات
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Stat label="الإجمالي" value={snap.assignment_stats.total} />
                <Stat label="مكتملة" value={snap.assignment_stats.completed} tone="primary" />
                <Stat label="ناجحة" value={snap.assignment_stats.passed} tone="success" />
                <Stat label="راسبة" value={snap.assignment_stats.failed} tone="danger" />
              </div>
            </section>
          )}

          {snap.enrolled_courses && snap.enrolled_courses.length > 0 && (
            <Card className="p-4">
              <div className="flex items-center gap-2 font-bold mb-3">
                <BookOpen className="w-4 h-4 text-primary" /> الكورسات المسجّلة
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs text-muted-foreground">
                    <tr>
                      <th className="text-right px-3 py-2">الكورس</th>
                      <th className="text-right px-3 py-2">المادة</th>
                      <th className="text-right px-3 py-2">المرحلة</th>
                      <th className="text-right px-3 py-2">التسجيل</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snap.enrolled_courses.map((c: any) => (
                      <tr key={c.course_id} className="border-t border-border">
                        <td className="px-3 py-2 font-semibold">{c.course_title}</td>
                        <td className="px-3 py-2 text-muted-foreground">{c.subject_name ?? "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{c.stage_name ?? "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground tabular-nums" dir="ltr">
                          {c.enrolled_at ? new Date(c.enrolled_at).toLocaleDateString() : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {snap.quiz_attempts && snap.quiz_attempts.length > 0 && (
            <Card className="p-4">
              <div className="flex items-center gap-2 font-bold mb-3">
                <ListChecks className="w-4 h-4 text-primary" /> محاولات الاختبارات
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs text-muted-foreground">
                    <tr>
                      <th className="text-right px-3 py-2">الاختبار</th>
                      <th className="text-right px-3 py-2">الكورس</th>
                      <th className="text-right px-3 py-2">النسبة</th>
                      <th className="text-right px-3 py-2">النتيجة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snap.quiz_attempts.map((a: any) => (
                      <tr key={a.attempt_id} className="border-t border-border">
                        <td className="px-3 py-2 font-semibold">{a.quiz_title}</td>
                        <td className="px-3 py-2 text-muted-foreground">{a.course_title}</td>
                        <td className="px-3 py-2 tabular-nums">{a.percentage != null ? `${a.percentage}%` : "—"}</td>
                        <td className="px-3 py-2">
                          {a.passed === true ? <Badge className="bg-emerald-600"><Trophy className="w-3 h-3 ml-1" />ناجح</Badge>
                            : a.passed === false ? <Badge variant="destructive"><XCircle className="w-3 h-3 ml-1" />راسب</Badge>
                            : <Badge variant="secondary">{a.status}</Badge>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      ) : null}
    </div>
  );
};

export default ParentDashboard;
