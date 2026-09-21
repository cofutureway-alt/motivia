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
import { BellOff, BellRing, Eye, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { deriveOutcome, type SubmissionListRow } from "@/lib/assignment-submissions-api";
import { outcomeDisplay } from "@/lib/assignment-outcome";

const formatDate = (iso: string | null) =>
  !iso
    ? "—"
    : new Date(iso).toLocaleString("ar-EG", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

interface Props {
  rows: SubmissionListRow[];
  loading: boolean;
  onView: (row: SubmissionListRow) => void;
  emptyTitle: string;
  emptyAction?: React.ReactNode;
  showStudentColumn: boolean;
  showSubjectStageColumns?: boolean;
}

export default function SubmissionsTable({
  rows,
  loading,
  onView,
  emptyTitle,
  emptyAction,
  showStudentColumn,
  showSubjectStageColumns = true,
}: Props) {
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-xl" />
        ))}
      </div>
    );
  }

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
      {/* Desktop */}
      <div className="hidden md:block rounded-2xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                {showStudentColumn && <TableHead className="text-right">الطالب</TableHead>}
                <TableHead className="text-right">الواجب</TableHead>
                <TableHead className="text-right">الدورة</TableHead>
                {showSubjectStageColumns && (
                  <>
                    <TableHead className="text-right">المادة</TableHead>
                    <TableHead className="text-right">المرحلة</TableHead>
                  </>
                )}
                <TableHead className="text-right">النتيجة</TableHead>
                <TableHead className="text-center">Feedback</TableHead>
                <TableHead className="text-right">تاريخ التسليم</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              <AnimatePresence initial={false}>
                {rows.map((r, i) => {
                  const outcome = deriveOutcome(r);
                  const d = outcomeDisplay(outcome);
                  return (
                    <motion.tr
                      key={r.submission_id}
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
                            {r.student_email || r.student_phone || "—"}
                          </div>
                        </TableCell>
                      )}
                      <TableCell className="font-medium truncate max-w-[220px]">
                        {r.assignment_title}
                      </TableCell>
                      <TableCell className="text-muted-foreground truncate max-w-[180px]">
                        {r.course_title}
                      </TableCell>
                      {showSubjectStageColumns && (
                        <>
                          <TableCell className="text-muted-foreground">{r.subject_name ?? "—"}</TableCell>
                          <TableCell className="text-muted-foreground">{r.stage_name ?? "—"}</TableCell>
                        </>
                      )}
                      <TableCell>
                        <Badge className={cn("gap-1 font-medium", d.badgeClass)}>
                          {d.label}
                          {outcome && outcome !== "not_submitted" && r.grade != null && (
                            <span className="opacity-80">
                              — {Number(r.grade)}/{Number(r.total_grade)}
                            </span>
                          )}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {r.has_feedback ? (
                          <span
                            title="تم إرسال Feedback"
                            className="inline-flex w-8 h-8 rounded-lg bg-primary/10 text-primary items-center justify-center"
                          >
                            <BellRing className="w-4 h-4" />
                          </span>
                        ) : (
                          <span
                            title="لا يوجد Feedback"
                            className="inline-flex w-8 h-8 rounded-lg bg-muted text-muted-foreground items-center justify-center"
                          >
                            <BellOff className="w-4 h-4" />
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                        {r.submitted_at ? formatDate(r.submitted_at) : "لم يتم التسليم"}
                      </TableCell>
                      <TableCell className="text-left">
                        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onView(r)}>
                          <Eye className="w-3.5 h-3.5" />
                          عرض التفاصيل
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

      {/* Mobile */}
      <div className="md:hidden space-y-3">
        <AnimatePresence initial={false}>
          {rows.map((r, i) => {
            const outcome = deriveOutcome(r);
            const d = outcomeDisplay(outcome);
            return (
              <motion.div
                key={r.submission_id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18, delay: Math.min(i * 0.02, 0.2) }}
                className="rounded-2xl border border-border bg-card p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-foreground truncate">{r.assignment_title}</div>
                    <div className="text-xs text-muted-foreground truncate">{r.course_title}</div>
                  </div>
                  <Badge className={cn("gap-1 shrink-0", d.badgeClass)}>{d.label}</Badge>
                </div>

                {showStudentColumn && (
                  <div className="text-sm">
                    <div className="font-medium">{r.student_name || "بدون اسم"}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {r.student_email || r.student_phone || "—"}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg bg-accent/40 p-2">
                    <div className="text-[10px] text-muted-foreground">الدرجة</div>
                    <div className="font-semibold">
                      {outcome && outcome !== "not_submitted" && r.grade != null
                        ? `${Number(r.grade)}/${Number(r.total_grade)}`
                        : "—"}
                    </div>
                  </div>
                  <div className="rounded-lg bg-accent/40 p-2">
                    <div className="text-[10px] text-muted-foreground">التسليم</div>
                    <div className="font-semibold">
                      {r.submitted_at ? formatDate(r.submitted_at) : "لم يتم التسليم"}
                    </div>
                  </div>
                  {showSubjectStageColumns && (
                    <>
                      <div className="rounded-lg bg-accent/40 p-2">
                        <div className="text-[10px] text-muted-foreground">المادة</div>
                        <div className="font-semibold">{r.subject_name ?? "—"}</div>
                      </div>
                      <div className="rounded-lg bg-accent/40 p-2">
                        <div className="text-[10px] text-muted-foreground">المرحلة</div>
                        <div className="font-semibold">{r.stage_name ?? "—"}</div>
                      </div>
                    </>
                  )}
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
