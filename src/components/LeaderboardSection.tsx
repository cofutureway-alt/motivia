import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Trophy, Medal, Crown, User, Award, ChevronLeft } from "lucide-react";
import { useScrollAnimation } from "@/hooks/use-scroll-animation";
import { IslamicDivider, EightPointStar } from "@/components/IslamicPatterns";
import { usePublicLeaderboardTop10 } from "@/hooks/useBadges";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

const RANK_CFG: Record<number, { icon: JSX.Element; border: string; bg: string; shadow: string; order: string; delay: string; badge: string; badgeBg: string; isFirst: boolean }> = {
  1: {
    icon: <Crown className="text-gold w-6 h-6 md:w-8 md:h-8" />,
    border: "border-gold/50",
    bg: "bg-gold/10",
    shadow: "shadow-[0_0_20px_-5px_hsl(var(--gold)/0.3)]",
    order: "order-2",
    delay: "200ms",
    badge: "الأول",
    badgeBg: "bg-gold text-foreground",
    isFirst: true,
  },
  2: {
    icon: <Medal className="text-silver w-5 h-5 md:w-7 md:h-7" />,
    border: "border-silver/50",
    bg: "bg-silver/10",
    shadow: "shadow-[0_0_15px_-5px_hsl(var(--silver)/0.3)]",
    order: "order-1",
    delay: "100ms",
    badge: "الثاني",
    badgeBg: "bg-silver text-foreground",
    isFirst: false,
  },
  3: {
    icon: <Medal className="text-bronze w-5 h-5 md:w-7 md:h-7" />,
    border: "border-bronze/50",
    bg: "bg-bronze/10",
    shadow: "shadow-[0_0_15px_-5px_hsl(var(--bronze)/0.3)]",
    order: "order-3",
    delay: "300ms",
    badge: "الثالث",
    badgeBg: "bg-bronze text-foreground",
    isFirst: false,
  },
};

const TopThreeCard = ({ row, rank, isVisible }: { row: any; rank: 1 | 2 | 3; isVisible: boolean }) => {
  const config = RANK_CFG[rank];
  const initials = (row.full_name || "؟").split(" ").filter(Boolean).slice(0, 2).map((s: string) => s[0]).join("").toUpperCase();
  return (
    <div
      className={`relative flex flex-col items-center gap-2 md:gap-4 p-3 md:p-6 rounded-2xl border-2 ${config.border} ${config.bg} ${config.shadow} ${config.order} transition-all duration-700 hover:-translate-y-2 hover:shadow-xl ${config.isFirst ? "md:scale-110 self-stretch" : "self-end"} ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-12"}`}
      style={{ transitionDelay: config.delay }}
    >
      <div className={`absolute -top-3 px-3 md:px-4 py-0.5 md:py-1 rounded-full text-[10px] md:text-xs font-bold ${config.badgeBg}`}>
        {config.badge}
      </div>
      <div className="relative mt-2">
        <div className={`w-14 h-14 md:w-20 md:h-20 rounded-full border-2 ${config.border} overflow-hidden`}>
          <Avatar className="w-full h-full">
            <AvatarImage src={row.avatar_url ?? undefined} />
            <AvatarFallback className="bg-primary/10 text-primary font-bold">{initials || <User className="w-5 h-5" />}</AvatarFallback>
          </Avatar>
        </div>
        <div className="absolute -bottom-1 -right-1">{config.icon}</div>
        <div className="absolute -top-1 -left-1 opacity-30">
          <EightPointStar size={12} className="text-primary" />
        </div>
      </div>
      <h3 className="text-xs md:text-base font-bold text-foreground text-center leading-tight line-clamp-1 max-w-full">
        {row.full_name || "بدون اسم"}
      </h3>
      <div className="flex items-baseline gap-1">
        <span className="text-base md:text-2xl font-extrabold text-primary tabular-nums">{row.total_points}</span>
        <span className="text-[9px] md:text-xs text-muted-foreground">نقطة</span>
      </div>
      {row.badge_count > 0 && (
        <div className="text-[10px] md:text-xs text-amber-600 inline-flex items-center gap-1 font-bold">
          <Award className="w-3 h-3" /> {row.badge_count}
        </div>
      )}
    </div>
  );
};

const LeaderboardSection = () => {
  const { ref, isVisible } = useScrollAnimation();
  const { data, isLoading } = usePublicLeaderboardTop10();
  const rows = (data ?? []) as any[];

  return (
    <section id="leaderboard" className="py-16 md:py-24 relative overflow-hidden">
      <EightPointStar size={50} className="absolute top-12 right-12 text-primary/5 animate-spin-slow" />
      <EightPointStar size={35} className="absolute bottom-12 left-12 text-primary/5 animate-spin-slow" style={{ animationDirection: "reverse" }} />

      <div className="container mx-auto px-4 max-w-4xl relative z-10" ref={ref}>
        <IslamicDivider className="mb-8" />
        <h2 className={`text-2xl md:text-4xl font-bold text-center mb-2 md:mb-4 transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
          لوحة المتصدرين
        </h2>
        <p className={`text-sm md:text-base text-muted-foreground text-center mb-8 md:mb-12 transition-all duration-700 delay-100 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
          أفضل الطلاب أداءً على المنصة
        </p>

        {isLoading ? (
          <>
            <div className="grid grid-cols-3 gap-2 md:gap-6 mb-6 md:mb-8">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-40 md:h-56 rounded-2xl" />)}
            </div>
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
            </div>
          </>
        ) : rows.length === 0 ? (
          <div className="text-center py-16 rounded-2xl border-2 border-dashed border-border/50">
            <Trophy className="w-12 h-12 mx-auto text-primary/30 mb-3" />
            <p className="text-muted-foreground">لا يوجد طلاب على المتصدرين حاليًا</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 md:gap-6 mb-6 md:mb-8 items-end px-2 md:px-0">
              {rows.slice(0, 3).map((r, i) => (
                <TopThreeCard key={r.student_id} row={r} rank={(i + 1) as 1 | 2 | 3} isVisible={isVisible} />
              ))}
            </div>

            <div className="space-y-3">
              {rows.slice(3).map((r, i) => {
                const initials = (r.full_name || "؟").split(" ").filter(Boolean).slice(0, 2).map((s: string) => s[0]).join("").toUpperCase();
                return (
                  <div
                    key={r.student_id}
                    className={`flex items-center gap-3 md:gap-4 p-3 md:p-4 rounded-xl border border-border transition-all duration-500 hover:shadow-md hover:border-primary/40 ${isVisible ? "opacity-100 translate-x-0" : "opacity-0 translate-x-8"}`}
                    style={{ transitionDelay: `${400 + i * 80}ms` }}
                  >
                    <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-secondary flex items-center justify-center font-bold text-xs md:text-sm shrink-0">
                      {r.rank}
                    </div>
                    <Avatar className="w-9 h-9 md:w-10 md:h-10 border border-border shrink-0">
                      <AvatarImage src={r.avatar_url ?? undefined} />
                      <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
                    </Avatar>
                    <span className="flex-1 font-semibold text-xs md:text-sm truncate">{r.full_name || "بدون اسم"}</span>
                    {r.badge_count > 0 && (
                      <span className="hidden sm:inline-flex items-center gap-1 text-xs text-amber-600 font-bold">
                        <Award className="w-3.5 h-3.5" /> {r.badge_count}
                      </span>
                    )}
                    <span className="text-xs md:text-sm font-bold text-primary tabular-nums">{r.total_points}</span>
                    <span className="text-[10px] md:text-xs text-muted-foreground">نقطة</span>
                  </div>
                );
              })}
            </div>

            <div className="mt-8 text-center">
              <Link to="/leaderboard">
                <Button variant="outline" className="gap-2">
                  عرض القائمة الكاملة
                  <ChevronLeft className="w-4 h-4" />
                </Button>
              </Link>
            </div>
          </>
        )}
      </div>
    </section>
  );
};

export default LeaderboardSection;
