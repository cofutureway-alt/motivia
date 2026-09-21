import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Search, BookOpen, X, Atom } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CourseCard } from "@/components/CourseCard";
import { usePublicCourses } from "@/hooks/use-public-courses";
import { useMyProgressMap } from "@/hooks/use-my-progress";
import { useGradeLock } from "@/hooks/use-grade-lock";
import { supabase } from "@/integrations/supabase/client";
import { usePageMeta } from "@/hooks/use-page-meta";

interface Named {
  id: string;
  name: string;
}

const Courses = () => {
  usePageMeta("الكورسات", "استكشف جميع كورسات الكيمياء على منصة مستر محمد إبراهيم — شروحات واختبارات ومتابعة مستمرة.");
  const courses = usePublicCourses();
  const progressMap = useMyProgressMap();
  // When active, the student only sees their own grade — stage filter is pinned.
  const gradeLock = useGradeLock();
  const [stages, setStages] = useState<Named[]>([]);
  const [subjects, setSubjects] = useState<Named[]>([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [stageId, setStageId] = useState<string | "all">(
    searchParams.get("stage") ?? "all",
  );
  const [subjectId, setSubjectId] = useState<string | "all">(
    searchParams.get("subject") ?? "all",
  );

  useEffect(() => {
    supabase
      .from("stages")
      .select("id, name")
      .order("name")
      .then(({ data }) => setStages((data as Named[]) ?? []));
    (supabase as any)
      .from("subjects")
      .select("id, name")
      .order("name")
      .then(({ data }: any) => setSubjects((data as Named[]) ?? []));
  }, []);

  // Sync selected filters -> URL for shareable state
  useEffect(() => {
    const p = new URLSearchParams(searchParams);
    stageId === "all" ? p.delete("stage") : p.set("stage", stageId);
    subjectId === "all" ? p.delete("subject") : p.set("subject", subjectId);
    setSearchParams(p, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageId, subjectId]);

  const filtered = useMemo(() => {
    if (!courses) return null;
    return courses.filter((c) => {
      if (stageId !== "all" && c.stage_id !== stageId) return false;
      if (subjectId !== "all" && c.subject_id !== subjectId) return false;
      if (query && !c.title.toLowerCase().includes(query.toLowerCase()))
        return false;
      return true;
    });
  }, [courses, query, stageId, subjectId]);

  const activeCount =
    (stageId !== "all" ? 1 : 0) +
    (subjectId !== "all" ? 1 : 0) +
    (query.trim() ? 1 : 0);

  const resetAll = () => {
    setStageId("all");
    setSubjectId("all");
    setQuery("");
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="pt-28 pb-16 relative overflow-hidden">
        {/* Page header backdrop — hex grid only, no gradients */}
        <div className="absolute inset-x-0 top-0 h-72 -z-10 overflow-hidden">
          <div className="absolute inset-0 chem-hex-grid opacity-[0.04] dark:opacity-[0.06]" />
        </div>

        <div className="container mx-auto px-4">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 text-center"
          >
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 mb-4">
              <Atom size={14} className="text-primary" />
              <span className="text-xs font-bold text-primary">كورسات الكيمياء</span>
            </div>
            <h1 className="text-3xl md:text-5xl font-black text-foreground">
              كل <span className="text-primary">الكورسات</span>
            </h1>
            <p className="text-muted-foreground mt-3 max-w-xl mx-auto">
              اختر صفك الدراسي وابدأ رحلتك نحو الدرجة النهائية في الكيمياء.
            </p>
          </motion.div>

          {/* Search */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="max-w-xl mx-auto mb-6 relative"
          >
            <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="ابحث عن كورس..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pr-11 h-12 rounded-2xl bg-card border-border shadow-sm"
            />
          </motion.div>

          {/* Filter chips — stages (pinned to the student's grade when locked) */}
          {gradeLock.active ? (
            <div className="flex justify-center">
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/25 text-sm font-bold text-primary">
                <Atom size={14} />
                {stages.find((s) => s.id === gradeLock.stageId)?.name ?? "كورسات صفك"}
              </span>
            </div>
          ) : (
            <FilterRail
              label="الصفوف"
              items={stages}
              activeId={stageId}
              onSelect={setStageId}
              allLabel="كل الصفوف"
            />
          )}

          {/* Filter chips — subjects (only when more than one exists) */}
          {subjects.length > 1 && (
            <FilterRail
              label="المواد"
              items={subjects}
              activeId={subjectId}
              onSelect={setSubjectId}
              allLabel="كل المواد"
              className="mt-3"
            />
          )}

          {/* Results row */}
          <div className="flex items-center justify-between mt-6 mb-5">
            <div className="text-sm text-muted-foreground">
              {courses && (
                <>
                  <span className="font-bold text-foreground">{filtered?.length ?? 0}</span> من{" "}
                  {courses.length} كورس
                </>
              )}
            </div>
            {activeCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={resetAll}
                className="gap-1 text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
                مسح الفلاتر
              </Button>
            )}
          </div>

          {courses === null ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="rounded-3xl border border-border overflow-hidden">
                  <Skeleton className="h-48 w-full" />
                  <div className="p-5 space-y-3">
                    <Skeleton className="h-5 w-2/3" />
                    <Skeleton className="h-4 w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered && filtered.length > 0 ? (
            <motion.div
              layout
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
            >
              <AnimatePresence mode="popLayout">
                {filtered.map((c, i) => (
                  <CourseCard key={c.id} course={c} index={i} progress={progressMap[c.id]} />
                ))}
              </AnimatePresence>
            </motion.div>
          ) : (
            <div className="rounded-3xl border-2 border-dashed border-border p-16 text-center max-w-lg mx-auto">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 ring-1 ring-primary/20 mb-4">
                <BookOpen className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-xl font-bold mb-2">
                {courses.length === 0
                  ? "لا توجد كورسات منشورة بعد"
                  : "لا توجد نتائج مطابقة"}
              </h2>
              <p className="text-muted-foreground mb-4">
                {courses.length === 0
                  ? "سنضيف الكورسات قريبًا. تابعنا للاطلاع على الجديد."
                  : "جرّب كلمات بحث أخرى أو غيّر الفلاتر."}
              </p>
              {activeCount > 0 && (
                <Button variant="outline" onClick={resetAll} className="gap-2">
                  <X className="w-4 h-4" /> مسح الفلاتر
                </Button>
              )}
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
};

/** Horizontal scrollable chip rail for RTL filter selection. */
const FilterRail = ({
  label,
  items,
  activeId,
  onSelect,
  allLabel,
  className = "",
}: {
  label: string;
  items: Named[];
  activeId: string | "all";
  onSelect: (v: string | "all") => void;
  allLabel: string;
  className?: string;
}) => {
  if (!items.length) return null;
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <span className="hidden sm:block text-xs font-bold text-muted-foreground shrink-0">
        {label}
      </span>
      <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none [scrollbar-width:none]">
        <Chip active={activeId === "all"} onClick={() => onSelect("all")}>
          {allLabel}
        </Chip>
        {items.map((s) => (
          <Chip key={s.id} active={activeId === s.id} onClick={() => onSelect(s.id)}>
            {s.name}
          </Chip>
        ))}
      </div>
    </div>
  );
};

const Chip = ({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <button
    onClick={onClick}
    className={
      "shrink-0 px-4 py-2 rounded-full text-sm font-bold transition-all duration-200 whitespace-nowrap " +
      (active
        ? "bg-primary text-primary-foreground shadow-md shadow-primary/25 scale-[1.02]"
        : "bg-card text-muted-foreground border border-border hover:border-primary/40 hover:text-foreground")
    }
  >
    {children}
  </button>
);

export default Courses;
