import { useEffect, useRef, useState } from "react";
import {
  Canvas,
  Rect,
  Circle,
  Ellipse,
  Triangle,
  Polygon,
  Line,
  Path,
  Textbox,
  FabricImage,
  Gradient,
} from "fabric";
import { loadFont, preloadFontsFromJson } from "@/lib/card-fonts";
import { generateQrDataUrl } from "@/lib/card-qr";
import { placeholderForBinding, sampleFor, type BindingSource } from "@/lib/card-bindings";

export const CARD_WIDTH = 1011;
export const CARD_HEIGHT = 638;

// Custom properties we persist through toJSON/loadFromJSON
export const CUSTOM_PROPS = [
  "__isBg",
  "__binding",           // { key, label, kind }
  "__imagePlaceholder",  // boolean, marks a shape as an image slot
  "__isQrPlaceholder",   // boolean
  "__gradient",          // { angle, stops:[{offset,color}] }  (for shapes/text)
  "__origText",          // preserved static text so we can unbind/exit-sample
];

export interface CardCanvasHandle {
  canvas: Canvas | null;
}

interface Props {
  initialJson?: any;
  onReady?: (canvas: Canvas) => void;
  onSelectionChange?: (obj: any | null) => void;
  className?: string;
}

/**
 * A responsive wrapper for a Fabric.js canvas locked to the 1011×638 CR80 card size.
 * The DOM canvas stays at true resolution; CSS scaling handles fit-to-viewport,
 * so all stored coordinates remain in the real design space.
 */
export function CardCanvas({ initialJson, onReady, onSelectionChange, className }: Props) {
  const elRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<Canvas | null>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    if (!elRef.current) return;
    const c = new Canvas(elRef.current, {
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      backgroundColor: "#ffffff",
      preserveObjectStacking: true,
      selection: true,
    });
    canvasRef.current = c;

    const notify = () => {
      const active = c.getActiveObject();
      onSelectionChange?.(active ?? null);
    };
    c.on("selection:created", notify);
    c.on("selection:updated", notify);
    c.on("selection:cleared", () => onSelectionChange?.(null));

    (async () => {
      if (initialJson && Object.keys(initialJson).length > 0) {
        try {
          await preloadFontsFromJson(initialJson);
          await c.loadFromJSON(initialJson);
          normalizeLoadedCanvas(c);
        } catch (e) {
          console.error("Fabric load failed", e);
        }
      } else {
        lockCanvasSize(c);
      }
      onReady?.(c);
    })();

    return () => {
      c.dispose();
      canvasRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fit-to-container scaling
  useEffect(() => {
    const compute = () => {
      const el = wrapRef.current;
      if (!el) return;
      const availableWidth = Math.max(320, el.clientWidth - 8);
      const s = Math.min(1, availableWidth / CARD_WIDTH);
      setScale(s);
    };
    compute();
    const obs = new ResizeObserver(compute);
    if (wrapRef.current) obs.observe(wrapRef.current);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={wrapRef} className={className} dir="ltr">
      <div
        style={{
          width: CARD_WIDTH * scale,
          height: CARD_HEIGHT * scale,
          margin: "0 auto",
          overflow: "hidden",
          direction: "ltr",
          isolation: "isolate",
          boxSizing: "content-box",
        }}
        className="rounded-md border-2 border-primary bg-card shadow-2xl"
      >
        <div
          style={{
            width: CARD_WIDTH,
            height: CARD_HEIGHT,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            overflow: "hidden",
            position: "relative",
            direction: "ltr",
          }}
        >
          <canvas ref={elRef} width={CARD_WIDTH} height={CARD_HEIGHT} />
        </div>
      </div>
    </div>
  );
}

const CX = CARD_WIDTH / 2;
const CY = CARD_HEIGHT / 2;
const DEFAULT_FILL = "#3b82f6";

function lockCanvasSize(c: Canvas) {
  c.setDimensions({ width: CARD_WIDTH, height: CARD_HEIGHT });
  c.setViewportTransform([1, 0, 0, 1, 0, 0]);
  c.calcOffset();
  c.requestRenderAll();
}

function fitImageToCard(img: FabricImage) {
  const iw = img.width || CARD_WIDTH;
  const ih = img.height || CARD_HEIGHT;

  img.set({
    originX: "left",
    originY: "top",
    left: 0,
    top: 0,
    scaleX: CARD_WIDTH / iw,
    scaleY: CARD_HEIGHT / ih,
    angle: 0,
    flipX: false,
    flipY: false,
    skewX: 0,
    skewY: 0,
    selectable: false,
    evented: false,
    excludeFromExport: false,
    hasControls: false,
    hasBorders: false,
    lockMovementX: true,
    lockMovementY: true,
    lockScalingX: true,
    lockScalingY: true,
    lockRotation: true,
  });
}

function normalizeLoadedCanvas(c: Canvas) {
  lockCanvasSize(c);

  const backgroundObjects = c.getObjects().filter((obj: any, index) => {
    if (obj.type !== "image") return false;
    if (obj.__isBg) return true;
    if (index === 0 && obj.selectable === false && obj.evented === false) return true;
    const rawW = obj.width || CARD_WIDTH;
    const rawH = obj.height || CARD_HEIGHT;
    const renderedW = rawW * (obj.scaleX || 1);
    const renderedH = rawH * (obj.scaleY || 1);
    const looksLikeFullCard = renderedW >= CARD_WIDTH * 0.75 && renderedH >= CARD_HEIGHT * 0.75;
    return index === 0 && looksLikeFullCard && obj.selectable === false;
  }) as FabricImage[];

  const bg = backgroundObjects[backgroundObjects.length - 1];
  if (bg) {
    backgroundObjects.forEach((obj) => c.remove(obj));
    fitImageToCard(bg);
    c.backgroundImage = bg;
  } else if (c.backgroundImage) {
    fitImageToCard(c.backgroundImage as FabricImage);
  }

  c.getObjects().forEach((obj: any) => {
    if (obj.type === "textbox") {
      obj.set({ direction: obj.direction ?? "rtl", textAlign: obj.textAlign ?? "right" });
      obj.initDimensions?.();
    }
  });

  c.requestRenderAll();
}

function center(obj: any, w: number, h: number) {
  obj.set({ left: CX - w / 2, top: CY - h / 2 });
}

function place(c: Canvas, obj: any) {
  c.add(obj);
  c.setActiveObject(obj);
  c.requestRenderAll();
}

function polyPoints(sides: number, radius: number, startAngle = -Math.PI / 2) {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < sides; i++) {
    const a = startAngle + (i * 2 * Math.PI) / sides;
    pts.push({ x: radius + radius * Math.cos(a), y: radius + radius * Math.sin(a) });
  }
  return pts;
}

function starPoints(points: number, outer: number, inner: number) {
  const pts: { x: number; y: number }[] = [];
  const step = Math.PI / points;
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + i * step;
    pts.push({ x: outer + r * Math.cos(a), y: outer + r * Math.sin(a) });
  }
  return pts;
}

// Helpers exposed for the builder toolbar
export const cardCanvasHelpers = {
  addRect(c: Canvas) {
    const w = 200, h = 120;
    const r = new Rect({ width: w, height: h, fill: DEFAULT_FILL });
    center(r, w, h);
    place(c, r);
  },
  addRoundedRect(c: Canvas) {
    const w = 220, h = 130;
    const r = new Rect({ width: w, height: h, rx: 20, ry: 20, fill: DEFAULT_FILL });
    center(r, w, h);
    place(c, r);
  },
  addSquare(c: Canvas) {
    const s = 150;
    const r = new Rect({ width: s, height: s, fill: DEFAULT_FILL });
    center(r, s, s);
    place(c, r);
  },
  addCircle(c: Canvas) {
    const rad = 70;
    const cir = new Circle({ radius: rad, fill: "#f59e0b" });
    center(cir, rad * 2, rad * 2);
    place(c, cir);
  },
  addEllipse(c: Canvas) {
    const rx = 100, ry = 60;
    const e = new Ellipse({ rx, ry, fill: DEFAULT_FILL });
    center(e, rx * 2, ry * 2);
    place(c, e);
  },
  addTriangle(c: Canvas) {
    const w = 150, h = 140;
    const t = new Triangle({ width: w, height: h, fill: DEFAULT_FILL });
    center(t, w, h);
    place(c, t);
  },
  addRightTriangle(c: Canvas) {
    const s = 150;
    const p = new Polygon(
      [{ x: 0, y: 0 }, { x: 0, y: s }, { x: s, y: s }],
      { fill: DEFAULT_FILL },
    );
    center(p, s, s);
    place(c, p);
  },
  addDiamond(c: Canvas) {
    const s = 150;
    const p = new Polygon(
      [{ x: s / 2, y: 0 }, { x: s, y: s / 2 }, { x: s / 2, y: s }, { x: 0, y: s / 2 }],
      { fill: DEFAULT_FILL },
    );
    center(p, s, s);
    place(c, p);
  },
  addPentagon(c: Canvas) {
    const r = 80;
    const p = new Polygon(polyPoints(5, r), { fill: DEFAULT_FILL });
    center(p, r * 2, r * 2);
    place(c, p);
  },
  addHexagon(c: Canvas) {
    const r = 80;
    const p = new Polygon(polyPoints(6, r, 0), { fill: DEFAULT_FILL });
    center(p, r * 2, r * 2);
    place(c, p);
  },
  addStar(c: Canvas) {
    const outer = 80, inner = 34;
    const p = new Polygon(starPoints(5, outer, inner), { fill: "#f59e0b" });
    center(p, outer * 2, outer * 2);
    place(c, p);
  },
  addHeart(c: Canvas) {
    const path = new Path(
      "M 75,30 A 20,20 0,0,1 115,30 A 20,20 0,0,1 155,30 Q 155,80 115,120 Q 75,80 75,30 Z",
      { fill: "#ef4444" },
    );
    center(path, 160, 130);
    place(c, path);
  },
  addLine(c: Canvas) {
    const l = new Line([0, 0, 220, 0], { stroke: "#111827", strokeWidth: 4 });
    center(l, 220, 4);
    place(c, l);
  },
  addDashedLine(c: Canvas) {
    const l = new Line([0, 0, 220, 0], {
      stroke: "#111827",
      strokeWidth: 4,
      strokeDashArray: [12, 8],
    });
    center(l, 220, 4);
    place(c, l);
  },
  addArrow(c: Canvas) {
    const p = new Path(
      "M 0,20 L 160,20 L 160,5 L 200,30 L 160,55 L 160,40 L 0,40 Z",
      { fill: DEFAULT_FILL },
    );
    center(p, 200, 60);
    place(c, p);
  },
  addDoubleArrow(c: Canvas) {
    const p = new Path(
      "M 40,5 L 0,30 L 40,55 L 40,40 L 200,40 L 200,55 L 240,30 L 200,5 L 200,20 L 40,20 Z",
      { fill: DEFAULT_FILL },
    );
    center(p, 240, 60);
    place(c, p);
  },
  addChevron(c: Canvas) {
    const p = new Path(
      "M 0,0 L 140,0 L 200,50 L 140,100 L 0,100 L 60,50 Z",
      { fill: DEFAULT_FILL },
    );
    center(p, 200, 100);
    place(c, p);
  },
  addRing(c: Canvas) {
    const p = new Path(
      "M 80,0 A 80,80 0 1,0 80,160 A 80,80 0 1,0 80,0 Z M 80,40 A 40,40 0 1,1 80,120 A 40,40 0 1,1 80,40 Z",
      { fill: DEFAULT_FILL, fillRule: "evenodd" as any },
    );
    center(p, 160, 160);
    place(c, p);
  },
  addSpeechBubble(c: Canvas) {
    const p = new Path(
      "M 20,0 L 200,0 Q 220,0 220,20 L 220,90 Q 220,110 200,110 L 90,110 L 60,140 L 70,110 L 20,110 Q 0,110 0,90 L 0,20 Q 0,0 20,0 Z",
      { fill: DEFAULT_FILL },
    );
    center(p, 220, 140);
    place(c, p);
  },
  addRibbon(c: Canvas) {
    const p = new Path(
      "M 0,0 L 240,0 L 240,120 L 200,90 L 160,120 L 120,90 L 80,120 L 40,90 L 0,120 Z",
      { fill: "#ef4444" },
    );
    center(p, 240, 120);
    place(c, p);
  },
  addText(c: Canvas, opts?: { fontFamily?: string }) {
    const family = opts?.fontFamily ?? "Tajawal";
    const t = new Textbox("نص جديد", {
      width: 420,
      fontSize: 48,
      fontFamily: family,
      fill: "#0f172a",
      textAlign: "right",
      direction: "rtl" as any,
    });
    center(t, 420, 60);
    place(c, t);
  },
  addImagePlaceholder(c: Canvas) {
    const w = 220, h = 220;
    const r = new Rect({
      width: w,
      height: h,
      rx: 12,
      ry: 12,
      fill: "#e2e8f0",
      stroke: "#94a3b8",
      strokeDashArray: [10, 8],
      strokeWidth: 3,
    });
    (r as any).__imagePlaceholder = true;
    center(r, w, h);
    place(c, r);
  },
  addQrPlaceholder(c: Canvas) {
    const s = 180;
    const r = new Rect({
      width: s,
      height: s,
      fill: "#f1f5f9",
      stroke: "#0f172a",
      strokeDashArray: [8, 6],
      strokeWidth: 3,
    });
    (r as any).__isQrPlaceholder = true;
    (r as any).__binding = { key: "qr_token", label: "رمز QR", kind: "qr" };
    center(r, s, s);
    place(c, r);
  },
  async setFontFamily(c: Canvas, obj: any, family: string) {
    await loadFont(family);
    obj.set({ fontFamily: family });
    obj.initDimensions?.();
    c.requestRenderAll();
  },
  setObjectFill(c: Canvas, obj: any, color: string) {
    // Clear any gradient marker; go back to solid
    (obj as any).__gradient = undefined;
    obj.set({ fill: color });
    c.requestRenderAll();
  },
  setObjectStroke(c: Canvas, obj: any, color: string) {
    obj.set({ stroke: color });
    c.requestRenderAll();
  },
  setTextProp(c: Canvas, obj: any, patch: Record<string, any>) {
    obj.set(patch);
    obj.initDimensions?.();
    c.requestRenderAll();
  },
  setObjectProp(c: Canvas, obj: any, patch: Record<string, any>) {
    obj.set(patch);
    obj.setCoords?.();
    c.requestRenderAll();
  },
  applyGradient(c: Canvas, obj: any, cfg: { angle: number; stops: { offset: number; color: string }[] }) {
    const w = (obj.width ?? 100) * (obj.scaleX ?? 1);
    const h = (obj.height ?? 100) * (obj.scaleY ?? 1);
    const rad = ((cfg.angle % 360) * Math.PI) / 180;
    // gradient endpoints across the object's bounding box, coordSpace: object-local
    const dx = Math.cos(rad);
    const dy = Math.sin(rad);
    const halfDiag = (Math.abs(dx) * w + Math.abs(dy) * h) / 2;
    const cx = (obj.width ?? 100) / 2;
    const cy = (obj.height ?? 100) / 2;
    const x1 = cx - dx * halfDiag / (obj.scaleX ?? 1);
    const y1 = cy - dy * halfDiag / (obj.scaleY ?? 1);
    const x2 = cx + dx * halfDiag / (obj.scaleX ?? 1);
    const y2 = cy + dy * halfDiag / (obj.scaleY ?? 1);
    const g = new Gradient({
      type: "linear",
      coords: { x1, y1, x2, y2 },
      colorStops: cfg.stops.map((s) => ({ offset: s.offset, color: s.color })),
      gradientUnits: "pixels",
    });
    obj.set({ fill: g });
    (obj as any).__gradient = { angle: cfg.angle, stops: cfg.stops };
    c.requestRenderAll();
  },
  async bindObject(c: Canvas, obj: any, src: BindingSource) {
    if (obj.type === "textbox") {
      if ((obj as any).__origText === undefined) (obj as any).__origText = obj.text;
      obj.set({ text: placeholderForBinding(src.label) });
      obj.initDimensions?.();
    }
    (obj as any).__binding = { key: src.key, label: src.label, kind: src.kind };
    if (src.kind === "qr") {
      (obj as any).__isQrPlaceholder = true;
    }
    if (src.kind === "image") {
      (obj as any).__imagePlaceholder = true;
    }
    c.requestRenderAll();
  },
  unbindObject(c: Canvas, obj: any) {
    (obj as any).__binding = undefined;
    if (obj.type === "textbox" && (obj as any).__origText !== undefined) {
      obj.set({ text: (obj as any).__origText });
      (obj as any).__origText = undefined;
      obj.initDimensions?.();
    }
    c.requestRenderAll();
  },
  bringForward(c: Canvas) {
    const a = c.getActiveObject();
    if (a) { c.bringObjectForward(a); c.requestRenderAll(); }
  },
  sendBackwards(c: Canvas) {
    const a = c.getActiveObject();
    if (a) { c.sendObjectBackwards(a); c.requestRenderAll(); }
  },
  bringToFront(c: Canvas) {
    const a = c.getActiveObject();
    if (a) { c.bringObjectToFront(a); c.requestRenderAll(); }
  },
  sendToBack(c: Canvas) {
    const a = c.getActiveObject();
    if (a) { c.sendObjectToBack(a); c.requestRenderAll(); }
  },
  deleteActive(c: Canvas) {
    const a = c.getActiveObject();
    if (a) { c.remove(a); c.discardActiveObject(); c.requestRenderAll(); }
  },
  setBackgroundColor(c: Canvas, color: string) {
    const objs = c.getObjects().filter((o: any) => o.__isBg);
    objs.forEach((o) => c.remove(o));
    c.backgroundImage = undefined;
    c.backgroundColor = color;
    lockCanvasSize(c);
  },
  async setBackgroundImage(c: Canvas, url: string) {
    try {
      const img = await FabricImage.fromURL(url, { crossOrigin: "anonymous" });
      fitImageToCard(img);
      (img as any).__isBg = true;
      const oldBg = c.getObjects().filter((o: any) => o.__isBg);
      oldBg.forEach((o) => c.remove(o));
      c.backgroundImage = img;
      lockCanvasSize(c);
    } catch (e) {
      console.error("bg image load failed", e);
      throw e;
    }
  },
  serialize(c: Canvas): any {
    return c.toObject(CUSTOM_PROPS);
  },
};

/**
 * Apply live sample data to every bound object in place. Call restoreFromSample
 * with the returned snapshot to revert.
 */
export async function applySampleData(c: Canvas): Promise<any> {
  const snapshot = c.toObject(CUSTOM_PROPS);
  const objs = c.getObjects().slice();
  for (const obj of objs) {
    const b = (obj as any).__binding;
    if (!b) continue;
    if (b.kind === "text" && obj.type === "textbox") {
      (obj as any).set({ text: sampleFor(b.key, `[${b.label}]`) });
      (obj as any).initDimensions?.();
    } else if (b.kind === "qr") {
      // Replace placeholder with a real QR image at same bounds
      const dataUrl = await generateQrDataUrl(sampleFor(b.key, "sample-token"));
      const img = await FabricImage.fromURL(dataUrl, { crossOrigin: "anonymous" });
      const w = (obj.width ?? 180) * (obj.scaleX ?? 1);
      const h = (obj.height ?? 180) * (obj.scaleY ?? 1);
      img.set({
        left: obj.left, top: obj.top, angle: obj.angle,
        scaleX: w / (img.width || 1), scaleY: h / (img.height || 1),
      });
      (img as any).__isSampleSwap = true;
      c.remove(obj);
      c.add(img);
    } else if (b.kind === "image") {
      // Silhouette placeholder swap: use an inline SVG data URL
      const svg = `data:image/svg+xml;utf8,${encodeURIComponent(
        `<svg xmlns='http://www.w3.org/2000/svg' width='400' height='400' viewBox='0 0 400 400'><rect width='400' height='400' rx='24' fill='#e2e8f0'/><circle cx='200' cy='150' r='70' fill='#94a3b8'/><path d='M60 340 Q200 220 340 340 L340 400 L60 400 Z' fill='#94a3b8'/></svg>`,
      )}`;
      const img = await FabricImage.fromURL(svg, { crossOrigin: "anonymous" });
      const w = (obj.width ?? 200) * (obj.scaleX ?? 1);
      const h = (obj.height ?? 200) * (obj.scaleY ?? 1);
      img.set({
        left: obj.left, top: obj.top, angle: obj.angle,
        scaleX: w / (img.width || 1), scaleY: h / (img.height || 1),
      });
      (img as any).__isSampleSwap = true;
      c.remove(obj);
      c.add(img);
    }
  }
  c.discardActiveObject();
  c.requestRenderAll();
  return snapshot;
}

export async function restoreFromSample(c: Canvas, snapshot: any) {
  await preloadFontsFromJson(snapshot);
  await c.loadFromJSON(snapshot);
  normalizeLoadedCanvas(c);
  c.requestRenderAll();
}


/**
 * Renders a stored fabric JSON to a data URL for use as a static preview thumbnail.
 */
export async function renderCardToDataURL(json: any): Promise<string> {
  const el = document.createElement("canvas");
  el.width = CARD_WIDTH;
  el.height = CARD_HEIGHT;
  const c = new Canvas(el, {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    backgroundColor: "#ffffff",
  });
  try {
    if (json && Object.keys(json).length > 0) {
      await preloadFontsFromJson(json);
      await c.loadFromJSON(json);
      normalizeLoadedCanvas(c);
    }
    c.renderAll();
    const url = c.toDataURL({ format: "png", multiplier: 0.5 });
    return url;
  } finally {
    c.dispose();
  }
}
