import { Link } from "react-router-dom";
import { ArrowLeft, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useScrollAnimation } from "@/hooks/use-scroll-animation";
import { EightPointStar, IslamicDivider } from "@/components/IslamicPatterns";
import { usePublicBundles } from "@/hooks/use-public-bundles";
import { BundleCard } from "@/components/BundleCard";

const BundlesSection = () => {
  const { ref, isVisible } = useScrollAnimation();
  const bundles = usePublicBundles(6);

  if (bundles === null) return null;
  if (bundles.length === 0) return null;

  return (
    <section id="bundles" className="py-24 relative overflow-hidden">
      <EightPointStar size={70} className="absolute top-12 left-12 text-primary/5 animate-spin-slow" />
      <EightPointStar size={50} className="absolute bottom-12 right-12 text-primary/5 animate-float" />

      <div className="container mx-auto px-4 relative z-10" ref={ref}>
        <IslamicDivider className="mb-8" />
        <div
          className={`flex items-center justify-center gap-2 mb-3 transition-all duration-700 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          }`}
        >
          <Package className="w-5 h-5 text-primary" />
          <span className="text-sm font-bold text-primary uppercase tracking-wider">عروض الحزم</span>
        </div>
        <h2
          className={`text-3xl md:text-4xl font-bold text-center mb-4 transition-all duration-700 delay-75 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          حزم الدورات
        </h2>
        <p
          className={`text-muted-foreground text-center mb-16 max-w-lg mx-auto transition-all duration-700 delay-100 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          احصل على عدة دورات معًا بسعر أفضل
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {bundles.map((b, i) => (
            <BundleCard key={b.id} bundle={b} index={i} />
          ))}
        </div>

        <div className="text-center mt-12">
          <Button asChild size="lg" variant="outline" className="gap-2 font-bold hover:scale-105 transition-transform">
            <Link to="/bundles">
              عرض جميع الحزم
              <ArrowLeft size={18} />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
};

export default BundlesSection;
