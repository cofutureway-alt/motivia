import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Award, Lock, CheckCircle2, XCircle, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import {
  useBadges, useMyEarnedBadges, useAllBadgeConditions, useConditionProgress,
  CONDITION_META, type BadgeRow, type BadgeConditionRow,
} from "@/hooks/useBadges";
import { useLevels } from "@/hooks/useLeaderboard";

type Filter = "all" | "earned" | "locked";

export default function MyBadges() {
  const { user } = useAuth();
  const { data: allBadges } = useBadges();
  const { data: earned } = useMyEarnedBadges(user?.id);
  const { data: allConds } = useAllBadgeConditions();
  const { data: levels } = useLevels();
  const [filter, setFilter] = useState<Filter>("all");
  const [flipped, setFlipped] = useState<Record<string, boolean>>({});

  const active = (allBadges ?? []).filter((b) => b.is_active);
  const earnedMap = new Map((earned ?? []).map((b) => [b.badge_id, b]));

  const visible = active.filter((b) => {
    if (filter === "earned") return earnedMap.has(b.id);
    if (filter === "locked") return !earnedMap.has(b.id);
    return true;
  });

  const byBadge = useMemo(() => {
    const m: Record<string, BadgeConditionRow[]> = {};
    (allConds ?? []).forEach((c) => {
      (m[c.badge_id] ||= []).push(c);
    });
    return m;
  }, [allConds]);

  return (
    <div className="max-w-6xl mx-auto space-y-6" dir="rtl">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center">
            <Award className="w-5 h-5 text-amber-500" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-black">شاراتي</h1>
            <p className="text-sm text-muted-foreground">
              حصلت على {earned?.length ?? 0} من {active.length} شارة نشطة.
            </p>
          </div>
        </div>
      </motion.div>

      <div className="flex gap-2 flex-wrap">
        {(["all", "earned", "locked"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === f ? "bg-primary text-primary-foreground" : "bg-accent hover:bg-accent/80"
            }`}
          >
            {f === "all" ? "الكل" : f === "earned" ? "التي حصلت عليها" : "المقفلة"}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">لا توجد شارات ضمن هذا الفلتر.</Card>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4" style={{ perspective: "1000px" }}>
          {visible.map((b) => {
            const isEarned = earnedMap.has(b.id);
            const rec = earnedMap.get(b.id);
            const isFlipped = !!flipped[b.id];
            return (
              <div key={b.id} className="relative min-h-[220px]" style={{ perspective: "1000px" }}>
                <motion.div
                  animate={{ rotateY: isFlipped ? 180 : 0 }}
                  transition={{ duration: 0.6, type: "spring", stiffness: 120, damping: 15 }}
                  style={{ transformStyle: "preserve-3d", position: "relative", width: "100%", height: "100%", minHeight: 220 }}
                  className="cursor-pointer"
                  onClick={() => setFlipped((p) => ({ ...p, [b.id]: !p[b.id] }))}
                >
                  {/* Front */}
                  <Card
                    className={`absolute inset-0 p-4 flex flex-col items-center text-center ${
                      isEarned ? "border-amber-500/40 bg-amber-500/5" : "border-border"
                    }`}
                    style={{ backfaceVisibility: "hidden" }}
                  >
                    <div className={`relative w-20 h-20 rounded-2xl border overflow-hidden flex items-center justify-center ${
                      isEarned ? "bg-amber-500/10 border-amber-500/40" : "bg-muted border-border"
                    }`}>
                      {b.icon_url ? (
                        <img src={b.icon_url} alt={b.name} className={`w-full h-full object-contain ${isEarned ? "" : "grayscale opacity-50"}`} />
                      ) : (
                        <Award className={`w-8 h-8 ${isEarned ? "text-amber-500" : "text-muted-foreground"}`} />
                      )}
                      {!isEarned && (
                        <div className="absolute inset-0 flex items-center justify-center bg-background/50">
                          <Lock className="w-6 h-6 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <h3 className="font-bold mt-3 line-clamp-1">{b.name}</h3>
                    {isEarned && rec ? (
                      <div className="text-[11px] text-muted-foreground mt-1 inline-flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-amber-500" />
                        {new Date(rec.awarded_at).toLocaleDateString("ar-EG")}
                      </div>
                    ) : (
                      <div className="text-[11px] text-muted-foreground mt-1">اضغط للمعاينة</div>
                    )}
                  </Card>

                  {/* Back */}
                  <Card
                    className="absolute inset-0 p-4 border-primary/40 bg-card"
                    style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
                  >
                    <h3 className="font-bold text-sm mb-2">{b.name}</h3>
                    {b.description && <p className="text-[11px] text-muted-foreground mb-3 line-clamp-3">{b.description}</p>}
                    <div className="space-y-1.5 text-[11px]">
                      {(byBadge[b.id] ?? []).map((c) => (
                        <ConditionRow
                          key={c.id}
                          badge={b}
                          condition={c}
                          studentId={user?.id}
                          levels={levels ?? []}
                          badges={active}
                        />
                      ))}
                      {(!byBadge[b.id] || byBadge[b.id].length === 0) && (
                        <div className="text-muted-foreground">لا شروط محددة</div>
                      )}
                    </div>
                  </Card>
                </motion.div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ConditionRow({
  condition, studentId, levels, badges,
}: {
  badge: BadgeRow; condition: BadgeConditionRow; studentId?: string; levels: any[]; badges: BadgeRow[];
}) {
  const { data } = useConditionProgress(studentId, condition);
  const meta = CONDITION_META[condition.condition_type];
  const targetLabel =
    meta.kind === "level"
      ? levels.find((l) => l.id === condition.target_uuid)?.name ?? "—"
      : meta.kind === "badge"
      ? badges.find((b) => b.id === condition.target_uuid)?.name ?? "—"
      : `${condition.target_int ?? 0}`;

  const satisfied = data?.satisfied;
  return (
    <div className="flex items-center gap-2">
      {satisfied === undefined ? (
        <div className="w-3.5 h-3.5 rounded-full border border-muted-foreground" />
      ) : satisfied ? (
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
      ) : (
        <XCircle className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      )}
      <span className={satisfied ? "text-foreground" : "text-muted-foreground"}>
        {meta.label}: <span className="font-bold">{targetLabel}</span>
        {data && meta.kind === "int" && (
          <span className="text-muted-foreground mr-1">({data.current_value}/{data.target_value})</span>
        )}
      </span>
    </div>
  );
}
