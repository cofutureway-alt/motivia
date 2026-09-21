import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { GraduationCap, BookOpen, AlertCircle, User } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";

interface InstructorCard {
  instructor_id: string;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  subjects: { id: string; name: string }[];
  stages: { id: string; name: string }[];
  courses_count: number;
}

export default function InstructorsDirectory() {
  const [rows, setRows] = useState<InstructorCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (supabase as any)
      .rpc("list_public_instructors")
      .then(({ data, error: e }: any) => {
        if (cancelled) return;
        if (e) throw e;
        setRows((data ?? []) as InstructorCard[]);
        setError(false);
      })
      .catch(() => !cancelled && setError(true))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col" dir="rtl">
      <Navbar />
      <main className="flex-1 pt-24 pb-16">
        <div className="container mx-auto px-4 max-w-6xl space-y-8">
          <div className="text-center space-y-2">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
              <GraduationCap className="w-7 h-7" />
            </div>
            <h1 className="text-3xl md:text-4xl font-black">نخبة معلمينا</h1>
            <p className="text-muted-foreground text-sm max-w-lg mx-auto">
              تعرف على نخبة المدرسين المتعاونين معنا وتصفح دوراتهم التعليمية
            </p>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-56 rounded-3xl" />
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-16 space-y-3">
              <AlertCircle className="w-10 h-10 text-destructive mx-auto" />
              <p className="text-muted-foreground">تعذّر تحميل قائمة المعلمين، حاول لاحقًا</p>
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center py-16 space-y-3">
              <User className="w-10 h-10 text-muted-foreground/40 mx-auto" />
              <p className="text-muted-foreground">لا يوجد معلمون متاحون حاليًا</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {rows.map((t, i) => (
                <motion.div
                  key={t.instructor_id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Link to={`/instructors/${t.instructor_id}`} className="block h-full">
                    <Card className="h-full hover:border-primary/50 hover:shadow-lg transition-all">
                      <CardContent className="p-6 text-center space-y-3">
                        <Avatar className="w-20 h-20 mx-auto border-2 border-primary/30">
                          <AvatarImage src={t.avatar_url ?? undefined} />
                          <AvatarFallback className="bg-primary/10 text-primary text-xl font-bold">
                            {t.full_name?.[0] ?? "م"}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <h2 className="font-bold text-lg">{t.full_name || "معلم"}</h2>
                          <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground mt-1">
                            <BookOpen className="w-3 h-3" />
                            {t.courses_count} دورة منشورة
                          </div>
                        </div>
                        {t.bio && (
                          <p className="text-xs text-muted-foreground line-clamp-2">{t.bio}</p>
                        )}
                        <div className="flex flex-wrap justify-center gap-1.5 pt-1">
                          {(t.subjects ?? []).slice(0, 3).map((s) => (
                            <Badge key={s.id} variant="secondary" className="text-[10px]">{s.name}</Badge>
                          ))}
                          {(t.stages ?? []).slice(0, 2).map((s) => (
                            <Badge key={s.id} variant="outline" className="text-[10px]">{s.name}</Badge>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
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