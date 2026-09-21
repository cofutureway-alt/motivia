import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronUp,
  ChevronDown,
  GripVertical,
  Plus,
  Trash2,
  Globe,
  Link2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface SocialLinkItem {
  platform: string;
  url: string;
}

const PLATFORM_PRESETS = [
  "YouTube",
  "Facebook",
  "Instagram",
  "Twitter",
  "Telegram",
  "WhatsApp",
  "TikTok",
  "LinkedIn",
  "Snapchat",
  "Website",
];

interface SocialLinksEditorProps {
  links: SocialLinkItem[];
  onChange: (updated: SocialLinkItem[]) => void;
  title?: string;
  description?: string;
}

export function SocialLinksEditor({
  links,
  onChange,
  title = "روابط التواصل الاجتماعي",
  description = "أضف أداة التواصل الخاصة بك وروابط الصفحات الرسمية.",
}: SocialLinksEditorProps) {
  const addLink = () => {
    onChange([...links, { platform: "Facebook", url: "" }]);
  };

  const removeLink = (i: number) => {
    onChange(links.filter((_, idx) => idx !== i));
  };

  const changeLink = (i: number, val: SocialLinkItem) => {
    onChange(links.map((l, idx) => (idx === i ? val : l)));
  };

  const moveLink = (i: number, dir: -1 | 1) => {
    const arr = [...links];
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    onChange(arr);
  };

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between gap-4 pb-3 border-b border-border/60">
        <div>
          <div className="font-bold text-sm text-foreground">{title}</div>
          {description && (
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          )}
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={addLink}
          className="gap-1.5 shrink-0"
        >
          <Plus className="w-4 h-4" />
          إضافة رابط
        </Button>
      </div>

      <AnimatePresence initial={false}>
        {links.length === 0 ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-2 py-8 text-muted-foreground/60 rounded-2xl border border-dashed border-border p-4 text-center"
          >
            <Link2 className="w-6 h-6" />
            <p className="text-xs">لا توجد روابط مسجلة بعد. اضغط "إضافة رابط" لإضافة أول رابط.</p>
          </motion.div>
        ) : (
          <div className="space-y-2.5">
            {links.map((link, i) => (
              <motion.div
                key={i}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8, scale: 0.97 }}
                transition={{ duration: 0.2 }}
                className="flex items-center gap-2 bg-secondary/40 rounded-xl p-2.5 border border-border"
              >
                <GripVertical className="w-4 h-4 text-muted-foreground/40 shrink-0 cursor-grab" />

                <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2 min-w-0">
                  <select
                    value={PLATFORM_PRESETS.includes(link.platform) ? link.platform : "custom"}
                    onChange={(e) => {
                      if (e.target.value !== "custom") {
                        changeLink(i, { ...link, platform: e.target.value });
                      }
                    }}
                    className="w-full h-9 rounded-lg border border-input bg-background px-3 text-xs focus:outline-none focus:ring-2 focus:ring-ring appearance-none"
                    dir="rtl"
                  >
                    {PLATFORM_PRESETS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                    {!PLATFORM_PRESETS.includes(link.platform) && (
                      <option value="custom">{link.platform}</option>
                    )}
                    <option value="custom">أخرى…</option>
                  </select>

                  <Input
                    placeholder="https://..."
                    value={link.url}
                    onChange={(e) => changeLink(i, { ...link, url: e.target.value })}
                    className="h-9 text-xs"
                    dir="ltr"
                  />
                </div>

                <div className="flex flex-col gap-0.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => moveLink(i, -1)}
                    disabled={i === 0}
                    className="p-1 rounded hover:bg-secondary disabled:opacity-20 transition-colors"
                  >
                    <ChevronUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveLink(i, 1)}
                    disabled={i === links.length - 1}
                    className="p-1 rounded hover:bg-secondary disabled:opacity-20 transition-colors"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => removeLink(i)}
                  className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </motion.div>
            ))}
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
