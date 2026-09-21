import { motion } from "framer-motion";
import { Crown, Medal, Trophy, User, Award, Loader2, Sparkles } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { usePublicLeaderboardTop10 } from "@/hooks/useBadges";

export default function LeaderboardPage() {
  const { data, isLoading } = usePublicLeaderboardTop10();
  const rows = (data ?? []) as any[];

  const top3 = rows.slice(0, 3);
  const rest = rows.slice(3, 10);

  return (
    <div className="min-h-screen bg-background flex flex-col" dir="rtl">
      <Navbar />
      <main className="flex-1 pt-24 pb-16">
        <div className="container mx-auto px-4">
          {/* Hero */}
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-12"
          >
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-600 text-xs font-bold mb-4">
              <Sparkles className="w-3.5 h-3.5" />
              أوائل المنصة
            </div>
            <h1 className="text-4xl md:text-6xl font-black">المتصدرون</h1>
            <p className="text-muted-foreground mt-3 max-w-xl mx-auto">
              أفضل عشرة طلاب على المنصة، مصنّفون بناءً على النقاط المكتسبة من إكمال الدروس والاختبارات والواجبات.
            </p>
          </motion.div>

          {isLoading ? (
            <div className="flex justify-center py-24"><Loader2 className="w-8 h-8 animate-spin text-amber-500" /></div>
          ) : rows.length === 0 ? (
            <Card className="p-14 text-center max-w-lg mx-auto">
              <Trophy className="w-14 h-14 text-amber-500/50 mx-auto mb-3" />
              <h2 className="font-bold text-lg">لا يوجد طلاب على المتصدرين حاليًا</h2>
              <p className="text-sm text-muted-foreground mt-2">كن أول من يبدأ التعلم!</p>
            </Card>
          ) : (
            <>
              {/* Podium — mobile stacked, desktop 3 columns */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 max-w-5xl mx-auto items-end mb-12">
                {top3.length >= 3 && <PodiumSlot rank={3} row={top3[2]} delay={0} />}
                {top3.length >= 2 && <PodiumSlot rank={2} row={top3[1]} delay={0.15} />}
                {top3.length >= 1 && <PodiumSlot rank={1} row={top3[0]} delay={0.3} />}
              </div>

              {/* Ranks 4-10 */}
              {rest.length > 0 && (
                <div className="max-w-3xl mx-auto space-y-2">
                  {rest.map((r, i) => (
                    <motion.div
                      key={r.student_id}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.5 + i * 0.05 }}
                    >
                      <Card className="p-4 flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center font-black text-lg">
                          {r.rank}
                        </div>
                        <Avatar className="w-11 h-11 border-2 border-border">
                          <AvatarImage src={r.avatar_url ?? undefined} />
                          <AvatarFallback><User className="w-4 h-4" /></AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="font-bold truncate">{r.full_name || "بدون اسم"}</div>
                          <div className="text-xs text-muted-foreground flex items-center gap-3 mt-0.5">
                            {r.level_name && (
                              <span className="inline-flex items-center gap-1">
                                {r.level_icon_url && <img src={r.level_icon_url} className="w-3.5 h-3.5" alt="" />}
                                {r.level_name}
                              </span>
                            )}
                            <span className="inline-flex items-center gap-1 text-amber-600">
                              <Award className="w-3.5 h-3.5" /> {r.badge_count}
                            </span>
                          </div>
                        </div>
                        <div className="text-left">
                          <div className="font-black text-lg text-indigo-500">{r.total_points}</div>
                          <div className="text-[10px] text-muted-foreground">نقطة</div>
                        </div>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}

function PodiumSlot({ rank, row, delay }: { rank: 1 | 2 | 3; row: any; delay: number }) {
  const cfg = rank === 1
    ? { color: "amber", label: "الأول", tone: "text-amber-500", bg: "bg-amber-500/10", border: "border-amber-500/60", ring: "shadow-[0_0_50px_hsl(45_95%_55%/0.35)]", height: "md:min-h-[340px]", Icon: Crown, size: "w-24 h-24 md:w-28 md:h-28", order: "md:order-2" }
    : rank === 2
    ? { color: "slate", label: "الثاني", tone: "text-slate-400", bg: "bg-slate-400/10", border: "border-slate-400/60", ring: "shadow-[0_0_35px_hsl(215_20%_75%/0.3)]", height: "md:min-h-[290px]", Icon: Medal, size: "w-20 h-20 md:w-24 md:h-24", order: "md:order-3" }
    : { color: "amber", label: "الثالث", tone: "text-amber-700", bg: "bg-amber-700/10", border: "border-amber-700/60", ring: "shadow-[0_0_30px_hsl(30_60%_45%/0.3)]", height: "md:min-h-[260px]", Icon: Medal, size: "w-20 h-20 md:w-24 md:h-24", order: "md:order-1" };

  return (
    <motion.div
      initial={{ opacity: 0, y: 60 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, type: "spring", stiffness: 90, damping: 14 }}
      className={cfg.order}
    >
      <Card className={`p-6 text-center border-2 ${cfg.border} ${cfg.bg} ${cfg.ring} ${cfg.height} h-full flex flex-col items-center justify-end`}>
        <cfg.Icon className={`${cfg.tone} w-8 h-8 mx-auto`} />
        <div className={`text-xs font-black uppercase tracking-wider mt-1 ${cfg.tone}`}>{cfg.label}</div>
        <div className="mt-4">
          <Avatar className={`${cfg.size} border-4 ${cfg.border} mx-auto`}>
            <AvatarImage src={row.avatar_url ?? undefined} />
            <AvatarFallback><User className="w-8 h-8" /></AvatarFallback>
          </Avatar>
        </div>
        <div className="font-black text-lg mt-3 truncate max-w-full">{row.full_name || "بدون اسم"}</div>
        {row.level_name && (
          <div className="mt-1 text-xs text-muted-foreground inline-flex items-center gap-1">
            {row.level_icon_url && <img src={row.level_icon_url} className="w-4 h-4" alt="" />}
            {row.level_name}
          </div>
        )}
        <div className={`mt-3 text-3xl font-black ${cfg.tone}`}>{row.total_points}</div>
        <div className="text-[11px] text-muted-foreground">نقطة</div>
        <div className="mt-2 inline-flex items-center gap-1 text-xs text-amber-600 font-bold">
          <Award className="w-3.5 h-3.5" /> {row.badge_count} شارة
        </div>
      </Card>
    </motion.div>
  );
}
