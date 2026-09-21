import { useEffect, useState } from "react";
import { ArrowLeft, BookOpen, CalendarDays, Check, Play, Users } from "lucide-react";
import { Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import HeroSection from "@/components/HeroSection";
import CourseCard from "@/components/CourseCard";
import { usePublicCourses } from "@/hooks/use-public-courses";
import { useSignedThumbnail } from "@/hooks/use-signed-thumbnail";
import { supabase } from "@/integrations/supabase/client";

interface Stage { id: string; name: string; description: string | null; thumbnail_url: string | null }
interface PublicBook { id: string; title: string; author: string | null; cover_image_url: string | null; subject: { name: string } | null; stage: { name: string } | null }
interface Instructor { instructor_id: string; full_name: string | null; avatar_url: string | null; subjects: { id: string; name: string }[]; courses_count: number }

function StagePill({ stage, index }: { stage: Stage; index: number }) {
  return <Link to={`/courses?stage=${stage.id}`} className="stage-pill group flex min-w-48 snap-start items-center justify-between gap-5 rounded-2xl bg-card px-5 py-4 shadow-subtle transition-all hover:-translate-y-1 hover:shadow-soft"><span className="font-bold">{stage.name}</span><span className="grid size-9 place-items-center rounded-xl bg-primary-soft text-sm font-black text-primary">{index + 1}</span></Link>;
}

function BookCard({ book }: { book: PublicBook }) {
  const cover = useSignedThumbnail(book.cover_image_url);
  return <Link to={`/books/${book.id}`} className="book-card group block"><div className="aspect-[2/3] overflow-hidden rounded-3xl bg-card shadow-subtle">{cover ? <img src={cover} alt={book.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.035]" /> : <div className="grid h-full place-items-center text-primary/40"><BookOpen size={48} /></div>}</div>{book.subject?.name && <p className="mt-4 text-xs font-bold text-primary">{book.subject.name}</p>}<h3 className="mt-1 line-clamp-2 font-extrabold">{book.title}</h3><p className="mt-1 text-xs text-muted-foreground">{book.stage?.name ?? book.author ?? ""}</p></Link>;
}

const Index = () => {
  const courses = usePublicCourses(6);
  const [stages, setStages] = useState<Stage[]>([]);
  const [books, setBooks] = useState<PublicBook[]>([]);
  const [instructors, setInstructors] = useState<Instructor[]>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      (supabase as any).from("stages").select("id,name,description,thumbnail_url").order("name"),
      (supabase as any).from("books").select("id,title,author,cover_image_url,subjects(name),stages(name)").eq("status", "published").order("created_at", { ascending: false }).limit(4),
      (supabase as any).rpc("list_public_instructors"),
    ]).then(([stageRes, bookRes, instructorRes]) => {
      if (cancelled) return;
      setStages((stageRes.data ?? []) as Stage[]);
      setBooks(((bookRes.data ?? []) as any[]).map((book) => ({ ...book, subject: book.subjects ?? null, stage: book.stages ?? null })));
      setInstructors((instructorRes.data ?? []) as Instructor[]);
    });
    return () => { cancelled = true; };
  }, []);

  return <div className="min-h-screen bg-background" dir="rtl"><Navbar /><main><HeroSection />
    <section className="px-4 py-10 sm:px-6 lg:px-8"><div className="mx-auto max-w-7xl"><div className="mb-6 flex items-end justify-between gap-4"><div><p className="section-kicker">ابدأ من مكانك</p><h2 className="section-heading">كل المراحل، طريق واحد واضح</h2></div><Link to="/courses" className="hidden items-center gap-2 font-bold text-primary sm:flex">استكشف الكل <ArrowLeft size={17} /></Link></div><div className="flex snap-x gap-3 overflow-x-auto pb-3">{stages.map((stage, index) => <StagePill key={stage.id} stage={stage} index={index} />)}</div></div></section>
<section className="section-reveal px-4 py-14 sm:px-6 lg:px-8"><div className="mx-auto max-w-7xl"><div className="mb-8 flex items-end justify-between gap-4"><div><p className="section-kicker">مختارة لك</p><h2 className="section-heading">كورسات تبدأ بها الآن</h2></div><Link to="/courses" className="hidden font-bold text-primary sm:block">كل الكورسات</Link></div>{courses === null ? <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">{[1, 2, 3].map((item) => <div key={item} className="h-80 animate-pulse rounded-3xl bg-muted" />)}</div> : courses.length === 0 ? <div className="rounded-3xl border border-dashed border-border p-10 text-center text-muted-foreground">لا توجد كورسات منشورة حاليًا</div> : <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">{courses.slice(0, 3).map((course, index) => <CourseCard key={course.id} course={course} index={index} />)}</div>}</div></section>
<section className="section-reveal px-4 py-14 sm:px-6 lg:px-8"><div className="teacher-band mx-auto max-w-7xl overflow-hidden rounded-[2rem] bg-foreground p-6 text-background sm:p-10 lg:p-14"><div className="grid gap-10 lg:grid-cols-[.7fr_1.3fr]"><div><p className="text-sm font-bold text-secondary">معلمون حقيقيون، دعم حقيقي</p><h2 className="mt-3 text-3xl font-black leading-tight sm:text-5xl">اختار الشرح الذي يشبهك.</h2><p className="mt-5 max-w-md leading-7 text-background/70">تعرّف على معلمي Motivai واختر المحتوى المناسب لطريقتك ومرحلتك الدراسية.</p><Link to="/instructors" className="mt-7 inline-flex items-center gap-2 rounded-2xl bg-background px-6 py-3 font-bold text-foreground">كل المعلمين <ArrowLeft size={17} /></Link></div><div className="grid gap-4 sm:grid-cols-3">{instructors.length === 0 ? <div className="sm:col-span-3 rounded-3xl bg-card/10 p-8 text-center text-background/70">لا توجد بيانات معلمين منشورة حاليًا</div> : instructors.slice(0, 3).map((teacher, index) => <Link key={teacher.instructor_id} to={`/instructors/${teacher.instructor_id}`} className={`teacher-card group overflow-hidden rounded-3xl bg-card text-foreground ${index === 1 ? "sm:translate-y-6" : ""}`}>{teacher.avatar_url ? <img src={teacher.avatar_url} alt={teacher.full_name ?? "معلم"} className="aspect-[4/3] w-full object-cover object-top" /> : <div className="grid aspect-[4/3] w-full place-items-center bg-primary-soft text-primary/40"><Users size={44} /></div>}<div className="p-4"><p className="text-xs font-bold text-primary">{teacher.subjects?.[0]?.name ?? "تعليم"}</p><h3 className="mt-1 font-extrabold">{teacher.full_name ?? "معلم"}</h3><p className="mt-3 flex items-center gap-1 text-xs text-muted-foreground"><Users size={13} />{teacher.courses_count} دورة</p></div></Link>)}</div></div></div></section>

    <section className="section-reveal px-4 py-14 sm:px-6 lg:px-8"><div className="mx-auto max-w-7xl"><div className="mb-8"><p className="section-kicker">مذاكرة بدون تشتت</p><h2 className="section-heading">ثلاث خطوات، وتكون على الطريق</h2></div><div className="grid gap-4 md:grid-cols-3">{[[CalendarDays, "رتّب أسبوعك", "نقسم هدفك إلى مهام يومية يمكن إنجازها."], [Play, "افهم الدرس", "شرح واضح، أمثلة عملية، وسرعة تناسبك."], [Check, "راجع تقدّمك", "اختبارات ومتابعة تساعدك تعرف خطوتك التالية."]].map(([Icon, title, text], index) => { const C = Icon as typeof CalendarDays; return <div key={title as string} className="rounded-3xl bg-muted p-6"><div className="flex items-center justify-between"><span className="grid size-12 place-items-center rounded-2xl bg-card text-primary shadow-subtle"><C size={22} /></span><b className="text-4xl text-primary/15">0{index + 1}</b></div><h3 className="mt-8 text-xl font-extrabold">{title as string}</h3><p className="mt-2 leading-7 text-muted-foreground">{text as string}</p></div>; })}</div></div></section>
    {books.length > 0 && <section className="section-reveal px-4 py-14 sm:px-6 lg:px-8"><div className="mx-auto max-w-7xl"><div className="mb-8 flex items-end justify-between"><div><p className="section-kicker">مكتبتك الخفيفة</p><h2 className="section-heading">مراجعة تمشي معك</h2></div><Link to="/books" className="hidden font-bold text-primary sm:block">كل الكتب</Link></div><div className="grid grid-cols-2 gap-5 md:grid-cols-4">{books.map((book) => <BookCard key={book.id} book={book} />)}</div></div></section>}
    <section className="px-4 py-14 sm:px-6 lg:px-8"><div className="cta-band mx-auto grid max-w-7xl items-center gap-7 overflow-hidden rounded-[2rem] bg-primary px-6 py-10 text-primary-foreground sm:px-10 md:grid-cols-[1fr_auto]"><div><p className="font-bold text-primary-foreground/70">جاهز تبدأ؟</p><h2 className="mt-2 text-3xl font-black sm:text-5xl">خلّي خطوتك الجاية محسوبة.</h2><p className="mt-4 text-primary-foreground/75">اختر مرحلتك، وسنرتب لك البداية.</p></div><Link to="/courses" className="inline-flex items-center justify-center gap-2 rounded-2xl bg-background px-7 py-4 font-bold text-foreground shadow-soft">ابدأ الآن <ArrowLeft size={18} /></Link></div></section>
  </main><Footer /></div>;
};

export default Index;