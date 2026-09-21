import { motion } from "framer-motion";
import { Layers, Crown, TrendingUp, Info, Zap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useLevels, usePointsConfig, usePurchaseThresholds, EVENT_LABELS, type EventKey } from "@/hooks/useLeaderboard";
import { useMyCurrentLevel, useMyPointsTotal } from "@/hooks/useBadges";

export default function MyLevels() {
  const { user } = useAuth();
  const { data: levels } = useLevels();
  const { data: currentLevel } = useMyCurrentLevel(user?.id);
  const { data: points } = useMyPointsTotal(user?.id);
  const { data: cfg } = usePointsConfig();
  const { data: courseThresh } = usePurchaseThresholds("courses");
  const { data: bundleThresh } = usePurchaseThresholds("bundles");

  const total = points ?? 0;
  const sortedLevels = [...(levels ?? [])].sort((a: any, b: any) => a.min_points - b.min_points);
  const belowFirst = sortedLevels.length > 0 && total < sortedLevels[0].min_points;

  return (
    <div className="max-w-4xl mx-auto space-y-6" dir="rtl">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-indigo-500/15 border border-indigo-500/40 flex items-center justify-center">
            <Layers className="w-5 h-5 text-indigo-500" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-black">المستويات</h1>
            <p className="text-sm text-muted-foreground">
              رصيدك الحالي: <span className="font-bold text-foreground">{total}</span> نقطة
            </p>
          </div>
        </div>
      </motion.div>

      {belowFirst && (
        <Card className="p-4 border-amber-500/30 bg-amber-500/5 flex items-center gap-3">
          <Info className="w-5 h-5 text-amber-600 shrink-0" />
          <p className="text-sm">استمر في التعلم لتصل إلى أول مستوى (تحتاج {sortedLevels[0].min_points} نقطة).</p>
        </Card>
      )}

      <Card className="p-4">
        <h2 className="font-bold mb-3 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-indigo-500" />
          كل المستويات
        </h2>
        {sortedLevels.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">لا توجد مستويات بعد.</p>
        ) : (
          <div className="space-y-2">
            {sortedLevels.map((l: any) => {
              const isCurrent = currentLevel?.id === l.id;
              return (
                <motion.div
                  key={l.id}
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  className={`flex items-center gap-3 p-3 rounded-xl border ${
                    isCurrent ? "border-amber-500/60 bg-amber-500/10" : "border-border"
                  }`}
                >
                  <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center overflow-hidden shrink-0">
                    {l.icon_url ? (
                      <img src={l.icon_url} className="w-full h-full object-contain" alt="" />
                    ) : (
                      <Layers className="w-5 h-5 text-indigo-500" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="font-bold">{l.name}</div>
                    <div className="text-xs text-muted-foreground">بدءًا من {l.min_points} نقطة</div>
                  </div>
                  {isCurrent && (
                    <div className="inline-flex items-center gap-1 text-amber-600 font-bold text-sm">
                      <Crown className="w-4 h-4" /> الحالي
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        )}
      </Card>

      <Card className="p-4">
        <h2 className="font-bold mb-3 flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-500" />
          كيفية ربح النقاط
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {(cfg ?? []).map((row: any) => {
            const meta = EVENT_LABELS[row.event_key as EventKey];
            if (!meta) return null;
            return (
              <div key={row.event_key} className="flex items-start justify-between gap-3 p-3 rounded-lg bg-accent/40">
                <div className="min-w-0">
                  <div className="font-medium text-sm">{meta.label}</div>
                  <div className="text-[11px] text-muted-foreground">{meta.hint}</div>
                </div>
                <div className={`shrink-0 font-bold px-2 py-1 rounded-md text-xs ${
                  row.points_value > 0 ? "bg-emerald-500/15 text-emerald-600" :
                  row.points_value < 0 ? "bg-red-500/15 text-red-600" :
                  "bg-muted text-muted-foreground"
                }`}>
                  {row.points_value > 0 ? "+" : ""}{row.points_value}
                </div>
              </div>
            );
          })}
        </div>

        {(courseThresh?.length || bundleThresh?.length) ? (
          <div className="mt-4 pt-4 border-t space-y-3">
            <h3 className="font-bold text-sm">مكافآت الشراء</h3>
            {(courseThresh ?? []).length > 0 && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">الدورات</div>
                <div className="flex flex-wrap gap-2">
                  {courseThresh!.map((r: any) => (
                    <span key={r.id} className="text-xs px-2 py-1 rounded-md bg-accent">
                      شراء {r.threshold_count}+ دورة = +{r.points_value} نقطة
                    </span>
                  ))}
                </div>
              </div>
            )}
            {(bundleThresh ?? []).length > 0 && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">الباقات</div>
                <div className="flex flex-wrap gap-2">
                  {bundleThresh!.map((r: any) => (
                    <span key={r.id} className="text-xs px-2 py-1 rounded-md bg-accent">
                      شراء {r.threshold_count}+ باقة = +{r.points_value} نقطة
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </Card>
    </div>
  );
}
