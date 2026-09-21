import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Loader2,
  Pencil,
  Trash2,
  ChevronUp,
  ChevronDown,
  Copy,
  FileQuestion,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import QuestionForm, {
  DraftQuestion,
  QuestionType,
  TYPE_META,
} from "./QuestionForm";
import RichTextRenderer from "./RichTextRenderer";
import ImportQuestionsModal from "./ImportQuestionsModal";
import { cn } from "@/lib/utils";

interface QuestionWithOptions {
  id: string;
  type: QuestionType;
  content: unknown;
  points: number;
  model_answer_text: string | null;
  order_index: number;
  options: {
    id: string;
    content: unknown;
    is_correct: boolean;
    order_index: number;
  }[];
}

interface Props {
  quizId: string;
  formNumber: number;
  formsCount: number;
  onCountChange?: (count: number) => void;
}

const QuestionsStep = ({ quizId, formNumber, formsCount, onCountChange }: Props) => {
  const [loading, setLoading] = useState(true);
  const [questions, setQuestions] = useState<QuestionWithOptions[]>([]);
  const [editing, setEditing] = useState<DraftQuestion | null>(null);
  const [adding, setAdding] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchQuestions = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("quiz_questions")
      .select(
        "id, type, content, points, model_answer_text, order_index, quiz_question_options(id, content, is_correct, order_index)",
      )
      .eq("quiz_id", quizId)
      .eq("form_number", formNumber)
      .order("order_index", { ascending: true });
    if (error) {
      toast.error(error.message);
      setQuestions([]);
    } else {
      const rows = (data ?? []).map((q) => ({
        ...q,
        options: [...(q.quiz_question_options ?? [])].sort(
          (a, b) => a.order_index - b.order_index,
        ),
      })) as unknown as QuestionWithOptions[];
      setQuestions(rows);
      onCountChange?.(rows.length);
    }
    setLoading(false);
  }, [quizId, formNumber, onCountChange]);

  useEffect(() => {
    void fetchQuestions();
  }, [fetchQuestions]);

  const handleSave = async (draft: DraftQuestion) => {
    try {
      if (draft.id) {
        // Update
        const { error: upErr } = await supabase
          .from("quiz_questions")
          .update({
            type: draft.type,
            content: draft.content as never,
            points: draft.points,
            model_answer_text: draft.model_answer_text,
          })
          .eq("id", draft.id);
        if (upErr) throw upErr;

        // Replace options
        const { error: delErr } = await supabase
          .from("quiz_question_options")
          .delete()
          .eq("question_id", draft.id);
        if (delErr) throw delErr;

        if (draft.options.length > 0) {
          const { error: insErr } = await supabase.from("quiz_question_options").insert(
            draft.options.map((o, i) => ({
              question_id: draft.id!,
              content: o.content as never,
              is_correct: o.is_correct,
              order_index: i,
            })),
          );
          if (insErr) throw insErr;
        }
        toast.success("تم حفظ التعديلات");
      } else {
        // Insert with next order
        const nextOrder =
          questions.length === 0
            ? 0
            : Math.max(...questions.map((q) => q.order_index)) + 1;
        const { data: inserted, error: insErr } = await supabase
          .from("quiz_questions")
          .insert({
            quiz_id: quizId,
            form_number: formNumber,
            type: draft.type,
            content: draft.content as never,
            points: draft.points,
            model_answer_text: draft.model_answer_text,
            order_index: nextOrder,
          })
          .select("id")
          .single();
        if (insErr) throw insErr;

        if (draft.options.length > 0) {
          const { error: optErr } = await supabase.from("quiz_question_options").insert(
            draft.options.map((o, i) => ({
              question_id: inserted.id,
              content: o.content as never,
              is_correct: o.is_correct,
              order_index: i,
            })),
          );
          if (optErr) throw optErr;
        }
        toast.success("تم إضافة السؤال");
      }

      setEditing(null);
      setAdding(false);
      await fetchQuestions();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل الحفظ");
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      const { error } = await supabase.from("quiz_questions").delete().eq("id", deleteId);
      if (error) throw error;
      toast.success("تم حذف السؤال");
      setDeleteId(null);
      await fetchQuestions();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل الحذف");
    }
  };

  const move = async (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= questions.length) return;
    const a = questions[idx];
    const b = questions[target];
    // Swap order_index
    const swapped = [...questions];
    swapped[idx] = { ...b, order_index: a.order_index };
    swapped[target] = { ...a, order_index: b.order_index };
    // reorder by position
    swapped.sort((x, y) => x.order_index - y.order_index);
    setQuestions(swapped);
    try {
      // Two-step swap to avoid unique conflicts (no unique constraint but safe)
      await supabase
        .from("quiz_questions")
        .update({ order_index: -1 })
        .eq("id", a.id);
      await supabase
        .from("quiz_questions")
        .update({ order_index: a.order_index })
        .eq("id", b.id);
      await supabase
        .from("quiz_questions")
        .update({ order_index: b.order_index })
        .eq("id", a.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل الترتيب");
      void fetchQuestions();
    }
  };

  const startEdit = (q: QuestionWithOptions) => {
    setAdding(false);
    setEditing({
      id: q.id,
      type: q.type,
      content: q.content,
      points: Number(q.points),
      model_answer_text: q.model_answer_text,
      options: q.options.map((o, i) => ({
        id: o.id,
        content: o.content,
        is_correct: o.is_correct,
        order_index: i,
      })),
    });
  };

  const showForm = adding || editing !== null;

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-bold text-foreground">أسئلة النموذج {formNumber}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {loading
              ? "جاري التحميل..."
              : `${questions.length} سؤال · ${questions
                  .reduce((s, q) => s + Number(q.points), 0)
                  .toFixed(2)} درجة كلية`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {formsCount > 1 && formNumber > 1 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setImportOpen(true)}
              disabled={showForm}
            >
              <Copy className="w-4 h-4 ml-1" />
              استيراد أسئلة من نماذج أخرى
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setEditing(null);
              setAdding(true);
            }}
            disabled={showForm}
          >
            <Plus className="w-4 h-4 ml-1" />
            إضافة سؤال
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="h-40 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : (
        <>
          <AnimatePresence mode="wait">
            {showForm && (
              <motion.div
                key="form"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
              >
                <QuestionForm
                  initial={editing}
                  onCancel={() => {
                    setEditing(null);
                    setAdding(false);
                  }}
                  onSave={handleSave}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {questions.length === 0 && !showForm ? (
            <div className="border border-dashed border-border rounded-xl p-8 text-center">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 mb-3">
                <FileQuestion className="w-7 h-7 text-primary" />
              </div>
              <h4 className="text-sm font-bold mb-1">لا توجد أسئلة بعد</h4>
              <p className="text-xs text-muted-foreground mb-3">
                أضف سؤالاً واحداً على الأقل لهذا النموذج.
              </p>
              <div className="inline-flex items-center gap-2 justify-center text-[11px] text-destructive">
                <AlertCircle className="w-3.5 h-3.5" />
                يجب إضافة سؤال واحد على الأقل لهذا النموذج
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <AnimatePresence initial={false}>
                {questions.map((q, idx) => {
                  const Icon = TYPE_META[q.type].icon;
                  return (
                    <motion.div
                      key={q.id}
                      layout
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.2 }}
                      className={cn(
                        "rounded-xl border border-border/60 bg-card p-3 flex items-start gap-3",
                        editing?.id === q.id && "border-primary/50 bg-primary/5",
                      )}
                    >
                      <div className="flex flex-col items-center gap-1 pt-0.5">
                        <button
                          type="button"
                          onClick={() => move(idx, -1)}
                          disabled={idx === 0 || showForm}
                          className="h-6 w-6 rounded hover:bg-muted disabled:opacity-30 inline-flex items-center justify-center"
                          title="تحريك لأعلى"
                        >
                          <ChevronUp className="w-4 h-4" />
                        </button>
                        <span className="text-[10px] font-bold text-muted-foreground tabular-nums">
                          {idx + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => move(idx, 1)}
                          disabled={idx === questions.length - 1 || showForm}
                          className="h-6 w-6 rounded hover:bg-muted disabled:opacity-30 inline-flex items-center justify-center"
                          title="تحريك لأسفل"
                        >
                          <ChevronDown className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-1">
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold">
                            <Icon className="w-3 h-3" />
                            {TYPE_META[q.type].label}
                          </span>
                          <span>·</span>
                          <span className="font-semibold text-foreground">
                            {Number(q.points)} درجة
                          </span>
                          {q.type !== "fill_blank" && q.type !== "true_false" && (
                            <>
                              <span>·</span>
                              <span>{q.options.length} خيار</span>
                            </>
                          )}
                        </div>
                        <div className="line-clamp-2 text-sm">
                          <RichTextRenderer content={q.content} />
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => startEdit(q)}
                          disabled={showForm}
                          title="تعديل"
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive hover:bg-destructive/10"
                          onClick={() => setDeleteId(q.id)}
                          disabled={showForm}
                          title="حذف"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </>
      )}

      <ImportQuestionsModal
        open={importOpen}
        onOpenChange={setImportOpen}
        quizId={quizId}
        currentForm={formNumber}
        formsCount={formsCount}
        onImported={fetchQuestions}
      />

      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف السؤال؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف السؤال وجميع خياراته نهائيًا. لا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default QuestionsStep;
