import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Trophy, Layers, Award, Lock, ChevronLeft, TrendingUp } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  useMyRank, useMyPointsTotal, useMyCurrentLevel, useMyNextLevel, useMyEarnedBadges,
} from "@/hooks/useBadges";
import { useBadges } from "@/hooks/useBadges";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function AchievementsWidgets() {
  const { user } = useAuth();
  const uid = user?.id;
  const { data: rank } = useMyRank(uid);
  const { data: points } = useMyPointsTotal(uid);
  const { data: currentLevel } = useMyCurrentLevel(uid);
  const { data: nextLevel } = useMyNextLevel(uid);
  const { data: earned } = useMyEarnedBadges(uid);
  const { data: allBadges } = useBadges();

  const activeBadges = (allBadges ?? []).filter((b) => b.is_active);
  const earnedIds = new Set((earned ?? []).map((b) => b.badge_id));
  const lockedBadges = activeBadges.filter((b) => !earnedIds.has(b.id));
  const last5Earned = (earned ?? []).slice(0, 5);

  // Level progress
  const min = currentLevel?.min_points ?? 0;
  const max = nextLevel?.min_points ?? null;
  const total = points ?? 0;
  const pct = max
    ? Math.min(100, Math.max(0, Math.round(((total - min) / Math.max(1, max - min)) * 100)))
    : 100;
  const remaining = max ? Math.max(0, max - total) : 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Rank */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="p-5 h-full border-amber-500/30 bg-gradient-to-br from-amber-500/5 to-transparent">
          <div className="flex items-start justify-between">
            <div className="w-11 h-11 rounded-2xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center">
              <Trophy className="w-5 h-5 text-amber-500" />
            </div>
            <Link to="/leaderboard" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
              المتصدرين <ChevronLeft className="w-3 h-3" />
            </Link>
          </div>
          <div className="mt-3">
            <div className="text-xs text-muted-foreground">ترتيبك</div>
            {rank === undefined ? (
              <Skeleton className="h-8 w-20 mt-1" />
            ) : rank?.rank ? (
              <div className="text-3xl font-black text-amber-600">#{rank.rank}</div>
            ) : (
              <div className="text-lg font-bold text-muted-foreground">غير مصنّف</div>
            )}
            <div className="text-xs text-muted-foreground mt-1">
              من إجمالي {rank?.total_students ?? 0} طالب · {total} نقطة
            </div>
          </div>
        </Card>
      </motion.div>

      {/* Level progress */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <Card className="p-5 h-full border-indigo-500/30 bg-gradient-to-br from-indigo-500/5 to-transparent">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <div className="w-11 h-11 rounded-2xl bg-indigo-500/15 border border-indigo-500/40 flex items-center justify-center overflow-hidden">
                {currentLevel?.icon_url ? (
                  <img src={currentLevel.icon_url} alt="" className="w-full h-full object-contain" />
                ) : (
                  <Layers className="w-5 h-5 text-indigo-500" />
                )}
              </div>
              <div>
                <div className="text-xs text-muted-foreground">المستوى الحالي</div>
                <div className="font-bold">{currentLevel?.name ?? "بدون مستوى"}</div>
              </div>
            </div>
            <Link to="/dashboard/levels" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
              تفاصيل <ChevronLeft className="w-3 h-3" />
            </Link>
          </div>
          <div className="mt-4">
            <div className="h-2 rounded-full bg-accent overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.9, ease: "easeOut" }}
                className="h-full bg-indigo-500"
              />
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              {nextLevel
                ? <>متبقي <span className="font-bold text-foreground">{remaining}</span> نقطة للوصول إلى <span className="font-bold text-foreground">{nextLevel.name}</span></>
                : "أعلى مستوى — لا يوجد مستوى بعده"}
            </div>
          </div>
        </Card>
      </motion.div>

      {/* Badges */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card className="p-5 h-full border-emerald-500/30 bg-gradient-to-br from-emerald-500/5 to-transparent">
          <div className="flex items-start justify-between">
            <div className="w-11 h-11 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center">
              <Award className="w-5 h-5 text-emerald-500" />
            </div>
            <Link to="/dashboard/badges" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
              الكل <ChevronLeft className="w-3 h-3" />
            </Link>
          </div>
          <div className="mt-3">
            <div className="text-xs text-muted-foreground">الشارات</div>
            <div className="text-2xl font-black">
              {earned?.length ?? 0}
              <span className="text-base text-muted-foreground"> / {activeBadges.length}</span>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-1.5">
            {last5Earned.map((b) => (
              <div key={b.badge_id} className="w-8 h-8 rounded-full border border-amber-500/40 overflow-hidden bg-amber-500/10">
                {b.icon_url ? <img src={b.icon_url} className="w-full h-full object-contain" alt={b.name} /> : <Award className="w-4 h-4 m-2" />}
              </div>
            ))}
            {lockedBadges.slice(0, Math.max(0, 5 - last5Earned.length)).map((b) => (
              <div key={b.id} className="relative w-8 h-8 rounded-full border border-border overflow-hidden bg-muted grayscale">
                {b.icon_url && <img src={b.icon_url} className="w-full h-full object-contain opacity-50" alt="" />}
                <Lock className="w-3 h-3 absolute inset-0 m-auto text-muted-foreground" />
              </div>
            ))}
          </div>
        </Card>
      </motion.div>
    </div>
  );
}
