import { useCountUp } from "@/hooks/use-count-up";
import { BookOpen, Users, ClipboardCheck, GraduationCap } from "lucide-react";
import { IslamicDivider as ChemDivider } from "@/components/IslamicPatterns";

const stats = [
  { icon: Users, label: "طالب مسجل", value: 1250 },
  { icon: BookOpen, label: "درس متاح", value: 340 },
  { icon: ClipboardCheck, label: "اختبار مكتمل", value: 5600 },
  { icon: GraduationCap, label: "شهادة صادرة", value: 890 },
];

const StatItem = ({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: number }) => {
  const { ref, count } = useCountUp(value);
  return (
    <div ref={ref} className="flex flex-col items-center gap-3 p-6 relative">
      <div className="w-14 h-14 rounded-2xl bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center relative z-10">
        <Icon size={28} className="text-primary" />
      </div>
      <span className="text-3xl md:text-4xl font-extrabold text-foreground">{count.toLocaleString("ar-EG")}</span>
      <span className="text-sm text-muted-foreground font-medium">{label}</span>
    </div>
  );
};

const StatsSection = () => {
  return (
    <section id="stats" className="py-24 relative overflow-hidden">
      {/* Molecule grid backdrop */}
      <div className="absolute inset-0 chem-hex-grid opacity-[0.03] dark:opacity-[0.05]" />

      <div className="container mx-auto px-4 relative z-10">
        <ChemDivider className="mb-8" />
        <h2 className="text-3xl md:text-4xl font-bold text-center mb-16">
          إحصائيات <span className="text-primary">المنصة</span>
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((s) => (
            <StatItem key={s.label} {...s} />
          ))}
        </div>
      </div>
    </section>
  );
};

export default StatsSection;
