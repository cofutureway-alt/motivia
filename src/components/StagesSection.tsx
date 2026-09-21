import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { GraduationCap, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useScrollAnimation } from "@/hooks/use-scroll-animation";
import { useSignedThumbnail } from "@/hooks/use-signed-thumbnail";
import { EightPointStar, IslamicDivider } from "@/components/IslamicPatterns";
import { Skeleton } from "@/components/ui/skeleton";

interface Stage {
  id: string;
  name: string;
  description: string | null;
  thumbnail_url: string | null;
}

const StagesSection = () => {
  const navigate = useNavigate();
  const { ref, isVisible } = useScrollAnimation();
  const [stages, setStages] = useState<Stage[] | null>(null);

  useEffect(() => {
    (supabase as any)
      .from("stages")
      .select("id, name, description, thumbnail_url")
      .order("name")
      .then(({ data }: any) => setStages((data ?? []) as Stage[]));
  }, []);

  if (stages !== null && stages.length === 0) return null;

  return (
    <section id="stages" className="py-24 relative overflow-hidden">
      <EightPointStar size={70} className="absolute top-10 left-10 text-primary/5 animate-spin-slow" />
      <EightPointStar size={50} className="absolute bottom-10 right-10 text-primary/5 animate-float" />

      <div className="container mx-auto px-4 relative z-10" ref={ref}>
        <IslamicDivider className="mb-8" />
        <div
          className={`flex items-center justify-center gap-2 mb-3 transition-all duration-700 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          }`}
        >
          <GraduationCap className="w-5 h-5 text-primary animate-bounce-soft" />
          <span className="text-sm font-bold text-primary uppercase tracking-wider">اختر مرحلتك</span>
        </div>
        <h2
          className={`text-3xl md:text-4xl font-bold text-center mb-4 transition-all duration-700 delay-75 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          المراحل الدراسية
        </h2>
        <p
          className={`text-muted-foreground text-center mb-14 max-w-lg mx-auto transition-all duration-700 delay-100 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          اختر صفك الدراسي وابدأ رحلتك نحو الدرجة النهائية في الكيمياء
        </p>

        {stages === null ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-72 rounded-2xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {stages.map((s, i) => (
              <StageCard
                key={s.id}
                stage={s}
                index={i}
                isVisible={isVisible}
                onSelect={() => navigate(`/courses?stage=${s.id}`)}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

interface StageCardProps {
  stage: Stage;
  index: number;
  isVisible: boolean;
  onSelect: () => void;
}

const StageCard = ({ stage, index, isVisible, onSelect }: StageCardProps) => {
  const signed = useSignedThumbnail(stage.thumbnail_url);
  const [errored, setErrored] = useState(false);
  const showImage = !!signed && !errored;

  return (
    <motion.button
      initial={{ opacity: 0, y: 24 }}
      animate={isVisible ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, delay: 0.1 + index * 0.07 }}
      whileHover={{ y: -6 }}
      whileTap={{ scale: 0.98 }}
      onClick={onSelect}
      className="group relative w-full text-right rounded-2xl border border-border/70 bg-card overflow-hidden transition-all duration-300 hover:border-primary/50 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-primary/50 flex flex-col"
    >
      {/* Image Banner */}
      <div className="relative h-48 sm:h-52 w-full overflow-hidden bg-muted">
        {showImage ? (
          <img
            src={signed!}
            alt={stage.name}
            loading="lazy"
            onError={() => setErrored(true)}
            className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-primary/5">
            <GraduationCap className="w-16 h-16 text-primary/30" />
          </div>
        )}

        {/* Solid bottom edge accent */}
        <div className="absolute inset-x-0 bottom-0 h-1 bg-primary/60 pointer-events-none" />

        <EightPointStar
          size={20}
          className="absolute top-3 left-3 text-primary-foreground/60 opacity-60 drop-shadow"
        />
      </div>

      {/* Card Content & Action */}
      <div className="p-4 pt-1 flex flex-col flex-1 justify-between gap-3">
        <div>
          <h3 className="text-base sm:text-lg font-bold text-foreground group-hover:text-primary transition-colors line-clamp-1">
            {stage.name}
          </h3>
          {stage.description && (
            <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
              {stage.description}
            </p>
          )}
        </div>

        <div className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-secondary group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-300 text-xs font-semibold">
          <span>استعرض الكورسات</span>
          <ArrowLeft
            size={16}
            className="transition-transform duration-300 group-hover:-translate-x-1.5"
          />
        </div>
      </div>
    </motion.button>
  );
};

export default StagesSection;
