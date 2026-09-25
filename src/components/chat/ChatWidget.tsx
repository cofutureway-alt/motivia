import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MessageCircle, X, Trash2, SendHorizonal, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { usePlatformSettings } from "@/hooks/use-platform-settings";
import { useChatHistory, type ChatMsg } from "@/hooks/use-chat-history";
import { sendChatMessage, type ChatMessagePayload } from "@/lib/chat-api";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

const QUICK_QUESTIONS = [
  "ازاي اعمل حساب على المنصة؟",
  "ازاي اشتري كورس؟",
  "مين الأوائل على المنصة؟",
  "أسعار الكتب والشحن كام؟",
];

interface ChatMessageRowProps {
  role: "user" | "assistant";
  content: string;
}

const ChatMessageRow = ({ role, content }: ChatMessageRowProps) => (
  <motion.div
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    className={role === "user" ? "flex justify-end" : "flex justify-start"}
  >
    <div
      className={cn(
        "max-w-[85%] px-4 py-2.5 text-sm leading-relaxed",
        role === "user"
          ? "rounded-2xl rounded-bl-md bg-primary text-primary-foreground shadow-soft"
          : "rounded-2xl rounded-br-md border border-border/60 bg-card text-foreground shadow-subtle"
      )}
    >
      <span className="whitespace-pre-wrap break-words">{content}</span>
    </div>
  </motion.div>
);

const ChatWidget = () => {
  const { settings } = usePlatformSettings();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const { messages, loading, appendMessage, clearHistory } = useChatHistory(user?.id ?? null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const enabled = settings.chatbot_enabled !== false;

  // Lock background scroll while the full-screen mobile panel is open
  useEffect(() => {
    if (!open || !isMobile) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, isMobile]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, sending, open]);

  useEffect(() => {
    if (open && !isMobile) inputRef.current?.focus();
  }, [open]);

  if (!enabled) return null;

  const handleSend = async (override?: string) => {
    const text = (override ?? input).trim();
    if (!text || sending) return;
    setInput("");
    appendMessage("user", text);
    setSending(true);
    try {
      const history: ChatMessagePayload[] = [...messages, { role: "user", content: text }].map(
        (m: ChatMsg) => ({ role: m.role, content: m.content })
      );
      const reply = await sendChatMessage(history);
      appendMessage("assistant", reply || "معنديش رد دلوقتي، جرب تاني.");
    } catch (err: any) {
      appendMessage("assistant", err?.message || "حصل خطأ، حاول تاني.");
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleClear = async () => {
    if (!window.confirm("هتمسح كل رسايل المحادثة، متأكد؟")) return;
    await clearHistory();
  };

  return (
    <>
      {/* Floating launcher — bottom-right, above the mobile bottom nav */}
      <AnimatePresence>
        {enabled && !open && (
          <motion.div
            key="chat-launcher"
            initial={{ opacity: 0, scale: 0.5, y: 20 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ type: "spring", stiffness: 320, damping: 24 }}
            className="fixed z-[60]"
            style={{
              right: 16,
              bottom: isMobile ? "calc(env(safe-area-inset-bottom, 0px) + 108px)" : 24,
            }}
          >
            <motion.button
              type="button"
              aria-label="افتح المساعد"
              onClick={() => setOpen(true)}
              whileHover={{ scale: 1.08, y: -2 }}
              whileTap={{ scale: 0.92 }}
              className="relative flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-float ring-4 ring-background/80"
            >
              <span className="absolute inset-0 rounded-full bg-primary/40 animate-ping" aria-hidden />
              <MessageCircle className="relative h-6 w-6" />
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <motion.div
            key="chat-panel"
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            dir="rtl"
            className={cn(
              "fixed z-[70] flex flex-col overflow-hidden border border-border/60 bg-background shadow-[0_20px_60px_-15px_hsl(var(--foreground)/0.35)]",
              isMobile
                ? "inset-0 rounded-none"
                : "bottom-24 right-6 h-[600px] max-h-[calc(100vh-7rem)] w-[400px] rounded-3xl"
            )}
          >
            {/* Header */}
            <div className="flex items-center gap-3 border-b border-border/60 bg-card px-4 py-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <MessageCircle className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-bold text-foreground">مساعد موتيفيا</div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  متصل وبيساعدك في المنصة
                </div>
              </div>
              <button
                type="button"
                onClick={handleClear}
                aria-label="مسح المحادثة"
                className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              {/* Prominent animated exit button */}
              <motion.button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="اقفل الشات"
                whileHover={{ scale: 1.1, rotate: 90 }}
                whileTap={{ scale: 0.9 }}
                className="relative flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-float"
              >
                <X className="h-5 w-5" />
                <motion.span
                  className="absolute inset-0 rounded-full border-2 border-primary/60"
                  animate={{ scale: [1, 1.35, 1], opacity: [0.7, 0, 0] }}
                  transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
                  aria-hidden
                />
              </motion.button>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {loading ? (
                <div className="flex h-full items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-5 text-center">
                  <div className="flex flex-col items-center gap-3 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <MessageCircle className="h-7 w-7" />
                    </div>
                    <p className="max-w-[260px] text-sm text-muted-foreground">
                      أهلًا بك في مساعد موتيفيا. اسألني أي حاجة عن المنصة وهقولك تعملها إزاي بالظبط.
                    </p>
                  </div>
                  <div className="flex w-full max-w-[300px] flex-col gap-2">
                    {QUICK_QUESTIONS.map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => handleSend(q)}
                        className="rounded-xl border border-border/60 bg-card px-3 py-2 text-right text-sm text-foreground shadow-subtle transition-colors hover:border-primary/50 hover:text-primary"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((m) => <ChatMessageRow key={m.id} role={m.role} content={m.content} />)
              )}

              {sending && (
                <div className="flex justify-end">
                  <div className="rounded-2xl rounded-br-md border border-border/60 bg-card px-4 py-3">
                    <div className="flex gap-1">
                      {[0, 1, 2].map((i) => (
                        <motion.span
                          key={i}
                          className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60"
                          animate={{ opacity: [0.3, 1, 0.3] }}
                          transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}

            </div>

            {/* Input */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="flex items-center gap-2 border-t border-border/60 bg-card px-3 py-3"
            >
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="اكتب سؤالك عن المنصة..."
                className="h-11 flex-1 rounded-xl border border-input bg-background px-4 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
                maxLength={1000}
              />
              <button
                type="submit"
                disabled={sending || !input.trim()}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-soft transition-opacity disabled:opacity-40"
                aria-label="إرسال"
              >
                {sending ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <SendHorizonal className="h-5 w-5 rotate-180" />
                )}
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
      </>
    );
};

export default ChatWidget;
