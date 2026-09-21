import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  MessageSquare,
  Ban,
  RotateCw,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronRight,
  ChevronLeft,
  Eye,
  FileText,
  User,
  Users,
  ShieldAlert,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { EightPointStar } from "@/components/IslamicPatterns";
import {
  fetchWhatsappQueueLog,
  bulkCancelWhatsappQueueByNumbers,
  triggerWhatsappDispatcher,
  type WhatsappQueueItem,
} from "@/lib/whatsapp-api";
import { CHANNEL_META_MAP } from "./AdminWhatsappSettings";

const ALL = "all";
const PAGE_SIZE = 15;

type RoleFilter = "all" | "student" | "parent" | "admin";

const NOTIFICATION_TYPES_BY_ROLE: Record<string, "student" | "parent" | "admin"> = {
  course_published: "student", lesson_added: "student", quiz_added: "student", assignment_added: "student",
  quiz_graded: "student", assignment_graded: "student", assignment_feedback: "student",
  course_purchased: "student", bundle_purchased: "student", book_order_created: "student",
  book_order_status_changed: "student", wallet_transaction: "student", refund_status_changed: "student",
  badge_earned: "student", level_up: "student", leaderboard_top10: "student",
  account_banned: "student", payment_proof_rejected: "student",
  parent_lesson_completed: "parent", parent_quiz_graded: "parent", parent_assignment_graded: "parent",
  parent_badge_earned: "parent", parent_leaderboard_top10: "parent", parent_course_purchased: "parent",
  parent_bundle_purchased: "parent", parent_wallet_topup: "parent",
  admin_payment_proof_submitted: "admin", admin_refund_request: "admin",
  admin_parent_link_request: "admin", assignment_submitted: "admin",
  quiz_needs_review: "admin", admin_new_book_order: "admin",
};

export default function AdminWhatsappLog() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<WhatsappQueueItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);

  // Filters
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [typeFilter, setTypeFilter] = useState(ALL);
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [searchText, setSearchText] = useState("");

  // Preview Modal
  const [previewItem, setPreviewItem] = useState<WhatsappQueueItem | null>(null);

  // Bulk Cancel Modal
  const [bulkCancelOpen, setBulkCancelOpen] = useState(false);
  const [bulkNumbersText, setBulkNumbersText] = useState("");
  const [cancelling, setCancelling] = useState(false);

  // Effective type filter taking role into account
  const effectiveTypeFilter = typeFilter;

  const loadQueue = useCallback(() => {
    setLoading(true);
    fetchWhatsappQueueLog({
      status: statusFilter,
      type: effectiveTypeFilter,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    })
      .then((res) => {
        setItems(res.items);
        setTotalCount(res.totalCount);
      })
      .catch((e: any) => {
        toast.error(e?.message || "تعذّر تحميل سجل الإشعارات");
        setItems([]);
        setTotalCount(0);
      })
      .finally(() => setLoading(false));
  }, [statusFilter, effectiveTypeFilter, page]);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  // When role filter changes, reset type filter and page
  const handleRoleChange = (role: RoleFilter) => {
    setRoleFilter(role);
    setTypeFilter(ALL);
    setPage(0);
  };

  const handleRunDispatcher = async () => {
    try {
      const res = await triggerWhatsappDispatcher();
      toast.success(`تم تشغيل الدفعة: تم إرسال ${res.sent}، وتخطي ${res.skipped}`);
      loadQueue();
    } catch (e: any) {
      toast.error(e?.message || "فشل تشغيل الدفعة");
    }
  };

  const handleExecuteBulkCancel = async () => {
    if (!bulkNumbersText.trim()) {
      toast.error("أدخل رقم هاتف واحد على الأقل");
      return;
    }
    setCancelling(true);
    try {
      const count = await bulkCancelWhatsappQueueByNumbers(bulkNumbersText);
      toast.success(`تم إلغاء إرسال ${count} رسالة قيد الانتظار بنجاح`);
      setBulkNumbersText("");
      setBulkCancelOpen(false);
      loadQueue();
    } catch (e: any) {
      toast.error(e?.message || "فشل إلغاء الرسائل");
    } finally {
      setCancelling(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  // Types filtered by role
  const availableTypes = Object.entries(NOTIFICATION_TYPES_BY_ROLE)
    .filter(([, role]) => roleFilter === "all" || role === roleFilter)
    .map(([type]) => type)
    .sort();

  // Client-side search filter on visible items
  const visibleItems = items.filter((item) => {
    if (!searchText.trim()) return true;
    const q = searchText.toLowerCase();
    return (
      item.phone_number?.includes(q) ||
      item.notification_type?.toLowerCase().includes(q) ||
      item.student_name?.toLowerCase().includes(q) ||
      item.rendered_body?.toLowerCase().includes(q)
    );
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "sent":
        return (
          <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 gap-1 text-[11px]">
            <CheckCircle2 className="w-3 h-3" /> تم الإرسال
          </Badge>
        );
      case "queued":
        return (
          <Badge variant="outline" className="text-amber-600 border-amber-500/30 bg-amber-500/10 gap-1 text-[11px]">
            <Clock className="w-3 h-3" /> قيد الانتظار
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="destructive" className="gap-1 text-[11px]">
            <XCircle className="w-3 h-3" /> فشل الإرسال
          </Badge>
        );
      case "cancelled":
        return (
          <Badge variant="secondary" className="gap-1 text-[11px]">
            <Ban className="w-3 h-3" /> ملغاة
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getRoleIcon = (type: string) => {
    const role = NOTIFICATION_TYPES_BY_ROLE[type];
    if (role === "parent") return <Users className="w-3 h-3 text-amber-500" />;
    if (role === "admin") return <ShieldAlert className="w-3 h-3 text-purple-500" />;
    return <User className="w-3 h-3 text-blue-500" />;
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl border border-border/80 bg-card p-6 md:p-8 shadow-xl flex flex-wrap items-center justify-between gap-4"
      >
        <EightPointStar
          size={140}
          className="absolute -top-10 -left-10 text-emerald-600/[0.04] pointer-events-none"
        />

        <div className="flex items-center gap-3 relative z-10">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
            <MessageSquare className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-black">سجل إرسال رسائل واتساب</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              متابعة طابور الرسائل الصادرة، حالات التسليم، وإلغاء الإرسال بالجملة.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 relative z-10 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={loadQueue}
            className="gap-1.5 text-xs"
          >
            <RefreshCw className="w-4 h-4 text-muted-foreground" />
            تحديث
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setBulkCancelOpen(true)}
            className="gap-1.5 text-xs text-destructive hover:bg-destructive/10"
          >
            <Ban className="w-4 h-4" />
            إلغاء لأرقام محددة
          </Button>
          <Button
            onClick={handleRunDispatcher}
            size="sm"
            className="gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <RotateCw className="w-4 h-4" />
            معالجة الطابور الآن
          </Button>
        </div>
      </motion.div>

      {/* Role Category Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 p-3 rounded-2xl border border-border bg-card shadow-sm">
        {(
          [
            { key: "all", label: "جميع الأدوار", icon: null },
            { key: "student", label: "إشعارات الطلاب", icon: <User className="w-3.5 h-3.5" /> },
            { key: "parent", label: "إشعارات أولياء الأمور", icon: <Users className="w-3.5 h-3.5" /> },
            { key: "admin", label: "إشعارات الإدارة", icon: <ShieldAlert className="w-3.5 h-3.5" /> },
          ] as const
        ).map((r) => (
          <Button
            key={r.key}
            variant={roleFilter === r.key ? "default" : "ghost"}
            size="sm"
            onClick={() => handleRoleChange(r.key as RoleFilter)}
            className="text-xs rounded-xl gap-1.5"
          >
            {r.icon}
            {r.label}
          </Button>
        ))}
      </div>

      {/* Filters Bar */}
      <div className="p-4 rounded-2xl border border-border bg-card flex flex-wrap items-center gap-3 shadow-sm">
        {/* Status Filter */}
        <div className="w-40">
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
            <SelectTrigger className="text-xs"><SelectValue placeholder="الحالة" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>جميع الحالات</SelectItem>
              <SelectItem value="queued">قيد الانتظار</SelectItem>
              <SelectItem value="sent">تم الإرسال</SelectItem>
              <SelectItem value="failed">فشل الإرسال</SelectItem>
              <SelectItem value="cancelled">ملغاة</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Notification Type Filter */}
        <div className="w-56">
          <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(0); }}>
            <SelectTrigger className="text-xs font-mono"><SelectValue placeholder="نوع الإشعار" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>جميع الأنواع</SelectItem>
              {availableTypes.map((t) => (
                <SelectItem key={t} value={t} className="font-mono text-xs">
                  {CHANNEL_META_MAP[t]?.titleAr || t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Search Box */}
        <div className="flex-1 min-w-[200px] relative">
          <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="بحث بالاسم، الرقم، أو نص الرسالة..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="pr-9 text-xs"
          />
        </div>

        <div className="text-xs text-muted-foreground font-mono ml-auto">
          {visibleItems.length} / {totalCount} نتيجة
        </div>
      </div>

      {/* Queue Table */}
      <div className="rounded-3xl border border-border bg-card overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-secondary/40 border-b border-border text-muted-foreground font-bold">
              <tr>
                <th className="p-4">المستلم / الرقم</th>
                <th className="p-4">نوع الإشعار</th>
                <th className="p-4">الحالة</th>
                <th className="p-4">الرقم المستعمل</th>
                <th className="p-4">وقت الجدولة / الإرسال</th>
                <th className="p-4 text-center">معاينة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={6} className="p-4 text-center text-muted-foreground">
                      جاري التحميل...
                    </td>
                  </tr>
                ))
              ) : visibleItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-10 text-center text-muted-foreground">
                    <MessageSquare className="w-8 h-8 mx-auto opacity-20 mb-2" />
                    لا توجد رسائل تطابق الفلاتر المحددة.
                  </td>
                </tr>
              ) : (
                visibleItems.map((item) => (
                  <tr key={item.id} className="hover:bg-accent/40 transition-colors">
                    <td className="p-4">
                      <div className="font-bold">{item.student_name || "مستخدم"}</div>
                      <div className="font-mono text-[11px] text-muted-foreground">
                        {item.phone_number}
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-1.5">
                        {getRoleIcon(item.notification_type)}
                        <span className="font-mono font-bold text-primary text-[11px]">
                          {CHANNEL_META_MAP[item.notification_type]?.titleAr || item.notification_type}
                        </span>
                      </div>
                      <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                        {item.notification_type}
                      </div>
                    </td>
                    <td className="p-4">{getStatusBadge(item.status)}</td>
                    <td className="p-4 text-muted-foreground">
                      {item.instance_label || "تلقائي"}
                    </td>
                    <td className="p-4 font-mono text-muted-foreground text-[11px]">
                      {new Date(item.sent_at || item.scheduled_for).toLocaleString("ar-EG")}
                    </td>
                    <td className="p-4 text-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setPreviewItem(item)}
                        className="h-8 w-8 p-0"
                      >
                        <Eye className="w-4 h-4 text-muted-foreground" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="gap-1 text-xs"
          >
            <ChevronRight className="w-4 h-4" /> السابق
          </Button>
          <span className="text-xs text-muted-foreground font-mono">
            صفحة {page + 1} من {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => p + 1)}
            className="gap-1 text-xs"
          >
            التالي <ChevronLeft className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Preview Dialog */}
      <Dialog open={!!previewItem} onOpenChange={(o) => !o && setPreviewItem(null)}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <FileText className="w-4 h-4 text-emerald-600" /> معاينة نص الرسالة
            </DialogTitle>
          </DialogHeader>
          {previewItem && (
            <div className="space-y-4 py-2 text-xs">
              <div className="bg-secondary/40 rounded-2xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold">{previewItem.student_name || "مستخدم"}</span>
                  <span className="font-mono text-muted-foreground">{previewItem.phone_number}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {getRoleIcon(previewItem.notification_type)}
                  <span className="font-bold text-xs">
                    {CHANNEL_META_MAP[previewItem.notification_type]?.titleAr || previewItem.notification_type}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {getStatusBadge(previewItem.status)}
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {new Date(previewItem.sent_at || previewItem.scheduled_for).toLocaleString("ar-EG")}
                  </span>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="font-bold text-muted-foreground">نص الرسالة المُرسَلة:</div>
                <p className="p-4 rounded-2xl bg-card border border-border text-xs leading-relaxed">
                  {previewItem.rendered_body}
                </p>
              </div>

              {previewItem.instance_label && (
                <div className="text-[11px] text-muted-foreground">
                  الرقم المُستعمل: <span className="font-bold text-foreground">{previewItem.instance_label}</span>
                </div>
              )}

              {previewItem.failed_reason && (
                <div className="p-3 rounded-xl bg-destructive/10 text-destructive text-xs">
                  سبب الفشل: {previewItem.failed_reason}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewItem(null)}>
              إغلاق
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Cancel Dialog */}
      <Dialog open={bulkCancelOpen} onOpenChange={setBulkCancelOpen}>
        <DialogContent className="sm:max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Ban className="w-5 h-5 text-destructive" /> إلغاء الإرسال لأرقام محددة
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <p className="text-muted-foreground leading-relaxed">
              أدخل أرقام الهواتف المراد إلغاء الرسائل قيد الانتظار لها (رقم في كل سطر أو مفصولة بفواصل). سيتم تغيير حالة كل الرسائل قيد الانتظار لهذه الأرقام إلى "ملغاة".
            </p>
            <Textarea
              rows={6}
              placeholder={"01012345678\n01198765432\n+201200000000"}
              value={bulkNumbersText}
              onChange={(e) => setBulkNumbersText(e.target.value)}
              className="font-mono text-xs"
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setBulkCancelOpen(false)}>
              إلغاء
            </Button>
            <Button
              onClick={handleExecuteBulkCancel}
              disabled={cancelling}
              variant="destructive"
              className="gap-2"
            >
              إلغاء الإرسال لهذه الأرقام
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
