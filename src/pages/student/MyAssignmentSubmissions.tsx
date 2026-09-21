import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  listAssignmentSubmissions,
  type SubmissionListRow,
} from "@/lib/assignment-submissions-api";
import SubmissionsTable from "@/components/assignments/SubmissionsTable";
import SubmissionGradingModal from "@/components/assignments/SubmissionGradingModal";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, ClipboardEdit } from "lucide-react";

const ALL = "__all__";

interface CourseOption { id: string; title: string }

export default function MyAssignmentSubmissions() {
  const { user } = useAuth();
  const [rows, setRows] = useState<SubmissionListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [courseId, setCourseId] = useState<string>(ALL);
  const [enrolledCourses, setEnrolledCourses] = useState<CourseOption[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const { data } = await (supabase as any)
        .from("enrollments")
        .select("courses(id,title)")
        .eq("user_id", user.id);
      const list = ((data ?? []) as any[])
        .map((r) => r.courses)
        .filter(Boolean)
        .map((c: any) => ({ id: c.id, title: c.title }));
      const seen = new Set<string>();
      const uniq: CourseOption[] = [];
      list.forEach((c) => { if (!seen.has(c.id)) { seen.add(c.id); uniq.push(c); } });
      uniq.sort((a, b) => a.title.localeCompare(b.title, "ar"));
      setEnrolledCourses(uniq);
    })();
  }, [user?.id]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listAssignmentSubmissions({
      courseId: courseId === ALL ? undefined : courseId,
      limit: 200,
      offset: 0,
    })
      .then((data) => { if (!cancelled) setRows(data); })
      .catch(() => { if (!cancelled) setRows([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [courseId, user?.id]);

  const emptyAction = useMemo(
    () => (
      <Button asChild variant="outline" className="gap-2">
        <Link to="/courses">
          تصفح الدورات <ArrowLeft className="w-4 h-4" />
        </Link>
      </Button>
    ),
    [],
  );

  return (
    <div className="max-w-6xl mx-auto space-y-6">
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
            <h1 className="text-2xl md:text-3xl font-black text-foreground">واجباتي</h1>
          </div>
          <p className="text-muted-foreground text-sm">
            {loading ? "…" : `${rows.length} تسليم`}
          </p>
        </div>

        {enrolledCourses.length > 0 && (
          <div className="min-w-[220px]">
            <Select value={courseId} onValueChange={setCourseId}>
              <SelectTrigger><SelectValue placeholder="كل الدورات" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>كل الدورات</SelectItem>
                {enrolledCourses.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </motion.div>

      <SubmissionsTable
        rows={rows}
        loading={loading}
        onView={(r) => setOpenId(r.submission_id)}
        emptyTitle="لا توجد تسليمات واجبات بعد"
        emptyAction={emptyAction}
        showStudentColumn={false}
        showSubjectStageColumns={false}
      />

      <SubmissionGradingModal
        submissionId={openId}
        open={!!openId}
        onOpenChange={(o) => !o && setOpenId(null)}
        isReadOnly
      />
    </div>
  );
}
