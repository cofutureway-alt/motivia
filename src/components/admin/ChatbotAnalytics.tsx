import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
} from "recharts";
import {
  Activity,
  Coins,
  Users,
  UserRound,
  Sparkles,
  Loader2,
  SendHorizonal,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  getChatbotUsageStats,
  analyzeChatConversations,
  askChatbotAnalyst,
  type ChatbotUsageStats,
} from "@/lib/chat-api";
import RichMessage from "@/components/chat/RichMessage";

const fmtNum = (n: number) => n.toLocaleString("ar-EG");

const StatCard = ({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  hint?: string;
}) => (
  <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-subtle">
    <div className="flex items-center gap-2 text-muted-foreground">
      <Icon className="h-4 w-4 text-primary" />
      <span className="text-xs font-semibold">{label}</span>
    </div>
    <div className="mt-2 text-2xl font-extrabold tabular-nums">{value}</div>
    {hint && <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>}
  </div>
);

const ChatbotAnalytics = () => {
  const [stats, setStats] = useState<ChatbotUsageStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);

  const [report, setReport] = useState("");
  const [analyzing, setAnalyzing] = useState(false);

  const [adminQuestion, setAdminQuestion] = useState("");
  const [adminThread, setAdminThread] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [asking, setAsking] = useState(false);
  const threadEndRef = useRef<HTMLDivElement>(null);

  const loadStats = async () => {
    setLoadingStats(true);
    try {
      setStats(await getChatbotUsageStats());
    } catch (e: any) {
      toast.error(e?.message || "تعذر تحميل الإحصائيات");
    } finally {
      setLoadingStats(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [adminThread, asking]);

  const handleAnalyze = async () => {
    setAnalyzing(true);
    setReport("");
    try {
      setReport(await analyzeChatConversations());
    } catch (e: any) {
      toast.error(e?.message || "تعذر تنفيذ التحليل");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleAsk = async () => {
    const q = adminQuestion.trim();
    if (!q || asking) return;
    setAdminQuestion("");
    setAdminThread((prev) => [...prev, { role: "user", content: q }]);
    setAsking(true);
    try {
      const answer = await askChatbotAnalyst(q);
      setAdminThread((prev) => [...prev, { role: "assistant", content: answer || "معنديش رد دلوقتي." }]);
    } catch (e: any) {
      setAdminThread((prev) => [...prev, { role: "assistant", content: e?.message || "حصل خطأ." }]);
    } finally {
      setAsking(false);
    }
  };

  const daily = stats?.daily ?? [];
  const successRate = stats && stats.totals.requests > 0
    ? Math.round((stats.totals.success / stats.totals.requests) * 100)
    : 100;

  return (
    <div className="space-y-6">
      {/* Usage cards */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Activity}
          label="عدد الطلبات (14 يوم)"
          value={loadingStats ? "..." : fmtNum(stats?.totals.requests ?? 0)}
          hint={`نسبة النجاح ${successRate}%`}
        />
        <StatCard
          icon={Coins}
          label="استهلاك التوكنز (14 يوم)"
          value={loadingStats ? "..." : fmtNum(stats?.totals.tokens ?? 0)}
        />
        <StatCard
          icon={Users}
          label="مستخدمون مسجلون"
          value={loadingStats ? "..." : fmtNum(stats?.totals.users ?? 0)}
        />
        <StatCard
          icon={UserRound}
          label="زوار (أجهزة مختلفة)"
          value={loadingStats ? "..." : fmtNum(stats?.totals.guests ?? 0)}
        />
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">الطلبات يوميًا (آخر 14 يوم)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-56" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={daily} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis dataKey="day" tickFormatter={(d: string) => d.slice(5)} fontSize={10} />
                  <YAxis allowDecimals={false} fontSize={10} />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, fontSize: 12, direction: "rtl" }}
                    labelFormatter={(d) => `يوم ${d}`}
                  />
                  <Bar dataKey="requests" name="طلبات" fill="hsl(214 82% 52%)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">استهلاك التوكنز يوميًا</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-56" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={daily} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="tokensGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(205 90% 64%)" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="hsl(205 90% 64%)" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis dataKey="day" tickFormatter={(d: string) => d.slice(5)} fontSize={10} />
                  <YAxis allowDecimals={false} fontSize={10} />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, fontSize: 12, direction: "rtl" }}
                    labelFormatter={(d) => `يوم ${d}`}
                  />
                  <Area
                    type="monotone"
                    dataKey="tokens"
                    name="توكنز"
                    stroke="hsl(205 90% 64%)"
                    fill="url(#tokensGrad)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent questions */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">أحدث أسئلة الطلاب</CardTitle>
            <CardDescription>آخر 60 سؤالًا وصلت للبوت (مسجلين وزوار)</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={loadStats} disabled={loadingStats}>
            <RefreshCw className={`h-4 w-4 ${loadingStats ? "animate-spin" : ""}`} />
            تحديث
          </Button>
        </CardHeader>
        <CardContent>
          <div className="max-h-56 space-y-1.5 overflow-y-auto pe-1">
            {(stats?.recent_questions ?? []).map((q, i) => (
              <div
                key={i}
                dir="auto"
                className="rounded-xl border border-border/50 bg-muted/40 px-3 py-2 text-sm"
              >
                {q.content}
              </div>
            ))}
            {!loadingStats && (stats?.recent_questions.length ?? 0) === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                لسه مفيش أسئلة — أول ما الطلاب يستخدموا البوت هتظهر هنا.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* AI analysis */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">تحليل ذكي للمحادثات</CardTitle>
            <CardDescription>
              يحلل المحادثات المحفوظة ويطلع تقرير بأكتر المشكلات وأكتر الأسئلة المتكررة
            </CardDescription>
          </div>
          <Button onClick={handleAnalyze} disabled={analyzing} className="gap-2">
            {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            عمل تحليل
          </Button>
        </CardHeader>
        <CardContent>
          {analyzing && (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              موتيفيا بوت بيحلل المحادثات...
            </div>
          )}
          {!analyzing && report && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl border border-border/60 bg-muted/30 p-4 text-sm"
            >
              <RichMessage content={report} />
            </motion.div>
          )}
          {!analyzing && !report && (
            <p className="py-4 text-sm text-muted-foreground">
              اضغط "عمل تحليل" عشان موتيفيا بوت يراجع كل المحادثات المحفوظة ويجهزلك تقرير.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Admin analyst chat */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">اسأل موتيفيا بوت عن بيانات الطلاب</CardTitle>
          <CardDescription>
            مثال: "اكتر الأخطاء اللي الطلبه بتستفسر عنها إيه؟" أو "ارسم لي اكتر 5 أسئلة متكررة"
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="max-h-72 space-y-2 overflow-y-auto pe-1">
            {adminThread.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-start" : "flex justify-end"}>
                <div
                  className={
                    m.role === "user"
                      ? "max-w-[85%] rounded-2xl rounded-tr-md bg-primary px-4 py-2.5 text-sm text-primary-foreground"
                      : "w-full max-w-[92%] rounded-2xl rounded-tl-md border border-border/60 bg-card px-4 py-3 text-sm shadow-subtle"
                  }
                >
                  {m.role === "user" ? (
                    <span dir="auto" className="whitespace-pre-wrap">
                      {m.content}
                    </span>
                  ) : (
                    <RichMessage content={m.content} />
                  )}
                </div>
              </div>
            ))}
            {asking && (
              <div className="flex justify-end">
                <div className="flex items-center gap-2 rounded-2xl rounded-tl-md border border-border/60 bg-card px-4 py-3 text-sm text-muted-foreground">
                  موتيفيا بوت بيحلل
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              </div>
            )}
            <div ref={threadEndRef} />
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAsk();
            }}
            className="flex items-center gap-2"
          >
            <Input
              value={adminQuestion}
              onChange={(e) => setAdminQuestion(e.target.value)}
              placeholder="اسأل عن بيانات الشات..."
              maxLength={500}
            />
            <Button type="submit" size="icon" disabled={asking || !adminQuestion.trim()} aria-label="إرسال">
              {asking ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <SendHorizonal className="h-4 w-4 rotate-180" />
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default ChatbotAnalytics;
