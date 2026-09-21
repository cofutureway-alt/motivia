import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";

export interface WatermarkConfig {
  text: string;
  color?: string;
  opacity?: number;
  speedSeconds?: number;
  fontSize?: number;
}

/**
 * Animated watermark overlay that survives fullscreen mode by portalling
 * itself into whichever element is currently fullscreen. Stays clipped
 * inside the video area with safe padding so it never escapes bounds.
 */
export const Watermark = ({
  text,
  color = "#ffffff",
  opacity = 0.35,
  speedSeconds = 22,
  fontSize = 14,
}: WatermarkConfig) => {
  const [pos, setPos] = useState({ x: 12, y: 14 });
  const [fsEl, setFsEl] = useState<Element | null>(null);

  useEffect(() => {
    const points = [
      { x: 12, y: 14 },
      { x: 78, y: 16 },
      { x: 82, y: 80 },
      { x: 14, y: 84 },
      { x: 50, y: 48 },
      { x: 70, y: 30 },
      { x: 22, y: 62 },
    ];
    let i = 0;
    setPos(points[0]);
    const step = () => {
      i = (i + 1) % points.length;
      setPos(points[i]);
    };
    const id = window.setInterval(step, speedSeconds * 1000);
    return () => window.clearInterval(id);
  }, [speedSeconds]);

  useEffect(() => {
    const onFs = () => {
      const el =
        document.fullscreenElement ||
        // @ts-expect-error – vendor
        document.webkitFullscreenElement ||
        null;
      setFsEl(el as Element | null);
    };
    document.addEventListener("fullscreenchange", onFs);
    document.addEventListener("webkitfullscreenchange", onFs as EventListener);
    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      document.removeEventListener("webkitfullscreenchange", onFs as EventListener);
    };
  }, []);

  if (!text) return null;

  const inner = (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden select-none"
      style={{ zIndex: 2147483000 }}
      aria-hidden="true"
    >
      <motion.div
        animate={{ left: `${pos.x}%`, top: `${pos.y}%` }}
        transition={{ duration: Math.max(6, speedSeconds), ease: "easeInOut" }}
        className="absolute max-w-[70%] truncate"
        style={{
          color,
          opacity,
          fontSize,
          textShadow: "0 1px 3px rgba(0,0,0,0.75)",
          fontWeight: 700,
          letterSpacing: 0.4,
          whiteSpace: "nowrap",
          transform: "translate(-50%, -50%)",
          direction: "ltr",
        }}
      >
        {text}
      </motion.div>
    </div>
  );

  // When in fullscreen, portal into the fullscreen element so the watermark
  // remains visible over the video (browsers hide non-fullscreen siblings).
  if (fsEl) {
    // Ensure the fullscreen container can host absolutely-positioned children.
    if (fsEl instanceof HTMLElement) {
      const cs = window.getComputedStyle(fsEl);
      if (cs.position === "static") fsEl.style.position = "relative";
    }
    return createPortal(inner, fsEl);
  }
  return inner;
};

export default Watermark;
