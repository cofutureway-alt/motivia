import { supabase } from "@/integrations/supabase/client";

export interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  template_data: Record<string, any>;
  action_url: string | null;
  related_entity_type: string | null;
  related_entity_id: string | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

// ── Unread count for bell badge ───────────────────────────────────────────────
export async function fetchUnreadNotificationCount(): Promise<number> {
  const { data: userResp } = await supabase.auth.getUser();
  if (!userResp?.user) return 0;

  const { count, error } = await (supabase as any)
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userResp.user.id)
    .eq("is_read", false);

  if (error) {
    console.error("Error fetching unread notifications count:", error);
    return 0;
  }
  return count ?? 0;
}

// ── Recent notifications for bell dropdown (~10 items) ───────────────────────
export async function fetchRecentNotifications(limit = 10): Promise<NotificationRow[]> {
  const { data: userResp } = await supabase.auth.getUser();
  if (!userResp?.user) return [];

  const { data, error } = await (supabase as any)
    .from("notifications")
    .select("*")
    .eq("user_id", userResp.user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as NotificationRow[];
}

// ── Paginated notifications for full page ─────────────────────────────────────
export async function fetchAllNotifications(opts: {
  page?: number;
  limit?: number;
  filter?: "all" | "unread";
}): Promise<{ notifications: NotificationRow[]; total_count: number }> {
  const { data: userResp } = await supabase.auth.getUser();
  if (!userResp?.user) return { notifications: [], total_count: 0 };

  const limit = opts.limit ?? 20;
  const page = opts.page ?? 0;

  let query = (supabase as any)
    .from("notifications")
    .select("*", { count: "exact" })
    .eq("user_id", userResp.user.id)
    .order("created_at", { ascending: false });

  if (opts.filter === "unread") {
    query = query.eq("is_read", false);
  }

  const { data, count, error } = await query
    .range(page * limit, (page + 1) * limit - 1);

  if (error) throw error;
  return {
    notifications: (data ?? []) as NotificationRow[],
    total_count: count ?? 0,
  };
}

// ── Mark single notification as read ──────────────────────────────────────────
export async function markNotificationAsRead(id: string): Promise<void> {
  const { error } = await (supabase as any)
    .from("notifications")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw error;
}

// ── Mark all notifications as read for current user ───────────────────────────
export async function markAllNotificationsAsRead(): Promise<void> {
  const { data: userResp } = await supabase.auth.getUser();
  if (!userResp?.user) return;

  const { error } = await (supabase as any)
    .from("notifications")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("user_id", userResp.user.id)
    .eq("is_read", false);

  if (error) throw error;
}

// ── Seed sample notifications for testing UI ─────────────────────────────────
export async function seedSampleNotificationsForMe(): Promise<number> {
  const { data, error } = await (supabase as any).rpc("seed_sample_notifications_for_me");
  if (error) throw error;
  return Number(data ?? 0);
}

// ── Helper to format relative time in Arabic ──────────────────────────────────
export function formatRelativeTimeArabic(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffSec < 60) return "الآن";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `منذ ${diffMin} دقيقة`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `منذ ${diffHours} ساعة`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `منذ ${diffDays} يوم`;
  return date.toLocaleDateString("ar-EG", { year: "numeric", month: "short", day: "numeric" });
}
