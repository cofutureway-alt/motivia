import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell,
  CheckCheck,
  ExternalLink,
  Loader2,
  RefreshCw,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";
import { toast } from "sonner";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import {
  fetchAllNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  formatRelativeTimeArabic,
  type NotificationRow,
} from "@/lib/notifications-api";
import { getNotificationTypeIcon } from "@/components/notifications/NotificationBell";
import { EightPointStar } from "@/components/IslamicPatterns";

export default function NotificationsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [filter, setFilter]           = useState<"all" | "unread">("all");
  const [page, setPage]               = useState(0);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [totalCount, setTotalCount]   = useState(0);
  const [loading, setLoading]         = useState(true);
  const [actionBusy, setActionBusy]   = useState(false);

  const pageSize = 15;

  const loadNotifications = useCallback(() => {
    if (!user) return;
    setLoading(true);
    fetchAllNotifications({ page, limit: pageSize, filter })
      .then((res) => {
        setNotifications(res.notifications);
        setTotalCount(res.total_count);
      })
      .catch((e: any) => {
        toast.error(e?.message || "تعذّر تحميل الإشعارات");
        setNotifications([]);
        setTotalCount(0);
      })
      .finally(() => setLoading(false));
  }, [user, page, filter]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const handleItemClick = async (n: NotificationRow) => {
    if (!n.is_read) {
      try {
        await markNotificationAsRead(n.id);
        setNotifications((prev) =>
          prev.map((item) => (item.id === n.id ? { ...item, is_read: true } : item))
        );
      } catch {
        // silent fallback
      }
    }
    if (n.action_url) {
      navigate(n.action_url);
    }
  };

  const handleMarkAllRead = async () => {
    setActionBusy(true);
    try {
      await markAllNotificationsAsRead();
      toast.success("تم تحديد جميع الإشعارات كمقروءة");
      loadNotifications();
    } catch {
      toast.error("فشل تحديث الإشعارات");
    } finally {
      setActionBusy(false);
    }
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <div className="min-h-screen bg-background flex flex-col" dir="rtl">
      <Navbar />

      <main className="flex-1 pt-24 pb-16">
        <div className="container mx-auto px-4 max-w-4xl space-y-6">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative overflow-hidden rounded-3xl border border-border/80 bg-card p-6 md:p-8 shadow-xl flex flex-wrap items-center justify-between gap-4"
          >
            <EightPointStar
              size={120}
              className="absolute -top-10 -left-10 text-primary/[0.04] pointer-events-none"
            />

            <div className="flex items-center gap-3 relative z-10">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                <Bell className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-black">الإشعارات والتنبيهات</h1>
                <p className="text-xs text-muted-foreground mt-0.5">
                  جميع المستجدات، التحديثات، والتنبيهات الخاصة بحسابك.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 relative z-10">
              <Button
                variant="outline"
                size="sm"
                onClick={handleMarkAllRead}
                disabled={actionBusy || notifications.length === 0}
                className="gap-1.5 text-xs"
              >
                <CheckCheck className="w-4 h-4 text-emerald-600" />
                تحديد الكل كمقروء
              </Button>
            </div>
          </motion.div>

          {/* Filter Tabs */}
          <div className="flex gap-1 bg-secondary/50 rounded-2xl p-1.5 w-fit">
            <button
              onClick={() => { setFilter("all"); setPage(0); }}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
                filter === "all" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              كل الإشعارات ({totalCount})
            </button>
            <button
              onClick={() => { setFilter("unread"); setPage(0); }}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
                filter === "unread" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              غير المقروءة
            </button>
          </div>

          {/* Notifications List */}
          <div className="rounded-3xl border border-border bg-card overflow-hidden shadow-sm">
            {loading ? (
              <div className="p-6 space-y-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex gap-4 p-4 border-b border-border/60 last:border-0">
                    <Skeleton className="w-10 h-10 rounded-2xl shrink-0" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-1/3" />
                      <Skeleton className="h-3 w-3/4" />
                    </div>
                  </div>
                ))}
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-20 text-center space-y-4">
                <div className="w-16 h-16 rounded-2xl bg-secondary/60 text-muted-foreground flex items-center justify-center mx-auto">
                  <Bell className="w-8 h-8 opacity-40" />
                </div>
                <div>
                  <div className="font-bold text-lg">لا توجد إشعارات بعد</div>
                  <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                    {filter === "unread"
                      ? "قرأت جميع إشعاراتك! لا توجد إشعارات غير مقروءة حالياً."
                      : "سيتم إعلامك بكل التحديثات والتنبيهات الجديدة هنا."}
                  </p>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                <AnimatePresence initial={false}>
                  {notifications.map((n, idx) => (
                    <motion.div
                      key={n.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.02 }}
                      onClick={() => handleItemClick(n)}
                      className={`p-4 md:p-5 flex gap-4 items-start cursor-pointer transition-colors hover:bg-accent/40 ${
                        !n.is_read ? "bg-primary/[0.03]" : ""
                      }`}
                    >
                      {/* Icon */}
                      <div className="w-10 h-10 rounded-2xl bg-secondary flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                        {getNotificationTypeIcon(n.type)}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-sm md:text-base font-bold ${
                                !n.is_read ? "text-foreground" : "text-muted-foreground"
                              }`}
                            >
                              {n.title}
                            </span>
                            {!n.is_read && (
                              <Badge variant="default" className="text-[10px] px-2 py-0">
                                جديد
                              </Badge>
                            )}
                          </div>

                          <span className="text-xs text-muted-foreground font-mono shrink-0">
                            {formatRelativeTimeArabic(n.created_at)}
                          </span>
                        </div>

                        <p className="text-xs md:text-sm text-muted-foreground leading-relaxed">
                          {n.body}
                        </p>

                        {n.action_url && (
                          <div className="pt-1">
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline">
                              الانتقال إلى التفاصيل
                              <ExternalLink className="w-3 h-3" />
                            </span>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
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
                <ChevronRight className="w-4 h-4" />
                السابق
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
                اللاحق
                <ChevronLeft className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
