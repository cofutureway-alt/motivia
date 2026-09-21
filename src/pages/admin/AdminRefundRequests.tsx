import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, Inbox } from "lucide-react";
import {
  adminListRefundRequests,
  type RefundRequestRow,
  type RefundStatus,
} from "@/lib/refund-requests-api";
import { formatEGP } from "@/lib/book-orders-management-api";
import RefundReviewDialog from "@/components/admin/RefundReviewDialog";

const STATUS_LABEL: Record<RefundStatus, string> = {
  pending: "بانتظار المراجعة",
  approved: "معتمد",
  processing: "قيد التنفيذ",
  completed: "تم الاسترجاع",
  rejected: "مرفوض",
};

const STATUS_TONE: Record<RefundStatus, string> = {
  pending: "bg-amber-500/10 text-amber-600 dark:text-amber-300",
  approved: "bg-sky-500/10 text-sky-600 dark:text-sky-300",
  processing: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-300",
  completed: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
  rejected: "bg-rose-500/10 text-rose-600 dark:text-rose-300",
};

const TABS: { key: RefundStatus | "all"; label: string }[] = [
  { key: "pending", label: "بانتظار المراجعة" },
  { key: "processing", label: "قيد التنفيذ" },
  { key: "approved", label: "معتمد" },
  { key: "completed", label: "منجزة" },
  { key: "rejected", label: "مرفوضة" },
  { key: "all", label: "الكل" },
];

export default function AdminRefundRequests() {
  const [status, setStatus] = useState<RefundStatus | "all">("pending");
  const [search, setSearch] = useState("");
  const [active, setActive] = useState<RefundRequestRow | null>(null);

  const query = useQuery({
    queryKey: ["admin-refund-requests", status, search],
    queryFn: () =>
      adminListRefundRequests(
        status === "all" ? null : status,
        search.trim() || null,
      ),
  });

  const counts = query.data?.counts ?? ({} as any);
  const rows = useMemo(() => query.data?.rows ?? [], [query.data]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">طلبات استرجاع الكتب</h1>
        <p className="text-sm text-muted-foreground">
          راجع طلبات الاسترجاع وقم بتنفيذها عبر البوابة أو يدويًا حسب طريقة الدفع.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {(["pending", "processing", "approved", "completed", "rejected"] as RefundStatus[]).map(
          (s) => (
            <Card key={s}>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">{STATUS_LABEL[s]}</div>
                <div className="mt-1 text-2xl font-bold">{counts?.[s] ?? 0}</div>
              </CardContent>
            </Card>
          ),
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <Button
            key={t.key}
            size="sm"
            variant={status === t.key ? "default" : "outline"}
            onClick={() => setStatus(t.key)}
          >
            {t.label}
          </Button>
        ))}
        <div className="relative mr-auto w-full sm:w-64">
          <Search className="absolute right-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="ابحث بالطلب أو اسم/هاتف الطالب"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pr-8"
          />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {query.isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
              <Inbox className="h-10 w-10" />
              <div className="text-sm">لا توجد طلبات في هذا القسم.</div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>الطلب</TableHead>
                    <TableHead>الطالب</TableHead>
                    <TableHead>البوابة</TableHead>
                    <TableHead>المبلغ</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead>تاريخ الطلب</TableHead>
                    <TableHead className="text-end">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono">
                        <Link
                          to={`/admin/book-orders/${r.order_id}`}
                          className="text-primary hover:underline"
                        >
                          {r.order_number}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{r.student_name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">
                          {r.student_phone ?? ""}
                        </div>
                      </TableCell>
                      <TableCell>{r.gateway_display_name}</TableCell>
                      <TableCell className="font-semibold">
                        {formatEGP(r.total_piastres)}
                      </TableCell>
                      <TableCell>
                        <Badge className={STATUS_TONE[r.status]} variant="secondary">
                          {STATUS_LABEL[r.status]}
                        </Badge>
                        {r.processing_error && (
                          <div className="mt-1 text-xs text-destructive line-clamp-1">
                            {r.processing_error}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(r.requested_at).toLocaleString("ar-EG")}
                      </TableCell>
                      <TableCell className="text-end">
                        <Button size="sm" onClick={() => setActive(r)}>
                          {r.status === "pending" ? "مراجعة" : "تفاصيل"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <RefundReviewDialog
        open={!!active}
        onOpenChange={(v) => !v && setActive(null)}
        request={active}
      />
    </div>
  );
}
