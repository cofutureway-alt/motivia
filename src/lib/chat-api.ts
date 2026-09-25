import { supabase } from "@/integrations/supabase/client";

export interface ChatMessagePayload {
  role: "user" | "assistant";
  content: string;
}

/**
 * supabase.functions.invoke surfaces non-2xx responses as an error whose
 * message often embeds the JSON body (e.g. `{"error":"..."}`) — pull it out.
 */
function extractError(error: any): string {
  const msg = typeof error === "string" ? error : error?.message || "";
  try {
    const start = msg.indexOf("{");
    if (start >= 0) {
      const parsed = JSON.parse(msg.slice(start));
      if (typeof parsed?.error === "string") return parsed.error;
    }
  } catch {
    /* not json */
  }
  return msg;
}

/** Send conversation to the chatbot edge function and get the assistant reply. */
export async function sendChatMessage(messages: ChatMessagePayload[]): Promise<string> {
  const { data, error } = await supabase.functions.invoke("chatbot-chat", {
    body: { messages },
  });
  if (error) throw new Error(extractError(error) || "حصل خطأ في الاتصال بالمساعد، حاول تاني.");
  const res = data as any;
  if (res?.error) throw new Error(res.error);
  return String(res?.reply ?? "");
}

/** Admin: save chatbot provider settings (api_key optional => keep existing). */
export async function saveChatbotSettings(input: {
  provider_name?: string;
  base_url?: string;
  api_key?: string;
  model?: string;
}): Promise<void> {
  const { data, error } = await supabase.functions.invoke("chatbot-admin", {
    body: { action: "save", ...input },
  });
  if (error) throw new Error(extractError(error) || "تعذر حفظ الإعدادات.");
  if ((data as any)?.error) throw new Error((data as any).error);
}

export interface ChatbotSettingsView {
  provider_name: string;
  base_url: string;
  api_key_masked: string;
  has_api_key: boolean;
  model: string;
}

export async function getChatbotSettings(): Promise<ChatbotSettingsView | null> {
  const { data, error } = await supabase.functions.invoke("chatbot-admin", {
    body: { action: "get" },
  });
  if (error) throw new Error(extractError(error) || "تعذر تحميل الإعدادات.");
  if ((data as any)?.error) throw new Error((data as any).error);
  return (data as any)?.settings ?? null;
}

export async function fetchChatbotModels(base_url: string, api_key?: string): Promise<string[]> {
  const { data, error } = await supabase.functions.invoke("chatbot-admin", {
    body: { action: "models", base_url, api_key },
  });
  if (error) throw new Error(extractError(error) || "تعذر جلب الموديلات.");
  if ((data as any)?.error) throw new Error((data as any).error);
  return (data as any)?.models ?? [];
}

export async function testChatbotModel(): Promise<{
  ok: boolean;
  sample?: string;
  latency_ms?: number;
  error?: string;
}> {
  const { data, error } = await supabase.functions.invoke("chatbot-admin", {
    body: { action: "test" },
  });
  if (error) throw new Error(extractError(error) || "تعذر تجربة الموديل.");
  return data as { ok: boolean; sample?: string; latency_ms?: number; error?: string };
}
