import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Circle,
  CheckSquare,
  ToggleLeft,
  PencilLine,
  Plus,
  Trash2,
  X,
  Save,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import RichTextEditor from "./RichTextEditor";
import { isEmptyDoc } from "./RichTextRenderer";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export type QuestionType = "single_choice" | "multiple_choice" | "true_false" | "fill_blank";

export interface DraftOption {
  id?: string;
  content: unknown;
  is_correct: boolean;
  order_index: number;
}

export interface DraftQuestion {
  id?: string;
  type: QuestionType;
  content: unknown;
  points: number;
  model_answer_text: string | null;
  options: DraftOption[];
}

const TYPE_CARDS: {
  value: QuestionType;
  label: string;
  desc: string;
  icon: typeof Circle;
}[] = [
  {
    value: "single_choice",
    label: "اختيار من متعدد (إجابة واحدة)",
    desc: "خيارات متعددة، إجابة صحيحة واحدة فقط.",
    icon: Circle,
  },
  {
    value: "multiple_choice",
    label: "اختيار من متعدد (عدة إجابات)",
    desc: "خيارات متعددة، إجابتان صحيحتان أو أكثر.",
    icon: CheckSquare,
  },
  {
    value: "true_false",
    label: "صح أو خطأ",
    desc: "سؤال بإجابتين ثابتتين: صح أو خطأ.",
    icon: ToggleLeft,
  },
  {
    value: "fill_blank",
    label: "أكمل الفراغ",
    desc: "الطالب يكتب الإجابة، ويتم التصحيح يدوياً.",
    icon: PencilLine,
  },
];

export const TYPE_META: Record<QuestionType, { label: string; icon: typeof Circle }> = {
  single_choice: { label: "اختيار واحد", icon: Circle },
  multiple_choice: { label: "اختيار متعدد", icon: CheckSquare },
  true_false: { label: "صح / خطأ", icon: ToggleLeft },
  fill_blank: { label: "أكمل الفراغ", icon: PencilLine },
};

const plainDoc = (text: string) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

interface Props {
  initial?: DraftQuestion | null;
  onCancel: () => void;
  onSave: (draft: DraftQuestion) => Promise<void> | void;
}

const emptyOption = (i: number): DraftOption => ({
  content: { type: "doc", content: [{ type: "paragraph" }] },
  is_correct: false,
  order_index: i,
});

const buildInitial = (type: QuestionType): DraftQuestion => ({
  type,
  content: { type: "doc", content: [{ type: "paragraph" }] },
  points: 1,
  model_answer_text: null,
  options:
    type === "true_false"
      ? [
          { content: plainDoc("صح"), is_correct: false, order_index: 0 },
          { content: plainDoc("خطأ"), is_correct: false, order_index: 1 },
        ]
      : type === "fill_blank"
      ? []
      : [emptyOption(0), emptyOption(1)],
});

const QuestionForm = ({ initial, onCancel, onSave }: Props) => {
  const [selectingType, setSelectingType] = useState(!initial);
  const [draft, setDraft] = useState<DraftQuestion>(initial ?? buildInitial("single_choice"));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initial) {
      setDraft(initial);
      setSelectingType(false);
    }
  }, [initial]);

  const pickType = (type: QuestionType) => {
    setDraft(buildInitial(type));
    setSelectingType(false);
  };

  const updateOption = (idx: number, patch: Partial<DraftOption>) => {
    setDraft((d) => ({
      ...d,
      options: d.options.map((o, i) => (i === idx ? { ...o, ...patch } : o)),
    }));
  };

  const setSingleCorrect = (idx: number) => {
    setDraft((d) => ({
      ...d,
      options: d.options.map((o, i) => ({ ...o, is_correct: i === idx })),
    }));
  };

  const addOption = () => {
    setDraft((d) => ({
      ...d,
      options: [...d.options, emptyOption(d.options.length)],
    }));
  };

  const removeOption = (idx: number) => {
    setDraft((d) => {
      if (d.options.length <= 2) return d;
      return {
        ...d,
        options: d.options
          .filter((_, i) => i !== idx)
          .map((o, i) => ({ ...o, order_index: i })),
      };
    });
  };

  const validate = (): string | null => {
    if (isEmptyDoc(draft.content)) return "نص السؤال مطلوب.";
    if (!(draft.points > 0)) return "الدرجة يجب أن تكون أكبر من صفر.";
    if (draft.type === "single_choice") {
      if (draft.options.length < 2) return "أضف خيارين على الأقل.";
      if (draft.options.some((o) => isEmptyDoc(o.content))) return "لا يمكن ترك خيار فارغ.";
      const correct = draft.options.filter((o) => o.is_correct).length;
      if (correct !== 1) return "حدد إجابة صحيحة واحدة فقط.";
    }
    if (draft.type === "multiple_choice") {
      if (draft.options.length < 2) return "أضف خيارين على الأقل.";
      if (draft.options.some((o) => isEmptyDoc(o.content))) return "لا يمكن ترك خيار فارغ.";
      const correct = draft.options.filter((o) => o.is_correct).length;
      if (correct < 2)
        return "يجب تحديد إجابتين صحيحتين على الأقل. لو الإجابة الصحيحة واحدة استخدم نوع (اختيار واحد).";
    }
    if (draft.type === "true_false") {
      const correct = draft.options.filter((o) => o.is_correct).length;
      if (correct !== 1) return "اختر: هل الإجابة الصحيحة (صح) أم (خطأ)؟";
    }
    return null;
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }
    setSaving(true);
    try {
      await onSave(draft);
    } finally {
      setSaving(false);
    }
  };

  if (selectingType) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-bold text-foreground">اختر نوع السؤال</h4>
          <Button size="sm" variant="ghost" onClick={onCancel}>
            <X className="w-4 h-4 ml-1" />
            إلغاء
          </Button>
        </div>
        <div className="grid sm:grid-cols-2 gap-2.5">
          {TYPE_CARDS.map((t) => {
            const Icon = t.icon;
            return (
              <motion.button
                key={t.value}
                type="button"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => pickType(t.value)}
                className="text-right p-3.5 rounded-xl border border-border/60 bg-card hover:border-primary/50 hover:bg-primary/5 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <Icon className="w-4.5 h-4.5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-foreground">{t.label}</div>
                    <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                      {t.desc}
                    </div>
                  </div>
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>
    );
  }

  const Icon = TYPE_META[draft.type].icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="rounded-xl border border-primary/30 bg-primary/[0.02] p-3.5 sm:p-4 space-y-4"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <Icon className="w-4 h-4" />
          </div>
          <div>
            <div className="text-sm font-bold">
              {initial ? "تعديل سؤال" : "سؤال جديد"}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {TYPE_META[draft.type].label}
            </div>
          </div>
        </div>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={saving}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div className="space-y-2">
        <Label className="text-xs font-semibold">نص السؤال *</Label>
        <RichTextEditor
          value={draft.content}
          onChange={(v) => setDraft((d) => ({ ...d, content: v }))}
          placeholder="اكتب نص السؤال..."
          minHeight={100}
        />
      </div>

      {(draft.type === "single_choice" || draft.type === "multiple_choice") && (
        <div className="space-y-2">
          <Label className="text-xs font-semibold">
            {draft.type === "single_choice" ? "الخيارات — إجابة واحدة صحيحة *" : "الخيارات — إجابتان صحيحتان أو أكثر *"}
          </Label>
          <AnimatePresence initial={false}>
            {draft.options.map((opt, idx) => (
              <motion.div
                key={idx}
                layout
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.18 }}
                className={cn(
                  "rounded-lg border p-2.5 flex items-start gap-2.5",
                  opt.is_correct ? "border-green-500/50 bg-green-500/5" : "border-border/60 bg-background",
                )}
              >
                <div className="pt-2">
                  {draft.type === "single_choice" ? (
                    <input
                      type="radio"
                      name="correct-option"
                      checked={opt.is_correct}
                      onChange={() => setSingleCorrect(idx)}
                      className="w-4 h-4 accent-primary cursor-pointer"
                    />
                  ) : (
                    <Checkbox
                      checked={opt.is_correct}
                      onCheckedChange={(v) => updateOption(idx, { is_correct: !!v })}
                    />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <RichTextEditor
                    value={opt.content}
                    onChange={(v) => updateOption(idx, { content: v })}
                    placeholder={`الخيار ${idx + 1}`}
                    minHeight={50}
                    compact
                  />
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 shrink-0 text-destructive hover:bg-destructive/10"
                  disabled={draft.options.length <= 2}
                  onClick={() => removeOption(idx)}
                  title="حذف الخيار"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </motion.div>
            ))}
          </AnimatePresence>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addOption}
            className="w-full"
          >
            <Plus className="w-4 h-4 ml-1" />
            إضافة خيار
          </Button>
        </div>
      )}

      {draft.type === "true_false" && (
        <div className="space-y-2">
          <Label className="text-xs font-semibold">الإجابة الصحيحة *</Label>
          <RadioGroup
            value={
              draft.options[0]?.is_correct
                ? "true"
                : draft.options[1]?.is_correct
                ? "false"
                : ""
            }
            onValueChange={(v) => {
              setDraft((d) => ({
                ...d,
                options: [
                  { ...d.options[0], is_correct: v === "true" },
                  { ...d.options[1], is_correct: v === "false" },
                ],
              }));
            }}
            className="grid grid-cols-2 gap-2"
          >
            {[
              { v: "true", l: "صح" },
              { v: "false", l: "خطأ" },
            ].map((o) => {
              const active =
                (o.v === "true" && draft.options[0]?.is_correct) ||
                (o.v === "false" && draft.options[1]?.is_correct);
              return (
                <label
                  key={o.v}
                  className={cn(
                    "flex items-center justify-center gap-2 p-3 rounded-lg border cursor-pointer transition-colors font-semibold",
                    active
                      ? "border-green-500 bg-green-500/10 text-green-700 dark:text-green-400"
                      : "border-border hover:border-primary/40",
                  )}
                >
                  <RadioGroupItem value={o.v} />
                  {o.l}
                </label>
              );
            })}
          </RadioGroup>
        </div>
      )}

      {draft.type === "fill_blank" && (
        <div className="space-y-2">
          <div className="flex items-start gap-2 p-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300 text-[11px]">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              هذا النوع من الأسئلة يتم تصحيحه يدوياً دائماً، ولن يتم مقارنته تلقائياً بأي إجابة.
            </span>
          </div>
          <Label className="text-xs font-semibold">
            إجابة نموذجية (اختياري، لمساعدتك أثناء المراجعة اليدوية)
          </Label>
          <Textarea
            rows={3}
            value={draft.model_answer_text ?? ""}
            onChange={(e) =>
              setDraft((d) => ({ ...d, model_answer_text: e.target.value || null }))
            }
            placeholder="اكتب الإجابة المتوقعة (لن تظهر للطالب)"
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">الدرجة *</Label>
          <Input
            type="number"
            min={0.25}
            step={0.25}
            value={draft.points}
            onChange={(e) =>
              setDraft((d) => ({ ...d, points: parseFloat(e.target.value) || 0 }))
            }
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
          إلغاء
        </Button>
        <Button type="button" onClick={handleSubmit} disabled={saving}>
          <Save className="w-4 h-4 ml-1" />
          {initial ? "حفظ التعديلات" : "إضافة السؤال"}
        </Button>
      </div>
    </motion.div>
  );
};

export default QuestionForm;
