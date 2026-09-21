import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight,
  User,
  BookOpen,
  ClipboardList,
  FileText,
  Loader2,
  Pencil,
  Ban,
  ShieldCheck,
  Trash2,
  Phone,
  Mail,
  IdCard,
  Calendar,
  MapPin,
  GraduationCap,
  AlertTriangle,
  Focus,
  Trophy,
  Wallet as WalletIcon,
  Lock,
  Unlock,
  Plus,
  ListTree,
} from "lucide-react";
import { resolveCourseLockState, adminGrantQuizAttempt, effectiveMaxAttempts, type CourseLockRow } from "@/lib/course-lock-api";
import AdminWalletAdjustPanel from "@/components/admin/AdminWalletAdjustPanel";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  getStudent, getStudentEnrollments, setStudentBanned, adminDeleteStudent,
  type AdminStudentRow,
} from "@/lib/admin-students-api";
import StudentFormModal from "@/components/admin/students/StudentFormModal";
import StudentQrCard from "@/components/admin/students/StudentQrCard";
import { useRegistrationFields } from "@/hooks/use-registration-fields";
import {
  classifyCombinedGroups, LEVEL_META, type GroupClassification,
  type AssignmentEval,
} from "@/lib/weak-analysis";

const STATUS_META: Record<string, { label: string; className: string }> = {
  graded: { label: "مصحّح", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  needs_review: { label: "بانتظار المراجعة", className: "bg-blue-500/15 text-blue-600" },
  submitted: { label: "مُرسل", className: "bg-slate-500/15 text-slate-600" },
  in_progress: { label: "قيد الإجراء", className: "bg-amber-500/15 text-amber-700" },
};

interface AttemptRow {
  id: string;
  quiz_id: string;
  status: string;
  percentage: number | null;
  passed: boolean | null;
  attempt_number: number;
  submitted_at: string | null;
  earned_points: number | null;
  total_points: number | null;
  quizzes: {
    id: string;
    title: string;
    pass_percentage: number;
    attempt_result_policy: string | null;
    courses: {
      id: string; title: string;
      subjects: { id: string; name: string } | null;
    } | null;
  } | null;
}

export default function AdminStudentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { fields } = useRegistrationFields();

  const [student, setStudent] = useState<AdminStudentRow | null>(null);
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [attempts, setAttempts] = useState<AttemptRow[]>([]);
  const [assignmentEvals, setAssignmentEvals] = useState<AssignmentEval[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [confirm, setConfirm] = useState<null | "ban" | "unban" | "delete">(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [s, e, atts, subs] = await Promise.all([
        getStudent(id),
        getStudentEnrollments(id),
        (supabase as any)
          .from("quiz_attempts")
          .select(
            "id, quiz_id, status, percentage, passed, attempt_number, submitted_at, earned_points, total_points, quizzes(id, title, pass_percentage, attempt_result_policy, courses(id, title, subjects(id, name)))",
          )
          .eq("user_id", id)
          .neq("status", "in_progress")
          .order("submitted_at", { ascending: false })
          .then(({ data }: any) => (data ?? []) as AttemptRow[]),
        (supabase as any)
          .from("assignment_submissions")
          .select(
            "assignment_id, outcome, assignments(id, courses(id, title, subjects(id, name)))",
          )
          .eq("user_id", id)
          .then(({ data }: any) =>
            ((data ?? []) as any[]).map((row) => ({
              assignment_id: row.assignment_id,
              course_id: row.assignments?.courses?.id ?? "",
              subject_id: row.assignments?.courses?.subjects?.id ?? null,
              subject_name: row.assignments?.courses?.subjects?.name ?? null,
              course_title: row.assignments?.courses?.title ?? "",
              outcome: row.outcome ?? null,
            })) as AssignmentEval[],
          ),
      ]);
      setStudent(s);
      setEnrollments(e);
      setAttempts(atts);
      setAssignmentEvals(subs);
    } catch (err: any) {
      toast.error(err?.message ?? "تعذّر التحميل");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  const quizzesForAnalysis = useMemo(
    () =>
      attempts
        .filter((a) => a.quizzes)
        .map((a) => ({
          id: a.quizzes!.id,
          course_id: a.quizzes!.courses?.id ?? "",
          subject_id: a.quizzes!.courses?.subjects?.id ?? null,
          subject_name: a.quizzes!.courses?.subjects?.name ?? null,
          course_title: a.quizzes!.courses?.title ?? "",
          attempt_result_policy: a.quizzes!.attempt_result_policy ?? "highest",
        })),
    [attempts],
  );

  const officialAttempts = useMemo(
    () =>
      attempts.map((a) => ({
        quiz_id: a.quiz_id,
        passed: a.passed,
        percentage: a.percentage,
        attempt_number: a.attempt_number,
        status: a.status,
      })),
    [attempts],
  );

  const weakSubjects: GroupClassification[] = useMemo(
    () =>
      classifyCombinedGroups(
        quizzesForAnalysis as any,
        officialAttempts,
        assignmentEvals,
        "subject_id",
        (_k, ctx) =>
          ctx.quiz?.subject_name ??
          ctx.assignment?.subject_name ??
          "بدون مادة",
      ),
    [quizzesForAnalysis, officialAttempts, assignmentEvals],
  );

  const weakCourses: GroupClassification[] = useMemo(
    () =>
      classifyCombinedGroups(
        quizzesForAnalysis as any,
        officialAttempts,
        assignmentEvals,
        "course_id",
        (_k, ctx) =>
          ctx.quiz?.course_title ??
          ctx.assignment?.course_title ??
          "بدون كورس",
      ),
    [quizzesForAnalysis, officialAttempts, assignmentEvals],
  );

  const stats = useMemo(() => {
    const uniqueQuizIds = new Set(attempts.map((a) => a.quiz_id));
    const graded = attempts.filter((a) => a.status === "graded");
    const passed = graded.filter((a) => a.passed === true).length;
    return {
      totalAttempts: attempts.length,
      uniqueQuizzes: uniqueQuizIds.size,
      passed,
      failed: graded.filter((a) => a.passed === false).length,
      passRate: graded.length ? Math.round((passed / graded.length) * 100) : 0,
    };
  }, [attempts]);

  const attemptsUsedByQuiz = useMemo(() => {
    const m: Record<string, number> = {};
    for (const a of attempts) {
      m[a.quiz_id] = Math.max(m[a.quiz_id] ?? 0, a.attempt_number ?? 0);
    }
    return m;
  }, [attempts]);

  if (loading || !student) {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-40" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  const initials =
    student.full_name?.split(" ").filter(Boolean).slice(0, 2).map((s) => s[0]).join("").toUpperCase() || "ط";

  const doBan = async (banned: boolean) => {
    setBusy(true);
    try {
      await setStudentBanned(student.id, banned);
      toast.success(banned ? "تم حظر الطالب" : "تم رفع الحظر");
      setStudent({ ...student, is_banned: banned });
    } catch (e: any) { toast.error(e?.message); }
    finally { setBusy(false); setConfirm(null); }
  };

  const doDelete = async () => {
    setBusy(true);
    try {
      await adminDeleteStudent(student.id);
      toast.success("تم حذف الطالب");
      navigate("/admin/students");
    } catch (e: any) { toast.error(e?.message); setBusy(false); }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <Button variant="ghost" onClick={() => navigate("/admin/students")} className="gap-2">
        <ArrowRight className="w-4 h-4" /> رجوع لقائمة الطلاب
      </Button>

      {/* Header card */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-border bg-card p-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <Avatar className="w-16 h-16 border-2 border-primary/20">
              <AvatarImage src={student.avatar_url ?? undefined} />
              <AvatarFallback className="bg-primary/10 text-primary text-xl font-black">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-black">{student.full_name || "بدون اسم"}</h1>
                {student.is_banned && <Badge variant="destructive">محظور</Badge>}
              </div>
              <div className="text-sm text-muted-foreground mt-1 flex flex-wrap gap-x-4 gap-y-1">
                {student.student_id && (
                  <span className="inline-flex items-center gap-1.5"><IdCard className="w-3.5 h-3.5" /><span className="font-mono">{student.student_id}</span></span>
                )}
                {student.phone_number && (
                  <span className="inline-flex items-center gap-1.5" dir="ltr"><Phone className="w-3.5 h-3.5" />{student.phone_number}</span>
                )}
                {student.email && (
                  <span className="inline-flex items-center gap-1.5" dir="ltr"><Mail className="w-3.5 h-3.5" />{student.email}</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" className="gap-2" onClick={() => setEditOpen(true)}>
              <Pencil className="w-4 h-4" /> تعديل
            </Button>
            <Button
              variant="outline"
              className={`gap-2 ${student.is_banned ? "text-emerald-600" : "text-amber-600"}`}
              onClick={() => setConfirm(student.is_banned ? "unban" : "ban")}
            >
              {student.is_banned ? <ShieldCheck className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
              {student.is_banned ? "رفع الحظر" : "حظر"}
            </Button>
            <Button variant="destructive" className="gap-2" onClick={() => setConfirm("delete")}>
              <Trash2 className="w-4 h-4" /> حذف
            </Button>
          </div>
        </div>

        {/* Quick stats row */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-6">
          {[
            { label: "الكورسات", value: enrollments.length, icon: BookOpen },
            { label: "المحاولات", value: stats.totalAttempts, icon: ClipboardList },
            { label: "اختبارات فريدة", value: stats.uniqueQuizzes, icon: FileText },
            { label: "ناجح", value: stats.passed, icon: Trophy },
            { label: "نسبة النجاح", value: `${stats.passRate}%`, icon: GraduationCap },
          ].map((s, i) => (
            <div key={i} className="rounded-xl bg-muted/40 p-3 text-center">
              <s.icon className="w-4 h-4 mx-auto text-muted-foreground mb-1" />
              <div className="text-xl font-black text-primary">{s.value}</div>
              <div className="text-xs text-muted-foreground">{s.label}</div>
            </div>
          ))}
        </div>

        <div className="mt-6">
          <StudentQrCard
            qrToken={student.qr_token ?? null}
            studentId={student.id}
            onTokenChanged={(t) => setStudent({ ...student, qr_token: t })}
          />
        </div>
      </motion.div>

      <Tabs defaultValue="overview" dir="rtl">
        <TabsList className="grid grid-cols-2 sm:grid-cols-5 w-full max-w-3xl">
          <TabsTrigger value="overview" className="gap-2"><User className="w-4 h-4" />نظرة عامة</TabsTrigger>
          <TabsTrigger value="enrollments" className="gap-2"><BookOpen className="w-4 h-4" />الكورسات</TabsTrigger>
          <TabsTrigger value="attempts" className="gap-2"><ClipboardList className="w-4 h-4" />المحاولات</TabsTrigger>
          <TabsTrigger value="wallet" className="gap-2"><WalletIcon className="w-4 h-4" />المحفظة</TabsTrigger>
          <TabsTrigger value="registration" className="gap-2"><FileText className="w-4 h-4" />البيانات</TabsTrigger>
        </TabsList>

        {/* OVERVIEW */}
        <TabsContent value="overview" className="mt-4 space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-border bg-card p-5">
              <h3 className="font-black mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500" /> نقاط ضعف بالمواد
              </h3>
              {weakSubjects.length === 0 ? (
                <p className="text-sm text-muted-foreground">لا توجد بيانات كافية بعد.</p>
              ) : (
                <div className="space-y-2">
                  {weakSubjects.map((g) => (
                    <div key={g.key} className="flex items-center justify-between rounded-xl bg-muted/40 p-3">
                      <div>
                        <div className="font-semibold">{g.label}</div>
                        <div className="text-xs text-muted-foreground">
                          نجح {g.passed_count} من {g.certified_count}
                        </div>
                      </div>
                      <Badge variant="outline" className={LEVEL_META[g.level].className}>
                        {LEVEL_META[g.level].label}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="rounded-2xl border border-border bg-card p-5">
              <h3 className="font-black mb-3 flex items-center gap-2">
                <Focus className="w-4 h-4 text-amber-500" /> نقاط ضعف بالكورسات
              </h3>
              {weakCourses.length === 0 ? (
                <p className="text-sm text-muted-foreground">لا توجد بيانات كافية بعد.</p>
              ) : (
                <div className="space-y-2">
                  {weakCourses.map((g) => (
                    <div key={g.key} className="flex items-center justify-between rounded-xl bg-muted/40 p-3">
                      <div>
                        <div className="font-semibold">{g.label}</div>
                        <div className="text-xs text-muted-foreground">
                          نجح {g.passed_count} من {g.certified_count}
                        </div>
                      </div>
                      <Badge variant="outline" className={LEVEL_META[g.level].className}>
                        {LEVEL_META[g.level].label}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ENROLLMENTS + CONTENT */}
        <TabsContent value="enrollments" className="mt-4">
          <div className="space-y-4">
            {enrollments.length === 0 ? (
              <div className="rounded-2xl border border-border bg-card p-10 text-center text-muted-foreground">
                لا يوجد كورسات مسجّلة.
              </div>
            ) : (
              enrollments.map((e) => (
                <StudentCourseContentCard
                  key={e.course_id}
                  courseId={e.course_id}
                  courseTitle={e.course_title}
                  subjectName={e.subject_name}
                  stageName={e.stage_name}
                  enrolledAt={e.enrolled_at}
                  userId={student.id}
                  attemptsUsed={attemptsUsedByQuiz}
                />
              ))
            )}
          </div>
        </TabsContent>

        {/* ATTEMPTS */}
        <TabsContent value="attempts" className="mt-4">
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            {attempts.length === 0 ? (
              <div className="p-10 text-center text-muted-foreground">لا توجد محاولات بعد.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-muted-foreground">
                    <tr className="text-right">
                      <th className="p-3 px-4">الاختبار</th>
                      <th className="p-3 px-4 hidden md:table-cell">الكورس</th>
                      <th className="p-3 px-4">المحاولة</th>
                      <th className="p-3 px-4">النتيجة</th>
                      <th className="p-3 px-4">الحالة</th>
                      <th className="p-3 px-4 hidden lg:table-cell">التاريخ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attempts.map((a) => {
                      const meta = STATUS_META[a.status] ?? STATUS_META.submitted;
                      return (
                        <tr key={a.id} className="border-t border-border/60 hover:bg-accent/30">
                          <td className="p-3 px-4 font-semibold">{a.quizzes?.title ?? "—"}</td>
                          <td className="p-3 px-4 hidden md:table-cell text-muted-foreground">
                            {a.quizzes?.courses?.title ?? "—"}
                          </td>
                          <td className="p-3 px-4 text-xs">#{a.attempt_number}</td>
                          <td className="p-3 px-4">
                            {a.percentage != null ? (
                              <span
                                className={
                                  a.passed
                                    ? "text-emerald-600 font-bold"
                                    : "text-red-600 font-bold"
                                }
                              >
                                {Math.round(a.percentage)}%
                              </span>
                            ) : "—"}
                          </td>
                          <td className="p-3 px-4">
                            <Badge variant="outline" className={meta.className}>{meta.label}</Badge>
                          </td>
                          <td className="p-3 px-4 text-xs text-muted-foreground hidden lg:table-cell" dir="ltr">
                            {a.submitted_at ? new Date(a.submitted_at).toLocaleString("ar-EG") : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>

        {/* WALLET */}
        <TabsContent value="wallet" className="mt-4">
          <div className="max-w-md">
            <AdminWalletAdjustPanel
              userId={student.id}
              studentName={student.full_name}
            />
          </div>
        </TabsContent>

        {/* REGISTRATION */}
        <TabsContent value="registration" className="mt-4">
          <div className="rounded-2xl border border-border bg-card p-5">
            <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {fields.map((f) => {
                if (f.field_key === "password" || f.field_key === "confirm_password") return null;
                let v: any = (student as any)[f.field_key];
                if (v == null) v = student.custom_fields?.[f.field_key];
                if (f.field_key === "stage_id") v = student.stage_name ?? v;
                if (f.options && v != null) {
                  const found = f.options.find((o) => o.value === v);
                  if (found) v = found.label;
                }
                return (
                  <div key={f.id} className="rounded-xl bg-muted/30 p-3">
                    <dt className="text-xs text-muted-foreground mb-1">{f.label}</dt>
                    <dd className="font-semibold break-words">{v ? String(v) : "—"}</dd>
                  </div>
                );
              })}
              <div className="rounded-xl bg-muted/30 p-3 md:col-span-2">
                <dt className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Calendar className="w-3 h-3" /> تاريخ الانضمام</dt>
                <dd className="font-semibold" dir="ltr">{new Date(student.created_at).toLocaleString("ar-EG")}</dd>
              </div>
            </dl>
          </div>
        </TabsContent>
      </Tabs>

      <StudentFormModal
        open={editOpen}
        onOpenChange={setEditOpen}
        mode="edit"
        student={student}
        onSaved={load}
      />

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-right">
              {confirm === "delete" && "حذف الطالب نهائيًا؟"}
              {confirm === "ban" && "حظر الطالب؟"}
              {confirm === "unban" && "رفع الحظر؟"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-right">
              {confirm === "delete" && "سيتم حذف الحساب وكل بياناته نهائيًا."}
              {confirm === "ban" && "سيمنع الطالب من الدخول حتى يتم رفع الحظر."}
              {confirm === "unban" && "سيتمكن الطالب من الدخول مجددًا."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              className={confirm === "delete" ? "bg-destructive hover:bg-destructive/90" : ""}
              onClick={(e) => {
                e.preventDefault();
                if (confirm === "delete") doDelete();
                else if (confirm) doBan(confirm === "ban");
              }}
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "تأكيد"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StudentCourseContentCard({
  courseId,
  courseTitle,
  subjectName,
  stageName,
  enrolledAt,
  userId,
  attemptsUsed,
}: {
  courseId: string;
  courseTitle: string;
  subjectName?: string | null;
  stageName?: string | null;
  enrolledAt?: string | null;
  userId: string;
  attemptsUsed: Record<string, number>;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<CourseLockRow[]>([]);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [effMap, setEffMap] = useState<Record<string, number>>({});
  const [granting, setGranting] = useState<string | null>(null);
  const [grantQty, setGrantQty] = useState<Record<string, number>>({});

  const load = async () => {
    setLoading(true);
    try {
      const list = await resolveCourseLockState(courseId, userId);
      setRows(list);
      // Fetch titles for lessons/quizzes/assignments in one shot
      const lessonIds = list.filter((r) => r.item_type === "lesson").map((r) => r.item_id);
      const quizIds = list.filter((r) => r.item_type === "quiz").map((r) => r.item_id);
      const asgIds = list.filter((r) => r.item_type === "assignment").map((r) => r.item_id);
      const [le, qz, ag] = await Promise.all([
        lessonIds.length
          ? (supabase as any).from("lessons").select("id,title").in("id", lessonIds)
          : Promise.resolve({ data: [] }),
        quizIds.length
          ? (supabase as any).from("quizzes").select("id,title").in("id", quizIds)
          : Promise.resolve({ data: [] }),
        asgIds.length
          ? (supabase as any).from("assignments").select("id,title").in("id", asgIds)
          : Promise.resolve({ data: [] }),
      ]);
      const map: Record<string, string> = {};
      [...(le.data ?? []), ...(qz.data ?? []), ...(ag.data ?? [])].forEach(
        (r: any) => (map[r.id] = r.title),
      );
      setTitles(map);
      // Effective max attempts for each quiz
      const effs = await Promise.all(
        quizIds.map(async (qid) => [qid, await effectiveMaxAttempts(userId, qid)] as const),
      );
      const emap: Record<string, number> = {};
      effs.forEach(([qid, v]) => (emap[qid] = v));
      setEffMap(emap);
    } catch (e: any) {
      toast.error(e?.message ?? "تعذّر تحميل المحتوى");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && rows.length === 0) load();
    // eslint-disable-next-line
  }, [open]);

  const doGrant = async (quizId: string, extra: number) => {
    const n = Math.max(1, Math.floor(extra || 1));
    setGranting(quizId);
    try {
      const res = await adminGrantQuizAttempt(userId, quizId, n);
      setEffMap((m) => ({ ...m, [quizId]: res.effective_max_attempts }));
      toast.success(`تم منح ${n} محاولة إضافية`);
    } catch (e: any) {
      toast.error(e?.message ?? "تعذّر منح المحاولة");
    } finally {
      setGranting(null);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 p-4 hover:bg-accent/30 transition-colors text-right"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <BookOpen className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="font-bold truncate">{courseTitle}</div>
            <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5">
              {subjectName && <span>{subjectName}</span>}
              {stageName && <span>{stageName}</span>}
              {enrolledAt && (
                <span dir="ltr">{new Date(enrolledAt).toLocaleDateString("ar-EG")}</span>
              )}
              <span>{open ? "إخفاء" : "عرض"} المحتوى وحالة الأقفال</span>
            </div>
          </div>
        </div>
        <ChevronDownIcon open={open} />
      </button>

      {open && (
        <div className="border-t border-border p-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </div>
          ) : rows.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-6">
              لا يوجد محتوى في هذا الكورس بعد.
            </div>
          ) : (
            <div className="space-y-1.5">
              {rows.map((r) => {
                const isQuiz = r.item_type === "quiz";
                const typeLabel =
                  r.item_type === "lesson"
                    ? "درس"
                    : r.item_type === "quiz"
                      ? "اختبار"
                      : "واجب";
                return (
                  <div
                    key={`${r.item_type}-${r.item_id}`}
                    className="flex items-center gap-3 rounded-lg border border-border/60 p-2.5"
                  >
                    <div
                      className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${
                        r.is_locked
                          ? "bg-amber-500/15 text-amber-600"
                          : r.is_completed
                            ? "bg-emerald-500/15 text-emerald-600"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {r.is_locked ? (
                        <Lock className="w-4 h-4" />
                      ) : (
                        <Unlock className="w-4 h-4" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">
                        {titles[r.item_id] ?? "—"}
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {typeLabel}
                        {r.is_locked && r.reason === "quiz_gate" && (
                          <> · مقفل حتى اجتياز: {r.gate_quiz_title ?? "اختبار"}</>
                        )}
                        {r.is_locked && r.reason === "drip" && <> · مقفل بالتسلسل</>}
                        {isQuiz && effMap[r.item_id] != null && (
                          <>
                            {" · "}
                            محاولات: {attemptsUsed[r.item_id] ?? 0} / {effMap[r.item_id]}
                            {(attemptsUsed[r.item_id] ?? 0) >= effMap[r.item_id] && (
                              <span className="text-amber-600"> · استنفد المحاولات</span>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                    {isQuiz && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <input
                          type="number"
                          min={1}
                          max={20}
                          value={grantQty[r.item_id] ?? 1}
                          onChange={(e) =>
                            setGrantQty((m) => ({
                              ...m,
                              [r.item_id]: Math.max(1, Math.min(20, Number(e.target.value) || 1)),
                            }))
                          }
                          className="w-14 h-8 rounded-md border border-border bg-background px-2 text-sm text-center"
                          dir="ltr"
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1"
                          disabled={granting === r.item_id}
                          onClick={() => doGrant(r.item_id, grantQty[r.item_id] ?? 1)}
                        >
                          {granting === r.item_id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Plus className="w-3.5 h-3.5" />
                          )}
                          محاولات
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ChevronDownIcon({ open }: { open: boolean }) {
  return (
    <motion.svg
      animate={{ rotate: open ? 180 : 0 }}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-muted-foreground shrink-0"
    >
      <polyline points="6 9 12 15 18 9" />
    </motion.svg>
  );
}

