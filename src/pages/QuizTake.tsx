import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Circle,
  Clock,
  Loader2,
  Send,
  LayoutGrid,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import RichTextRenderer from "@/components/admin/quiz/RichTextRenderer";
import {
  addAnswerTime,
  fetchQuizMeta,
  getAttemptQuestions,
  getOrFinalize,
  heartbeat,
  saveAnswer,
  submitAttempt,
  type AttemptQuestion,
  type QuizAttempt,
  type QuizMeta,
} from "@/lib/quiz-api";
import { cn } from "@/lib/utils";

const HEARTBEAT_MS = 25_000;
const TEXT_DEBOUNCE = 500;

const pad = (n: number) => String(n).padStart(2, "0");
const formatRemaining = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
};

const QuizTake = () => {
  const { attemptId } = useParams();
  const navigate = useNavigate();

  const [attempt, setAttempt] = useState<QuizAttempt | null>(null);
  const [quiz, setQuiz] = useState<QuizMeta | null>(null);
  const [questions, setQuestions] = useState<AttemptQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIdx, setActiveIdx] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [submitting, setSubmitting] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [autoSubmitting, setAutoSubmitting] = useState(false);

  // Per-question local time tracking
  const activeStartRef = useRef<number>(Date.now());
  const activeIdxRef = useRef(0);
  const questionsRef = useRef<AttemptQuestion[]>([]);
  useEffect(() => {
    questionsRef.current = questions;
  }, [questions]);

  // Text debounce timer
  const textTimerRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const load = useCallback(async () => {
    if (!attemptId) return;
    setLoading(true);
    try {
      const a = await getOrFinalize(attemptId);
      if (!a) {
        toast.error("لم يتم العثور على المحاولة");
        navigate("/dashboard");
        return;
      }
      setAttempt(a);
      const q = await fetchQuizMeta(a.quiz_id);
      setQuiz(q);
      if (a.status !== "in_progress") {
        // Redirect to details page
        navigate(`/courses/${q.course_id}/learn/quiz/${q.id}`, { replace: true });
        return;
      }
      const qs = await getAttemptQuestions(attemptId);
      setQuestions(qs);
      // Land on first unanswered
      const firstUnanswered = qs.findIndex((x) => !x.answered_at);
      setActiveIdx(firstUnanswered >= 0 ? firstUnanswered : 0);
      activeIdxRef.current = firstUnanswered >= 0 ? firstUnanswered : 0;
      activeStartRef.current = Date.now();
    } catch (e: any) {
      toast.error(e?.message || "تعذّر تحميل الاختبار");
      navigate("/dashboard");
    } finally {
      setLoading(false);
    }
  }, [attemptId, navigate]);

  useEffect(() => {
    load();
  }, [load]);

  // Tick every second
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Beforeunload warning
  useEffect(() => {
    if (!attempt || attempt.status !== "in_progress") return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [attempt]);

  // Pause tracker on visibility hidden
  const visibleRef = useRef(true);
  useEffect(() => {
    const onVis = () => {
      const nowVisible = document.visibilityState === "visible";
      if (visibleRef.current && !nowVisible) {
        // Flush current segment
        flushActiveTime();
      } else if (!visibleRef.current && nowVisible) {
        activeStartRef.current = Date.now();
      }
      visibleRef.current = nowVisible;
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const flushActiveTime = useCallback(() => {
    if (!attemptId) return;
    if (!visibleRef.current) return;
    const qs = questionsRef.current;
    const idx = activeIdxRef.current;
    const q = qs[idx];
    if (!q) return;
    const delta = (Date.now() - activeStartRef.current) / 1000;
    if (delta <= 0.5) return;
    activeStartRef.current = Date.now();
    // Optimistically update local
    setQuestions((prev) => {
      const next = [...prev];
      if (next[idx]) next[idx] = { ...next[idx], time_spent_seconds: next[idx].time_spent_seconds + delta };
      return next;
    });
    addAnswerTime(attemptId, q.id, delta).catch(() => {});
  }, [attemptId]);

  // Heartbeat
  useEffect(() => {
    if (!attempt || attempt.status !== "in_progress" || !attemptId) return;
    const t = setInterval(async () => {
      try {
        const stillInProgress = await heartbeat(attemptId);
        if (!stillInProgress) {
          await triggerAutoSubmit(true);
        }
      } catch {}
    }, HEARTBEAT_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, attemptId]);

  // Countdown expiry
  const expiresMs = attempt ? new Date(attempt.expires_at).getTime() : 0;
  const startedMs = attempt ? new Date(attempt.started_at).getTime() : 0;
  const totalDurationMs = expiresMs - startedMs;
  const remainingMs = expiresMs - nowMs;

  const timeColor = useMemo(() => {
    if (!totalDurationMs) return "text-foreground";
    const ratio = remainingMs / totalDurationMs;
    if (ratio > 0.5) return "bg-emerald-500 text-white";
    if (ratio > 0.2) return "bg-amber-500 text-white";
    return "bg-red-500 text-white";
  }, [remainingMs, totalDurationMs]);

  useEffect(() => {
    if (!attempt || attempt.status !== "in_progress") return;
    if (remainingMs <= 0 && !autoSubmitting) {
      triggerAutoSubmit(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingMs, attempt]);

  const triggerAutoSubmit = async (fromServer: boolean) => {
    if (autoSubmitting || !attemptId) return;
    setAutoSubmitting(true);
    flushActiveTime();
    toast.info(fromServer ? "انتهت المحاولة" : "انتهى الوقت، جاري تسليم الاختبار…");
    try {
      await submitAttempt(attemptId);
    } catch {}
    if (quiz) navigate(`/courses/${quiz.course_id}/learn/quiz/${quiz.id}`, { replace: true });
  };

  const goto = (i: number) => {
    if (i < 0 || i >= questions.length || i === activeIdx) return;
    flushActiveTime();
    activeIdxRef.current = i;
    activeStartRef.current = Date.now();
    setActiveIdx(i);
    setPaletteOpen(false);
  };

  const persistAnswer = useCallback(
    async (q: AttemptQuestion, selectedIds: string[], fillText: string | null) => {
      if (!attemptId) return;
      const delta = (Date.now() - activeStartRef.current) / 1000;
      activeStartRef.current = Date.now();
      try {
        await saveAnswer({
          attemptId,
          questionId: q.id,
          selectedOptionIds: selectedIds,
          fillBlankText: fillText,
          timeDeltaSeconds: delta > 0 ? delta : 0,
        });
        setQuestions((prev) => {
          const next = [...prev];
          const idx = next.findIndex((x) => x.id === q.id);
          if (idx >= 0) {
            const hasAnswer =
              (q.type === "fill_blank" && !!fillText?.trim()) ||
              (q.type !== "fill_blank" && selectedIds.length > 0);
            next[idx] = {
              ...next[idx],
              selected_option_ids: selectedIds,
              fill_blank_text: fillText,
              answered_at: hasAnswer ? next[idx].answered_at ?? new Date().toISOString() : next[idx].answered_at,
              time_spent_seconds: next[idx].time_spent_seconds + (delta > 0 ? delta : 0),
            };
          }
          return next;
        });
      } catch (e: any) {
        toast.error(e?.message || "تعذّر حفظ الإجابة");
      }
    },
    [attemptId],
  );

  const handleChoice = (q: AttemptQuestion, optionId: string) => {
    let selected: string[];
    if (q.type === "multiple_choice") {
      selected = q.selected_option_ids.includes(optionId)
        ? q.selected_option_ids.filter((x) => x !== optionId)
        : [...q.selected_option_ids, optionId];
    } else {
      selected = [optionId];
    }
    // Optimistic
    setQuestions((prev) => {
      const next = [...prev];
      const idx = next.findIndex((x) => x.id === q.id);
      if (idx >= 0) next[idx] = { ...next[idx], selected_option_ids: selected };
      return next;
    });
    persistAnswer(q, selected, q.fill_blank_text ?? null);
  };

  const handleFillChange = (q: AttemptQuestion, text: string) => {
    setQuestions((prev) => {
      const next = [...prev];
      const idx = next.findIndex((x) => x.id === q.id);
      if (idx >= 0) next[idx] = { ...next[idx], fill_blank_text: text };
      return next;
    });
    const prev = textTimerRef.current.get(q.id);
    if (prev) clearTimeout(prev);
    const t = setTimeout(() => {
      persistAnswer(q, [], text);
      textTimerRef.current.delete(q.id);
    }, TEXT_DEBOUNCE);
    textTimerRef.current.set(q.id, t);
  };

  const answeredCount = questions.filter((q) => !!q.answered_at).length;
  const allAnswered = questions.length > 0 && answeredCount === questions.length;

  const activeQ = questions[activeIdx];

  const handleManualSubmit = async () => {
    if (!attemptId) return;
    if (!allAnswered) {
      toast.warning("يجب الإجابة عن جميع الأسئلة قبل التسليم");
      setPaletteOpen(true);
      return;
    }
    setSubmitting(true);
    flushActiveTime();
    try {
      await submitAttempt(attemptId);
      toast.success("تم تسليم الاختبار");
      if (quiz) navigate(`/courses/${quiz.course_id}/learn/quiz/${quiz.id}`, { replace: true });
    } catch (e: any) {
      toast.error(e?.message || "تعذّر تسليم الاختبار");
    } finally {
      setSubmitting(false);
      setConfirmSubmit(false);
    }
  };

  if (loading || !attempt || !activeQ || !quiz) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col" dir="rtl">
      {/* Header (mobile-first) */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="container mx-auto px-3 md:px-6 py-2.5 flex items-center gap-2 md:gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-[11px] text-muted-foreground truncate">{quiz.title}</div>
            <div className="text-sm md:text-base font-bold truncate">
              السؤال {activeIdx + 1} / {questions.length}
              <span className="text-muted-foreground text-xs font-normal mr-2">
                · {answeredCount} تمّت
              </span>
            </div>
          </div>

          <motion.div
            layout
            transition={{ type: "spring", stiffness: 260, damping: 22 }}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1.5 font-mono font-bold text-sm md:text-base transition-colors duration-500",
              timeColor,
            )}
          >
            <Clock className="w-4 h-4" />
            {formatRemaining(remainingMs)}
          </motion.div>

          <Sheet open={paletteOpen} onOpenChange={setPaletteOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" aria-label="خريطة الأسئلة">
                <LayoutGrid className="w-4 h-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" dir="rtl" className="w-80 max-w-[85vw]">
              <SheetHeader>
                <SheetTitle>خريطة الأسئلة</SheetTitle>
              </SheetHeader>
              <div className="mt-4 grid grid-cols-6 gap-2">
                {questions.map((q, i) => {
                  const answered = !!q.answered_at;
                  return (
                    <button
                      key={q.id}
                      onClick={() => goto(i)}
                      className={cn(
                        "aspect-square rounded-lg text-sm font-bold border-2 flex items-center justify-center transition-all",
                        i === activeIdx
                          ? "border-primary bg-primary text-primary-foreground scale-110"
                          : answered
                            ? "border-emerald-500 bg-emerald-500 text-white"
                            : "border-border bg-background text-foreground",
                      )}
                    >
                      {i + 1}
                    </button>
                  );
                })}
              </div>
              <div className="mt-6 space-y-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-emerald-500" /> تمّت الإجابة
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded border-2 border-border" /> بدون إجابة
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-primary" /> السؤال الحالي
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-accent">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${(answeredCount / questions.length) * 100}%` }}
          />
        </div>
      </header>

      {/* Main question */}
      <main className="flex-1 container mx-auto px-3 md:px-6 py-4 md:py-8 max-w-3xl w-full">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeQ.id}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            transition={{ duration: 0.2 }}
            className="rounded-2xl border border-border bg-card p-4 md:p-6"
          >
            <div className="flex items-center gap-2 mb-4">
              <Badge className="bg-primary text-primary-foreground border-0">
                س{activeIdx + 1}
              </Badge>
              <Badge variant="outline">{activeQ.points} نقطة</Badge>
              {activeQ.type === "multiple_choice" && (
                <Badge variant="secondary" className="text-[10px]">اختر كل ما ينطبق</Badge>
              )}
            </div>

            <div className="mb-5">
              <RichTextRenderer content={activeQ.content} className="text-base md:text-lg leading-relaxed" />
              {activeQ.image_url && (
                <img src={activeQ.image_url} alt="" className="mt-3 max-h-72 rounded-lg border border-border" />
              )}
            </div>

            <QuestionInput q={activeQ} onChoice={handleChoice} onFill={handleFillChange} />
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Footer nav — sticky on mobile */}
      <footer className="sticky bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur">
        <div className="container mx-auto px-3 md:px-6 py-3 flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => goto(activeIdx - 1)}
            disabled={activeIdx === 0}
            className="flex-1 md:flex-none"
          >
            <ArrowRight className="w-4 h-4 ml-1" />
            <span className="hidden md:inline">السؤال السابق</span>
            <span className="md:hidden">سابق</span>
          </Button>

          {activeIdx < questions.length - 1 ? (
            <Button onClick={() => goto(activeIdx + 1)} className="flex-1 md:flex-none">
              <span className="hidden md:inline">السؤال التالي</span>
              <span className="md:hidden">التالي</span>
              <ArrowLeft className="w-4 h-4 mr-1" />
            </Button>
          ) : (
            <Button
              onClick={() => setConfirmSubmit(true)}
              disabled={!allAnswered || submitting}
              className="flex-1 md:flex-none bg-primary"
            >
              <Send className="w-4 h-4 ml-1" />
              تسليم الاختبار
            </Button>
          )}
        </div>
      </footer>

      <AlertDialog open={confirmSubmit} onOpenChange={setConfirmSubmit}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد تسليم الاختبار</AlertDialogTitle>
            <AlertDialogDescription>
              بعد التسليم لن تتمكن من تعديل إجاباتك. هل أنت متأكد؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handleManualSubmit} disabled={submitting}>
              {submitting ? <Loader2 className="w-4 h-4 ml-2 animate-spin" /> : <Send className="w-4 h-4 ml-2" />}
              تسليم
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

const QuestionInput = ({
  q,
  onChoice,
  onFill,
}: {
  q: AttemptQuestion;
  onChoice: (q: AttemptQuestion, optionId: string) => void;
  onFill: (q: AttemptQuestion, text: string) => void;
}) => {
  if (q.type === "fill_blank") {
    return (
      <Textarea
        value={q.fill_blank_text ?? ""}
        onChange={(e) => onFill(q, e.target.value)}
        placeholder="اكتب إجابتك هنا…"
        rows={5}
        className="text-base"
      />
    );
  }

  const orderedIds = q.option_order.length ? q.option_order : Object.keys(q.options_by_id);
  const isMulti = q.type === "multiple_choice";

  return (
    <ul className="space-y-2.5">
      {orderedIds.map((id, i) => {
        const opt = q.options_by_id[id];
        if (!opt) return null;
        const selected = q.selected_option_ids.includes(id);
        return (
          <li key={id}>
            <button
              type="button"
              onClick={() => onChoice(q, id)}
              className={cn(
                "w-full text-right rounded-xl border-2 p-3 md:p-4 flex items-start gap-3 transition-all",
                selected
                  ? "border-primary bg-primary/5 shadow-sm"
                  : "border-border hover:border-primary/40 hover:bg-accent/30",
              )}
            >
              <div
                className={cn(
                  "shrink-0 w-6 h-6 flex items-center justify-center border-2 transition-colors mt-0.5",
                  isMulti ? "rounded-md" : "rounded-full",
                  selected ? "border-primary bg-primary text-primary-foreground" : "border-border",
                )}
              >
                {selected ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : (
                  <span className="text-xs font-bold text-muted-foreground">
                    {String.fromCharCode(0x0623 + i)}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <RichTextRenderer content={opt.content} className="text-sm md:text-base" />
              </div>
              {!selected && <Circle className="w-4 h-4 text-muted-foreground/30 mt-1" />}
            </button>
          </li>
        );
      })}
    </ul>
  );
};

export default QuizTake;
