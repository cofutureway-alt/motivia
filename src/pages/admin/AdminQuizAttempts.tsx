import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { listQuizAttempts, type QuizAttemptRow } from "@/lib/quiz-attempts-api";
import AttemptsTable from "@/components/quiz/AttemptsTable";
import AttemptDetailsModal from "@/components/quiz/AttemptDetailsModal";
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
import { Search, SlidersHorizontal, X, ClipboardCheck } from "lucide-react";

const ALL = "__all__";
const PAGE_SIZE = 50;

interface Option { id: string; name: string }
interface CourseOption extends Option { stage_id: string | null; subject_id: string | null }

export default function AdminQuizAttempts() {
  const [searchParams, setSearchParams] = useSearchParams();
  const quizId = searchParams.get("quizId") || undefined;
  const [quizTitle, setQuizTitle] = useState<string | null>(null);

  const [rows, setRows] = useState<QuizAttemptRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [courseId, setCourseId] = useState<string>(ALL);
  const [stageId, setStageId] = useState<string>(ALL);
  const [subjectId, setSubjectId] = useState<string>(ALL);
  const [needsReviewOnly, setNeedsReviewOnly] = useState(false);

  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [stages, setStages] = useState<Option[]>([]);
  const [subjects, setSubjects] = useState<Option[]>([]);

  const [openAttemptId, setOpenAttemptId] = useState<string | null>(null);
  const [openStudentLabel, setOpenStudentLabel] = useState<string>();

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Load quiz title when filtered by quizId
  useEffect(() => {
    if (!quizId) { setQuizTitle(null); return; }
    (supabase as any).from("quizzes").select("title").eq("id", quizId).maybeSingle()
      .then(({ data }: any) => setQuizTitle(data?.title ?? null));
  }, [quizId]);

  // Load filter option lists once
  useEffect(() => {
    (async () => {
      const [c, s, sub] = await Promise.all([
        (supabase as any).from("courses").select("id,title,stage_id,subject_id").order("title"),
        (supabase as any).from("stages").select("id,name").order("name"),
        (supabase as any).from("subjects").select("id,name").order("name"),
      ]);
      setCourses(((c.data ?? []) as any[]).map((r) => ({ id: r.id, name: r.title, stage_id: r.stage_id, subject_id: r.subject_id })));
      setStages(((s.data ?? []) as any[]).map((r) => ({ id: r.id, name: r.name })));
      setSubjects(((sub.data ?? []) as any[]).map((r) => ({ id: r.id, name: r.name })));
    })();
  }, []);

  // Reset paging when filters change
  useEffect(() => { setPage(0); }, [debouncedSearch, courseId, stageId, subjectId, needsReviewOnly, quizId]);

  // Fetch rows
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listQuizAttempts({
      userSearch: debouncedSearch || undefined,
      courseId: courseId === ALL ? undefined : courseId,
      stageId: stageId === ALL ? undefined : stageId,
      subjectId: subjectId === ALL ? undefined : subjectId,
      quizId,
      needsReviewOnly,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    })
      .then((data) => {
        if (cancelled) return;
        setRows(data);
        setTotal(data[0]?.total_count ?? 0);
      })
      .catch(() => { if (!cancelled) { setRows([]); setTotal(0); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [debouncedSearch, courseId, stageId, subjectId, needsReviewOnly, page, quizId]);

  const filteredCourses = useMemo(() => {
    return courses.filter(
      (c) =>
        (stageId === ALL || c.stage_id === stageId) &&
        (subjectId === ALL || c.subject_id === subjectId),
    );
  }, [courses, stageId, subjectId]);

  const clearQuizFilter = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("quizId");
    setSearchParams(next, { replace: true });
  };

  const activeFilterCount =
    (debouncedSearch ? 1 : 0) +
    (courseId !== ALL ? 1 : 0) +
    (stageId !== ALL ? 1 : 0) +
    (subjectId !== ALL ? 1 : 0) +
    (needsReviewOnly ? 1 : 0) +
    (quizId ? 1 : 0);

  const clearAll = () => {
    setSearch(""); setDebouncedSearch("");
    setCourseId(ALL); setStageId(ALL); setSubjectId(ALL);
    setNeedsReviewOnly(false);
    clearQuizFilter();
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const filtersUI = (
    <div className="space-y-4">
      <div className="relative">
        <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث عن مستخدم (الاسم أو البريد)"
          className="pr-10"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <FilterSelect label="المرحلة الدراسية" value={stageId} onChange={setStageId} options={stages} />
        <FilterSelect label="المادة الدراسية" value={subjectId} onChange={setSubjectId} options={subjects} />
        <FilterSelect label="الكورس" value={courseId} onChange={setCourseId} options={filteredCourses} />
      </div>

      <label className="flex items-center gap-3 rounded-xl border border-border p-3 cursor-pointer">
        <Switch checked={needsReviewOnly} onCheckedChange={setNeedsReviewOnly} />
        <div className="flex-1">
          <div className="font-medium">تحتاج مراجعة فقط</div>
          <div className="text-xs text-muted-foreground">إظهار المحاولات ذات الحالة "قيد المراجعة" فقط.</div>
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
              <ClipboardCheck className="w-5 h-5" />
            </div>
            <h1 className="text-2xl md:text-3xl font-black text-foreground">محاولات الاختبارات</h1>
          </div>
          <p className="text-muted-foreground text-sm">
            {loading ? "…" : `${total} محاولة مطابقة${activeFilterCount ? " للفلاتر الحالية" : ""}`}
          </p>
          {quizId && (
            <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold">
              الاختبار: {quizTitle ?? "…"}
              <button
                type="button"
                onClick={clearQuizFilter}
                className="hover:opacity-80"
                aria-label="مسح فلتر الاختبار"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Mobile filter trigger */}
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

      {/* Desktop filter panel */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="hidden md:block rounded-2xl border border-border bg-card p-5"
      >
        {filtersUI}
      </motion.div>

      <AttemptsTable
        rows={rows}
        loading={loading}
        onView={(r) => {
          setOpenAttemptId(r.attempt_id);
          setOpenStudentLabel(`${r.student_name || "طالب"} — ${r.student_email}`);
        }}
        emptyTitle={activeFilterCount ? "لا توجد محاولات مطابقة للفلاتر الحالية" : "لا توجد محاولات مكتملة بعد"}
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

      <AttemptDetailsModal
        attemptId={openAttemptId}
        open={!!openAttemptId}
        onOpenChange={(o) => !o && setOpenAttemptId(null)}
        adminMode
        studentLabel={openStudentLabel}
        onSaved={() => {
          // Refresh current page after grading/feedback saves
          listQuizAttempts({
            userSearch: debouncedSearch || undefined,
            courseId: courseId === ALL ? undefined : courseId,
            stageId: stageId === ALL ? undefined : stageId,
            subjectId: subjectId === ALL ? undefined : subjectId,
            needsReviewOnly,
            quizId,
            limit: PAGE_SIZE,
            offset: page * PAGE_SIZE,
          }).then((data) => {
            setRows(data);
            setTotal(data[0]?.total_count ?? 0);
          }).catch(() => {});
        }}
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
