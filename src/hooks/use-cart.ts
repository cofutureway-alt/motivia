import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface CartItem {
  id: string;
  book_id: string;
  quantity: number;
  added_at: string;
  book: {
    id: string;
    title: string;
    author: string | null;
    cover_image_url: string | null;
    book_type: "digital" | "physical";
    price_piastres: number;
    discount_price_piastres: number | null;
    discount_expires_at: string | null;
    stock_quantity: number | null;
    status: string;
  };
}

type CartRealtimeEntry = {
  channel: ReturnType<typeof supabase.channel>;
  listeners: Set<() => void>;
};

const cartRealtimeSubscriptions = new Map<string, CartRealtimeEntry>();

const createCartChannelTopic = (userId: string) => {
  const randomId = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return `book-cart-${userId}-${randomId}`;
};

const subscribeToCartRealtime = (userId: string, listener: () => void) => {
  const existing = cartRealtimeSubscriptions.get(userId);

  if (existing) {
    existing.listeners.add(listener);
    return () => {
      existing.listeners.delete(listener);
      if (existing.listeners.size === 0) {
        cartRealtimeSubscriptions.delete(userId);
        void supabase.removeChannel(existing.channel);
      }
    };
  }

  const listeners = new Set<() => void>([listener]);
  const channel = supabase
    .channel(createCartChannelTopic(userId))
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "book_cart_items", filter: `user_id=eq.${userId}` },
      () => {
        listeners.forEach((callback) => callback());
      }
    )
    .subscribe();

  cartRealtimeSubscriptions.set(userId, { channel, listeners });

  return () => {
    const current = cartRealtimeSubscriptions.get(userId);
    if (!current) return;

    current.listeners.delete(listener);
    if (current.listeners.size === 0) {
      cartRealtimeSubscriptions.delete(userId);
      void supabase.removeChannel(current.channel);
    }
  };
};

export function useCart() {
  const { user } = useAuth();
  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const userId = user?.id;
    if (!userId) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("book_cart_items")
      .select(
        "id,book_id,quantity,added_at,book:books(id,title,author,cover_image_url,book_type,price_piastres,discount_price_piastres,discount_expires_at,stock_quantity,status)"
      )
      .eq("user_id", userId)
      .order("added_at", { ascending: false });
    if (!error) setItems((data ?? []) as CartItem[]);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!user?.id) return;
    return subscribeToCartRealtime(user.id, load);
  }, [user?.id, load]);

  const addToCart = useCallback(
    async (bookId: string, bookType: "digital" | "physical", stockQuantity?: number | null) => {
      if (!user) {
        toast.error("سجّل الدخول لإضافة الكتاب إلى السلة");
        return false;
      }
      if (bookType === "physical" && stockQuantity !== undefined && stockQuantity !== null && stockQuantity <= 0) {
        toast.error("عذراً، هذا الكتاب غير متوفر في المخزون حالياً");
        return false;
      }
      const existing = items.find((i) => i.book_id === bookId);
      if (existing) {
        if (bookType === "digital") {
          toast.info("هذا الكتاب موجود بالفعل في السلة");
          return false;
        }
        if (stockQuantity !== undefined && stockQuantity !== null && existing.quantity >= stockQuantity) {
          toast.error("عذراً، تم الوصول للكمية المتاحة بالمخزون");
          return false;
        }
        const { error } = await (supabase as any)
          .from("book_cart_items")
          .update({ quantity: existing.quantity + 1 })
          .eq("id", existing.id);
        if (error) {
          toast.error("تعذّر تحديث السلة");
          return false;
        }
      } else {
        const { error } = await (supabase as any).from("book_cart_items").insert({
          user_id: user.id,
          book_id: bookId,
          quantity: 1,
        });
        if (error) {
          toast.error("تعذّر الإضافة إلى السلة");
          return false;
        }
      }
      await load();
      toast.success("أُضيف الكتاب إلى السلة");
      return true;
    },
    [user, items, load]
  );

  const updateQuantity = useCallback(
    async (id: string, quantity: number) => {
      if (quantity < 1) return;
      const { error } = await (supabase as any)
        .from("book_cart_items")
        .update({ quantity })
        .eq("id", id);
      if (error) {
        toast.error("تعذّر تحديث الكمية");
        return;
      }
      await load();
    },
    [load]
  );

  const removeItem = useCallback(
    async (id: string) => {
      const { error } = await (supabase as any).from("book_cart_items").delete().eq("id", id);
      if (error) {
        toast.error("تعذّر الحذف");
        return;
      }
      await load();
    },
    [load]
  );

  const clear = useCallback(async () => {
    if (!user) return;
    await (supabase as any).from("book_cart_items").delete().eq("user_id", user.id);
    await load();
  }, [user, load]);

  const count = items.reduce((a, b) => a + b.quantity, 0);

  return { items, loading, count, addToCart, updateQuantity, removeItem, clear, reload: load };
}
