import { useMemo, useState } from "react";
import type { Canvas } from "fabric";
import {
  PaintBucket,
  Move,
  RotateCw,
  Maximize2,
  Sparkles,
  Image as ImageIcon,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cardCanvasHelpers } from "./CardCanvas";
import { BindingPicker } from "./BindingPicker";

interface Props {
  canvas: Canvas | null;
  obj: any;
  onChange: () => void;
  /** Hide the fill/gradient controls (text panel provides its own). */
  hideFill?: boolean;
}

/** Style + geometry controls for any (non-text) object; text gets its own panel. */
export function ObjectProperties({ canvas, obj, onChange, hideFill }: Props) {
  const [useGradient, setUseGradient] = useState(!!obj.__gradient);
  const g = obj.__gradient ?? { angle: 90, stops: [{ offset: 0, color: "#3b82f6" }, { offset: 1, color: "#8b5cf6" }] };
  const [angle, setAngle] = useState<number>(g.angle);
  const [stop1, setStop1] = useState<string>(g.stops[0]?.color ?? "#3b82f6");
  const [stop2, setStop2] = useState<string>(g.stops[1]?.color ?? "#8b5cf6");

  const isImgSlot = !!obj.__imagePlaceholder;
  const isQr = !!obj.__isQrPlaceholder;
  const currentBinding = obj.__binding ?? null;
  const allowedKinds: any[] = isQr
    ? ["qr"]
    : obj.type === "textbox"
      ? ["text"]
      : isImgSlot
        ? ["image"]
        : ["text"];

  const patch = (p: Record<string, any>) => {
    if (!canvas) return;
    cardCanvasHelpers.setObjectProp(canvas, obj, p);
    onChange();
  };

  const setSolid = (color: string) => {
    if (!canvas) return;
    setUseGradient(false);
    cardCanvasHelpers.setObjectFill(canvas, obj, color);
    onChange();
  };

  const applyGrad = (nextAngle = angle, s1 = stop1, s2 = stop2) => {
    if (!canvas) return;
    cardCanvasHelpers.applyGradient(canvas, obj, {
      angle: nextAngle,
      stops: [{ offset: 0, color: s1 }, { offset: 1, color: s2 }],
    });
    onChange();
  };

  const solidFill = typeof obj.fill === "string" ? obj.fill : "#3b82f6";
  const opacity = Math.round(((obj.opacity ?? 1) as number) * 100);
  const w = Math.round((obj.width ?? 0) * (obj.scaleX ?? 1));
  const h = Math.round((obj.height ?? 0) * (obj.scaleY ?? 1));

  return (
    <div className="space-y-3">
      {/* Binding */}
      <BindingPicker
        currentBinding={currentBinding}
        allowedKinds={allowedKinds}
        onPick={(s) => { canvas && cardCanvasHelpers.bindObject(canvas, obj, s); onChange(); }}
        onUnbind={() => { canvas && cardCanvasHelpers.unbindObject(canvas, obj); onChange(); }}
      />

      {/* Image-placeholder toggle for shapes only */}
      {obj.type !== "textbox" && !isQr && (
        <div className="flex items-center justify-between rounded-md border border-border px-2 py-1.5">
          <Label className="text-xs flex items-center gap-1.5">
            <ImageIcon className="w-3.5 h-3.5" /> استخدام كصورة
          </Label>
          <input
            type="checkbox"
            checked={isImgSlot}
            onChange={(e) => { obj.__imagePlaceholder = e.target.checked; if (!e.target.checked && obj.__binding?.kind === "image") { canvas && cardCanvasHelpers.unbindObject(canvas, obj); } onChange(); }}
            className="w-4 h-4 accent-primary"
          />
        </div>
      )}

      {/* Fill (solid or gradient) */}
      {!hideFill && (
      <div>{/* fill-block-start */}
        <div className="flex items-center justify-between mb-1.5">
          <Label className="text-xs flex items-center gap-1.5">
            <PaintBucket className="w-3 h-3" /> التعبئة
          </Label>
          <div className="flex text-[10px] rounded-md border border-border overflow-hidden">
            <button type="button" onClick={() => { setUseGradient(false); setSolid(solidFill); }} className={`px-2 py-0.5 ${!useGradient ? "bg-primary text-primary-foreground" : ""}`}>لون</button>
            <button type="button" onClick={() => { setUseGradient(true); applyGrad(); }} className={`px-2 py-0.5 gap-1 flex items-center ${useGradient ? "bg-primary text-primary-foreground" : ""}`}><Sparkles className="w-3 h-3" />تدرج</button>
          </div>
        </div>
        {!useGradient ? (
          <div className="flex items-center gap-1.5">
            <input type="color" value={solidFill} onChange={(e) => setSolid(e.target.value)} className="w-9 h-9 rounded-md border border-border cursor-pointer bg-transparent" />
            <Input value={solidFill} onChange={(e) => setSolid(e.target.value)} className="h-9 font-mono text-xs" />
          </div>
        ) : (
          <div className="space-y-2 rounded-md border border-border p-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px]">لون 1</Label>
                <div className="flex items-center gap-1">
                  <input type="color" value={stop1} onChange={(e) => { setStop1(e.target.value); applyGrad(angle, e.target.value, stop2); }} className="w-8 h-8 rounded-md border border-border cursor-pointer bg-transparent" />
                  <Input value={stop1} onChange={(e) => { setStop1(e.target.value); applyGrad(angle, e.target.value, stop2); }} className="h-8 font-mono text-[10px]" />
                </div>
              </div>
              <div>
                <Label className="text-[10px]">لون 2</Label>
                <div className="flex items-center gap-1">
                  <input type="color" value={stop2} onChange={(e) => { setStop2(e.target.value); applyGrad(angle, stop1, e.target.value); }} className="w-8 h-8 rounded-md border border-border cursor-pointer bg-transparent" />
                  <Input value={stop2} onChange={(e) => { setStop2(e.target.value); applyGrad(angle, stop1, e.target.value); }} className="h-8 font-mono text-[10px]" />
                </div>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-[10px] text-muted-foreground"><span>زاوية</span><span className="font-mono">{angle}°</span></div>
              <Slider value={[angle]} min={0} max={360} step={1} onValueChange={([v]) => { setAngle(v); applyGrad(v, stop1, stop2); }} />
            </div>
          </div>
        )}
      </div>
      )}

      {/* Opacity */}
      <div>
        <div className="flex justify-between text-xs mb-1">
          <Label className="text-xs">الشفافية</Label>
          <span className="font-mono text-muted-foreground">{opacity}%</span>
        </div>
        <Slider value={[opacity]} min={0} max={100} step={1} onValueChange={([v]) => patch({ opacity: v / 100 })} />
      </div>

      {/* Position */}
      <div>
        <Label className="text-xs flex items-center gap-1.5"><Move className="w-3 h-3" /> الموضع</Label>
        <div className="grid grid-cols-2 gap-2 mt-1.5">
          <NumInput label="X" value={Math.round(obj.left ?? 0)} onChange={(v) => patch({ left: v })} />
          <NumInput label="Y" value={Math.round(obj.top ?? 0)} onChange={(v) => patch({ top: v })} />
        </div>
      </div>

      {/* Size */}
      <div>
        <Label className="text-xs flex items-center gap-1.5"><Maximize2 className="w-3 h-3" /> الحجم</Label>
        <div className="grid grid-cols-2 gap-2 mt-1.5">
          <NumInput label="العرض" value={w} onChange={(v) => { obj.set({ scaleX: 1, width: v }); onChange(); canvas?.requestRenderAll(); }} />
          <NumInput label="الارتفاع" value={h} onChange={(v) => { obj.set({ scaleY: 1, height: v }); onChange(); canvas?.requestRenderAll(); }} />
        </div>
      </div>

      {/* Rotation */}
      <div>
        <div className="flex justify-between text-xs mb-1">
          <Label className="text-xs flex items-center gap-1.5"><RotateCw className="w-3 h-3" /> الدوران</Label>
          <span className="font-mono text-muted-foreground">{Math.round(obj.angle ?? 0)}°</span>
        </div>
        <Slider value={[Math.round(obj.angle ?? 0)]} min={0} max={360} step={1} onValueChange={([v]) => patch({ angle: v })} />
      </div>
    </div>
  );
}

function NumInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <Input type="number" value={value} onChange={(e) => onChange(Number(e.target.value) || 0)} className="h-8 font-mono text-xs" />
    </div>
  );
}
