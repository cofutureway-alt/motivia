import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

const GUEST_STORAGE_KEY = "motivia-chat-history";
const MAX_MESSAGES = 200;

export function readGuestMessages(): ChatMsg[] {
  try {
    const raw = localStorage.getItem(GUEST_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (m: any) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string"
    );
  } catch {
    return [];
  }
}

/**
 * Chat history per user. Logged-in users get rows in `chat_messages`
 * (RLS: own rows only); guests fall back to localStorage on this device.
 */
export function useChatHistory(userId: string | null | undefined) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      if (userId) {
        const { data } = await supabase
          .from("chat_messages")
          .select("id,role,content,created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: true })
          .limit(MAX_MESSAGES);
        if (mounted) setMessages((data ?? []) as ChatMsg[]);
      } else {
        if (mounted) setMessages(readGuestMessages());
      }
      if (mounted) setLoading(false);
    };
    load();
    return () => {
      mounted = false;
    };
  }, [userId]);

  const appendMessage = useCallback(
    (role: "user" | "assistant", content: string): ChatMsg => {
      const msg: ChatMsg = {
        id: crypto.randomUUID(),
        role,
        content,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => {
        const next = [...prev, msg].slice(-MAX_MESSAGES);
        if (!userId) {
          try {
            localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(next));
          } catch {
            /* storage full */
          }
        }
        return next;
      });
      if (userId) {
        supabase
          .from("chat_messages")
          .insert({ user_id: userId, role, content })
          .then(({ error }) => {
            if (error) console.error("failed to persist chat message", error);
          });
      }
      return msg;
    },
    [userId]
  );

  const clearHistory = useCallback(async () => {
    setMessages([]);
    if (userId) {
      await supabase.from("chat_messages").delete().eq("user_id", userId);
    } else {
      try {
        localStorage.removeItem(GUEST_STORAGE_KEY);
      } catch {
        /* ignore */
      }
    }
  }, [userId]);

  return { messages, loading, appendMessage, clearHistory };
}
