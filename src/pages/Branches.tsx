import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { MapPin, Landmark, Sparkles, Building2 } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { IslamicDivider, EightPointStar } from "@/components/IslamicPatterns";
import { fetchPublicBranches, BranchRow } from "@/lib/branches-api";
import { toast } from "sonner";
import { usePageMeta } from "@/hooks/use-page-meta";

export default function Branches() {
  const [branches, setBranches] = useState<BranchRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  usePageMeta("أماكن التواجد");
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const data = await fetchPublicBranches();
        if (isMounted) setBranches(data);
      } catch (e: any) {
        if (isMounted) {
          toast.error("مش عارفين نحمل الأماكن دلوقتي، حاول تاني كمان شوية");
          setBranches([]);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  // Group branches by governorate while maintaining order_index hierarchy
  const groupedBranches = useMemo(() => {
    if (!branches) return [];
    const groupsMap = new Map<string, { governorate: string; minOrder: number; items: BranchRow[] }>();

    for (const b of branches) {
      const gov = b.governorate.trim();
      if (!groupsMap.has(gov)) {
        groupsMap.set(gov, { governorate: gov, minOrder: b.order_index, items: [] });
      }
      const g = groupsMap.get(gov)!;
      g.items.push(b);
      if (b.order_index < g.minOrder) g.minOrder = b.order_index;
    }

    const groups = Array.from(groupsMap.values());
    groups.sort((a, b) => a.minOrder - b.minOrder);
    for (const g of groups) {
      g.items.sort((a, b) => a.order_index - b.order_index);
    }
    return groups;
  }, [branches]);

  return (
    <div className="min-h-screen bg-background flex flex-col justify-between" dir="rtl">
      <Navbar />

      <main className="flex-1 pt-24 pb-20 relative overflow-hidden">
        {/* Glow ambient background lights */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[350px] bg-primary/10 rounded-full blur-[140px] pointer-events-none" />

        <div className="container mx-auto px-4 relative z-10">
          {/* Header Banner */}
          <div className="text-center max-w-2xl mx-auto mb-16 space-y-4">
            <IslamicDivider className="mb-4" />

            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-xs font-bold text-primary shadow-sm">
              <Landmark size={14} />
              <span>أماكن الشرح المباشر</span>
            </div>

            <h1 className="text-3xl md:text-5xl font-extrabold text-foreground tracking-tight">
              أماكن التواجد
            </h1>

            <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
              الأماكن والمراكز اللي بيشرح فيها المعلم وتقدر تحضر فيها المحاضرات والدروس مباشر في المحافظات المختلفة
            </p>
          </div>

          {/* Loading Skeletons */}
          {loading ? (
            <div className="space-y-10 max-w-5xl mx-auto">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="space-y-4">
                  <Skeleton className="h-8 w-40 rounded-lg" />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Skeleton className="h-36 rounded-2xl" />
                    <Skeleton className="h-36 rounded-2xl" />
                  </div>
                </div>
              ))}
            </div>
          ) : groupedBranches.length === 0 ? (
            /* Empty State */
            <div className="max-w-md mx-auto text-center py-16 px-6 rounded-3xl border border-dashed border-border bg-card/40">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4">
                <Building2 size={32} />
              </div>
              <h3 className="text-xl font-bold mb-2">مفيش أماكن متضافة دلوقتي</h3>
              <p className="text-sm text-muted-foreground">
                تابعنا قريب عشان تعرف الأماكن والمراكز الجديدة في محافظتك أول بأول.
              </p>
            </div>
          ) : (
            /* Grouped Branches List */
            <div className="space-y-12 max-w-5xl mx-auto">
              {groupedBranches.map((group, idx) => (
                <motion.div
                  key={group.governorate}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: idx * 0.1 }}
                  className="space-y-5"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-8 bg-primary rounded-full" />
                    <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
                      <span>محافظة {group.governorate}</span>
                      <Badge variant="secondary" className="text-xs font-semibold">
                        {group.items.length} {group.items.length === 1 ? "مكان" : "أماكن"}
                      </Badge>
                    </h2>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {group.items.map((branch) => (
                      <Card
                        key={branch.id}
                        className="group relative rounded-2xl p-6 bg-card/60 backdrop-blur-xl border border-border/70 hover:border-primary/50 hover:shadow-xl hover:shadow-primary/5 transition-all duration-300 flex flex-col justify-between"
                      >
                        {/* Top Accent line on hover */}
                        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-transparent via-primary/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                        {/* Corner Ornament */}
                        <div className="absolute top-3 left-3 opacity-[0.06] group-hover:opacity-[0.15] transition-opacity">
                          <EightPointStar size={40} className="text-primary" />
                        </div>

                        <div className="space-y-3">
                          <div className="flex items-center justify-between gap-2">
                            <h3 className="text-xl font-bold text-foreground group-hover:text-primary transition-colors flex items-center gap-2">
                              <Building2 className="w-5 h-5 text-primary shrink-0" />
                              <span>{branch.branch_name}</span>
                            </h3>
                            <Badge variant="outline" className="text-xs shrink-0">
                              {branch.governorate}
                            </Badge>
                          </div>

                          <div className="flex items-start gap-2.5 text-sm text-muted-foreground leading-relaxed pt-1">
                            <MapPin className="w-4 h-4 text-primary shrink-0 mt-1" />
                            <span>{branch.address_details}</span>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
