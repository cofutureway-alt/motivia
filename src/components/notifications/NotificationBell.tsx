import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell,
  CheckCheck,
  ExternalLink,
  BookOpen,
  Sparkles,
  Award,
  AlertCircle,
  GraduationCap,
  Info,
  Clock,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  fetchUnreadNotificationCount,
  fetchRecentNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  formatRelativeTimeArabic,
  type NotificationRow,
} from "@/lib/notifications-api";
import { useAuth } from "@/contexts/AuthContext";

// ── Notification Type Icon Helper ──────────────────────────────────────────────
export function getNotificationTypeIcon(type: string): JSX.Element {
  switch (type) {
    case "course_published":
    case "lesson_added":
      return <BookOpen className="w-4 h-4 text-primary" />;
    case "quiz_graded":
    case "assignment_submitted":
      return <Award className="w-4 h-4 text-amber-500" />;
    case "child_lesson_completed":
    case "child_joined":
      return <GraduationCap className="w-4 h-4 text-violet-500" />;
    case "welcome":
    case "system_update":
      return <Sparkles className="w-4 h-4 text-emerald-500" />;
    default:
      return <Info className="w-4 h-4 text-blue-500" />;
  }
}

export default function NotificationBell() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const [unreadCount, setUnreadCount] = useState(0);
  const [recent, setRecent]           = useState<NotificationRow[]>([]);
  const [loading, setLoading]         = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Determine target path for "View all"
  const viewAllPath =
    profile?.role === "admin"
      ? "/admin/notifications"
      : profile?.role === "parent"
      ? "/parent/notifications"
      : "/dashboard/notifications";

  // Load unread count
  const loadUnreadCount = useCallback(() => {
    if (!user) return;
    fetchUnreadNotificationCount()
      .then(setUnreadCount)
      .catch(() => setUnreadCount(0));
  }, [user]);

  // Load recent notifications for dropdown
  const loadRecent = useCallback(() => {
    if (!user) return;
    setLoading(true);
    fetchRecentNotifications(10)
      .then(setRecent)
      .catch(() => setRecent([]))
      .finally(() => setLoading(false));
  }, [user]);

  // Poll count every 45s and on window focus
  useEffect(() => {
    if (!user) return;
    loadUnreadCount();

    const interval = setInterval(loadUnreadCount, 45000);
    const onFocus = () => loadUnreadCount();
    window.addEventListener("focus", onFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [user, loadUnreadCount]);

  // Load recent list when dropdown opens
  useEffect(() => {
    if (dropdownOpen) {
      loadRecent();
      loadUnreadCount();
    }
  }, [dropdownOpen, loadRecent, loadUnreadCount]);

  // Handle single notification click
  const handleItemClick = async (n: NotificationRow) => {
    if (!n.is_read) {
      try {
        await markNotificationAsRead(n.id);
        setUnreadCount((c) => Math.max(0, c - 1));
        setRecent((prev) =>
          prev.map((item) => (item.id === n.id ? { ...item, is_read: true } : item))
        );
      } catch {
        // silent fallback
      }
    }
    setDropdownOpen(false);

    if (n.action_url) {
      navigate(n.action_url);
    }
  };

  // Handle mark all as read
  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsAsRead();
      setUnreadCount(0);
      setRecent((prev) => prev.map((item) => ({ ...item, is_read: true })));
      toast.success("تم تحديد جميع الإشعارات كمقروءة");
    } catch (e: any) {
      toast.error("فشل تحديث الإشعارات");
    }
  };

  if (!user) return null;

  return (
    <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
      <DropdownMenuTrigger asChild>
        <button
          className="relative p-2 rounded-full text-foreground/80 hover:text-foreground hover:bg-accent transition-colors focus:outline-none"
          title="الإشعارات"
        >
          <Bell className="w-5 h-5" />

          {/* Animated Unread Badge */}
          <AnimatePresence>
            {unreadCount > 0 && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white shadow-md ring-2 ring-background"
              >
                {unreadCount > 99 ? "99+" : unreadCount}
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-80 sm:w-96 p-0 rounded-2xl border border-border shadow-2xl overflow-hidden bg-card"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-3.5 px-4 bg-muted/30 border-b border-border/60">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm text-foreground">الإشعارات</span>
            {unreadCount > 0 && (
              <Badge variant="secondary" className="text-[10px] font-mono px-2 py-0.5">
                {unreadCount} غير مقروء
              </Badge>
            )}
          </div>

          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              تحديد الكل كمقروء
            </button>
          )}
        </div>

        {/* Recent Items List */}
        <div className="max-h-80 overflow-y-auto divide-y divide-border/40">
          {loading && recent.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground space-y-2">
              <Loader2 className="w-5 h-5 animate-spin mx-auto text-primary" />
              <div className="text-xs">جارٍ تحميل الإشعارات...</div>
            </div>
          ) : recent.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground space-y-2">
              <Bell className="w-8 h-8 opacity-30 mx-auto" />
              <div className="text-xs font-medium">لا توجد إشعارات بعد</div>
            </div>
          ) : (
            recent.map((n) => (
              <button
                key={n.id}
                onClick={() => handleItemClick(n)}
                className={`w-full text-right p-3.5 px-4 flex gap-3 transition-colors hover:bg-accent/40 ${
                  !n.is_read ? "bg-primary/[0.03]" : ""
                }`}
              >
                {/* Icon */}
                <div className="w-8 h-8 rounded-xl bg-secondary flex items-center justify-center shrink-0 mt-0.5">
                  {getNotificationTypeIcon(n.type)}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className={`text-xs font-bold truncate ${
                        !n.is_read ? "text-foreground" : "text-muted-foreground"
                      }`}
                    >
                      {n.title}
                    </span>
                    {!n.is_read && (
                      <span className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1" />
                    )}
                  </div>

                  <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                    {n.body}
                  </p>

                  <div className="text-[10px] text-muted-foreground/70 font-mono pt-0.5">
                    {formatRelativeTimeArabic(n.created_at)}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-2.5 bg-muted/20 border-t border-border/60 text-center">
          <button
            onClick={() => {
              setDropdownOpen(false);
              navigate(viewAllPath);
            }}
            className="text-xs font-bold text-primary hover:underline inline-flex items-center gap-1"
          >
            عرض كل الإشعارات
            <ExternalLink className="w-3 h-3" />
          </button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
