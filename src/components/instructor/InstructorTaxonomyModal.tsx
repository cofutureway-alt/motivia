import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, BookMarked, Layers, Check } from "lucide-react";
import { toast } from "sonner";
import { listAllSubjects, listAllStages, setMyTaxonomy } from "@/lib/instructor-api";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When true, the dialog cannot be dismissed until a full selection is saved */
  mandatory: boolean;
  initialSubjects?: string[];
  initialStages?: string[];
  onSaved?: () => void | Promise<void>;
}

export default function InstructorTaxonomyModal({
  open, onOpenChange, mandatory, initialSubjects, initialStages, onSaved,
}: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [allSubjects, setAllSubjects] = useState<{ id: string; name: string }[]>([]);
  const [allStages, setAllStages] = useState<{ id: string; name: string }[]>([]);
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>(initialSubjects ?? []);
  const [selectedStages, setSelectedStages] = useState<string[]>(initialStages ?? []);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([listAllSubjects(), listAllStages()])
      .then(([s, st]) => {
        if (cancelled) return;
        setAllSubjects(s);
        setAllStages(st);
        if (initialSubjects) setSelectedSubjects(initialSubjects);
        if (initialStages) setSelectedStages(initialStages);
      })
      .catch(() => toast.error("تعذّر تحميل المواد والمراحل"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [open]);

  const toggle = (arr: string[], setArr: (v: string[]) => void, id: string) => {
    setArr(arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);
  };

  const save = async () => {
    if (selectedSubjects.length === 0) {
      toast.error("اختر مادة واحدة على الأقل");
      return;
    }
    if (selectedStages.length === 0) {
      toast.error("اختر مرحلة واحدة على الأقل");
      return;
    }
    setSaving(true);
    try {
      await setMyTaxonomy(selectedSubjects, selectedStages);
      toast.success("تم حفظ موادك ومراحلك بنجاح");
      await onSaved?.();
      onOpenChange(false);
      setStep(1);
    } catch (e: any) {
      toast.error(e?.message || "تعذّر الحفظ، حاول مرة أخرى");
    } finally {
      setSaving(false);
    }
  };

  const ChipGrid = ({
    items, selected, onSelect, icon,
  }: {
    items: { id: string; name: string }[];
    selected: string[];
    onSelect: (id: string) => void;
    icon: JSX.Element;
  }) => (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-64 overflow-y-auto p-1">
      {items.map((it) => {
        const active = selected.includes(it.id);
        return (
          <button
            key={it.id}
            type="button"
            onClick={() => onSelect(it.id)}
            className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-sm transition-all ${
              active
                ? "border-primary bg-primary/10 text-primary font-semibold"
                : "border-border bg-card hover:border-primary/40"
            }`}
          >
            <span className="flex items-center gap-2 truncate">
              {icon}
              <span className="truncate">{it.name}</span>
            </span>
            {active && <Check className="w-4 h-4 shrink-0" />}
          </button>
        );
      })}
      {items.length === 0 && !loading && (
        <div className="col-span-full text-center text-sm text-muted-foreground py-6">لا توجد عناصر متاحة</div>
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(v) => (mandatory && !saving ? undefined : onOpenChange(v))}>
      <DialogContent
        dir="rtl"
        className="sm:max-w-lg"
        onInteractOutside={(e) => mandatory && e.preventDefault()}
        onEscapeKeyDown={(e) => mandatory && e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <BookMarked className="w-5 h-5 text-primary" />
            {mandatory ? "أكمل بيانات حسابك المعلم" : "موادّي ومراحلي"}
          </DialogTitle>
          <DialogDescription>
            {mandatory
              ? "لتفعيل لوحتك، اختر المواد والمراحل التي تدرّسها. يمكنك تعديلها لاحقًا من لوحتك."
              : "حدّث المواد والمراحل التي تدرّسها."}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-10 text-center">
            <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" />
          </div>
        ) : step === 1 ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold flex items-center gap-2">
                <BookMarked className="w-4 h-4 text-primary" />
                المواد التي تدرّسها <Badge variant="secondary">{selectedSubjects.length}</Badge>
              </div>
              <span className="text-xs text-muted-foreground">خطوة 1 من 2</span>
            </div>
            <ChipGrid
              items={allSubjects}
              selected={selectedSubjects}
              onSelect={(id) => toggle(selectedSubjects, setSelectedSubjects, id)}
              icon={<BookMarked className="w-3.5 h-3.5 text-muted-foreground" />}
            />
            <div className="flex justify-end gap-2">
              {selectedSubjects.length > 0 && (
                <Button onClick={() => setStep(2)}>التالي: المراحل</Button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold flex items-center gap-2">
                <Layers className="w-4 h-4 text-primary" />
                المراحل التي تدرّسها <Badge variant="secondary">{selectedStages.length}</Badge>
              </div>
              <span className="text-xs text-muted-foreground">خطوة 2 من 2</span>
            </div>
            <ChipGrid
              items={allStages}
              selected={selectedStages}
              onSelect={(id) => toggle(selectedStages, setSelectedStages, id)}
              icon={<Layers className="w-3.5 h-3.5 text-muted-foreground" />}
            />
            <div className="flex justify-between gap-2">
              <Button variant="outline" onClick={() => setStep(1)} disabled={saving}>
                رجوع
              </Button>
              <Button onClick={save} disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 ml-2 animate-spin" />}
                حفظ وتفعيل لوحتي
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
