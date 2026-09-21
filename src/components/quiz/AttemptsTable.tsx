import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BellRing,
  BellOff,
  Eye,
  Inbox,
  MessageSquare,
  MessageSquareOff,
} from "lucide-react";
import type { QuizAttemptRow } from "@/lib/quiz-attempts-api";
import { getResultDisplay } from "@/lib/quiz-result";
import { cn } from "@/lib/utils";

const formatDate = (iso: string | null) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ar-EG", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

interface Props {
  rows: QuizAttemptRow[];
  loading: boolean;
  onView: (row: QuizAttemptRow) => void;
  emptyTitle: string;
  emptyAction?: React.ReactNode;
  showStudentColumn: boolean;
  showSubjectStageColumns?: boolean;
}

export default function AttemptsTable({
  rows,
  loading,
  onView,
  emptyTitle,
  emptyAction,
  showStudentColumn,
  showSubjectStageColumns = true,
}: Props) {
  if (loading) return <TableSkeleton />;

  if (!rows.length) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-10 md:p-14 text-center">
        <div className="mx-auto mb-4 w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
          <Inbox className="w-7 h-7 text-muted-foreground" />
        </div>
        <div className="font-bold text-lg text-foreground">{emptyTitle}</div>
        {emptyAction && <div className="mt-4">{emptyAction}</div>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Desktop table */}
      <div className="hidden md:block rounded-2xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                {showStudentColumn && <TableHead className="text-right">الطالب</TableHead>}
                <TableHead className="text-right">الاختبار</TableHead>
                <TableHead className="text-right">الدورة</TableHead>
                {showSubjectStageColumns && (
                  <>
                    <TableHead className="text-right">المادة</TableHead>
                    <TableHead className="text-right">المرحلة</TableHead>
                  </>
                )}
                <TableHead className="text-center">النموذج</TableHead>
                <TableHead className="text-center">المحاولة</TableHead>
                <TableHead className="text-right">النتيجة</TableHead>
                <TableHead className="text-center">ملاحظات</TableHead>
                <TableHead className="text-right">تاريخ التسليم</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              <AnimatePresence initial={false}>
                {rows.map((r, i) => {
                  const result = getResultDisplay(
                    { status: r.status, percentage: r.percentage, passed: r.passed },
                    r.pass_percentage,
                  );
                  return (
                    <motion.tr
                      key={r.attempt_id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.18, delay: Math.min(i * 0.015, 0.2) }}
                      className="border-b border-border/60 hover:bg-accent/30"
                    >
                      {showStudentColumn && (
                        <TableCell>
                          <div className="font-medium text-foreground truncate max-w-[180px]">
                            {r.student_name || "بدون اسم"}
                          </div>
                          <div className="text-xs text-muted-foreground truncate max-w-[180px]">
                            {r.student_email}
                          </div>
                        </TableCell>
                      )}
                      <TableCell className="font-medium truncate max-w-[220px]">{r.quiz_title}</TableCell>
                      <TableCell className="text-muted-foreground truncate max-w-[180px]">{r.course_title}</TableCell>
                      {showSubjectStageColumns && (
                        <>
                          <TableCell className="text-muted-foreground">{r.subject_name ?? "—"}</TableCell>
                          <TableCell className="text-muted-foreground">{r.stage_name ?? "—"}</TableCell>
                        </>
                      )}
                      <TableCell className="text-center tabular-nums">{r.form_number}</TableCell>
                      <TableCell className="text-center tabular-nums">#{r.attempt_number}</TableCell>
                      <TableCell>
                        <Badge className={cn("gap-1", result.badgeClass)}>
                          {result.label}
                          {result.showPercentage && result.percentage != null && (
                            <span className="opacity-90">— {result.percentage}%</span>
                          )}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {r.has_feedback ? (
                          <span
                            title="تم إرسال ملاحظات"
                            className="inline-flex w-8 h-8 rounded-lg bg-primary/10 text-primary items-center justify-center"
                          >
                            <BellRing className="w-4 h-4" />
                          </span>
                        ) : (
                          <span
                            title="لا توجد ملاحظات"
                            className="inline-flex w-8 h-8 rounded-lg bg-muted text-muted-foreground items-center justify-center"
                          >
                            <BellOff className="w-4 h-4" />
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                        {formatDate(r.submitted_at)}
                      </TableCell>
                      <TableCell className="text-left">
                        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onView(r)}>
                          <Eye className="w-3.5 h-3.5" />
                          عرض
                        </Button>
                      </TableCell>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Mobile stacked cards */}
      <div className="md:hidden space-y-3">
        <AnimatePresence initial={false}>
          {rows.map((r, i) => {
            const result = getResultDisplay(
              { status: r.status, percentage: r.percentage, passed: r.passed },
              r.pass_percentage,
            );
            return (
              <motion.div
                key={r.attempt_id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18, delay: Math.min(i * 0.02, 0.2) }}
                className="rounded-2xl border border-border bg-card p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-foreground truncate">{r.quiz_title}</div>
                    <div className="text-xs text-muted-foreground truncate">{r.course_title}</div>
                  </div>
                  <Badge className={cn("gap-1 shrink-0", result.badgeClass)}>
                    {result.label}
                    {result.showPercentage && result.percentage != null && <span>— {result.percentage}%</span>}
                  </Badge>
                </div>

                {showStudentColumn && (
                  <div className="text-sm">
                    <div className="font-medium">{r.student_name || "بدون اسم"}</div>
                    <div className="text-xs text-muted-foreground truncate">{r.student_email}</div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <Meta label="النموذج" value={String(r.form_number)} />
                  <Meta label="المحاولة" value={`#${r.attempt_number}`} />
                  {showSubjectStageColumns && (
                    <>
                      <Meta label="المادة" value={r.subject_name ?? "—"} />
                      <Meta label="المرحلة" value={r.stage_name ?? "—"} />
                    </>
                  )}
                  <Meta label="التسليم" value={formatDate(r.submitted_at)} />
                  <Meta
                    label="ملاحظات"
                    value={r.has_feedback ? "تم الإرسال" : "لا يوجد"}
                    icon={
                      r.has_feedback ? (
                        <MessageSquare className="w-3.5 h-3.5 text-primary" />
                      ) : (
                        <MessageSquareOff className="w-3.5 h-3.5 text-muted-foreground" />
                      )
                    }
                  />
                </div>

                <Button className="w-full gap-2" variant="outline" onClick={() => onView(r)}>
                  <Eye className="w-4 h-4" />
                  عرض التفاصيل
                </Button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}

const Meta = ({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) => (
  <div className="rounded-lg bg-accent/40 p-2">
    <div className="text-[10px] text-muted-foreground">{label}</div>
    <div className="font-semibold text-foreground inline-flex items-center gap-1">
      {icon}
      {value}
    </div>
  </div>
);

const TableSkeleton = () => (
  <div className="space-y-3">
    {Array.from({ length: 6 }).map((_, i) => (
      <Skeleton key={i} className="h-16 rounded-xl" />
    ))}
  </div>
);
