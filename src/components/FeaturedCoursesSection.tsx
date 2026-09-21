import { Link } from "react-router-dom";
import { ArrowLeft, Sparkles, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useScrollAnimation } from "@/hooks/use-scroll-animation";
import { EightPointStar, IslamicDivider } from "@/components/IslamicPatterns";
import { usePublicCourses } from "@/hooks/use-public-courses";
import { useMyProgressMap } from "@/hooks/use-my-progress";
import { CourseCard } from "@/components/CourseCard";

const FeaturedCoursesSection = () => {
  const { ref, isVisible } = useScrollAnimation();
  const courses = usePublicCourses(6, { featuredOnly: true });
  const progressMap = useMyProgressMap();

  if (courses === null) return null;
  if (courses.length === 0) return null;

  return (
    <section id="featured-courses" className="py-24 relative overflow-hidden bg-accent/10">
      <EightPointStar size={70} className="absolute top-12 right-12 text-primary/5 animate-spin-slow" />
      <EightPointStar size={50} className="absolute bottom-12 left-12 text-primary/5 animate-float" />

      <div className="container mx-auto px-4 relative z-10" ref={ref}>
        <IslamicDivider className="mb-8" />

        {/* Header row */}
        <div
          className={`flex flex-col items-center gap-3 mb-4 transition-all duration-700 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          }`}
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20">
            <Star className="w-4 h-4 text-primary animate-pulse-soft" fill="currentColor" />
            <span className="text-xs font-bold text-primary">مختارة بعناية لك</span>
            <Sparkles className="w-4 h-4 text-primary animate-float" />
          </div>
        </div>

        <h2
          className={`text-3xl md:text-5xl font-extrabold text-center mb-3 transition-all duration-700 delay-75 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          الدورات المميزة
        </h2>
        <p
          className={`text-muted-foreground text-center mb-14 max-w-xl mx-auto transition-all duration-700 delay-100 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          نخبة من أفضل الدورات على المنصة، اخترناها لتناسب رحلتك التعليمية وتساعدك على التميّز
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {courses.map((c, i) => (
            <CourseCard key={c.id} course={c} index={i} progress={progressMap[c.id]} />
          ))}
        </div>

        <div className="text-center mt-12">
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

export default FeaturedCoursesSection;
