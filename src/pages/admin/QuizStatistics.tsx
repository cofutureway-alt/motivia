import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, BarChart3, CheckCircle2, XCircle, Loader2, ChevronLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import RichTextRenderer from "@/components/admin/quiz/RichTextRenderer";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";

interface QuestionRow {
  question_id: string;
  content: any;
  type: string;
  points: number;
  order_index: number;
  correct_count: number;
  incorrect_count: number;
  unanswered_count: number;
  total_count: number;
}

interface QuizMeta {
  id: string;
  title: string;
  forms_count: number;
  course_id: string;
  course_title: string;
}

export default function QuizStatistics() {
  const { quizId } = useParams<{ quizId: string }>();
  const [meta, setMeta] = useState<QuizMeta | null>(null);
  const [form, setForm] = useState<number>(1);
  const [rows, setRows] = useState<QuestionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!quizId) return;
    (supabase as any)
      .from("quizzes")
      .select("id, title, forms_count, course_id, courses(title)")
      .eq("id", quizId)
      .maybeSingle()
      .then(({ data }: any) => {
        if (!data) return;
        setMeta({
          id: data.id,
          title: data.title,
          forms_count: data.forms_count ?? 1,
          course_id: data.course_id,
          course_title: data.courses?.title ?? "",
        });
      });
  }, [quizId]);

  useEffect(() => {
    if (!quizId) return;
    setLoading(true);
    (supabase as any)
      .rpc("get_question_analysis", { _quiz_id: quizId, _form: form })
      .then(({ data }: any) => {
        setRows((data ?? []) as QuestionRow[]);
      })
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [quizId, form]);

  const mostFailed = useMemo(
    () =>
      [...rows]
        .filter((r) => r.total_count > 0)
        .sort((a, b) => b.incorrect_count - a.incorrect_count || a.correct_count - b.correct_count)
        .slice(0, 10),
    [rows],
  );

  const mostSucceeded = useMemo(
    () =>
      [...rows]
        .filter((r) => r.total_count > 0)
        .sort((a, b) => b.correct_count - a.correct_count || a.incorrect_count - b.incorrect_count)
        .slice(0, 10),
    [rows],
  );

  const totalOfficialAttempts = rows[0]?.total_count ?? 0;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-start justify-between gap-4"
      >
        <div>
          <Link
            to="/admin"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary mb-2"
          >
            <ChevronLeft className="w-3.5 h-3.5 rotate-180" />
            العودة إلى الإحصائيات
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-black">{meta?.title ?? "…"}</h1>
              <p className="text-xs md:text-sm text-muted-foreground">
                تحليل الأسئلة • {meta?.course_title}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {meta && meta.forms_count > 1 && (
            <div className="min-w-[10rem]">
              <div className="text-xs text-muted-foreground mb-1.5">النموذج</div>
              <Select value={String(form)} onValueChange={(v) => setForm(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: meta.forms_count }).map((_, i) => (
                    <SelectItem key={i} value={String(i + 1)}>
                      النموذج {i + 1}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <Link to={`/admin/quiz-attempts?quizId=${quizId}`}>
            <Button variant="outline" className="gap-2">
              كل المحاولات <ArrowRight className="w-4 h-4 rotate-180" />
            </Button>
          </Link>
        </div>
      </motion.div>

      <div className="rounded-2xl border border-border/60 bg-card p-4 text-sm text-muted-foreground">
        النتائج مبنية على{" "}
        <span className="font-bold text-foreground">
          {loading ? "…" : totalOfficialAttempts}
        </span>{" "}
        محاولة رسمية (Official) في هذا النموذج.
      </div>

      {loading ? (
        <div className="grid md:grid-cols-2 gap-6">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-96 rounded-2xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-border/60 bg-card p-12 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-muted mb-3">
            <BarChart3 className="w-6 h-6 text-muted-foreground" />
          </div>
          <div className="font-bold mb-1">لا توجد بيانات كافية للتحليل</div>
          <div className="text-sm text-muted-foreground">
            لم يقم أحد بإنهاء هذا النموذج بعد.
          </div>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-6">
          <AnalysisTable
            title="الأسئلة الأكثر رسوباً"
            accent="destructive"
            rows={mostFailed}
            metricLabel="خطأ"
            metricKey="incorrect_count"
          />
          <AnalysisTable
            title="الأسئلة الأكثر نجاحاً"
            accent="emerald"
            rows={mostSucceeded}
            metricLabel="صواب"
            metricKey="correct_count"
          />
        </div>
      )}
    </div>
  );
}

function AnalysisTable({
  title,
  accent,
  rows,
  metricLabel,
  metricKey,
}: {
  title: string;
  accent: "destructive" | "emerald";
  rows: QuestionRow[];
  metricLabel: string;
  metricKey: "incorrect_count" | "correct_count";
}) {
  const isDestructive = accent === "destructive";
  return (
    <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
      <div className="p-5 border-b border-border/60 flex items-center gap-3">
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center ${
            isDestructive ? "bg-destructive/10 text-destructive" : "bg-emerald-500/10 text-emerald-600"
          }`}
        >
          {isDestructive ? <XCircle className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
        </div>
        <h3 className="font-bold text-lg">{title}</h3>
      </div>
      {rows.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">لا توجد بيانات.</div>
      ) : (
        <ul className="divide-y divide-border/50">
          {rows.map((r, i) => {
            const metric = r[metricKey];
            const pct = r.total_count > 0 ? Math.round((metric / r.total_count) * 100) : 0;
            return (
              <li key={r.question_id} className="p-4 flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-muted text-muted-foreground flex items-center justify-center text-sm font-bold shrink-0">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0 text-sm">
                  <div className="line-clamp-3 [&_*]:!m-0 [&_p]:!m-0">
                    <RichTextRenderer content={r.content} />
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {r.correct_count} صواب • {r.incorrect_count} خطأ
                    {r.unanswered_count > 0 && ` • ${r.unanswered_count} بدون إجابة`}
                  </div>
                </div>
                <div
                  className={`shrink-0 inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold tabular-nums ${
                    isDestructive
                      ? "bg-destructive/10 text-destructive"
                      : "bg-emerald-500/10 text-emerald-700"
                  }`}
                >
                  {metric} {metricLabel} ({pct}%)
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
