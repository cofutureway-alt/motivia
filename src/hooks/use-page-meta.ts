import { useEffect } from "react";

export const SITE_NAME = "Motivai";
export const SITE_NAME_EN = "Motivai Learning Platform";

/**
 * Sets document title (and optional description) for a page.
 * Title pattern: `${title} — ${SITE_NAME}` or just the site name when no title.
 */
export function usePageMeta(title?: string, description?: string) {
  useEffect(() => {
    const prev = document.title;
    document.title = title ? `${title} — ${SITE_NAME}` : SITE_NAME;
    let prevDesc: string | null = null;
    if (description) {
      const el = document.querySelector('meta[name="description"]');
      if (el) {
        prevDesc = el.getAttribute("content");
        el.setAttribute("content", description);
      }
    }
    return () => {
      document.title = prev;
      if (prevDesc !== null) {
        const el = document.querySelector('meta[name="description"]');
        el?.setAttribute("content", prevDesc);
      }
    };
  }, [title, description]);
}
