import { Link } from "react-router-dom";
import { ArrowLeft, Sparkles } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { DEFAULT_PLATFORM_SETTINGS, usePlatformSettings } from "@/hooks/use-platform-settings";

export default function HeroSection() {
  const prefersReduced = useReducedMotion();
  const { settings } = usePlatformSettings();
  const headline = settings.hero_headline ?? DEFAULT_PLATFORM_SETTINGS.hero_headline ?? "تعلّم بطريقتك\nوتقدّم كل يوم";
  const [lineOne = "تعلّم بطريقتك", lineTwo = "وتقدّم كل يوم"] = headline.split("\n");
  const subtext = settings.hero_subtext ?? DEFAULT_PLATFORM_SETTINGS.hero_subtext ?? "";
  const ctaLabel = settings.hero_cta_label ?? DEFAULT_PLATFORM_SETTINGS.hero_cta_label ?? "ابدأ التعلّم";
  const ctaUrl = settings.hero_cta_url ?? DEFAULT_PLATFORM_SETTINGS.hero_cta_url ?? "/courses";

  return (
    <section className="hero-surface overflow-hidden px-4 pb-12 pt-7 sm:px-6 lg:px-8 lg:pb-20 lg:pt-10">
      <div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-[.95fr_1.05fr]">
        <motion.div
          initial={{ opacity: 0, y: prefersReduced ? 0 : 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="hero-copy py-5 lg:py-12"
        >
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-primary-soft px-4 py-2 text-sm font-bold text-primary">
            <Sparkles size={16} /> كل طريق للتفوق يبدأ بخطوة
          </div>
          <h1 className="max-w-2xl text-4xl font-black leading-[1.35] sm:text-6xl lg:text-7xl">
            <span className="block">{lineOne}</span>
            <span className="mt-3 block text-primary sm:mt-4">{lineTwo}</span>
          </h1>
          <p className="mt-6 max-w-xl text-base leading-8 text-muted-foreground sm:text-lg">{subtext}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg" className="min-h-[3.25rem] rounded-2xl px-7 py-3.5 font-bold shadow-soft">
              <Link to={ctaUrl}>{ctaLabel}<ArrowLeft size={18} /></Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="min-h-[3.25rem] rounded-2xl bg-card px-7 py-3.5 font-bold shadow-subtle">
              <Link to="/instructors">تعرّف على المعلمين</Link>
            </Button>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: prefersReduced ? 0 : 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.12 }}
          className="relative min-h-[330px] rounded-[2rem] bg-primary-soft p-5 sm:min-h-[420px] sm:p-8"
        >
          <div className="absolute inset-x-5 top-8 rounded-[2rem] bg-card p-5 shadow-float sm:inset-x-12 sm:top-12 sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold text-primary">مسارك الدراسي</p>
                <h2 className="mt-2 text-2xl font-black sm:text-3xl">كل ما تحتاجه في مكان واحد</h2>
              </div>
              <span className="grid size-12 place-items-center rounded-2xl bg-secondary-soft text-2xl font-black text-primary">✦</span>
            </div>
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {["كورسات منظمة", "معلمون موثوقون", "كتب ومراجعات"].map((label, index) => (
                <div key={label} className="rounded-2xl bg-muted p-4">
                  <span className="text-3xl font-black text-primary/20">0{index + 1}</span>
                  <p className="mt-3 text-sm font-bold">{label}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="absolute bottom-6 left-6 right-6 rounded-2xl bg-card p-3 shadow-float sm:left-10 sm:right-auto sm:w-72">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-primary-soft text-primary"><Sparkles size={18} /></span>
              <div><p className="text-sm font-bold">ابدأ من مرحلتك</p><p className="text-xs text-muted-foreground">واختر المحتوى المناسب لك</p></div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}