import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  BarChart3, BookOpen, Users, Wallet, BadgeDollarSign, Landmark, Trophy,
  ClipboardCheck, ClipboardEdit,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import {
  fetchInstructorOverview, listInstructorTopStudents, listMyBooks, listMyBundles, listMyCourses,
  formatEGP, type MyBookRow, type MyBundleRow, type MyCourseRow,
} from "@/lib/instructor-api";

export default function InstructorOverview() {
  const [stats, setStats] = useState<any>(null);
  const [top, setTop] = useState<{ user_id: string; full_name: string; avatar_url: string | null; total_points: number }[]>([]);
  const [courses, setCourses] = useState<MyCourseRow[]>([]);
  const [bundles, setBundles] = useState<MyBundleRow[]>([]);
  const [books, setBooks] = useState<MyBookRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchInstructorOverview(),
      listInstructorTopStudents(5).catch(() => []),
      listMyCourses().catch(() => []),
      listMyBundles().catch(() => []),
      listMyBooks().catch(() => []),
    ])
      .then(([o, t, c, b, k]) => {
        if (cancelled) return;
        setStats(o);
        setTop(t as any);
        setCourses(c);
        setBundles(b);
        setBooks(k);
      })
      .catch((e) => toast.error(e?.message || "تعذّر تحميل البيانات"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);
  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4" dir="rtl">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
    );
  }

  const cards = [
    { label: "كورساتي", value: stats?.courses_count ?? 0, icon: BookOpen, to: "/instructor/courses", color: "text-blue-600 bg-blue-500/10" },
    { label: "الباقات", value: stats?.bundles_count ?? 0, icon: BadgeDollarSign, to: "/instructor/bundles", color: "text-violet-600 bg-violet-500/10" },
    { label: "كتبى", value: stats?.books_count ?? 0, icon: BookOpen, to: "/instructor/books", color: "text-amber-600 bg-amber-500/10" },
    { label: "تسجيلات الطلاب", value: stats?.enrollments_count ?? 0, icon: Users, to: "/instructor/students", color: "text-emerald-600 bg-emerald-500/10" },
    { label: "أرباح معلّقة", value: formatEGP(stats?.earnings_pending_piastres), icon: Wallet, to: "/instructor/earnings", color: "text-orange-600 bg-orange-500/10" },
    { label: "رصيد متاح للسحب", value: formatEGP(stats?.earnings_available_piastres), icon: Wallet, to: "/instructor/withdrawals", color: "text-green-600 bg-green-500/10" },
    { label: "مسحوبات", value: formatEGP(stats?.earnings_withdrawn_piastres), icon: Landmark, to: "/instructor/withdrawals", color: "text-slate-600 bg-slate-500/10" },
    { label: "طلبات سحب قيد المراجعة", value: stats?.pending_withdrawals_count ?? 0, icon: Landmark, to: "/instructor/withdrawals", color: "text-rose-600 bg-rose-500/10" },
    { label: "اختباراتي", value: stats?.quizzes_count ?? 0, icon: ClipboardCheck, to: "/instructor/quiz-attempts", color: "text-cyan-600 bg-cyan-500/10" },
    { label: "واجباتي", value: stats?.assignments_count ?? 0, icon: ClipboardEdit, to: "/instructor/assignment-submissions", color: "text-indigo-600 bg-indigo-500/10" },
    { label: "مبيعات الكتب", value: stats?.book_sales_count ?? 0, icon: BookOpen, to: "/instructor/earnings", color: "text-teal-600 bg-teal-500/10" },
    { label: "إجمالي المحتوى", value: courses.length + bundles.length + books.length, icon: BarChart3, to: "/instructor/courses", color: "text-primary bg-primary/10" },
  ];
  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">نظرة عامة</h1>
        <p className="text-muted-foreground text-sm mt-1">ملخص أدائك وأرباحك ومحتواك التعليمي</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Link key={c.label} to={c.to}>
            <Card className="hover:border-primary/40 hover:shadow-md transition-all h-full">
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${c.color}`}>
                  <c.icon className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs text-muted-foreground">{c.label}</div>
                  <div className="text-lg font-bold truncate">{c.value}</div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Trophy className="w-4 h-4 text-amber-500" />
              أفضل طلابك (نقاط المتصدرين)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {top.length === 0 ? (
              <div className="text-sm text-muted-foreground py-4 text-center">لا يوجد طلاب بعد</div>
            ) : (
              top.map((s, i) => (
                <div key={s.user_id} className="flex items-center gap-3 rounded-xl border border-border/60 p-2.5">
                  <span className="w-6 text-center font-bold text-muted-foreground">{i + 1}</span>
                  <Avatar className="w-8 h-8">
                    <AvatarImage src={s.avatar_url ?? undefined} />
                    <AvatarFallback className="bg-primary/10 text-primary text-xs">
                      {s.full_name?.[0] ?? "ط"}
                    </AvatarFallback>
                  </Avatar>
                  <span className="flex-1 text-sm font-medium truncate">{s.full_name}</span>
                  <span className="text-sm font-bold text-amber-600">{s.total_points}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BookOpen className="w-4 h-4 text-primary" />
              أحدث محتواك
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {[
              ...courses.slice(0, 4).map((c) => ({ id: c.id, title: c.title, kind: "كورس", to: "/instructor/courses" })),
              ...bundles.slice(0, 3).map((b) => ({ id: b.id, title: b.title, kind: "باقة", to: "/instructor/bundles" })),
              ...books.slice(0, 3).map((b) => ({ id: b.id, title: b.title, kind: "كتاب", to: "/instructor/books" })),
            ]
              .slice(0, 8)
              .map((r) => (
                <Link
                  key={`${r.kind}-${r.id}`}
                  to={r.to}
                  className="flex items-center justify-between rounded-xl border border-border/60 p-2.5 hover:border-primary/40 transition-colors"
                >
                  <span className="text-sm font-medium truncate">{r.title}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{r.kind}</span>
                </Link>
              ))}
            {courses.length + bundles.length + books.length === 0 && (
              <div className="text-sm text-muted-foreground py-4 text-center">لم تنشئ أي محتوى بعد</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}