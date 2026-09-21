import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Crown, Medal, Trophy, User, Loader2, ChevronRight, ChevronLeft, Award, EyeOff } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

const PAGE_SIZE = 20;

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="inline-flex items-center gap-1 text-amber-500 font-bold"><Crown className="w-5 h-5" /> 1</span>;
  if (rank === 2) return <span className="inline-flex items-center gap-1 text-slate-400 font-bold"><Medal className="w-5 h-5" /> 2</span>;
  if (rank === 3) return <span className="inline-flex items-center gap-1 text-amber-700 font-bold"><Medal className="w-5 h-5" /> 3</span>;
  return <span className="font-bold text-muted-foreground">{rank}</span>;
}

export default function LeaderboardTop() {
  const [page, setPage] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ["leaderboard_top_full", page],
    queryFn: async () => {
      const [rows, count] = await Promise.all([
        supabase.rpc("leaderboard_top_full", { p_limit: PAGE_SIZE, p_offset: page * PAGE_SIZE }),
        supabase.rpc("leaderboard_eligible_count"),
      ]);
      if (rows.error) throw rows.error;
      if (count.error) throw count.error;
      return { rows: (rows.data ?? []) as any[], total: (count.data as number) ?? 0 };
    },
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Trophy className="w-5 h-5 text-amber-500" /> الأوائل
        </h2>
        <div className="text-sm text-muted-foreground">إجمالي الطلاب المؤهلين: {total}</div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : rows.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">لا يوجد طلاب بعد.</Card>
      ) : (
        <>
          <Card className="hidden md:block overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="text-right p-3 w-16">الترتيب</th>
                  <th className="text-right p-3">الطالب</th>
                  <th className="text-right p-3">المستوى</th>
                  <th className="text-right p-3">النقاط</th>
                  <th className="text-right p-3">الشارات</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r: any) => (
                  <motion.tr
                    key={r.student_id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="border-t border-border/50 hover:bg-accent/40"
                  >
                    <td className="p-3"><RankBadge rank={Number(r.rank)} /></td>
                    <td className="p-3">
                      <div className="flex items-center gap-3">
                        <Avatar className="w-9 h-9">
                          <AvatarImage src={r.avatar_url ?? undefined} />
                          <AvatarFallback><User className="w-4 h-4" /></AvatarFallback>
                        </Avatar>
                        <span className="font-medium">{r.full_name || "بدون اسم"}</span>
                        {!r.leaderboard_visible && (
                          <Badge variant="secondary" className="text-[10px]">
                            <EyeOff className="w-3 h-3 ml-1" /> مخفي عامّة
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="p-3">
                      {r.level_name ? (
                        <div className="flex items-center gap-2">
                          {r.level_icon_url ? (
                            <img src={r.level_icon_url} className="w-6 h-6 object-contain" alt="" />
                          ) : null}
                          <span className="text-xs">{r.level_name}</span>
                        </div>
                      ) : <span className="text-muted-foreground text-xs">—</span>}
                    </td>
                    <td className="p-3">
                      <span className="inline-flex px-2.5 py-1 rounded-lg bg-indigo-500/10 text-indigo-500 font-bold">
                        {r.total_points}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="inline-flex items-center gap-1 text-amber-600 font-bold">
                        <Award className="w-4 h-4" />
                        {r.badge_count}
                      </span>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </Card>

          <div className="md:hidden space-y-2">
            {rows.map((r: any) => (
              <Card key={r.student_id} className="p-3 flex items-center gap-3">
                <div className="w-10 text-center"><RankBadge rank={Number(r.rank)} /></div>
                <Avatar className="w-10 h-10">
                  <AvatarImage src={r.avatar_url ?? undefined} />
                  <AvatarFallback><User className="w-4 h-4" /></AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{r.full_name || "بدون اسم"}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-2">
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
                <span className="px-2 py-1 rounded-lg bg-indigo-500/10 text-indigo-500 font-bold text-sm">
                  {r.total_points}
                </span>
              </Card>
            ))}
          </div>

          <div className="flex items-center justify-between pt-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
              <ChevronRight className="w-4 h-4 ml-1" /> السابق
            </Button>
            <div className="text-sm text-muted-foreground">صفحة {page + 1} من {totalPages}</div>
            <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage(page + 1)}>
              التالي <ChevronLeft className="w-4 h-4 mr-1" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
