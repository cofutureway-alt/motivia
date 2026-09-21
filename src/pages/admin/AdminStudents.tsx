import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users,
  Search,
  UserPlus,
  Trash2,
  Ban,
  ShieldCheck,
  Pencil,
  Eye,
  X,
  SlidersHorizontal,
  Loader2,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useRegistrationFields, useStagesList } from "@/hooks/use-registration-fields";
import {
  listStudents, setStudentBanned, adminDeleteStudent, type AdminStudentRow,
} from "@/lib/admin-students-api";
import StudentFormModal from "@/components/admin/students/StudentFormModal";
import { KNOWN_PROFILE_COLUMNS, PASSWORD_KEYS } from "@/lib/registration-fields";

const PAGE_SIZE = 50;
const ALL = "__all__";

export default function AdminStudents() {
  const navigate = useNavigate();
  const { fields } = useRegistrationFields();
  const stages = useStagesList();

  const [rows, setRows] = useState<AdminStudentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});

  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [selected, setSelected] = useState<AdminStudentRow | null>(null);
  const [confirm, setConfirm] = useState<null | {
    kind: "ban" | "unban" | "delete";
    student: AdminStudentRow;
  }>(null);
  const [bulkConfirm, setBulkConfirm] = useState<null | "delete" | "ban" | "unban">(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);

  const toggleOne = (id: string) =>
    setSelectedIds((p) => {
      const n = new Set(p);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const toggleAll = () =>
    setSelectedIds((p) =>
      p.size === rows.length ? new Set() : new Set(rows.map((r) => r.id)),
    );

  useEffect(() => { setSelectedIds(new Set()); }, [rows]);

  const runBulk = async () => {
    if (!bulkConfirm || selectedIds.size === 0) return;
    setBusy(true);
    const ids = Array.from(selectedIds);
    let ok = 0, fail = 0;
    try {
      if (bulkConfirm === "delete") {
        for (const id of ids) {
          try { await adminDeleteStudent(id); ok++; } catch { fail++; }
        }
        setRows((rs) => rs.filter((r) => !selectedIds.has(r.id)));
        setTotal((t) => Math.max(0, t - ok));
      } else {
        const banned = bulkConfirm === "ban";
        for (const id of ids) {
          try { await setStudentBanned(id, banned); ok++; } catch { fail++; }
        }
        setRows((rs) => rs.map((r) => (selectedIds.has(r.id) ? { ...r, is_banned: banned } : r)));
      }
      toast.success(`تم تنفيذ العملية على ${ok} طالب${fail ? ` (فشل ${fail})` : ""}`);
      setSelectedIds(new Set());
    } finally {
      setBusy(false);
      setBulkConfirm(null);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Filters derived from registration_form_fields
  // Only select/radio, excluding phone type and password
  const filterableFields = useMemo(
    () =>
      fields.filter(
        (f) =>
          (f.field_type === "select" || f.field_type === "radio") &&
          f.field_type !== ("phone" as any),
      ),
    [fields],
  );

  useEffect(() => { setPage(0); }, [debouncedSearch, filterValues]);

  useEffect(() => {
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
      offset: page * PAGE_SIZE,
    })
      .then((data) => {
        if (cancelled) return;
        setRows(data);
        setTotal(data[0]?.total_count ?? 0);
      })
      .catch(() => { if (!cancelled) { setRows([]); setTotal(0); } })
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [debouncedSearch, filterValues, page]);

  const activeFilterCount =
    Object.values(filterValues).filter((v) => v && v !== ALL).length + (debouncedSearch ? 1 : 0);

  const clearAll = () => { setSearch(""); setFilterValues({}); };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const reload = () => setPage((p) => p);

  const doBan = async (row: AdminStudentRow, banned: boolean) => {
    setBusy(true);
    try {
      await setStudentBanned(row.id, banned);
      toast.success(banned ? "تم حظر الطالب" : "تم رفع الحظر");
      setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, is_banned: banned } : r)));
    } catch (e: any) {
      toast.error(e?.message ?? "تعذّر التنفيذ");
    } finally { setBusy(false); setConfirm(null); }
  };

  const doDelete = async (row: AdminStudentRow) => {
    setBusy(true);
    try {
      await adminDeleteStudent(row.id);
      toast.success("تم حذف الطالب نهائيًا");
      setRows((rs) => rs.filter((r) => r.id !== row.id));
      setTotal((t) => Math.max(0, t - 1));
    } catch (e: any) {
      toast.error(e?.message ?? "تعذّر الحذف");
    } finally { setBusy(false); setConfirm(null); }
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const known: Record<string, string> = {};
      const custom: Record<string, string> = {};
      for (const [k, v] of Object.entries(filterValues)) {
        if (!v || v === ALL) continue;
        if (KNOWN_PROFILE_COLUMNS.has(k)) known[k] = v;
        else custom[k] = v;
      }
      const all = await listStudents({
        search: debouncedSearch || undefined,
        knownFilters: known,
        customFilters: custom,
        limit: 100000,
        offset: 0,
      });

      // Determine dynamic custom columns from the registration form
      const customCols = fields
        .filter(
          (f) =>
            !KNOWN_PROFILE_COLUMNS.has(f.field_key) &&
            !PASSWORD_KEYS.has(f.field_key),
        )
        .map((f) => ({ key: f.field_key, label: f.label }));

      const header = [
        "رقم الطالب",
        "الاسم الكامل",
        "رقم الهاتف",
        "البريد الإلكتروني",
        "المرحلة",
        "المحافظة",
        "نوع التسجيل",
        "النوع",
        "تاريخ التسجيل",
        "عدد الكورسات",
        "الكورسات المكتملة",
        "رصيد المحفظة (ج.م)",
        "حالة الحساب",
        ...customCols.map((c) => c.label),
      ];

      const escape = (v: any) => {
        const s =
          v === null || v === undefined
            ? ""
            : typeof v === "object"
              ? JSON.stringify(v)
              : String(v);
        return `"${s.replace(/"/g, '""')}"`;
      };

      const lines = all.map((r) => {
        const cf = (r.custom_fields ?? {}) as Record<string, any>;
        return [
          r.student_id ?? "",
          r.full_name ?? "",
          r.phone_number ?? "",
          r.email ?? "",
          r.stage_name ?? "",
          r.governorate ?? "",
          r.registration_type ?? "",
          r.gender ?? "",
          r.created_at ? new Date(r.created_at).toISOString() : "",
          r.enrollments_count ?? 0,
          r.completed_courses_count ?? 0,
          ((r.wallet_balance_piastres ?? 0) / 100).toFixed(2),
          r.is_banned ? "محظور" : "نشط",
          ...customCols.map((c) => {
            const v = cf[c.key];
            if (Array.isArray(v)) return v.join(" | ");
            return v ?? "";
          }),
        ]
          .map(escape)
          .join(",");
      });

      const csv = "\uFEFF" + [header.join(","), ...lines].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `students-export-${stamp}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`تم تصدير ${all.length} طالب`);
    } catch (e: any) {
      toast.error(e?.message ?? "تعذّر التصدير");
    } finally {
      setExporting(false);
    }
  };



  const filtersUI = (
    <div className="space-y-4">
      <div className="relative">
        <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث بالاسم أو رقم الطالب أو الهاتف"
          className="pr-10"
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {filterableFields.map((f) => {
          const isStage = f.field_key === "stage_id";
          const opts = isStage
            ? stages.map((s) => ({ value: s.id, label: s.name }))
            : f.options ?? [];
          return (
            <div key={f.id}>
              <div className="text-xs text-muted-foreground mb-1.5">{f.label}</div>
              <Select
                value={filterValues[f.field_key] ?? ALL}
                onValueChange={(v) =>
                  setFilterValues((p) => ({ ...p, [f.field_key]: v }))
                }
              >
                <SelectTrigger><SelectValue placeholder="الكل" /></SelectTrigger>
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
      {activeFilterCount > 0 && (
        <Button variant="ghost" onClick={clearAll} className="w-full gap-2">
          <X className="w-4 h-4" /> مسح كل الفلاتر ({activeFilterCount})
        </Button>
      )}
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-center justify-between gap-3"
      >
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
            <h1 className="text-2xl md:text-3xl font-black">إدارة الطلاب</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            {loading ? "…" : `${total} طالب${activeFilterCount ? " مطابق للفلاتر" : ""}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" className="md:hidden gap-2 relative">
                <SlidersHorizontal className="w-4 h-4" /> فلاتر
                {activeFilterCount > 0 && (
                  <Badge className="bg-primary text-primary-foreground border-0">{activeFilterCount}</Badge>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[90vw] sm:max-w-md">
              <SheetHeader className="text-right"><SheetTitle>الفلاتر</SheetTitle></SheetHeader>
              <div className="mt-6">{filtersUI}</div>
            </SheetContent>
          </Sheet>
          <Button
            variant="outline"
            onClick={exportCsv}
            disabled={exporting || loading}
            className="gap-2"
            title="تصدير النتائج الحالية إلى CSV"
          >
            {exporting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            تصدير CSV
          </Button>
          <Button onClick={() => { setSelected(null); setModalMode("create"); }} className="gap-2">
            <UserPlus className="w-4 h-4" /> إضافة طالب
          </Button>
        </div>
      </motion.div>

      {/* Desktop filters */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="hidden md:block rounded-2xl border border-border bg-card p-5"
      >
        {filtersUI}
      </motion.div>

      {/* Bulk actions bar */}
      <AnimatePresence>
        {selectedIds.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-3"
          >
            <div className="text-sm font-semibold">تم تحديد {selectedIds.size} طالب</div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setBulkConfirm("ban")} className="gap-1.5 text-amber-600">
                <Ban className="w-4 h-4" /> حظر
              </Button>
              <Button size="sm" variant="outline" onClick={() => setBulkConfirm("unban")} className="gap-1.5 text-emerald-600">
                <ShieldCheck className="w-4 h-4" /> رفع الحظر
              </Button>
              <Button size="sm" variant="destructive" onClick={() => setBulkConfirm("delete")} className="gap-1.5">
                <Trash2 className="w-4 h-4" /> حذف
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>إلغاء</Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Table */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr className="text-right">
                <th className="py-3 px-4 w-10">
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-primary cursor-pointer"
                    checked={rows.length > 0 && selectedIds.size === rows.length}
                    ref={(el) => { if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < rows.length; }}
                    onChange={toggleAll}
                  />
                </th>
                <th className="py-3 px-4 font-semibold">الطالب</th>
                <th className="py-3 px-4 font-semibold hidden sm:table-cell">الهاتف</th>
                <th className="py-3 px-4 font-semibold hidden md:table-cell">رقم الطالب</th>
                <th className="py-3 px-4 font-semibold hidden lg:table-cell">الالتحاق</th>
                <th className="py-3 px-4 font-semibold text-left">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-t border-border/60">
                    <td className="p-4"><Skeleton className="h-4 w-4" /></td>
                    <td className="p-4"><Skeleton className="h-10 w-40" /></td>
                    <td className="p-4 hidden sm:table-cell"><Skeleton className="h-4 w-28" /></td>
                    <td className="p-4 hidden md:table-cell"><Skeleton className="h-4 w-16" /></td>
                    <td className="p-4 hidden lg:table-cell"><Skeleton className="h-4 w-16" /></td>
                    <td className="p-4"><Skeleton className="h-8 w-32 ml-auto" /></td>
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-10 text-center text-muted-foreground">
                    لا يوجد طلاب مطابقون
                  </td>
                </tr>
              ) : (
                <AnimatePresence initial={false}>
                  {rows.map((r, i) => {
                    const initials =
                      r.full_name?.split(" ").filter(Boolean).slice(0, 2).map((s) => s[0]).join("").toUpperCase() ||
                      "ط";
                    return (
                      <motion.tr
                        key={r.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ delay: i * 0.02 }}
                        className="border-t border-border/60 hover:bg-accent/30 cursor-pointer"
                        onClick={() => navigate(`/admin/students/${r.id}`)}
                      >
                        <td className="p-3 px-4 w-10" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            className="w-4 h-4 accent-primary cursor-pointer"
                            checked={selectedIds.has(r.id)}
                            onChange={() => toggleOne(r.id)}
                          />
                        </td>
                        <td className="p-3 px-4">
                          <div className="flex items-center gap-3">
                            <Avatar className="w-9 h-9">
                              <AvatarImage src={r.avatar_url ?? undefined} />
                              <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                                {initials}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <div className="font-semibold truncate flex items-center gap-2">
                                {r.full_name || "بدون اسم"}
                                {r.is_banned && (
                                  <Badge variant="destructive" className="text-[10px]">محظور</Badge>
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground truncate" dir="ltr">
                                {r.email || r.auth_email}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="p-3 px-4 hidden sm:table-cell font-mono text-xs" dir="ltr">
                          {r.phone_number || "—"}
                        </td>
                        <td className="p-3 px-4 hidden md:table-cell font-mono text-xs">
                          {r.student_id || "—"}
                        </td>
                        <td className="p-3 px-4 hidden lg:table-cell text-xs text-muted-foreground">
                          {r.enrollments_count} كورس
                        </td>
                        <td className="p-3 px-4">
                          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" onClick={() => navigate(`/admin/students/${r.id}`)} title="عرض التفاصيل">
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => { setSelected(r); setModalMode("edit"); }} title="تعديل">
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setConfirm({ kind: r.is_banned ? "unban" : "ban", student: r })}
                              title={r.is_banned ? "رفع الحظر" : "حظر"}
                              className={r.is_banned ? "text-emerald-600" : "text-amber-600"}
                            >
                              {r.is_banned ? <ShieldCheck className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
                            </Button>
                            <Button variant="ghost" size="icon" className="text-destructive" onClick={() => setConfirm({ kind: "delete", student: r })} title="حذف">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <Button variant="outline" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
            السابق
          </Button>
          <div className="text-sm text-muted-foreground">الصفحة {page + 1} من {totalPages}</div>
          <Button variant="outline" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>
            التالي
          </Button>
        </div>
      )}

      <StudentFormModal
        open={modalMode !== null}
        onOpenChange={(o) => !o && setModalMode(null)}
        mode={modalMode ?? "create"}
        student={selected}
        onSaved={reload}
      />

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-right">
              {confirm?.kind === "delete" && "حذف الطالب نهائيًا؟"}
              {confirm?.kind === "ban" && "حظر الطالب؟"}
              {confirm?.kind === "unban" && "رفع الحظر عن الطالب؟"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-right">
              {confirm?.kind === "delete" && (
                <>سيتم حذف الحساب نهائيًا مع كل تسجيلاته وتقدمه ومحاولات اختباراته. لا يمكن التراجع.</>
              )}
              {confirm?.kind === "ban" && (
                <>سيتم تسجيل خروج الطالب فورًا وسيُمنع من تسجيل الدخول مجددًا حتى يتم رفع الحظر.</>
              )}
              {confirm?.kind === "unban" && (
                <>سيتمكن الطالب من تسجيل الدخول والاستمرار في استخدام المنصة.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              className={confirm?.kind === "delete" ? "bg-destructive hover:bg-destructive/90" : ""}
              onClick={(e) => {
                e.preventDefault();
                if (!confirm) return;
                if (confirm.kind === "delete") doDelete(confirm.student);
                else doBan(confirm.student, confirm.kind === "ban");
              }}
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "تأكيد"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!bulkConfirm} onOpenChange={(o) => !o && setBulkConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-right">
              {bulkConfirm === "delete" && `حذف ${selectedIds.size} طالب نهائيًا؟`}
              {bulkConfirm === "ban" && `حظر ${selectedIds.size} طالب؟`}
              {bulkConfirm === "unban" && `رفع الحظر عن ${selectedIds.size} طالب؟`}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-right">
              {bulkConfirm === "delete"
                ? "سيتم حذف الحسابات المحددة نهائيًا مع كل بياناتها. لا يمكن التراجع."
                : "سيتم تطبيق العملية على كل الطلاب المحددين."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              className={bulkConfirm === "delete" ? "bg-destructive hover:bg-destructive/90" : ""}
              onClick={(e) => { e.preventDefault(); runBulk(); }}
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "تأكيد"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
