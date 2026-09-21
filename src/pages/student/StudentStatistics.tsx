import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  ClipboardCheck,
  Compass,
  Eye,
  FileText,
  ListChecks,
  Percent,
  PlayCircle,
  ShieldCheck,
  ShieldX,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { useStudentStats, type StudentCourseStat, type FailedAttemptRow } from "@/hooks/use-stats";
import { StatCard } from "@/components/StatCard";
import { useSignedThumbnail } from "@/hooks/use-signed-thumbnail";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCountUp } from "@/hooks/use-count-up";
import { getResultDisplay } from "@/lib/quiz-result";
import AttemptDetailsModal from "@/components/quiz/AttemptDetailsModal";
import AchievementsWidgets from "@/components/student/AchievementsWidgets";

const StudentStatistics = () => {
  const stats = useStudentStats();
  const [openAttemptId, setOpenAttemptId] = useState<string | null>(null);

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">الإحصائيات</h1>
        <p className="text-muted-foreground mt-1">
          تقدّمك عبر الدورات ونسبة إنجازك الفعلية.
        </p>
      </motion.div>

      <AchievementsWidgets />

      {!stats ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-2xl" />
          ))}
        </div>
      ) : stats.enrollmentsCount === 0 ? (
        <EmptyState />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard
              label="الكورسات المشترك بها"
              value={stats.enrollmentsCount}
              icon={BookOpen}
              accent="primary"
              delay={0}
            />
            <StatCard
              label="المحتوى المكتمل"
              value={stats.completedLessons}
              icon={ListChecks}
              accent="emerald"
              delay={0.05}
            />
            <OverallCard percent={stats.overallPercent} />
          </div>

          {/* ==== Quizzes section ==== */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="space-y-4"
          >
            <div className="flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-primary" />
              <h2 className="text-lg md:text-xl font-bold">الاختبارات</h2>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                label="إجمالي الاختبارات"
                value={stats.quizzesTotal}
                icon={ClipboardList}
                accent="primary"
                delay={0}
              />
              <StatCard
                label="الاختبارات المكتملة"
                value={stats.quizzesCompleted}
                icon={ClipboardCheck}
                accent="violet"
                delay={0.05}
              />
              <StatCard
                label="الاختبارات الناجح بها"
                value={stats.quizzesPassed}
                icon={ShieldCheck}
                accent="emerald"
                delay={0.1}
              />
              <StatCard
                label="الاختبارات الراسب بها"
                value={stats.quizzesFailed}
                icon={ShieldX}
                accent="amber"
                delay={0.15}
              />
            </div>
          </motion.div>

          {/* ==== Assignments section (Phase 32) ==== */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.18 }}
            className="space-y-4"
          >
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              <h2 className="text-lg md:text-xl font-bold">الواجبات</h2>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                label="إجمالي الواجبات"
                value={stats.assignmentsTotal}
                icon={FileText}
                accent="primary"
                delay={0}
              />
              <StatCard
                label="الواجبات المكتملة"
                value={stats.assignmentsCompleted}
                icon={ClipboardCheck}
                accent="violet"
                delay={0.05}
              />
              <StatCard
                label="الواجبات الناجح بها"
                value={stats.assignmentsPassed}
                icon={ShieldCheck}
                accent="emerald"
                delay={0.1}
              />
              <StatCard
                label="الواجبات الراسب بها"
                value={stats.assignmentsFailed}
                icon={ShieldX}
                accent="amber"
                delay={0.15}
              />
            </div>
          </motion.div>


          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="rounded-2xl border border-border/60 bg-card overflow-hidden"
          >
            <div className="p-5 md:p-6 border-b border-border/60">
              <h2 className="text-lg md:text-xl font-bold">دوراتي</h2>
              <p className="text-xs text-muted-foreground">
                اضغط على الدورة لعرض الدروس والاختبارات والتقدّم داخل كل محتوى.
              </p>
            </div>
            <div className="divide-y divide-border/50">
              {stats.courses.map((c, i) => (
                <CourseRow key={c.id} course={c} index={i} />
              ))}
            </div>
          </motion.div>

          {/* ==== Failed attempts table ==== */}
          <FailedAttemptsCard
            rows={stats.failedAttempts}
            onView={(id) => setOpenAttemptId(id)}
          />
        </>
      )}

      <AttemptDetailsModal
        attemptId={openAttemptId}
        open={openAttemptId !== null}
        onOpenChange={(o) => !o && setOpenAttemptId(null)}
      />
    </div>
  );
};

const FailedAttemptsCard = ({
  rows,
  onView,
}: {
  rows: FailedAttemptRow[];
  onView: (attemptId: string) => void;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: 0.25 }}
    className="rounded-2xl border border-border/60 bg-card overflow-hidden"
  >
    <div className="p-5 md:p-6 border-b border-border/60 flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-red-500/10 text-red-600 dark:text-red-400 flex items-center justify-center">
        <ShieldX className="w-5 h-5" />
      </div>
      <div>
        <h2 className="text-lg md:text-xl font-bold">محاولات راسب بها</h2>
        <p className="text-xs text-muted-foreground">
          النتيجة الرسمية لكل اختبار رسبت به.
        </p>
      </div>
    </div>

    {rows.length === 0 ? (
      <div className="p-10 text-center text-sm text-muted-foreground">
        لا توجد محاولات راسب بها حالياً
      </div>
    ) : (
      <>
        {/* Desktop */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border/60 bg-muted/30">
              <tr>
                <th className="text-right p-4">الاختبار</th>
                <th className="text-right p-4">الدورة</th>
                <th className="text-right p-4">المادة</th>
                <th className="text-right p-4">النتيجة</th>
                <th className="text-right p-4">تاريخ التسليم</th>
                <th className="text-right p-4 w-32"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const display = getResultDisplay(
                  { status: "graded", percentage: r.percentage, passed: false },
                  r.pass_percentage,
                );
                return (
                  <motion.tr
                    key={r.attempt_id}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="border-b border-border/40 hover:bg-accent/30 transition-colors"
                  >
                    <td className="p-4 font-semibold">{r.quiz_title}</td>
                    <td className="p-4 text-sm text-muted-foreground">{r.course_title}</td>
                    <td className="p-4">
                      {r.subject_name ? (
                        <Badge variant="secondary" className="text-[10px] font-medium">
                          {r.subject_name}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="p-4">
                      <Badge className={`${display.badgeClass} font-bold`}>
                        {display.label}
                        {display.showPercentage && display.percentage !== null && (
                          <span className="mr-1">· {Math.round(display.percentage)}%</span>
                        )}
                      </Badge>
                    </td>
                    <td className="p-4 text-xs text-muted-foreground tabular-nums">
                      {r.submitted_at
                        ? new Date(r.submitted_at).toLocaleDateString("ar-EG")
                        : "—"}
                    </td>
                    <td className="p-4">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() => onView(r.attempt_id)}
                      >
                        <Eye className="w-3.5 h-3.5" />
                        عرض التفاصيل
                      </Button>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile */}
        <div className="md:hidden divide-y divide-border/50">
          {rows.map((r, i) => {
            const display = getResultDisplay(
              { status: "graded", percentage: r.percentage, passed: false },
              r.pass_percentage,
            );
            return (
              <motion.div
                key={r.attempt_id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="p-4 space-y-2"
              >
                <div className="font-bold">{r.quiz_title}</div>
                <div className="text-xs text-muted-foreground">{r.course_title}</div>
                <div className="flex items-center gap-2 flex-wrap">
                  {r.subject_name && (
                    <Badge variant="secondary" className="text-[10px]">
                      {r.subject_name}
                    </Badge>
                  )}
                  <Badge className={`${display.badgeClass} font-bold text-[10px]`}>
                    {display.label}
                    {display.showPercentage && display.percentage !== null && (
                      <span className="mr-1">· {Math.round(display.percentage)}%</span>
                    )}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    {r.submitted_at
                      ? new Date(r.submitted_at).toLocaleDateString("ar-EG")
                      : "—"}
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full gap-1.5"
                  onClick={() => onView(r.attempt_id)}
                >
                  <Eye className="w-3.5 h-3.5" />
                  عرض التفاصيل
                </Button>
              </motion.div>
            );
          })}
        </div>
      </>
    )}
  </motion.div>
);


const OverallCard = ({ percent }: { percent: number }) => {
  const { count } = useCountUp(percent, 1400);
  return (
    <motion.div
      initial={{ opacity: 0, y: 18, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: 0.1, type: "spring", damping: 22, stiffness: 200 }}
      whileHover={{ y: -3 }}
      className="relative overflow-hidden rounded-2xl border border-border/60 bg-card p-5 md:p-6"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-xs md:text-sm font-medium text-muted-foreground mb-2">
            نسبة الإكمال الإجمالية
          </div>
          <div className="text-3xl md:text-4xl font-black tabular-nums text-foreground leading-none">
            {count}
            <span className="text-lg md:text-xl font-bold text-muted-foreground mr-1">%</span>
          </div>
          <div className="mt-3">
            <Progress value={count} className="h-2" />
          </div>
        </div>
        <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <Percent className="w-5 h-5" />
        </div>
      </div>
    </motion.div>
  );
};

const CourseRow = ({ course, index }: { course: StudentCourseStat; index: number }) => {
  const [open, setOpen] = useState(false);
  const thumb = useSignedThumbnail(course.thumbnail_url);

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.25 + index * 0.05 }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 p-4 md:p-5 text-right hover:bg-accent/30 transition-colors"
      >
        <div className="w-16 h-11 md:w-20 md:h-14 rounded-lg overflow-hidden bg-accent shrink-0 flex items-center justify-center">
          {thumb ? (
            <img src={thumb} alt="" className="w-full h-full object-cover" />
          ) : (
            <BookOpen className="w-5 h-5 text-muted-foreground/50" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-foreground truncate">{course.title}</div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {course.stage_name && (
              <Badge variant="secondary" className="text-[10px] font-medium">
                {course.stage_name}
              </Badge>
            )}
            {course.subject_name && (
              <Badge variant="outline" className="text-[10px] font-medium">
                {course.subject_name}
              </Badge>
            )}
            <span className="text-[11px] text-muted-foreground">
              {course.completed_lessons}/{course.total_lessons} محتوى
            </span>
          </div>
        </div>
        <div className="hidden sm:flex flex-col items-end gap-1 w-32 shrink-0">
          <div className="flex items-center gap-1 text-sm font-bold tabular-nums">
            <TrendingUp className="w-3.5 h-3.5 text-primary" />
            {course.percent}%
          </div>
          <Progress value={course.percent} className="h-1.5 w-full" />
        </div>
        <div className="sm:hidden text-sm font-bold tabular-nums shrink-0">{course.percent}%</div>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        </motion.div>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden bg-muted/20 border-t border-border/40"
          >
            <div className="p-4 md:p-5 space-y-4">
              {course.units.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  لا توجد وحدات بعد.
                </p>
              ) : (
                course.units.map((u, ui) => (
                  <div key={u.id} className="space-y-1.5">
                    <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-wider px-1">
                      <span className="w-5 h-5 rounded bg-primary/10 text-primary inline-flex items-center justify-center text-[10px]">
                        {ui + 1}
                      </span>
                      <span className="truncate">{u.title}</span>
                    </div>
                    {u.lessons.length === 0 && u.quizzes.length === 0 && u.assignments.length === 0 ? (
                      <div className="text-xs text-muted-foreground px-2 py-1.5">
                        لا يوجد محتوى
                      </div>
                    ) : (
                      <>
                        {[
                          ...u.lessons.map((item) => ({ ...item, type: "lesson" as const })),
                          ...u.quizzes.map((item) => ({ ...item, type: "quiz" as const })),
                          ...u.assignments.map((item) => ({ ...item, type: "assignment" as const })),
                        ]
                          .sort((a, b) => a.position - b.position)
                          .map((item) => {
                            if (item.type === "lesson") {
                              return (
                                <Link
                                  key={`lesson-${item.id}`}
                                  to={`/courses/${course.id}/learn/lesson/${item.id}`}
                                  className="flex items-center gap-3 p-2.5 rounded-lg bg-background border border-border/50 hover:border-primary/40 transition-colors group"
                                >
                                  <div
                                    className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${
                                      item.completed
                                        ? "bg-emerald-500 text-white"
                                        : "bg-primary/10 text-primary"
                                    }`}
                                  >
                                    {item.completed ? (
                                      <CheckCircle2 className="w-4 h-4" />
                                    ) : (
                                      <PlayCircle className="w-4 h-4" />
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0 text-sm font-medium truncate">
                                    {item.title}
                                  </div>
                                  <div className="text-xs font-bold tabular-nums shrink-0">
                                    {item.completed ? (
                                      <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                        مكتمل
                                      </span>
                                    ) : (
                                      <span className="text-muted-foreground">
                                        {Math.round(item.watch_percentage)}%
                                      </span>
                                    )}
                                  </div>
                                </Link>
                              );
                            }

                            if (item.type === "quiz") {
                              return (
                                <Link
                                  key={`quiz-${item.id}`}
                                  to={`/courses/${course.id}/learn/quiz/${item.id}`}
                                  className="flex items-center gap-3 p-2.5 rounded-lg bg-background border border-border/50 hover:border-primary/40 transition-colors group"
                                >
                                  <div
                                    className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${
                                      item.attempted
                                        ? "bg-emerald-500 text-white"
                                        : "bg-violet-500/10 text-violet-600 dark:text-violet-400"
                                    }`}
                                  >
                                    {item.attempted ? (
                                      <CheckCircle2 className="w-4 h-4" />
                                    ) : (
                                      <ClipboardCheck className="w-4 h-4" />
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0 text-sm font-medium truncate">
                                    {item.title}
                                    <span className="mr-1 text-[10px] font-normal text-muted-foreground">· اختبار</span>
                                  </div>
                                  <div className="text-xs font-bold tabular-nums shrink-0">
                                    {item.attempted ? (
                                      <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                        تمّت المحاولة
                                      </span>
                                    ) : (
                                      <span className="text-muted-foreground">لم تُحاول</span>
                                    )}
                                  </div>
                                </Link>
                              );
                            }

                            // assignment
                            return (
                              <Link
                                key={`assignment-${item.id}`}
                                to={`/courses/${course.id}/learn/assignment/${item.id}`}
                                className="flex items-center gap-3 p-2.5 rounded-lg bg-background border border-border/50 hover:border-primary/40 transition-colors group"
                              >
                                <div
                                  className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${
                                    item.evaluated
                                      ? "bg-emerald-500 text-white"
                                      : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                                  }`}
                                >
                                  {item.evaluated ? (
                                    <CheckCircle2 className="w-4 h-4" />
                                  ) : (
                                    <FileText className="w-4 h-4" />
                                  )}
                                </div>
                                <div className="flex-1 min-w-0 text-sm font-medium truncate">
                                  {item.title}
                                  <span className="mr-1 text-[10px] font-normal text-muted-foreground">· واجب</span>
                                </div>
                                <div className="text-xs font-bold tabular-nums shrink-0">
                                  {item.evaluated ? (
                                    <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                                      <CheckCircle2 className="w-3.5 h-3.5" />
                                      تمّ تقييمه
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground">قيد الانتظار</span>
                                  )}
                                </div>
                              </Link>
                            );
                          })}
                      </>
                    )}
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

const EmptyState = () => (
  <motion.div
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    className="rounded-3xl border-2 border-dashed border-border p-12 md:p-16 text-center max-w-xl mx-auto"
  >
    <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-primary/10 mb-6">
      <Compass className="w-10 h-10 text-primary" />
    </div>
    <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary bg-primary/10 rounded-full px-3 py-1 mb-3">
      <Sparkles className="w-3 h-3" />
      ابدأ رحلتك
    </div>
    <h2 className="text-xl md:text-2xl font-bold mb-2">
      لم تسجّل في أي دورة بعد
    </h2>
    <p className="text-muted-foreground max-w-md mx-auto mb-6">
      سجّل في أول دورة لتظهر إحصائيات تقدّمك هنا.
    </p>
    <Button asChild size="lg" className="font-bold">
      <Link to="/courses">استعرض الدورات</Link>
    </Button>
  </motion.div>
);

export default StudentStatistics;
