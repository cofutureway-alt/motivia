import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  Clipboard,
  FormInput,
  GripVertical,
  Hash,
  Info,
  List,
  Lock,
  Mail,
  Phone,
  Plus,
  Save,
  Sliders,
  Loader2,
  Text,
  ToggleRight,
  Trash2,
  Type,
  X,
  Calendar as CalendarIcon,
  CircleDot,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import {
  FIELD_TYPES,
  slugifyKey,
  type RegField,
  type RegFieldOption,
  type RegFieldType,
} from "@/lib/registration-fields";
import { useRegistrationFields } from "@/hooks/use-registration-fields";

const TYPE_ICON: Record<RegFieldType, React.ComponentType<{ className?: string }>> = {
  text: Type,
  textarea: Text,
  number: Hash,
  date: CalendarIcon,
  select: List,
  radio: CircleDot,
  checkbox: ToggleRight,
  phone: Phone,
};

const TYPE_LABEL: Record<RegFieldType, string> = Object.fromEntries(
  FIELD_TYPES.map((t) => [t.value, t.label]),
) as any;

type SaveState = "idle" | "saving" | "saved" | "error";

export default function AdminRegistrationForm() {
  const { fields, loading, reload, setFields } = useRegistrationFields();
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [addOpen, setAddOpen] = useState(false);
  const [editOptions, setEditOptions] = useState<RegField | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const flash = async (fn: () => Promise<any>) => {
    setSaveState("saving");
    const r = await fn();
    if (r?.error) {
      setSaveState("error");
      toast.error("تعذّر الحفظ");
      return false;
    }
    setSaveState("saved");
    window.setTimeout(() => setSaveState("idle"), 1400);
    return true;
  };

  const updateField = async (id: string, patch: Partial<RegField>) => {
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
    await flash(async () =>
      (supabase as any)
        .from("registration_form_fields")
        .update(patch)
        .eq("id", id),
    );
  };

  const deleteField = async (id: string) => {
    const target = fields.find((f) => f.id === id);
    if (!target || target.is_locked) return;
    if (!confirm(`حذف الحقل "${target.label}"؟`)) return;
    setFields((prev) => prev.filter((f) => f.id !== id));
    await flash(async () =>
      (supabase as any)
        .from("registration_form_fields")
        .delete()
        .eq("id", id),
    );
  };

  const onDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = fields.findIndex((f) => f.id === active.id);
    const newIdx = fields.findIndex((f) => f.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const next = arrayMove(fields, oldIdx, newIdx).map((f, i) => ({ ...f, order_index: i }));
    setFields(next);
    await flash(async () => {
      const rows = next.map((f) => ({ id: f.id, order_index: f.order_index }));
      // Update each row's order_index
      const updates = await Promise.all(
        rows.map((r) =>
          (supabase as any)
            .from("registration_form_fields")
            .update({ order_index: r.order_index })
            .eq("id", r.id),
        ),
      );
      const err = updates.find((u: any) => u.error);
      return err ?? { error: null };
    });
  };

  const existingKeys = useMemo(() => new Set(fields.map((f) => f.field_key)), [fields]);

  const handleAdd = async (payload: {
    label: string;
    field_type: RegFieldType;
    is_required: boolean;
    options: RegFieldOption[] | null;
  }) => {
    const field_key = slugifyKey(payload.label, existingKeys);
    const nextIdx =
      fields.reduce((m, f) => Math.max(m, f.order_index), -1) + 1;
    const { data, error } = await (supabase as any)
      .from("registration_form_fields")
      .insert({
        field_key,
        label: payload.label,
        field_type: payload.field_type,
        is_required: payload.is_required,
        is_locked: false,
        options: payload.options,
        order_index: nextIdx,
      })
      .select()
      .single();
    if (error) {
      toast.error("تعذّرت إضافة الحقل");
      return false;
    }
    setFields((prev) => [...prev, data as RegField]);
    toast.success("تمت إضافة الحقل");
    return true;
  };

  const handleSaveOptions = async (id: string, options: RegFieldOption[]) => {
    await updateField(id, { options });
    setEditOptions(null);
  };

  return (
    <TooltipProvider>
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <Link
              to="/admin/settings"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary mb-2"
            >
              <ChevronLeft className="w-3.5 h-3.5 rotate-180" />
              العودة إلى الإعدادات
            </Link>
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                <FormInput className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-black">إعدادات نموذج التسجيل</h1>
                <p className="text-xs md:text-sm text-muted-foreground">
                  تحكّم بالحقول التي تظهر في صفحة إنشاء حساب جديد.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <SaveIndicator state={saveState} />
            <Button className="gap-2" onClick={() => setAddOpen(true)}>
              <Plus className="w-4 h-4" />
              إضافة حقل جديد
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border border-border/60 bg-primary/5 p-4 text-xs md:text-sm text-foreground/80 flex items-start gap-2">
          <Info className="w-4 h-4 mt-0.5 text-primary shrink-0" />
          <div>
            الحقول الأساسية (الاسم، رقم الهاتف، كلمة المرور) مقفلة ولا يمكن حذفها لأن نظام
            الدخول يعتمد عليها. يمكن تعديل اسم العرض لأيّ حقل، وإضافة حقول مخصّصة من أي نوع تريده.
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-2xl" />
            ))}
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
              <ul className="space-y-3">
                <AnimatePresence initial={false}>
                  {fields.map((f) => (
                    <FieldRow
                      key={f.id}
                      field={f}
                      onUpdate={(patch) => updateField(f.id, patch)}
                      onDelete={() => deleteField(f.id)}
                      onEditOptions={() => setEditOptions(f)}
                    />
                  ))}
                </AnimatePresence>
              </ul>
            </SortableContext>
          </DndContext>
        )}

        <AddFieldModal
          open={addOpen}
          onClose={() => setAddOpen(false)}
          onAdd={handleAdd}
        />

        <OptionsModal
          field={editOptions}
          onClose={() => setEditOptions(null)}
          onSave={handleSaveOptions}
        />
      </div>
    </TooltipProvider>
  );
}

/* ----- Field Row ----- */

function FieldRow({
  field,
  onUpdate,
  onDelete,
  onEditOptions,
}: {
  field: RegField;
  onUpdate: (patch: Partial<RegField>) => void;
  onDelete: () => void;
  onEditOptions: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: field.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 30 : undefined,
  };
  const Icon = TYPE_ICON[field.field_type] ?? Type;
  const [label, setLabel] = useState(field.label);
  useEffect(() => setLabel(field.label), [field.label]);

  const commitLabel = () => {
    const trimmed = label.trim();
    if (!trimmed || trimmed === field.label) return;
    onUpdate({ label: trimmed });
  };

  const hasOptions = field.field_type === "select" || field.field_type === "radio";
  const stageSpecial = field.field_key === "stage_id";
  const phoneLocked = field.field_key === "phone_number";

  return (
    <motion.li
      ref={setNodeRef}
      style={style}
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.18 }}
      className={`rounded-2xl border ${
        isDragging ? "border-primary shadow-xl bg-card" : "border-border/60 bg-card"
      } p-4 md:p-5`}
    >
      <div className="flex items-center gap-3 flex-wrap md:flex-nowrap">
        <button
          type="button"
          className="w-9 h-9 shrink-0 rounded-lg border border-border/60 flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/50 cursor-grab active:cursor-grabbing touch-none"
          {...attributes}
          {...listeners}
          aria-label="سحب لإعادة الترتيب"
        >
          <GripVertical className="w-4 h-4" />
        </button>

        <div className="w-9 h-9 shrink-0 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
          <Icon className="w-4 h-4" />
        </div>

        <div className="flex-1 min-w-0">
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={commitLabel}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            className="font-bold border-transparent hover:border-border focus-visible:border-primary bg-transparent px-2 h-9"
          />
          <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap px-2">
            <span className="font-mono">{field.field_key}</span>
            <span>•</span>
            <span>{TYPE_LABEL[field.field_type]}</span>
            {field.is_locked && (
              <>
                <span>•</span>
                <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-500">
                  <Lock className="w-3 h-3" />
                  مقفل
                </span>
              </>
            )}
            {stageSpecial && (
              <>
                <span>•</span>
                <span className="text-primary">يُملأ تلقائيًا من قائمة المراحل</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          <div className="flex items-center gap-2">
            {phoneLocked ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex">
                    <Switch checked disabled />
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  رقم الهاتف مطلوب دائمًا لأن نظام الدخول يعتمد عليه.
                </TooltipContent>
              </Tooltip>
            ) : (
              <Switch
                checked={field.is_required}
                onCheckedChange={(v) => onUpdate({ is_required: v })}
              />
            )}
            <Label className="text-xs">مطلوب</Label>
          </div>

          {hasOptions && !stageSpecial && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={onEditOptions}>
              <Sliders className="w-3.5 h-3.5" />
              الخيارات
            </Button>
          )}

          {!field.is_locked && (
            <Button
              variant="ghost"
              size="icon"
              className="text-destructive hover:bg-destructive/10 h-9 w-9"
              onClick={onDelete}
              aria-label="حذف"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    </motion.li>
  );
}

/* ----- Save indicator ----- */

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === "idle") return null;
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={state}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg ${
          state === "saving"
            ? "bg-muted text-muted-foreground"
            : state === "saved"
            ? "bg-emerald-500/10 text-emerald-600"
            : "bg-destructive/10 text-destructive"
        }`}
      >
        {state === "saving" && <Loader2 className="w-3 h-3 animate-spin" />}
        {state === "saved" && <Check className="w-3 h-3" />}
        {state === "error" && <X className="w-3 h-3" />}
        {state === "saving" ? "جارٍ الحفظ..." : state === "saved" ? "تم الحفظ" : "فشل الحفظ"}
      </motion.div>
    </AnimatePresence>
  );
}

/* ----- Add field modal ----- */

function AddFieldModal({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (p: {
    label: string;
    field_type: RegFieldType;
    is_required: boolean;
    options: RegFieldOption[] | null;
  }) => Promise<boolean>;
}) {
  const [label, setLabel] = useState("");
  const [type, setType] = useState<RegFieldType>("text");
  const [required, setRequired] = useState(false);
  const [options, setOptions] = useState<RegFieldOption[]>([{ value: "", label: "" }]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setLabel("");
      setType("text");
      setRequired(false);
      setOptions([{ value: "", label: "" }]);
    }
  }, [open]);

  const needsOptions = type === "select" || type === "radio";

  const submit = async () => {
    if (!label.trim()) {
      toast.error("أدخل اسم الحقل");
      return;
    }
    if (needsOptions) {
      const cleaned = options
        .map((o) => ({
          value: (o.value || o.label).trim(),
          label: (o.label || o.value).trim(),
        }))
        .filter((o) => o.label);
      if (cleaned.length < 2) {
        toast.error("أضف خيارين على الأقل");
        return;
      }
      setSaving(true);
      const ok = await onAdd({
        label: label.trim(),
        field_type: type,
        is_required: required,
        options: cleaned,
      });
      setSaving(false);
      if (ok) onClose();
      return;
    }
    setSaving(true);
    const ok = await onAdd({
      label: label.trim(),
      field_type: type,
      is_required: required,
      options: null,
    });
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>إضافة حقل جديد</DialogTitle>
          <DialogDescription>
            سيظهر هذا الحقل مباشرة في نموذج التسجيل بعد الحفظ.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>اسم الحقل الظاهر</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="مثال: المدرسة" />
          </div>

          <div className="space-y-1.5">
            <Label>نوع الحقل</Label>
            <Select value={type} onValueChange={(v) => setType(v as RegFieldType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {FIELD_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-border/60 p-3">
            <Label className="text-sm">حقل مطلوب</Label>
            <Switch checked={required} onCheckedChange={setRequired} />
          </div>

          <AnimatePresence>
            {needsOptions && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
              >
                <OptionsEditor options={options} onChange={setOptions} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>إلغاء</Button>
          <Button onClick={submit} disabled={saving} className="gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            إضافة
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ----- Options editor (shared) ----- */

function OptionsEditor({
  options,
  onChange,
}: {
  options: RegFieldOption[];
  onChange: (o: RegFieldOption[]) => void;
}) {
  const setAt = (i: number, patch: Partial<RegFieldOption>) => {
    const next = options.slice();
    next[i] = { ...next[i], ...patch };
    onChange(next);
  };
  const remove = (i: number) => onChange(options.filter((_, idx) => idx !== i));
  const add = () => onChange([...options, { value: "", label: "" }]);
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= options.length) return;
    const next = options.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <div className="space-y-2">
      <Label>الخيارات</Label>
      <ul className="space-y-2">
        {options.map((o, i) => (
          <li key={i} className="flex items-center gap-2">
            <div className="flex flex-col">
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground text-xs"
                onClick={() => move(i, -1)}
              >
                ▲
              </button>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground text-xs"
                onClick={() => move(i, 1)}
              >
                ▼
              </button>
            </div>
            <Input
              placeholder="النص المعروض"
              value={o.label}
              onChange={(e) => setAt(i, { label: e.target.value })}
            />
            <Input
              placeholder="القيمة (اختياري)"
              value={o.value}
              onChange={(e) => setAt(i, { value: e.target.value })}
              dir="ltr"
              className="text-right font-mono text-xs"
            />
            <Button
              variant="ghost"
              size="icon"
              className="text-destructive"
              onClick={() => remove(i)}
              disabled={options.length <= 1}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </li>
        ))}
      </ul>
      <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={add}>
        <Plus className="w-3.5 h-3.5" />
        إضافة خيار
      </Button>
    </div>
  );
}

/* ----- Options modal for existing field ----- */

function OptionsModal({
  field,
  onClose,
  onSave,
}: {
  field: RegField | null;
  onClose: () => void;
  onSave: (id: string, options: RegFieldOption[]) => Promise<void>;
}) {
  const [options, setOptions] = useState<RegFieldOption[]>([]);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (field) {
      setOptions(field.options?.length ? field.options : [{ value: "", label: "" }]);
    }
  }, [field]);
  const submit = async () => {
    if (!field) return;
    const cleaned = options
      .map((o) => ({
        value: (o.value || o.label).trim(),
        label: (o.label || o.value).trim(),
      }))
      .filter((o) => o.label);
    if (cleaned.length < 2) {
      toast.error("أضف خيارين على الأقل");
      return;
    }
    setSaving(true);
    await onSave(field.id, cleaned);
    setSaving(false);
  };
  return (
    <Dialog open={!!field} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>تعديل خيارات "{field?.label}"</DialogTitle>
        </DialogHeader>
        <OptionsEditor options={options} onChange={setOptions} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>إلغاء</Button>
          <Button onClick={submit} disabled={saving} className="gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
