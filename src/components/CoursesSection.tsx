import { Link } from "react-router-dom";
import { ArrowLeft, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useScrollAnimation } from "@/hooks/use-scroll-animation";
import { IslamicDivider, EightPointStar } from "@/components/IslamicPatterns";
import { usePublicCourses } from "@/hooks/use-public-courses";
import { useMyProgressMap } from "@/hooks/use-my-progress";
import { CourseCard } from "@/components/CourseCard";

const CoursesSection = () => {
  const { ref, isVisible } = useScrollAnimation();
  const courses = usePublicCourses(6);
  const progressMap = useMyProgressMap();

  return (
    <section id="courses" className="py-24 relative overflow-hidden">
      <div
        className="absolute inset-0 opacity-[0.02] dark:opacity-[0.04]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 80 80' fill='none'%3E%3Cg stroke='%23000' stroke-width='0.4'%3E%3Cpolygon points='40,10 55,17 60,33 55,48 40,55 25,48 20,33 25,17'/%3E%3C/g%3E%3C/svg%3E")`,
          backgroundRepeat: "repeat",
        }}
      />

      <EightPointStar size={70} className="absolute top-12 left-12 text-primary/5 animate-spin-slow" />
      <EightPointStar size={50} className="absolute bottom-12 right-12 text-primary/5 animate-spin-slow" style={{ animationDirection: "reverse" }} />
      <EightPointStar size={30} className="absolute top-1/3 right-[5%] text-primary/5 animate-float" />

      <div className="container mx-auto px-4 relative z-10" ref={ref}>
        <IslamicDivider className="mb-8" />

        <h2 className={`text-3xl md:text-4xl font-bold text-center mb-4 transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
          الدورات المتاحة
        </h2>
        <p className={`text-muted-foreground text-center mb-16 max-w-lg mx-auto transition-all duration-700 delay-100 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
          رحلة علمية شاملة في مختلف العلوم مع أفضل المعلمين
        </p>

        {courses === null ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-border overflow-hidden">
                <Skeleton className="h-44 w-full" />
                <div className="p-5 space-y-3">
                  <Skeleton className="h-5 w-2/3" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-4/5" />
                </div>
              </div>
            ))}
          </div>
        ) : courses.length === 0 ? (
          <div className="max-w-md mx-auto text-center rounded-2xl border-2 border-dashed border-border p-12">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-4">
              <BookOpen className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-xl font-bold mb-2">قريبًا</h3>
            <p className="text-muted-foreground">
              يتم حاليًا إعداد الدورات. تابعنا للاطلاع على الجديد.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {courses.map((c, i) => (
              <CourseCard key={c.id} course={c} index={i} progress={progressMap[c.id]} />
            ))}
          </div>
        )}

        <div className={`text-center mt-12 transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`} style={{ transitionDelay: "600ms" }}>
          <Button asChild size="lg" variant="outline" className="gap-2 font-bold hover:scale-105 transition-transform">
            <Link to="/courses">
              عرض جميع الدورات
              <ArrowLeft size={18} />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
};

export default CoursesSection;
