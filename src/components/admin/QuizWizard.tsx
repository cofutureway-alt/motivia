import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import QuestionsStep from "./quiz/QuestionsStep";
import {
  Loader2,
  ClipboardList,
  Settings2,
  ChevronLeft,
  ChevronRight,
  Check,
  FileQuestion,
  Info,
  AlertCircle,
  Minus,
  Plus,
  Calendar,
  Shuffle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

export interface QuizRecord {
  id: string;
  unit_id: string;
  course_id: string;
  title: string;
  description: string | null;
  order_index: number;
  duration_minutes: number;
  start_at: string | null;
  end_at: string | null;
  randomize_enabled: boolean;
  pass_percentage: number;
  max_attempts: number;
  attempt_result_policy: "first" | "highest" | "last";
  forms_count: number;
}

// Placeholder — Phase 13 will fill this in.
async function hasExistingAttempts(_quizId: string): Promise<boolean> {
  return false;
}

const settingsSchema = z
  .object({
    title: z.string().trim().min(2, "الاسم قصير جدًا").max(150),
    description: z.string().trim().max(1000).optional().or(z.literal("")),
    duration_minutes: z.coerce.number().int().min(1, "الحد الأدنى دقيقة واحدة").max(600, "الحد الأقصى 600 دقيقة"),
    start_at: z.string().optional().or(z.literal("")),
    end_at: z.string().optional().or(z.literal("")),
    randomize_enabled: z.boolean(),
    pass_percentage: z.coerce.number().int().min(1).max(100),
    max_attempts: z.coerce.number().int().min(1).max(20),
    attempt_result_policy: z.enum(["first", "highest", "last"]),
    forms_count: z.coerce.number().int().min(1).max(5),
  })
  .refine(
    (v) => {
      if (v.end_at && !v.start_at) return false;
      return true;
    },
    { message: "لا يمكن تحديد تاريخ انتهاء بدون تاريخ بدء", path: ["end_at"] },
  )
  .refine(
    (v) => {
      if (v.start_at && v.end_at) {
        return new Date(v.end_at) > new Date(v.start_at);
      }
      return true;
    },
    { message: "يجب أن يكون تاريخ الانتهاء بعد تاريخ البدء", path: ["end_at"] },
  );

type SettingsValues = z.infer<typeof settingsSchema>;

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  unitId: string;
  courseId: string;
  quiz: QuizRecord | null;
  onSaved: () => void;
}

const toLocalInput = (iso: string | null): string => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const fromLocalInput = (v: string): string | null => {
  if (!v) return null;
  return new Date(v).toISOString();
};

const QuizWizard = ({ open, onOpenChange, unitId, courseId, quiz, onSaved }: Props) => {
  const [step, setStep] = useState(0);
  const [savedQuizId, setSavedQuizId] = useState<string | null>(quiz?.id ?? null);
  const [saving, setSaving] = useState(false);
  const [hasAttempts, setHasAttempts] = useState(false);
  const [formCounts, setFormCounts] = useState<Record<number, number>>({});
  const [showCountError, setShowCountError] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    setValue,
    trigger,
    formState: { errors },
  } = useForm<SettingsValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      title: "",
      description: "",
      duration_minutes: 30,
      start_at: "",
      end_at: "",
      randomize_enabled: true,
      pass_percentage: 50,
      max_attempts: 1,
      attempt_result_policy: "highest",
      forms_count: 1,
    },
  });

  const maxAttempts = watch("max_attempts");
  const formsCount = watch("forms_count");
  const startAt = watch("start_at");

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setSavedQuizId(quiz?.id ?? null);
    reset({
      title: quiz?.title ?? "",
      description: quiz?.description ?? "",
      duration_minutes: quiz?.duration_minutes ?? 30,
      start_at: toLocalInput(quiz?.start_at ?? null),
      end_at: toLocalInput(quiz?.end_at ?? null),
      randomize_enabled: quiz?.randomize_enabled ?? true,
      pass_percentage: quiz?.pass_percentage ?? 50,
      max_attempts: quiz?.max_attempts ?? 1,
      attempt_result_policy: quiz?.attempt_result_policy ?? "highest",
      forms_count: quiz?.forms_count ?? 1,
    });
    if (quiz?.id) {
      hasExistingAttempts(quiz.id).then(setHasAttempts);
    } else {
      setHasAttempts(false);
    }
  }, [open, quiz, reset]);

  useEffect(() => {
    setShowCountError(false);
  }, [step]);


  // Structure the forms_count change as a distinct function so Phase 12
  // can add a "has-questions" guard without restructuring.
  const handleFormsCountChange = (next: number) => {
    const clamped = Math.max(1, Math.min(5, next));
    // Future: if (clamped < current) verify no form-being-removed has questions
    setValue("forms_count", clamped, { shouldValidate: true, shouldDirty: true });
  };

  const totalSteps = 1 + (formsCount || 1);
  const stepLabels = useMemo(() => {
    const arr = ["الإعدادات"];
    for (let i = 1; i <= (formsCount || 1); i++) arr.push(`أسئلة النموذج ${i}`);
    return arr;
  }, [formsCount]);

  const persistSettings = async (values: SettingsValues): Promise<string | null> => {
    setSaving(true);
    try {
      const payload = {
        unit_id: unitId,
        course_id: courseId,
        title: values.title.trim(),
        description: values.description?.trim() || null,
        duration_minutes: values.duration_minutes,
        start_at: fromLocalInput(values.start_at ?? ""),
        end_at: fromLocalInput(values.end_at ?? ""),
        randomize_enabled: values.randomize_enabled,
        pass_percentage: values.pass_percentage,
        max_attempts: values.max_attempts,
        attempt_result_policy:
          values.max_attempts > 1 ? values.attempt_result_policy : "highest",
        forms_count: values.forms_count,
      };

      if (savedQuizId) {
        const { error } = await supabase
          .from("quizzes")
          .update(payload)
          .eq("id", savedQuizId);
        if (error) throw error;
        onSaved();
        return savedQuizId;
      }

      const { data: orderData, error: orderErr } = await supabase.rpc(
        "next_unit_order_index",
        { _unit_id: unitId },
      );
      if (orderErr) throw orderErr;

      const { data, error } = await supabase
        .from("quizzes")
        .insert({ ...payload, order_index: orderData ?? 0 })
        .select("id")
        .single();
      if (error) throw error;
      setSavedQuizId(data.id);
      onSaved();
      return data.id;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "فشل الحفظ";
      toast.error(msg);
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleNext = async () => {
    if (step === 0) {
      const ok = await trigger();
      if (!ok) return;
      const values = watch();
      const id = await persistSettings(values as SettingsValues);
      if (!id) return;
      toast.success(quiz ? "تم حفظ التعديلات" : "تم إنشاء الاختبار");
      setStep(1);
      return;
    }
    // On question steps, require at least 1 question in the current form.
    if ((formCounts[step] ?? 0) < 1) {
      setShowCountError(true);
      toast.error("يجب إضافة سؤال واحد على الأقل لهذا النموذج");
      return;
    }
    setShowCountError(false);
    if (step < totalSteps - 1) setStep(step + 1);
  };

  const handleFinish = async () => {
    if ((formCounts[step] ?? 0) < 1) {
      setShowCountError(true);
      toast.error("يجب إضافة سؤال واحد على الأقل لهذا النموذج");
      return;
    }
    onSaved();
    onOpenChange(false);
    toast.success("تم حفظ الاختبار بنجاح");
  };

  const onSubmit = handleSubmit(() => handleNext());

  return (
    <Dialog open={open} onOpenChange={(v) => !saving && onOpenChange(v)}>
      <DialogContent
        dir="rtl"
        className="max-w-3xl w-[100vw] sm:w-auto h-[100dvh] sm:h-[90vh] sm:max-h-[90vh] p-0 gap-0 flex flex-col overflow-hidden sm:rounded-xl rounded-none"
      >
        {/* Header */}
        <div className="px-4 sm:px-6 py-4 border-b border-border/60 shrink-0">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <ClipboardList className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-bold text-lg text-foreground truncate">
                {quiz ? "تعديل الاختبار" : "اختبار جديد"}
              </h2>
              <p className="text-xs text-muted-foreground truncate">
                {stepLabels[step]}
              </p>
            </div>
          </div>

          {/* Stepper */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
            <AnimatePresence initial={false} mode="popLayout">
              {stepLabels.map((label, i) => {
                const active = i === step;
                const done = i < step;
                return (
                  <motion.div
                    key={label + i}
                    layout
                    initial={{ opacity: 0, x: 8, scale: 0.9 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: -8, scale: 0.9 }}
                    transition={{ duration: 0.2 }}
                    className="flex items-center gap-1.5 shrink-0"
                  >
                    <button
                      type="button"
                      disabled={i > step || !savedQuizId && i > 0}
                      onClick={() => i <= step && setStep(i)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                        active
                          ? "bg-primary text-primary-foreground border-primary"
                          : done
                          ? "bg-primary/10 text-primary border-primary/30"
                          : "bg-muted/50 text-muted-foreground border-border"
                      } ${i > step ? "cursor-not-allowed opacity-60" : ""}`}
                    >
                      <span
                        className={`w-5 h-5 rounded-full inline-flex items-center justify-center text-[10px] ${
                          active
                            ? "bg-primary-foreground text-primary"
                            : done
                            ? "bg-primary text-primary-foreground"
                            : "bg-background text-muted-foreground"
                        }`}
                      >
                        {done ? <Check className="w-3 h-3" /> : i + 1}
                      </span>
                      <span className="whitespace-nowrap">{label}</span>
                    </button>
                    {i < stepLabels.length - 1 && (
                      <div className="w-4 h-px bg-border shrink-0" />
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5">
          <AnimatePresence mode="wait">
            {step === 0 ? (
              <motion.form
                key="settings"
                id="quiz-settings-form"
                onSubmit={onSubmit}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.25 }}
                className="space-y-5 max-w-2xl mx-auto"
              >
                {quiz && (
                  <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300 text-xs">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                      تعديل الإعدادات لن يؤثر على المحاولات التي تم تسليمها بالفعل، وسيتم
                      تطبيق أي تغييرات على المحاولات القادمة فقط.
                    </span>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>اسم الاختبار *</Label>
                  <Input placeholder="مثال: اختبار الوحدة الأولى" {...register("title")} />
                  {errors.title && (
                    <p className="text-xs text-destructive">{errors.title.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>الوصف</Label>
                  <Textarea rows={3} placeholder="وصف مختصر للاختبار (اختياري)" {...register("description")} />
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>مدة الاختبار (بالدقائق) *</Label>
                    <Input
                      type="number"
                      min={1}
                      max={600}
                      {...register("duration_minutes")}
                    />
                    {errors.duration_minutes && (
                      <p className="text-xs text-destructive">
                        {errors.duration_minutes.message}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>نسبة النجاح</Label>
                    <div className="relative">
                      <Input
                        type="number"
                        min={1}
                        max={100}
                        className="pl-10"
                        {...register("pass_percentage")}
                      />
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                        %
                      </span>
                    </div>
                    {errors.pass_percentage && (
                      <p className="text-xs text-destructive">
                        {errors.pass_percentage.message}
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="inline-flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      تاريخ البدء
                    </Label>
                    <Input type="datetime-local" {...register("start_at")} />
                  </div>
                  <div className="space-y-2">
                    <Label className="inline-flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      تاريخ الانتهاء
                    </Label>
                    <Input
                      type="datetime-local"
                      disabled={!startAt}
                      {...register("end_at")}
                    />
                    {errors.end_at && (
                      <p className="text-xs text-destructive">{errors.end_at.message}</p>
                    )}
                    {!startAt && (
                      <p className="text-[11px] text-muted-foreground">
                        حدد تاريخ البدء أولًا.
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 rounded-lg border border-border/60 bg-muted/30">
                  <Shuffle className="w-4 h-4 mt-0.5 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-3">
                      <Label className="font-semibold">ترتيب عشوائي</Label>
                      <Controller
                        control={control}
                        name="randomize_enabled"
                        render={({ field }) => (
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        )}
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                      عند التفعيل، سيظهر ترتيب الأسئلة وترتيب الإجابات بشكل مختلف وعشوائي
                      لكل طالب.
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>عدد المحاولات المسموحة</Label>
                  <Controller
                    control={control}
                    name="max_attempts"
                    render={({ field }) => (
                      <NumberStepper
                        value={field.value}
                        onChange={field.onChange}
                        min={1}
                        max={20}
                      />
                    )}
                  />
                </div>

                <AnimatePresence initial={false}>
                  {maxAttempts > 1 && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="space-y-3 p-3 rounded-lg border border-border/60 bg-muted/30">
                        <Label>المحاولة المعتمدة</Label>
                        <Controller
                          control={control}
                          name="attempt_result_policy"
                          render={({ field }) => (
                            <RadioGroup
                              value={field.value}
                              onValueChange={field.onChange}
                              className="grid sm:grid-cols-3 gap-2"
                            >
                              {[
                                { v: "first", l: "أول محاولة" },
                                { v: "highest", l: "أعلى درجة" },
                                { v: "last", l: "آخر محاولة" },
                              ].map((o) => (
                                <label
                                  key={o.v}
                                  className={`flex items-center gap-2 p-3 rounded-md border cursor-pointer transition-colors ${
                                    field.value === o.v
                                      ? "border-primary bg-primary/5"
                                      : "border-border hover:border-primary/40"
                                  }`}
                                >
                                  <RadioGroupItem value={o.v} />
                                  <span className="text-sm">{o.l}</span>
                                </label>
                              ))}
                            </RadioGroup>
                          )}
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="space-y-2">
                  <Label>عدد النماذج</Label>
                  <Controller
                    control={control}
                    name="forms_count"
                    render={({ field }) => (
                      <NumberStepper
                        value={field.value}
                        onChange={(n) => handleFormsCountChange(n)}
                        min={1}
                        max={5}
                      />
                    )}
                  />
                  <p className="text-[11px] text-muted-foreground inline-flex items-start gap-1.5">
                    <Info className="w-3 h-3 mt-0.5 shrink-0" />
                    كل نموذج يحتوي على أسئلة مختلفة، ويحصل كل طالب على نموذج واحد بشكل عشوائي عند بدء الاختبار.
                  </p>
                </div>
              </motion.form>
            ) : savedQuizId ? (
              <motion.div
                key={`form-${step}`}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.25 }}
                className="space-y-3"
              >
                <QuestionsStep
                  quizId={savedQuizId}
                  formNumber={step}
                  formsCount={formsCount || 1}
                  onCountChange={(c) => {
                    setFormCounts((prev) => (prev[step] === c ? prev : { ...prev, [step]: c }));
                    if (c > 0) setShowCountError(false);
                  }}
                />
                {showCountError && (formCounts[step] ?? 0) < 1 && (
                  <div className="max-w-3xl mx-auto flex items-start gap-2 p-3 rounded-lg border border-destructive/40 bg-destructive/10 text-destructive text-xs">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>يجب إضافة سؤال واحد على الأقل لهذا النموذج قبل المتابعة.</span>
                  </div>
                )}
              </motion.div>
            ) : (
              <div className="h-full flex items-center justify-center py-10 text-sm text-muted-foreground">
                <FileQuestion className="w-4 h-4 ml-2" />
                احفظ إعدادات الاختبار أولاً.
              </div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-3 border-t border-border/60 shrink-0 flex items-center justify-between gap-3 bg-card">
          <Button
            type="button"
            variant="ghost"
            onClick={() => (step === 0 ? onOpenChange(false) : setStep(step - 1))}
            disabled={saving}
          >
            {step === 0 ? (
              "إلغاء"
            ) : (
              <>
                <ChevronRight className="w-4 h-4 ml-1" />
                السابق
              </>
            )}
          </Button>
          <div className="text-xs text-muted-foreground hidden sm:block">
            الخطوة {step + 1} من {totalSteps}
          </div>
          {step === totalSteps - 1 && step > 0 ? (
            <Button type="button" onClick={handleFinish} disabled={saving}>
              <Check className="w-4 h-4 ml-1" />
              {quiz ? "حفظ الاختبار" : "إضافة الاختبار"}
            </Button>
          ) : (
            <Button
              type="button"
              onClick={step === 0 ? onSubmit : handleNext}
              disabled={saving}
            >
              {saving && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}
              {step === 0 ? (
                <>
                  <Settings2 className="w-4 h-4 ml-1" />
                  حفظ ومتابعة
                </>
              ) : (
                <>
                  التالي
                  <ChevronLeft className="w-4 h-4 mr-1" />
                </>
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

const NumberStepper = ({
  value,
  onChange,
  min,
  max,
}: {
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
}) => {
  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  return (
    <div className="inline-flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-9 w-9"
        onClick={() => onChange(clamp(value - 1))}
        disabled={value <= min}
      >
        <Minus className="w-4 h-4" />
      </Button>
      <Input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(clamp(parseInt(e.target.value || String(min), 10)))}
        className="w-20 text-center h-9"
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-9 w-9"
        onClick={() => onChange(clamp(value + 1))}
        disabled={value >= max}
      >
        <Plus className="w-4 h-4" />
      </Button>
    </div>
  );
};

export default QuizWizard;
