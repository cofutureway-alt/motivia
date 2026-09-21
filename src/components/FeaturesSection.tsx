import { motion } from "framer-motion";
import {
  Video,
  ClipboardCheck,
  Users,
  BookOpen,
  Award,
  Clock,
  TrendingUp,
  ArrowLeft,
} from "lucide-react";
import { Link } from "react-router-dom";
import { IslamicDivider } from "@/components/IslamicPatterns";
import { Button } from "@/components/ui/button";

/**
 * Features — bento-style grid: one large hero card + supporting cards with
 * distinct sizes, stat highlights, and a CTA card. Replaces the old uniform
 * 6-card layout.
 */

const fadeUp = {
  hidden: { opacity: 0, y: 26 },
  show: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

const FeaturesSection = () => {
  return (
    <section id="features" className="py-20 md:py-28 relative overflow-hidden">
      <div className="container mx-auto px-4">
        {/* Header */}
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-60px" }}
          className="text-center max-w-2xl mx-auto mb-14 space-y-3"
        >
          <IslamicDivider className="mb-4" />
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-xs font-bold text-primary">
            ليه تتعلم معانا؟
          </span>
          <h2 className="text-3xl md:text-5xl font-black text-foreground leading-tight">
            طريقة تشرح الكيمياء
            <br />
            <span className="text-primary">من غير حفظ أعمى</span>
          </h2>
        </motion.div>

        {/* Bento grid */}
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4 md:gap-5 max-w-6xl mx-auto">
          {/* Large lead card */}
          <motion.div
            variants={fadeUp}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-60px" }}
            className="md:col-span-6 lg:col-span-4 md:row-span-2 group relative overflow-hidden rounded-3xl bg-card border border-border p-7 md:p-9 shadow-sm hover:border-primary/40 hover:shadow-xl hover:shadow-black/5 transition-all duration-300"
          >
            {/* Oversized watermark icon */}
            <Video
              className="absolute -bottom-8 -left-8 w-44 h-44 text-primary/[0.06] rotate-[-8deg] group-hover:rotate-0 group-hover:scale-110 transition-transform duration-500 pointer-events-none"
              strokeWidth={1}
            />
            <div className="relative z-10 flex flex-col h-full justify-between gap-6 min-h-[280px]">
              <div className="w-14 h-14 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center shadow-lg shadow-primary/25">
                <Video size={28} />
              </div>
              <div>
                <h3 className="text-2xl md:text-3xl font-extrabold text-foreground mb-3 leading-snug">
                  شرح مباشر تفاعلي يوصلك في بيتك
                </h3>
                <p className="text-muted-foreground leading-relaxed max-w-md">
                  حصص مباشرة مع مستر محمد إبراهيم تسأل فيها وتتفاعل لحظة بلحظة،
                  وكل حصة بتتسجل وتفضل متاحة لك ترجع لها في أي وقت.
                </p>
                <Link
                  to="/courses"
                  className="mt-5 inline-flex items-center gap-1.5 text-sm font-bold text-primary hover:gap-3 transition-all"
                >
                  شوف الحصص المتاحة
                  <ArrowLeft size={16} />
                </Link>
              </div>
            </div>
          </motion.div>

          {/* Stat card — exams */}
          <motion.div
            variants={fadeUp}
            custom={1}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-60px" }}
            className="md:col-span-3 lg:col-span-2 group rounded-3xl bg-card border border-border p-6 shadow-sm hover:border-primary/40 hover:shadow-lg transition-all duration-300 flex flex-col justify-between gap-4"
          >
            <div className="flex items-start justify-between">
              <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <ClipboardCheck size={24} />
              </div>
              <TrendingUp className="text-primary/40" size={20} />
            </div>
            <div>
              <p className="text-4xl font-black text-foreground tracking-tight">٥٠٠+</p>
              <p className="text-sm text-muted-foreground mt-1">سؤال واختبار تدريبي على كل درس</p>
            </div>
          </motion.div>

          {/* Follow-up card (accent solid) */}
          <motion.div
            variants={fadeUp}
            custom={2}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-60px" }}
            className="md:col-span-3 lg:col-span-2 group rounded-3xl bg-primary text-primary-foreground p-6 shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all duration-300 flex flex-col justify-between gap-4"
          >
            <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center">
              <Users size={24} />
            </div>
            <div>
              <p className="text-lg font-extrabold">متابعة فردية مش جماعية</p>
              <p className="text-sm text-primary-foreground/80 mt-1">
                مسترك بيتابع تقدمك بنفسه ويحل معاك نقاط ضعفك واحدة واحدة.
              </p>
            </div>
          </motion.div>

          {/* Curriculum card */}
          <motion.div
            variants={fadeUp}
            custom={3}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-60px" }}
            className="lg:col-span-2 group rounded-3xl bg-card border border-border p-6 shadow-sm hover:border-primary/40 hover:shadow-lg transition-all duration-300 flex flex-col justify-between gap-4"
          >
            <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <BookOpen size={24} />
            </div>
            <div>
              <p className="font-extrabold text-foreground">المنهج كامل مرتب</p>
              <p className="text-sm text-muted-foreground mt-1">
                من الأساسيات للمراجعة النهائية — مفيش حاجة هتفوتك.
              </p>
            </div>
          </motion.div>

          {/* Certificate card */}
          <motion.div
            variants={fadeUp}
            custom={4}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-60px" }}
            className="lg:col-span-2 group rounded-3xl bg-card border border-border p-6 shadow-sm hover:border-primary/40 hover:shadow-lg transition-all duration-300 flex flex-col justify-between gap-4"
          >
            <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <Award size={24} />
            </div>
            <div>
              <p className="font-extrabold text-foreground">شهادات ومستويات</p>
              <p className="text-sm text-muted-foreground mt-1">
                اجتاز كل مستوى وخد شهادة إتمام موثقة على المنصة.
              </p>
            </div>
          </motion.div>

          {/* Anytime card + CTA */}
          <motion.div
            variants={fadeUp}
            custom={5}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-60px" }}
            className="md:col-span-3 lg:col-span-2 group relative overflow-hidden rounded-3xl bg-secondary border border-border/70 p-6 shadow-sm hover:border-primary/40 transition-all duration-300 flex flex-col justify-between gap-4"
          >
            <Clock
              className="absolute -top-4 -right-4 w-24 h-24 text-primary/[0.07] rotate-12 pointer-events-none"
              strokeWidth={1.2}
            />
            <div className="relative z-10">
              <div className="w-12 h-12 rounded-xl bg-background text-primary flex items-center justify-center border border-border">
                <Clock size={24} />
              </div>
            </div>
            <div className="relative z-10">
              <p className="font-extrabold text-foreground">في وقتك.. من غير ضغط</p>
              <p className="text-sm text-muted-foreground mt-1 mb-4">
                كل المحتوى مسجل ومتاح ٢٤ ساعة — تراجع قبل الامتحان براحتك.
              </p>
              <Button asChild variant="outline" size="sm" className="bg-background font-bold">
                <Link to="/signup">ابدأ دلوقتي مجانًا</Link>
              </Button>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default FeaturesSection;
