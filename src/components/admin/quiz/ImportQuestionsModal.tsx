import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Copy, X, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import RichTextRenderer from "./RichTextRenderer";
import { TYPE_META, QuestionType } from "./QuestionForm";
import { cn } from "@/lib/utils";

interface QuestionRow {
  id: string;
  form_number: number;
  type: QuestionType;
  content: unknown;
  points: number;
  order_index: number;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  quizId: string;
  currentForm: number;
  formsCount: number;
  onImported: () => void;
}

const ImportQuestionsModal = ({
  open,
  onOpenChange,
  quizId,
  currentForm,
  formsCount,
  onImported,
}: Props) => {
  const [loading, setLoading] = useState(false);
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelected(new Set());
    setLoading(true);
    supabase
      .from("quiz_questions")
      .select("id, form_number, type, content, points, order_index")
      .eq("quiz_id", quizId)
      .neq("form_number", currentForm)
      .order("form_number", { ascending: true })
      .order("order_index", { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          toast.error(error.message);
        } else {
          setQuestions((data ?? []) as QuestionRow[]);
        }
        setLoading(false);
      });
  }, [open, quizId, currentForm]);

  const grouped = questions.reduce<Record<number, QuestionRow[]>>((acc, q) => {
    (acc[q.form_number] = acc[q.form_number] ?? []).push(q);
    return acc;
  }, {});

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleImport = async () => {
    if (selected.size === 0) {
      toast.error("اختر سؤالاً واحداً على الأقل");
      return;
    }
    setImporting(true);
    try {
      // Determine next order_index in current form
      const { data: maxRow } = await supabase
        .from("quiz_questions")
        .select("order_index")
        .eq("quiz_id", quizId)
        .eq("form_number", currentForm)
        .order("order_index", { ascending: false })
        .limit(1)
        .maybeSingle();
      let nextOrder = ((maxRow?.order_index as number | undefined) ?? -1) + 1;

      // Fetch full source questions with options
      const sourceIds = Array.from(selected);
      const { data: sources, error: srcErr } = await supabase
        .from("quiz_questions")
        .select(
          "id, type, content, points, model_answer_text, order_index, quiz_question_options(id, content, is_correct, order_index)",
        )
        .in("id", sourceIds);
      if (srcErr) throw srcErr;

      // Preserve original ordering according to `selected` (which mirrors on-screen)
      const orderedSources = sourceIds
        .map((id) => sources?.find((s) => s.id === id))
        .filter(Boolean) as NonNullable<typeof sources>;

      for (const src of orderedSources) {
        const { data: inserted, error: insErr } = await supabase
          .from("quiz_questions")
          .insert({
            quiz_id: quizId,
            form_number: currentForm,
            type: src.type,
            content: src.content,
            points: src.points,
            model_answer_text: src.model_answer_text,
            order_index: nextOrder++,
          })
          .select("id")
          .single();
        if (insErr) throw insErr;

        const opts = (src as unknown as {
          quiz_question_options?: {
            content: unknown;
            is_correct: boolean;
            order_index: number;
          }[];
        }).quiz_question_options;
        if (opts && opts.length) {
          const { error: optErr } = await supabase.from("quiz_question_options").insert(
            opts.map((o) => ({
              question_id: inserted.id,
              content: o.content as never,
              is_correct: o.is_correct,
              order_index: o.order_index,
            })),
          );
          if (optErr) throw optErr;
        }
      }

      toast.success(`تم استيراد ${selected.size} سؤال`);
      onImported();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل الاستيراد");
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !importing && onOpenChange(v)}>
      <DialogContent
        dir="rtl"
        className="max-w-2xl w-[100vw] sm:w-auto h-[100dvh] sm:h-[85vh] sm:max-h-[85vh] p-0 gap-0 flex flex-col overflow-hidden sm:rounded-xl rounded-none"
      >
        <DialogHeader className="px-4 sm:px-6 py-3.5 border-b border-border/60 shrink-0">
          <DialogTitle className="text-base font-bold flex items-center gap-2">
            <Copy className="w-4 h-4 text-primary" />
            استيراد أسئلة من نماذج أخرى
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
          {loading ? (
            <div className="h-40 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : questions.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-10">
              لا توجد أسئلة في النماذج الأخرى بعد.
            </div>
          ) : (
            <div className="space-y-5">
              {Object.keys(grouped)
                .map(Number)
                .sort((a, b) => a - b)
                .map((formNo) => (
                  <div key={formNo}>
                    <div className="text-xs font-bold text-muted-foreground mb-2">
                      النموذج {formNo}
                    </div>
                    <div className="space-y-2">
                      <AnimatePresence initial={false}>
                        {grouped[formNo].map((q) => {
                          const active = selected.has(q.id);
                          const Icon = TYPE_META[q.type].icon;
                          return (
                            <motion.label
                              key={q.id}
                              layout
                              initial={{ opacity: 0, y: 4 }}
                              animate={{ opacity: 1, y: 0 }}
                              className={cn(
                                "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                                active
                                  ? "border-primary bg-primary/5"
                                  : "border-border/60 bg-card hover:border-primary/40",
                              )}
                            >
                              <Checkbox
                                checked={active}
                                onCheckedChange={() => toggle(q.id)}
                                className="mt-1"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-1">
                                  <Icon className="w-3 h-3" />
                                  <span>{TYPE_META[q.type].label}</span>
                                  <span>·</span>
                                  <span>{q.points} درجة</span>
                                </div>
                                <div className="max-h-16 overflow-hidden line-clamp-2">
                                  <RichTextRenderer content={q.content} />
                                </div>
                              </div>
                            </motion.label>
                          );
                        })}
                      </AnimatePresence>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>

        <div className="px-4 sm:px-6 py-3 border-t border-border/60 shrink-0 flex items-center justify-between gap-3 bg-card">
          <div className="text-xs text-muted-foreground">
            {selected.size > 0 ? `${selected.size} سؤال محدد` : "لم يتم اختيار أي سؤال"}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={importing}>
              <X className="w-4 h-4 ml-1" />
              إلغاء
            </Button>
            <Button onClick={handleImport} disabled={importing || selected.size === 0}>
              {importing ? (
                <Loader2 className="w-4 h-4 ml-1 animate-spin" />
              ) : (
                <Check className="w-4 h-4 ml-1" />
              )}
              استيراد
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ImportQuestionsModal;
