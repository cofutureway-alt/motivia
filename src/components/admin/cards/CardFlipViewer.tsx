import { useEffect, useRef, useState } from "react";
import { Canvas } from "fabric";
import { motion, AnimatePresence } from "framer-motion";
import { CARD_WIDTH, CARD_HEIGHT, applySampleData, restoreFromSample } from "./CardCanvas";
import { preloadFontsFromJson } from "@/lib/card-fonts";

interface Props {
  frontJson: any;
  backJson: any;
  sample: boolean;
  /** "flip" = single face with 3D flip toggle; "side" = both faces side by side */
  mode: "flip" | "side";
  flipped: boolean;
}

/** Read-only preview canvas that renders a stored fabric JSON. */
function StaticFace({ json, sample, label }: { json: any; sample: boolean; label: string }) {
  const elRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    if (!elRef.current) return;
    const c = new Canvas(elRef.current, {
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      backgroundColor: "#ffffff",
      selection: false,
    });
    (async () => {
      try {
        if (json && Object.keys(json).length > 0) {
          await preloadFontsFromJson(json);
          await c.loadFromJSON(json);
        }
        c.getObjects().forEach((o: any) => o.set({ selectable: false, evented: false }));
        if (sample) await applySampleData(c);
        c.requestRenderAll();
      } catch (e) { console.error(e); }
    })();
    return () => { c.dispose(); };
  }, [json, sample]);

  useEffect(() => {
    const compute = () => {
      const el = wrapRef.current;
      if (!el) return;
      const avail = Math.max(240, el.clientWidth - 8);
      setScale(Math.min(1, avail / CARD_WIDTH));
    };
    compute();
    const obs = new ResizeObserver(compute);
    if (wrapRef.current) obs.observe(wrapRef.current);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={wrapRef} className="w-full" dir="ltr">
      <div className="text-[10px] text-muted-foreground text-center mb-1 font-bold" dir="rtl">{label}</div>
      <div
        style={{ width: CARD_WIDTH * scale, height: CARD_HEIGHT * scale, margin: "0 auto", overflow: "hidden", isolation: "isolate" }}
        className="rounded-md border-2 border-primary bg-card shadow-2xl"
      >
        <div style={{ width: CARD_WIDTH, height: CARD_HEIGHT, transform: `scale(${scale})`, transformOrigin: "top left", overflow: "hidden", position: "relative" }}>
          <canvas ref={elRef} width={CARD_WIDTH} height={CARD_HEIGHT} />
        </div>
      </div>
    </div>
  );
}

export function CardFlipViewer({ frontJson, backJson, sample, mode, flipped }: Props) {
  if (mode === "side") {
    return (
      <motion.div layout className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <StaticFace json={frontJson} sample={sample} label="الوجه الأمامي" />
        <StaticFace json={backJson} sample={sample} label="الوجه الخلفي" />
      </motion.div>
    );
  }

  return (
    <div className="relative w-full flex items-center justify-center" style={{ perspective: 1600 }}>
      <motion.div
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
        style={{ transformStyle: "preserve-3d", width: "100%" }}
        className="relative"
      >
        <div style={{ backfaceVisibility: "hidden" }}>
          <StaticFace json={frontJson} sample={sample} label="الوجه الأمامي" />
        </div>
        <div style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)", position: "absolute", top: 0, left: 0, width: "100%" }}>
          <StaticFace json={backJson} sample={sample} label="الوجه الخلفي" />
        </div>
      </motion.div>
    </div>
  );
}
