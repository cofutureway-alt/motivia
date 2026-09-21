import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import {
  Search,
  X,
  Loader2,
  FileDown,
  CheckSquare,
  Square,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { useRegistrationFields, useStagesList } from "@/hooks/use-registration-fields";
import { listStudents, type AdminStudentRow } from "@/lib/admin-students-api";
import { KNOWN_PROFILE_COLUMNS } from "@/lib/registration-fields";
import { exportStudentsPdf, type ExportStudent } from "@/lib/card-export";

const ALL = "__all__";
const PAGE_SIZE = 200;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateName: string;
  frontDesign: any;
  backDesign: any;
}

export default function CardExportModal({
  open,
  onOpenChange,
  templateName,
  frontDesign,
  backDesign,
}: Props) {
  const { fields } = useRegistrationFields();
  const stages = useStagesList();

  const [rows, setRows] = useState<AdminStudentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, label: "" });

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (!open) {
      setSelectedIds(new Set());
      setSearch("");
      setFilterValues({});
      setRows([]);
      setExporting(false);
      setProgress({ done: 0, total: 0, label: "" });
    }
  }, [open]);

  const filterableFields = useMemo(
    () =>
      fields.filter(
        (f) =>
          (f.field_type === "select" || f.field_type === "radio") &&
          f.field_type !== ("phone" as any),
      ),
    [fields],
  );

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    const known: Record<string, string> = {};
    const custom: Record<string, string> = {};
    for (const [k, v] of Object.entries(filterValues)) {
      if (!v || v === ALL) continue;
      if (KNOWN_PROFILE_COLUMNS.has(k)) known[k] = v;
      else custom[k] = v;
    }
    listStudents({
      search: debouncedSearch || undefined,
      knownFilters: known,
      customFilters: custom,
      limit: PAGE_SIZE,
      offset: 0,
    })
      .then((data) => { if (!cancelled) setRows(data); })
      .catch(() => { if (!cancelled) setRows([]); })
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [open, debouncedSearch, filterValues]);

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const allVisibleSelected =
    rows.length > 0 && rows.every((r) => selectedIds.has(r.id));

  const toggleAllVisible = () => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (allVisibleSelected) rows.forEach((r) => n.delete(r.id));
      else rows.forEach((r) => n.add(r.id));
      return n;
    });
  };

  const clearAll = () => {
    setSearch("");
    setFilterValues({});
  };

  const doExport = async () => {
    if (selectedIds.size === 0) return;
    setExporting(true);
    setProgress({ done: 0, total: selectedIds.size, label: "" });
    try {
      // Fetch full student data (with qr_token) for selected IDs
      const ids = Array.from(selectedIds);
      const { data, error } = await (supabase as any)
        .from("profiles")
        .select(
          "id, full_name, phone_number, guardian_phone, student_id, email, auth_email, avatar_url, qr_token, governorate, registration_type, gender, stage_id, custom_fields, stages:stages(name)",
        )
        .in("id", ids);
      if (error) throw error;

      // Preserve selection order (order of selection)
      const byId = new Map<string, any>((data ?? []).map((r: any) => [r.id, r]));
      const students: ExportStudent[] = ids
        .map((id) => byId.get(id))
        .filter(Boolean)
        .map((r: any) => ({
          id: r.id,
          full_name: r.full_name,
          phone_number: r.phone_number,
          guardian_phone: r.guardian_phone,
          student_id: r.student_id,
          email: r.email,
          auth_email: r.auth_email,
          avatar_url: r.avatar_url,
          qr_token: r.qr_token,
          governorate: r.governorate,
          registration_type: r.registration_type,
          gender: r.gender,
          stage_id: r.stage_id,
          stage_name: r.stages?.name ?? null,
          custom_fields: r.custom_fields ?? {},
        }));

      await exportStudentsPdf(frontDesign, backDesign, students, {
        onProgress: (done, total, label) =>
          setProgress({ done, total, label }),
        filename: `${templateName || "student-cards"}-${new Date()
          .toISOString()
          .slice(0, 10)}.pdf`,
      });
      toast.success("تم توليد ملف PDF");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "تعذّر التصدير");
    } finally {
      setExporting(false);
    }
  };

  const pct = progress.total > 0
    ? Math.round((progress.done / progress.total) * 100)
    : 0;

  return (
    <Sheet open={open} onOpenChange={(o) => !exporting && onOpenChange(o)}>
      <SheetContent
        side="left"
        className="w-full sm:max-w-2xl flex flex-col p-0"
      >
        <SheetHeader className="p-5 pb-3 border-b border-border">
          <SheetTitle className="text-right flex items-center gap-2">
            <FileDown className="w-5 h-5 text-primary" />
            تصدير كروت الطلاب
          </SheetTitle>
          <p className="text-xs text-muted-foreground text-right">
            القالب: <span className="font-bold text-foreground">{templateName}</span>
          </p>
        </SheetHeader>

        {/* Search + Filters */}
        <div className="p-5 space-y-3 border-b border-border">
          <div className="relative">
            <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث بالاسم أو رقم الطالب أو الهاتف أو البريد"
              className="pr-10"
              disabled={exporting}
            />
          </div>
          {filterableFields.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {filterableFields.map((f) => {
                const isStage = f.field_key === "stage_id";
                const opts = isStage
                  ? stages.map((s) => ({ value: s.id, label: s.name }))
                  : f.options ?? [];
                return (
                  <div key={f.id}>
                    <div className="text-[10px] text-muted-foreground mb-1">{f.label}</div>
                    <Select
                      value={filterValues[f.field_key] ?? ALL}
                      onValueChange={(v) =>
                        setFilterValues((p) => ({ ...p, [f.field_key]: v }))
                      }
                      disabled={exporting}
                    >
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder="الكل" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ALL}>الكل</SelectItem>
                        {opts.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
            </div>
          )}
          {(search || Object.values(filterValues).some((v) => v && v !== ALL)) && (
            <Button variant="ghost" size="sm" onClick={clearAll} disabled={exporting} className="gap-1.5 h-7 text-xs">
              <X className="w-3.5 h-3.5" /> مسح
            </Button>
          )}
        </div>

        {/* Toolbar */}
        <div className="px-5 py-3 border-b border-border flex items-center justify-between gap-2 bg-muted/30">
          <button
            type="button"
            onClick={toggleAllVisible}
            disabled={exporting || rows.length === 0}
            className="text-xs font-bold text-primary hover:underline flex items-center gap-1.5 disabled:opacity-50"
          >
            {allVisibleSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
            {allVisibleSelected ? "إلغاء تحديد الكل" : "تحديد الكل"}
          </button>
          <Badge variant="secondary" className="gap-1.5">
            <Users className="w-3 h-3" />
            تم اختيار {selectedIds.size} طالب
          </Badge>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="p-10 text-center"><Loader2 className="w-6 h-6 animate-spin inline text-primary" /></div>
          ) : rows.length === 0 ? (
            <div className="p-10 text-center text-muted-foreground text-sm">لا يوجد طلاب مطابقون</div>
          ) : (
            <AnimatePresence initial={false}>
              {rows.map((r, i) => {
                const checked = selectedIds.has(r.id);
                const initials =
                  r.full_name?.split(" ").filter(Boolean).slice(0, 2).map((s) => s[0]).join("").toUpperCase() || "ط";
                return (
                  <motion.label
                    key={r.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ delay: Math.min(i * 0.01, 0.2) }}
                    className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors ${
                      checked ? "bg-primary/10" : "hover:bg-accent/40"
                    }`}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggleOne(r.id)}
                      disabled={exporting}
                    />
                    <Avatar className="w-9 h-9">
                      <AvatarImage src={r.avatar_url ?? undefined} />
                      <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">{initials}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-sm truncate">{r.full_name || "بدون اسم"}</div>
                      <div className="text-[10px] text-muted-foreground flex items-center gap-2" dir="ltr">
                        {r.student_id && <span className="font-mono">#{r.student_id}</span>}
                        {r.phone_number && <span className="font-mono">{r.phone_number}</span>}
                      </div>
                    </div>
                  </motion.label>
                );
              })}
            </AnimatePresence>
          )}
        </div>

        {/* Footer / Export */}
        <div className="border-t border-border p-4 space-y-3 bg-card">
          {exporting && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="truncate">{progress.label || "جاري التوليد…"}</span>
                <span className="font-mono font-bold">{progress.done} / {progress.total}</span>
              </div>
              <Progress value={pct} />
            </motion.div>
          )}
          <Button
            onClick={doExport}
            disabled={selectedIds.size === 0 || exporting}
            className="w-full gap-2 h-11"
          >
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
            {exporting ? `جاري التصدير (${pct}%)` : `تصدير PDF (${selectedIds.size} طالب)`}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
