import { supabase } from "@/integrations/supabase/client";

export type BookOrderStatus =
  | "pending_payment"
  | "confirmed"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "delivery_failed"
  | "refund_requested"
  | "refunded";

export const STATUS_LABEL: Record<BookOrderStatus, string> = {
  pending_payment: "بانتظار الدفع",
  confirmed: "مؤكد",
  shipped: "قيد الشحن",
  delivered: "تم التسليم",
  cancelled: "ملغي",
  delivery_failed: "فشل التسليم",
  refund_requested: "طلب استرجاع",
  refunded: "تم الاسترجاع",
};

export const STATUS_TONE: Record<
  BookOrderStatus,
  { bg: string; text: string; ring: string; dot: string }
> = {
  pending_payment: {
    bg: "bg-amber-500/10",
    text: "text-amber-600 dark:text-amber-300",
    ring: "ring-amber-500/25",
    dot: "bg-amber-500",
  },
  confirmed: {
    bg: "bg-sky-500/10",
    text: "text-sky-600 dark:text-sky-300",
    ring: "ring-sky-500/25",
    dot: "bg-sky-500",
  },
  shipped: {
    bg: "bg-indigo-500/10",
    text: "text-indigo-600 dark:text-indigo-300",
    ring: "ring-indigo-500/25",
    dot: "bg-indigo-500",
  },
  delivered: {
    bg: "bg-emerald-500/10",
    text: "text-emerald-600 dark:text-emerald-300",
    ring: "ring-emerald-500/25",
    dot: "bg-emerald-500",
  },
  cancelled: {
    bg: "bg-rose-500/10",
    text: "text-rose-600 dark:text-rose-300",
    ring: "ring-rose-500/25",
    dot: "bg-rose-500",
  },
  delivery_failed: {
    bg: "bg-orange-500/10",
    text: "text-orange-600 dark:text-orange-300",
    ring: "ring-orange-500/25",
    dot: "bg-orange-500",
  },
  refund_requested: {
    bg: "bg-violet-500/10",
    text: "text-violet-600 dark:text-violet-300",
    ring: "ring-violet-500/25",
    dot: "bg-violet-500",
  },
  refunded: {
    bg: "bg-slate-500/10",
    text: "text-slate-600 dark:text-slate-300",
    ring: "ring-slate-500/25",
    dot: "bg-slate-500",
  },
};

export function nextAdminTransitions(current: BookOrderStatus): BookOrderStatus[] {
  switch (current) {
    case "pending_payment":
      return ["cancelled"];
    case "confirmed":
      return ["shipped", "cancelled"];
    case "shipped":
      return ["delivered", "delivery_failed", "cancelled"];
    default:
      return [];
  }
}

export interface AdminBookOrderRow {
  id: string;
  order_number: string;
  status: BookOrderStatus;
  total_piastres: number;
  has_physical_items: boolean;
  created_at: string;
  confirmed_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  delivery_failed_at?: string | null;
  user_id: string;
  student_name: string | null;
  student_phone: string | null;
  student_id_code: string | null;
  gateway_key: string;
  gateway_display_name: string;
  shipping_zone_id: string | null;
  shipping_zone_name: string | null;
  items_count: number;
}

export interface AdminBookOrdersResult {
  rows: AdminBookOrderRow[];
  counts: Record<BookOrderStatus | "total", number>;
}

export interface AdminOrderFilters {
  status?: BookOrderStatus | null;
  gatewayKey?: string | null;
  shippingZoneId?: string | null;
  from?: string | null;
  to?: string | null;
  search?: string | null;
}

export async function adminListBookOrders(
  f: AdminOrderFilters = {},
): Promise<AdminBookOrdersResult> {
  const { data, error } = await (supabase as any).rpc("admin_list_book_orders", {
    p_status: f.status ?? null,
    p_gateway_key: f.gatewayKey ?? null,
    p_shipping_zone_id: f.shippingZoneId ?? null,
    p_from: f.from ?? null,
    p_to: f.to ?? null,
    p_search: f.search ?? null,
  });
  if (error) throw error;
  return (data as AdminBookOrdersResult) ?? { rows: [], counts: {} as any };
}

export interface BookOrderFull {
  id: string;
  order_number: string;
  status: BookOrderStatus;
  has_physical_items: boolean;
  shipping_address: {
    full_name?: string;
    phone?: string;
    street?: string;
    city?: string;
    notes?: string;
  } | null;
  shipping_zone_name: string | null;
  shipping_cost_piastres: number;
  items_subtotal_piastres: number;
  total_piastres: number;
  gateway_key: string;
  gateway_display_name: string;
  created_at: string;
  confirmed_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  delivery_failed_at?: string | null;
  items: Array<{
    id: string;
    book_id: string;
    book_type: "digital" | "physical";
    quantity: number;
    unit_price_piastres: number;
    title: string;
    author: string | null;
    cover_image_url: string | null;
  }>;
  history: Array<{
    id: string;
    from_status: BookOrderStatus | null;
    to_status: BookOrderStatus;
    notes: string | null;
    created_at: string;
    notify_student: boolean;
    changed_by_name: string | null;
  }>;
  student: {
    id: string;
    full_name: string | null;
    phone: string | null;
    email: string | null;
    student_id_code: string | null;
  };
  refund_requests: Array<{
    id: string;
    reason: string;
    status: "pending" | "approved" | "rejected";
    requested_at: string;
    reviewed_at: string | null;
    review_notes: string | null;
  }>;
}

export async function getBookOrderFull(orderId: string): Promise<BookOrderFull | null> {
  const { data, error } = await (supabase as any).rpc("get_book_order_full", {
    p_order_id: orderId,
  });
  if (error) throw error;
  return (data as BookOrderFull | null) ?? null;
}

export async function changeBookOrderStatus(args: {
  orderId: string;
  newStatus: BookOrderStatus;
  notes?: string | null;
  notifyStudent?: boolean;
  cashCollected?: boolean;
}) {
  const { data, error } = await (supabase as any).rpc("change_book_order_status", {
    p_order_id: args.orderId,
    p_new_status: args.newStatus,
    p_notes: args.notes ?? null,
    p_notify_student: args.notifyStudent ?? true,
    p_cash_collected: args.cashCollected ?? false,
  });
  if (error) throw error;
  return data;
}

export async function requestBookOrderRefund(orderId: string, reason: string) {
  const { data, error } = await (supabase as any).rpc("request_book_order_refund", {
    p_order_id: orderId,
    p_reason: reason,
  });
  if (error) throw error;
  return data;
}

export interface MyBookOrderRow {
  id: string;
  order_number: string;
  status: BookOrderStatus;
  total_piastres: number;
  has_physical_items: boolean;
  created_at: string;
  gateway_key: string;
  gateway_display_name: string;
  items_count: number;
  items_preview: Array<{ title: string; quantity: number }>;
}

export async function listMyBookOrders(): Promise<MyBookOrderRow[]> {
  const { data, error } = await (supabase as any).rpc("list_my_book_orders");
  if (error) throw error;
  return (data as MyBookOrderRow[]) ?? [];
}

export function formatEGP(piastres: number): string {
  const egp = piastres / 100;
  return `${egp.toLocaleString("ar-EG", {
    minimumFractionDigits: piastres % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })} ج.م`;
}
