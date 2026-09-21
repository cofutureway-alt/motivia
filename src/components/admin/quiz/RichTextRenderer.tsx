import { useMemo } from "react";
import { generateHTML } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { MathExtension } from "@aarkue/tiptap-math-extension";
import DOMPurify from "dompurify";
import "katex/dist/katex.min.css";
import "katex/contrib/mhchem";
import { cn } from "@/lib/utils";

interface Props {
  content: unknown;
  className?: string;
}

const isEmptyDoc = (json: unknown): boolean => {
  if (!json || typeof json !== "object") return true;
  const j = json as { content?: unknown[] };
  if (!j.content || j.content.length === 0) return true;
  // check any non-empty text node exists
  const walk = (node: unknown): boolean => {
    if (!node || typeof node !== "object") return false;
    const n = node as { type?: string; text?: string; content?: unknown[]; attrs?: Record<string, unknown> };
    if (n.type === "text" && n.text && n.text.trim().length > 0) return true;
    if (n.type === "image" && n.attrs?.src) return true;
    if (n.type === "inlineMath" && n.attrs?.latex) return true;
    if (n.content) return n.content.some(walk);
    return false;
  };
  return !walk(json);
};

const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const RichTextRenderer = ({ content, className }: Props) => {
  const html = useMemo(() => {
    if (!content) return "";
    try {
      // Plain-string content is NOT trusted HTML — escape and preserve line breaks.
      if (typeof content === "string") {
        return escapeHtml(content).replace(/\n/g, "<br/>");
      }
      const raw = generateHTML(content as never, [
        StarterKit.configure({ heading: false }),
        Image,
        MathExtension.configure({ evaluation: false, addInlineMath: true }),
      ]);
      // Sanitize the generated HTML to strip any script/handler that slipped through.
      return DOMPurify.sanitize(raw, { USE_PROFILES: { html: true, mathMl: true, svg: true } });
    } catch {
      return "";
    }
  }, [content]);


  return (
    <div
      dir="rtl"
      className={cn(
        "prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 break-words",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

export { isEmptyDoc };
export default RichTextRenderer;
