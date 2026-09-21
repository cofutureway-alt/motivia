import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  listAssignmentSubmissions,
  type SubmissionListRow,
} from "@/lib/assignment-submissions-api";
import SubmissionsTable from "@/components/assignments/SubmissionsTable";
import SubmissionGradingModal from "@/components/assignments/SubmissionGradingModal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ClipboardEdit, Search, SlidersHorizontal, X } from "lucide-react";

const ALL = "__all__";
const PAGE_SIZE = 50;

interface Option { id: string; name: string }
interface CourseOption extends Option { stage_id: string | null; subject_id: string | null }
interface AssignmentOption extends Option { course_id: string }

export default function AdminAssignmentSubmissions() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [rows, setRows] = useState<SubmissionListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [courseId, setCourseId] = useState<string>(ALL);
  const [stageId, setStageId] = useState<string>(ALL);
  const [subjectId, setSubjectId] = useState<string>(ALL);
  const [assignmentId, setAssignmentId] = useState<string>(
    searchParams.get("assignmentId") || ALL,
  );
  const [ungradedOnly, setUngradedOnly] = useState(false);

  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [stages, setStages] = useState<Option[]>([]);
  const [subjects, setSubjects] = useState<Option[]>([]);
  const [assignments, setAssignments] = useState<AssignmentOption[]>([]);

  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    (async () => {
      const [c, s, sub, a] = await Promise.all([
        (supabase as any).from("courses").select("id,title,stage_id,subject_id").order("title"),
        (supabase as any).from("stages").select("id,name").order("name"),
        (supabase as any).from("subjects").select("id,name").order("name"),
        (supabase as any).from("assignments").select("id,title,course_id").order("title"),
      ]);
      setCourses(((c.data ?? []) as any[]).map((r) => ({ id: r.id, name: r.title, stage_id: r.stage_id, subject_id: r.subject_id })));
      setStages(((s.data ?? []) as any[]).map((r) => ({ id: r.id, name: r.name })));
      setSubjects(((sub.data ?? []) as any[]).map((r) => ({ id: r.id, name: r.name })));
      setAssignments(((a.data ?? []) as any[]).map((r) => ({ id: r.id, name: r.title, course_id: r.course_id })));
    })();
  }, []);

  // Sync assignmentId → URL (?assignmentId=…) so deep links work both ways.
  useEffect(() => {
    const current = searchParams.get("assignmentId");
    if (assignmentId === ALL && current) {
      const next = new URLSearchParams(searchParams);
      next.delete("assignmentId");
      setSearchParams(next, { replace: true });
    } else if (assignmentId !== ALL && current !== assignmentId) {
      const next = new URLSearchParams(searchParams);
      next.set("assignmentId", assignmentId);
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentId]);

  useEffect(() => { setPage(0); }, [debouncedSearch, courseId, stageId, subjectId, assignmentId, ungradedOnly]);

  const fetchRows = () => {
    setLoading(true);
    listAssignmentSubmissions({
      userSearch: debouncedSearch || undefined,
      courseId: courseId === ALL ? undefined : courseId,
      stageId: stageId === ALL ? undefined : stageId,
      subjectId: subjectId === ALL ? undefined : subjectId,
      assignmentId: assignmentId === ALL ? undefined : assignmentId,
      ungradedOnly,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    })
      .then((data) => { setRows(data); setTotal(data[0]?.total_count ?? 0); })
      .catch(() => { setRows([]); setTotal(0); })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, courseId, stageId, subjectId, assignmentId, ungradedOnly, page]);

  const filteredCourses = useMemo(
    () => courses.filter(
      (c) =>
        (stageId === ALL || c.stage_id === stageId) &&
        (subjectId === ALL || c.subject_id === subjectId),
    ),
    [courses, stageId, subjectId],
  );

  const filteredAssignments = useMemo(
    () => assignments.filter((a) => courseId === ALL || a.course_id === courseId),
    [assignments, courseId],
  );

  const selectedAssignment = useMemo(
    () => assignments.find((a) => a.id === assignmentId) || null,
    [assignments, assignmentId],
  );

  const activeFilterCount =
    (debouncedSearch ? 1 : 0) +
    (courseId !== ALL ? 1 : 0) +
    (stageId !== ALL ? 1 : 0) +
    (subjectId !== ALL ? 1 : 0) +
    (assignmentId !== ALL ? 1 : 0) +
    (ungradedOnly ? 1 : 0);

  const clearAll = () => {
    setSearch(""); setDebouncedSearch("");
    setCourseId(ALL); setStageId(ALL); setSubjectId(ALL);
    setAssignmentId(ALL);
    setUngradedOnly(false);
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const filtersUI = (
    <div className="space-y-4">
      <div className="relative">
        <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث عن طالب (اسم / بريد / هاتف / رقم الطالب)"
          className="pr-10"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <FilterSelect label="المرحلة الدراسية" value={stageId} onChange={setStageId} options={stages} />
        <FilterSelect label="المادة الدراسية" value={subjectId} onChange={setSubjectId} options={subjects} />
        <FilterSelect label="الدورة" value={courseId} onChange={setCourseId} options={filteredCourses} />
      </div>

      <FilterSelect
        label="الواجب"
        value={assignmentId}
        onChange={setAssignmentId}
        options={filteredAssignments}
      />

      <label className="flex items-center gap-3 rounded-xl border border-border p-3 cursor-pointer">
        <Switch checked={ungradedOnly} onCheckedChange={setUngradedOnly} />
        <div className="flex-1">
          <div className="font-medium">لم يتم تقييمها فقط</div>
          <div className="text-xs text-muted-foreground">
            إظهار التسليمات التي لم يتم إعطاؤها درجة/نتيجة بعد.
          </div>
        </div>
      </label>

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
              <ClipboardEdit className="w-5 h-5" />
            </div>
            <h1 className="text-2xl md:text-3xl font-black text-foreground">تسليمات الواجبات</h1>
          </div>
          <p className="text-muted-foreground text-sm">
            {loading ? "…" : `${total} تسليم مطابق${activeFilterCount ? " للفلاتر الحالية" : ""}`}
          </p>
        </div>

        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" className="md:hidden gap-2 relative">
              <SlidersHorizontal className="w-4 h-4" />
              فلاتر
              {activeFilterCount > 0 && (
                <Badge className="bg-primary text-primary-foreground border-0">{activeFilterCount}</Badge>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[90vw] sm:max-w-md">
            <SheetHeader className="text-right">
              <SheetTitle>الفلاتر</SheetTitle>
            </SheetHeader>
            <div className="mt-6">{filtersUI}</div>
          </SheetContent>
        </Sheet>
      </motion.div>

      {selectedAssignment && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3"
        >
          <Badge className="bg-primary text-primary-foreground border-0 gap-1">
            <ClipboardEdit className="w-3 h-3" /> واجب محدد
          </Badge>
          <div className="font-bold text-sm">{selectedAssignment.name}</div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAssignmentId(ALL)}
            className="ms-auto h-8 gap-1 text-xs"
          >
            <X className="w-3.5 h-3.5" /> إزالة
          </Button>
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="hidden md:block rounded-2xl border border-border bg-card p-5"
      >
        {filtersUI}
      </motion.div>

      <SubmissionsTable
        rows={rows}
        loading={loading}
        onView={(r) => setOpenId(r.submission_id)}
        emptyTitle={activeFilterCount ? "لا توجد تسليمات مطابقة للفلاتر" : "لا توجد تسليمات بعد"}
        emptyAction={
          activeFilterCount ? (
            <Button variant="outline" onClick={clearAll} className="gap-2">
              <X className="w-4 h-4" /> مسح الفلاتر
            </Button>
          ) : undefined
        }
        showStudentColumn
        showSubjectStageColumns
      />

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-3">
          <Button variant="outline" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
            السابق
          </Button>
          <div className="text-sm text-muted-foreground">
            الصفحة {page + 1} من {totalPages}
          </div>
          <Button
            variant="outline"
            disabled={page + 1 >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            التالي
          </Button>
        </div>
      )}

      <SubmissionGradingModal
        submissionId={openId}
        open={!!openId}
        onOpenChange={(o) => !o && setOpenId(null)}
        onSaved={fetchRows}
      />
    </div>
  );
}

const FilterSelect = ({
  label, value, onChange, options,
}: {
  label: string; value: string; onChange: (v: string) => void; options: Option[];
}) => (
  <div>
    <div className="text-xs text-muted-foreground mb-1.5">{label}</div>
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger><SelectValue placeholder={`اختر ${label}`} /></SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>الكل</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
);
