import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookOpen,
  Layers,
  Lock,
  PlayCircle,
  ChevronDown,
  ArrowLeft,
  Loader2,
  CheckCircle2,
  ShieldCheck,
  Sparkles,
  ClipboardCheck,
  ClipboardList,
  HelpCircle,
  Clock,
  GraduationCap,
  ChevronLeft,
  Ticket,
} from "lucide-react";
import { toast } from "sonner";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useGradeLock } from "@/hooks/use-grade-lock";
import { useSignedThumbnail } from "@/hooks/use-signed-thumbnail";
import { useCourseProgress } from "@/hooks/use-my-progress";
import { EightPointStar } from "@/components/IslamicPatterns";
import { listUnitQuizzes } from "@/lib/quiz-api";
import { getEffectiveCoursePrice, formatPiastres } from "@/lib/money";
import PurchaseCourseModal from "@/components/course/PurchaseCourseModal";
import DiscountCountdown from "@/components/DiscountCountdown";
import { ComingSoonBadge, ComingSoonCountdown } from "@/components/ComingSoon";
import { Input } from "@/components/ui/input";
import { redeemPurchaseCode } from "@/lib/admin-purchase-codes-api";



interface Course {
  id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  stage_id: string | null;
  stage_name: string | null;
  subject_name: string | null;
  status: "draft" | "coming_soon" | "published";
  is_paid: boolean | null;
  price_piastres: number | null;
  discount_price_piastres: number | null;
  discount_expires_at: string | null;
  scheduled_publish_at: string | null;
  created_by: string | null;
}


interface LessonLite {
  id: string;
  unit_id: string;
  title: string;
  position: number;
}

interface QuizLite {
  id: string;
  unit_id: string;
  title: string;
  order_index: number;
  duration_minutes: number;
}

type UnitItem =
  | { kind: "lesson"; order: number; lesson: LessonLite }
  | { kind: "quiz"; order: number; quiz: QuizLite };

interface UnitWithLessons {
  id: string;
  title: string;
  description: string | null;
  position: number;
  lessons: LessonLite[];
  quizzes: QuizLite[];
  items: UnitItem[];
}

const CourseDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, profile, loading: authLoading } = useAuth();
  const isAdmin = profile?.role === "admin";
  const gradeLock = useGradeLock();

  const [course, setCourse] = useState<Course | null>(null);
  const [publisher, setPublisher] = useState<any>(null);
  const [units, setUnits] = useState<UnitWithLessons[]>([]);
  const [questionsCount, setQuestionsCount] = useState(0);
  const [enrolled, setEnrolled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [openUnits, setOpenUnits] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    // Fetch course (RLS: published visible to all, admin sees all)
    const { data: cData, error: cErr } = await (supabase as any)
      .from("courses")
      .select("id, title, description, thumbnail_url, stage_id, status, is_paid, price_piastres, discount_price_piastres, discount_expires_at, scheduled_publish_at, created_by, stages(name), subjects(name)")
      .eq("id", id)
      .maybeSingle();

    if (cErr || !cData) {
      setCourse(null);
      setLoading(false);
      return;
    }
    setCourse({
      id: cData.id,
      title: cData.title,
      description: cData.description,
      thumbnail_url: cData.thumbnail_url,
      stage_id: cData.stage_id,
      stage_name: (cData as any).stages?.name ?? null,
      subject_name: (cData as any).subjects?.name ?? null,
      status: cData.status,
      is_paid: cData.is_paid ?? false,
      price_piastres: cData.price_piastres ?? null,
      discount_price_piastres: cData.discount_price_piastres ?? null,
      discount_expires_at: cData.discount_expires_at ?? null,
      scheduled_publish_at: (cData as any).scheduled_publish_at ?? null,
      created_by: cData.created_by ?? null,
    });

    // Fetch publisher info if created_by exists
    if (cData.created_by) {
      const { data: pubData } = await (supabase as any).rpc("get_public_instructor_profile", {
        _user_id: cData.created_by,
      });
      setPublisher(pubData ?? null);
    } else {
      setPublisher(null);
    }


    // Units
    const { data: uData } = await supabase
      .from("units")
      .select("id, title, description, position")
      .eq("course_id", id)
      .order("position");

    const unitList = (uData ?? []) as UnitWithLessons[];
    const unitIds = unitList.map((u) => u.id);

    let lessons: LessonLite[] = [];
    if (unitIds.length) {
      // Admins can read the full lessons table; everyone else uses the public view
      if (isAdmin) {
        const { data } = await supabase
          .from("lessons")
          .select("id, unit_id, title, position")
          .in("unit_id", unitIds)
          .order("position");
        lessons = (data as LessonLite[]) ?? [];
      } else {
        const { data } = await supabase
          .from("lessons_public")
          .select("id, unit_id, title, position")
          .in("unit_id", unitIds)
          .order("position");
        lessons = (data as LessonLite[]) ?? [];
      }
    }

    // Fetch quizzes per unit (parallel)
    const quizzesByUnit: Record<string, QuizLite[]> = {};
    if (unitIds.length) {
      const results = await Promise.all(unitIds.map((uid) => listUnitQuizzes(uid).catch(() => [])));
      unitIds.forEach((uid, i) => {
        quizzesByUnit[uid] = (results[i] ?? []) as QuizLite[];
      });
    }

    setUnits(
      unitList.map((u) => {
        const uLessons = lessons.filter((l) => l.unit_id === u.id);
        const uQuizzes = quizzesByUnit[u.id] ?? [];
        const items: UnitItem[] = [
          ...uLessons.map((l) => ({ kind: "lesson" as const, order: l.position, lesson: l })),
          ...uQuizzes.map((q) => ({ kind: "quiz" as const, order: q.order_index, quiz: q })),
        ].sort((a, b) => a.order - b.order);
        return { ...u, lessons: uLessons, quizzes: uQuizzes, items };
      }),
    );

    // Total questions across all forms of all quizzes in this course
    const allQuizIds = Object.values(quizzesByUnit).flat().map((q) => q.id);
    if (allQuizIds.length) {
      const { count } = await (supabase as any)
        .from("quiz_questions")
        .select("id", { count: "exact", head: true })
        .in("quiz_id", allQuizIds);
      setQuestionsCount(count ?? 0);
    } else {
      setQuestionsCount(0);
    }

    // Enrollment status
    if (user) {
      const { data: eRows } = await supabase
        .from("enrollments")
        .select("id")
        .eq("course_id", id)
        .eq("user_id", user.id)
        .limit(1);

      let isEnrolled = !!(eRows && eRows.length > 0);

      if (!isEnrolled) {
        try {
          const { data: bCourses } = await (supabase as any)
            .from("bundle_courses")
            .select("bundle_id")
            .eq("course_id", id);

          if (bCourses && bCourses.length > 0) {
            const bundleIds = bCourses.map((b: any) => b.bundle_id);
            const { data: bPurchases } = await (supabase as any)
              .from("bundle_purchases")
              .select("id")
              .eq("user_id", user.id)
              .in("bundle_id", bundleIds)
              .limit(1);
            if (bPurchases && bPurchases.length > 0) {
              isEnrolled = true;
            }
          }
        } catch {
          // Ignore bundle query errors
        }
      }

      setEnrolled(isEnrolled);
    } else {
      setEnrolled(false);
    }

    setLoading(false);
  }, [id, user, isAdmin]);

  useEffect(() => {
    if (!authLoading) load();
  }, [load, authLoading]);

  const totalLessons = units.reduce((acc, u) => acc + u.lessons.length, 0);
  const totalQuizzes = units.reduce((acc, u) => acc + u.quizzes.length, 0);
  const unlocked = enrolled || isAdmin;
  const { data: progressData } = useCourseProgress(enrolled ? id : undefined);
  const progress = enrolled ? (progressData?.percent ?? 0) : null;
  const completedIds = progressData?.completedLessonIds ?? new Set<string>();

  const effective = getEffectiveCoursePrice(course);

  const handleEnroll = async () => {
    if (!id) return;
    if (course?.status === "coming_soon") {
      toast.error("لا يمكن التسجيل في هذا الكورس حاليًا — سيتاح قريبًا");
      return;
    }
    if (!user) {
      navigate(`/login?redirect=/courses/${id}`);
      return;
    }
    // Paid courses go through the purchase modal
    if (course?.is_paid && effective.amount > 0) {
      setPurchaseOpen(true);
      return;
    }
    setEnrolling(true);
    try {
      const { error } = await supabase
        .from("enrollments")
        .insert({ user_id: user.id, course_id: id });
      if (error) {
        if ((error as any).code === "23505") {
          setEnrolled(true);
          toast.success("أنت مسجّل بالفعل في هذه الدورة");
          return;
        }
        throw error;
      }
      setEnrolled(true);
      toast.success("تم التسجيل في الدورة بنجاح");
    } catch (e: any) {
      toast.error(e?.message || "تعذّر التسجيل، حاول مجددًا");
    } finally {
      setEnrolling(false);
    }
  };


  const startCourse = () => {
    const allItems = units.flatMap((u) => u.items);
    if (!allItems.length) {
      toast.info("لم يتم إضافة محتوى بعد");
      return;
    }
    const firstLesson = allItems.find(
      (it) => it.kind === "lesson" && !completedIds.has((it as any).lesson.id),
    );
    const target =
      firstLesson ??
      allItems.find((it) => it.kind === "lesson") ??
      allItems[0];
    if (target.kind === "lesson") {
      navigate(`/courses/${id}/learn/lesson/${(target as any).lesson.id}`);
    } else {
      navigate(`/courses/${id}/learn/quiz/${(target as any).quiz.id}`);
    }
  };

  if (loading || authLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="pt-28 pb-16 container mx-auto px-4 space-y-6">
          <Skeleton className="h-72 w-full rounded-2xl" />
          <Skeleton className="h-10 w-1/2" />
          <Skeleton className="h-24 w-full" />
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // Grade lock: students with an assigned grade may only open their grade's
  // courses — unless already enrolled (never lose access to what they paid for).
  const lockedForGrade =
    gradeLock.active &&
    !enrolled &&
    !isAdmin &&
    course !== null &&
    course.stage_id !== null &&
    course.stage_id !== gradeLock.stageId;

  if (lockedForGrade) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="pt-28 pb-16 container mx-auto px-4">
          <div className="max-w-lg mx-auto rounded-2xl border-2 border-dashed border-border p-16 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-4">
              <Lock className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-xl font-bold mb-2">هذا الكورس لصف دراسي آخر</h2>
            <p className="text-muted-foreground mb-4">
              الكورسات المتاحة لك تظهر حسب صفك الدراسي المسجّل به.
            </p>
            <Button variant="outline" onClick={() => navigate("/courses")} className="gap-2">
              تصفح كورسات صفك
            </Button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (!course) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="pt-28 pb-16 container mx-auto px-4">
          <div className="max-w-lg mx-auto rounded-2xl border-2 border-dashed border-border p-16 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-4">
              <BookOpen className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-2xl font-bold mb-2">الدورة غير متوفرة</h1>
            <p className="text-muted-foreground mb-6">
              لم يتم العثور على هذه الدورة أو أنها لم تُنشر بعد.
            </p>
            <Button asChild>
              <Link to="/courses">
                <ArrowLeft className="w-4 h-4 ml-2" />
                العودة إلى الدورات
              </Link>
            </Button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="pt-24 pb-16">
        <CourseHero
          course={course}
          unitsCount={units.length}
          lessonsCount={totalLessons}
          quizzesCount={totalQuizzes}
          questionsCount={questionsCount}
        />

        <div className="container mx-auto px-4 mt-10 grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Sidebar CTA (Mobile: Order 1, Desktop: Order 2) */}
          <aside className="space-y-4 order-1 lg:order-2 lg:sticky lg:top-24 lg:self-start">
            <EnrollCard
              enrolled={enrolled}
              isAdmin={isAdmin}
              enrolling={enrolling}
              onEnroll={handleEnroll}
              onStart={startCourse}
              progress={progress}
              effective={effective}
              comingSoon={course.status === "coming_soon"}
              scheduledAt={course.scheduled_publish_at}
            />

            {/* Publisher / Instructor Card */}
            {publisher && publisher.id && (
              <Link
                to={`/instructors/${publisher.id}`}
                className="group block rounded-2xl border border-border/80 bg-card p-4 hover:border-primary/50 hover:shadow-md transition-all"
              >
                <div className="flex items-center gap-3">
                  <Avatar className="w-12 h-12 border border-primary/20 shrink-0">
                    <AvatarImage src={publisher.avatar_url ?? undefined} />
                    <AvatarFallback className="bg-primary text-primary-foreground font-bold text-sm">
                      {publisher.full_name?.split(" ").filter(Boolean).slice(0, 2).map((s: string) => s[0]).join("").toUpperCase() || "م"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] text-primary font-semibold flex items-center gap-1">
                      <GraduationCap className="w-3.5 h-3.5" />
                      <span>محاضر الدورة</span>
                    </div>
                    <div className="font-bold text-sm text-foreground group-hover:text-primary transition-colors truncate">
                      {publisher.full_name || "محاضر المنصة"}
                    </div>
                    {publisher.bio && (
                      <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                        {publisher.bio}
                      </p>
                    )}
                  </div>
                  <div className="text-xs text-primary font-semibold group-hover:translate-x-[-2px] transition-transform shrink-0 flex items-center gap-1">
                    <span>الملف الشخصي</span>
                    <ChevronLeft className="w-4 h-4" />
                  </div>
                </div>
              </Link>
            )}

            {/* Inline Purchase Code Redeem Card */}
            <InlineRedeemCard currentCourseId={course.id} onRedeemedCurrent={load} />

            {course && (
              <PurchaseCourseModal
                open={purchaseOpen}
                onOpenChange={setPurchaseOpen}
                courseId={course.id}
                courseTitle={course.title}
                amountPiastres={effective.amount}
                onPurchased={(info) => {
                  setEnrolled(true);
                  toast.success(
                    `تم تفعيل الدورة بنجاح — الرصيد الجديد ${(info.newBalance / 100).toFixed(2)} ج.م`,
                  );
                  load();
                }}
              />
            )}

            <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <ShieldCheck className="w-4 h-4 text-primary" />
                <span>وصول مدى الحياة بعد التسجيل</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <BookOpen className="w-4 h-4 text-primary" />
                <span>{totalLessons} درس تعليمي</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Layers className="w-4 h-4 text-primary" />
                <span>{units.length} وحدة تعليمية</span>
              </div>
            </div>
          </aside>

          {/* Curriculum (Mobile: Order 2, Desktop: Order 1) */}
          <section className="lg:col-span-2 space-y-4 order-2 lg:order-1">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold">المنهج الدراسي</h2>
              <div className="text-sm text-muted-foreground">
                {units.length} وحدات · {totalLessons} دروس · {totalQuizzes} اختبار
              </div>
            </div>

            {units.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-border p-12 text-center text-muted-foreground">
                لم يتم إضافة محتوى بعد.
              </div>
            ) : (
              <div className="space-y-3">
                {units.map((u, i) => (
                  <UnitAccordion
                    key={u.id}
                    unit={u}
                    index={i}
                    open={!!openUnits[u.id]}
                    onToggle={() =>
                      setOpenUnits((prev) => ({ ...prev, [u.id]: !prev[u.id] }))
                    }
                    unlocked={unlocked}
                    courseId={course.id}
                    completedIds={completedIds}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
};

// ---------------- Inline Redeem Card ----------------
function InlineRedeemCard({
  currentCourseId,
  onRedeemedCurrent,
}: {
  currentCourseId: string;
  onRedeemedCurrent: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleRedeem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) {
      toast.error("يرجى إدخال كود الشراء");
      return;
    }
    setLoading(true);
    try {
      const res = await redeemPurchaseCode(code.trim());
      if (res.success) {
        if (res.target_type === "course" && res.target_id === currentCourseId) {
          toast.success("تم تفعيل هذه الدورة بنجاح!");
          onRedeemedCurrent();
        } else {
          toast.success(`تم تفعيل (${res.target_title}) بنجاح!`);
          if (res.target_type === "course") {
            navigate(`/courses/${res.target_id}`);
          } else {
            navigate("/student/courses");
          }
        }
        setCode("");
        setOpen(false);
      } else {
        toast.error(res.error || "فشل تفعيل الكود");
      }
    } catch (err: any) {
      toast.error(err?.message || "حدث خطأ أثناء التفعيل");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border/80 bg-card p-4 space-y-3">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between text-xs font-bold text-foreground hover:text-primary transition-colors"
      >
        <div className="flex items-center gap-2">
          <Ticket className="w-4 h-4 text-primary" />
          <span>لديك كود شراء؟</span>
        </div>
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.form
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            onSubmit={handleRedeem}
            className="space-y-2 pt-2 border-t border-border/50 overflow-hidden"
          >
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="أدخل كود التفعيل"
              className="text-xs font-mono uppercase text-center h-9"
              dir="ltr"
            />
            <Button type="submit" size="sm" disabled={loading} className="w-full gap-1.5 text-xs">
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              تفعيل الكود
            </Button>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}


// ---------------- Hero ----------------
const CourseHero = ({
  course,
  unitsCount,
  lessonsCount,
  quizzesCount,
  questionsCount,
}: {
  course: Course;
  unitsCount: number;
  lessonsCount: number;
  quizzesCount: number;
  questionsCount: number;
}) => {
  const thumb = useSignedThumbnail(course.thumbnail_url);
  return (
    <section className="relative">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-3xl border border-border bg-card"
        >
          <div className="relative aspect-[21/9] md:aspect-[3/1] bg-accent">
            {thumb ? (
              <img
                src={thumb}
                alt={course.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                <BookOpen className="w-16 h-16 opacity-30" />
              </div>
            )}
            <div className="absolute inset-0 bg-background/40" />
            <EightPointStar
              size={90}
              className="absolute top-6 left-6 text-primary-foreground/40 opacity-60"
            />
          </div>

          <div className="p-6 md:p-10">
            <div className="flex items-center gap-2 flex-wrap mb-3">
              {course.stage_name && (
                <Badge className="bg-primary text-primary-foreground border-0">
                  {course.stage_name}
                </Badge>
              )}
              {course.subject_name && (
                <Badge variant="outline" className="border-primary/40 text-foreground">
                  {course.subject_name}
                </Badge>
              )}
              {course.status === "draft" && (
                <Badge variant="secondary">مسودة (معاينة إدارية)</Badge>
              )}
              {course.status === "coming_soon" && <ComingSoonBadge />}
            </div>
            {course.status === "coming_soon" && course.scheduled_publish_at && (
              <div className="mb-3">
                <ComingSoonCountdown target={course.scheduled_publish_at} />
              </div>
            )}

            <h1 className="text-3xl md:text-5xl font-bold text-foreground mb-3">
              {course.title}
            </h1>
            {course.description && (
              <p className="text-muted-foreground text-base md:text-lg leading-relaxed max-w-3xl">
                {course.description}
              </p>
            )}

            <div className="flex items-center gap-4 flex-wrap mt-5 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Layers className="w-4 h-4" />
                {unitsCount} وحدات
              </span>
              <span className="inline-flex items-center gap-1.5">
                <BookOpen className="w-4 h-4" />
                {lessonsCount} دروس
              </span>
              <span className="inline-flex items-center gap-1.5">
                <ClipboardList className="w-4 h-4" />
                {quizzesCount} اختبار
              </span>
              <span className="inline-flex items-center gap-1.5">
                <HelpCircle className="w-4 h-4" />
                {questionsCount} سؤال
              </span>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

// ---------------- Enroll card ----------------
const EnrollCard = ({
  enrolled,
  isAdmin,
  enrolling,
  onEnroll,
  onStart,
  progress,
  effective,
  comingSoon,
  scheduledAt,
}: {
  enrolled: boolean;
  isAdmin: boolean;
  enrolling: boolean;
  onEnroll: () => void;
  onStart: () => void;
  progress: number | null;
  effective: ReturnType<typeof getEffectiveCoursePrice>;
  comingSoon: boolean;
  scheduledAt: string | null;
}) => {
  const isPaid = !effective.isFree;
  const [shake, setShake] = useState(false);
  const triggerLocked = () => {
    setShake(true);
    toast.error("لا يمكن التسجيل في هذا الكورس حاليًا — سيتاح قريبًا");
    window.setTimeout(() => setShake(false), 500);
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-border bg-card overflow-hidden"
    >
      <div className="p-6 space-y-4">
        {comingSoon ? (
          <div className="space-y-3">
            <ComingSoonBadge />
            <div className="text-2xl font-extrabold text-foreground">التسجيل لم يُفتح بعد</div>
            {scheduledAt && (
              <>
                <div className="text-xs text-muted-foreground">يبدأ التسجيل بعد:</div>
                <ComingSoonCountdown target={scheduledAt} />
              </>
            )}
          </div>
        ) : isPaid ? (
          <div className="space-y-2">
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="text-3xl font-bold text-foreground">
                {formatPiastres(effective.amount)}
              </span>
              {effective.discountActive && effective.originalAmount !== null && (
                <span className="text-base text-muted-foreground line-through">
                  {formatPiastres(effective.originalAmount)}
                </span>
              )}
            </div>
            {effective.discountActive && effective.discountExpiresAt && (
              <DiscountCountdown target={effective.discountExpiresAt} compact />
            )}
          </div>
        ) : (
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-foreground">مجانًا</span>
          </div>
        )}

        {isAdmin ? (
          <div className="rounded-lg bg-primary/10 border border-primary/20 p-3 text-sm flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-primary mt-0.5" />
            <span>لديك صلاحية إدارية — كامل الوصول للدورة.</span>
          </div>
        ) : enrolled ? (
          <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3 text-sm flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-0.5" />
            <span>أنت مسجّل في هذه الدورة.</span>
          </div>
        ) : comingSoon ? (
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 text-sm flex items-start gap-2">
            <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5" />
            <span>سنُعلن عن فتح التسجيل قريبًا — تابع الصفحة!</span>
          </div>
        ) : (
          <div className="rounded-lg bg-accent p-3 text-sm flex items-start gap-2">
            <Sparkles className="w-4 h-4 text-primary mt-0.5" />
            <span>
              {isPaid
                ? "اشترِ الدورة الآن لفتح كامل المحتوى."
                : "سجّل مجانًا لفتح كامل الدروس والملفات."}
            </span>
          </div>
        )}

        {enrolled && typeof progress === "number" && (
          <div>
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
              <span>تقدّمك</span>
              <span className="font-semibold text-foreground">{progress}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        )}

        {isAdmin || enrolled ? (
          <Button
            onClick={onStart}
            size="lg"
            className="w-full font-bold shadow-lg shadow-primary/20"
          >
            <PlayCircle className="w-5 h-5 ml-2" />
            {isAdmin && !enrolled
              ? "بدء المعاينة"
              : progress && progress > 0
                ? "متابعة التعلّم"
                : "بدء الدورة"}
          </Button>
        ) : comingSoon ? (
          <motion.div
            animate={shake ? { x: [0, -8, 8, -6, 6, -3, 3, 0] } : { x: 0 }}
            transition={{ duration: 0.45 }}
          >
            <Button
              type="button"
              onClick={triggerLocked}
              size="lg"
              variant="secondary"
              className="w-full font-bold cursor-not-allowed opacity-80"
            >
              <Lock className="w-5 h-5 ml-2" />
              قريبًا — التسجيل مغلق
            </Button>
          </motion.div>
        ) : (
          <Button
            onClick={onEnroll}
            disabled={enrolling}
            size="lg"
            className="w-full font-bold shadow-lg shadow-primary/20"
          >
            {enrolling && <Loader2 className="w-4 h-4 ml-2 animate-spin" />}
            {isPaid ? "شراء الكورس" : "سجّل مجانًا"}
          </Button>
        )}
      </div>
    </motion.div>

  );
};

// ---------------- Unit accordion ----------------
const UnitAccordion = ({
  unit,
  index,
  open,
  onToggle,
  unlocked,
  courseId,
  completedIds,
}: {
  unit: UnitWithLessons;
  index: number;
  open: boolean;
  onToggle: () => void;
  unlocked: boolean;
  courseId: string;
  completedIds: Set<string>;
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="rounded-2xl border border-border bg-card overflow-hidden"
    >
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-4 md:p-5 text-right hover:bg-accent/40 transition-colors"
      >
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 text-primary font-bold">
          {index + 1}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-foreground">{unit.title}</div>
          <div className="text-xs text-muted-foreground">
            {unit.lessons.length} دروس
          </div>
        </div>
        <motion.div
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown className="w-5 h-5 text-muted-foreground" />
        </motion.div>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="px-4 md:px-5 pb-4 space-y-1.5 border-t border-border pt-3">
              {unit.items.length === 0 ? (
                <p className="text-sm text-muted-foreground py-3 text-center">
                  لا يوجد محتوى في هذه الوحدة بعد.
                </p>
              ) : (
                unit.items.map((it, i) =>
                  it.kind === "lesson" ? (
                    <LessonRow
                      key={`l-${it.lesson.id}`}
                      lesson={it.lesson}
                      index={i}
                      unlocked={unlocked}
                      courseId={courseId}
                      completed={completedIds.has(it.lesson.id)}
                    />
                  ) : (
                    <QuizRow
                      key={`q-${it.quiz.id}`}
                      quiz={it.quiz}
                      index={i}
                      unlocked={unlocked}
                      courseId={courseId}
                    />
                  ),
                )
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

const LessonRow = ({
  lesson,
  index,
  unlocked,
  courseId,
  completed,
}: {
  lesson: LessonLite;
  index: number;
  unlocked: boolean;
  courseId: string;
  completed?: boolean;
}) => {
  const content = (
    <div
      className={`group flex items-center gap-3 p-3 rounded-lg transition-colors ${
        unlocked
          ? "hover:bg-accent cursor-pointer"
          : "opacity-70 cursor-not-allowed"
      }`}
    >
      <span className="w-7 text-center text-xs font-semibold text-muted-foreground">
        {String(index + 1).padStart(2, "0")}
      </span>
      <div
        className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${
          completed
            ? "bg-emerald-500 text-white"
            : "bg-primary/10 text-primary"
        }`}
      >
        {completed ? (
          <CheckCircle2 className="w-4 h-4" />
        ) : unlocked ? (
          <PlayCircle className="w-4 h-4" />
        ) : (
          <Lock className="w-3.5 h-3.5 text-muted-foreground" />
        )}
      </div>
      <div className="flex-1 min-w-0 text-sm font-medium truncate">
        {lesson.title}
      </div>
      {!unlocked && (
        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
          مقفول
        </span>
      )}
    </div>
  );

  if (!unlocked) return content;
  return (
    <Link to={`/courses/${courseId}/learn/lesson/${lesson.id}`} className="block">
      {content}
    </Link>
  );
};

const QuizRow = ({
  quiz,
  index,
  unlocked,
  courseId,
}: {
  quiz: QuizLite;
  index: number;
  unlocked: boolean;
  courseId: string;
}) => {
  const content = (
    <div
      className={`group flex items-center gap-3 p-3 rounded-lg transition-colors border border-dashed border-primary/30 ${
        unlocked ? "hover:bg-primary/5 cursor-pointer" : "opacity-70 cursor-not-allowed"
      }`}
    >
      <span className="w-7 text-center text-xs font-semibold text-muted-foreground">
        {String(index + 1).padStart(2, "0")}
      </span>
      <div className="w-8 h-8 rounded-md flex items-center justify-center shrink-0 bg-primary/15 text-primary">
        {unlocked ? <ClipboardCheck className="w-4 h-4" /> : <Lock className="w-3.5 h-3.5" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{quiz.title}</div>
        <div className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {quiz.duration_minutes} دقيقة · اختبار
        </div>
      </div>
      <Badge variant="outline" className="text-[10px] border-primary/40 text-primary shrink-0">
        اختبار
      </Badge>
    </div>
  );

  if (!unlocked) return content;
  return (
    <Link to={`/courses/${courseId}/learn/quiz/${quiz.id}`} className="block">
      {content}
    </Link>
  );
};


export default CourseDetails;
