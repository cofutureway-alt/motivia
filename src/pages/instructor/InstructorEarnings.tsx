import { useEffect, useState } from "react";
import { Wallet, Clock, CheckCircle2, Banknote } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { listInstructorEarnings, formatEGP, type InstructorEarningsRow } from "@/lib/instructor-api";

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  pending: { label: "معلّق", cls: "bg-orange-500/10 text-orange-600 border-orange-500/30" },
  available: { label: "متاح للسحب", cls: "bg-green-500/10 text-green-600 border-green-500/30" },
  withdrawn: { label: "مسحوب", cls: "bg-slate-500/10 text-slate-600 border-slate-500/30" },
};

export default function InstructorEarnings() {
  const [rows, setRows] = useState<InstructorEarningsRow[]>([]);
  const [filter, setFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    listInstructorEarnings(filter || null)
      .then((d) => setRows(d))
      .catch((e) => toast.error(e?.message || "تعذّر تحميل الأرباح"))
      .finally(() => setLoading(false));
  }, [filter]);

  const visible = rows.filter(
    (r) =>
      !search.trim() ||
      (r.course_title ?? "").includes(search.trim()) ||
      (r.book_title ?? "").includes(search.trim())
  );

  const totals = rows.reduce(
    (acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + r.instructor_amount;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
          <Wallet className="w-7 h-7 text-primary" />
          أرباحي
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          سجل أرباحك من الدورات والكتب — تتحول من "معلّق" إلى "متاح" بعد انتهاء فترة التعليق
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "معلّق", v: totals.pending ?? 0, icon: Clock, cls: "text-orange-600 bg-orange-500/10" },
          { label: "متاح للسحب", v: totals.available ?? 0, icon: CheckCircle2, cls: "text-green-600 bg-green-500/10" },
          { label: "مسحوب", v: totals.withdrawn ?? 0, icon: Banknote, cls: "text-slate-600 bg-slate-500/10" },
        ].map((c) => (
          <Card key={c.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${c.cls}`}>
                <c.icon className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">{c.label}</div>
                <div className="text-lg font-bold">{formatEGP(c.v)}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {[
          { v: "", l: "الكل" },
          { v: "pending", l: "معلّق" },
          { v: "available", l: "متاح" },
          { v: "withdrawn", l: "مسحوب" },
        ].map((f) => (
          <Button key={f.l} size="sm" variant={filter === f.v ? "default" : "outline"} onClick={() => setFilter(f.v)}>
            {f.l}
          </Button>
        ))}
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث بعنوان الكورس/الكتاب…"
          className="w-64"
        />
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            لا توجد أرباح مطابقة — ستظهر هنا تلقائيًا عند شراء الطلاب محتواك
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-accent/40 text-muted-foreground">
                  <tr>
                    <th className="p-3 text-right font-medium">المنتج</th>
                    <th className="p-3 text-right font-medium">الإجمالي</th>
                    <th className="p-3 text-right font-medium">المصاريف</th>
                    <th className="p-3 text-right font-medium">الصافي</th>
                    <th className="p-3 text-right font-medium">نسبتك</th>
                    <th className="p-3 text-right font-medium">الحالة</th>
                    <th className="p-3 text-right font-medium">متاح في</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r) => (
                    <tr key={r.id} className="border-t border-border/60 hover:bg-accent/20">
                      <td className="p-3">
                        <div className="font-medium truncate max-w-56">{r.course_title ?? r.book_title ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">
                          {r.product_type === "course" ? "كورس" : "كتاب"}
                        </div>
                      </td>
                      <td className="p-3">{formatEGP(r.gross_piastres)}</td>
                      <td className="p-3 text-muted-foreground">{formatEGP(r.expenses_piastres)}</td>
                      <td className="p-3">{formatEGP(r.net_piastres)}</td>
                      <td className="p-3 font-bold text-green-600">
                        {formatEGP(r.instructor_amount)}
                        <span className="text-xs font-normal text-muted-foreground">
                          {" "}({Number(r.instructor_percent)}%)
                        </span>
                      </td>
                      <td className="p-3">
                        <Badge variant="outline" className={STATUS_BADGE[r.status]?.cls ?? ""}>
                          {STATUS_BADGE[r.status]?.label ?? r.status}
                        </Badge>
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">
                        {r.status === "pending" && r.available_at
                          ? new Date(r.available_at).toLocaleDateString("ar-EG")
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}