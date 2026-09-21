import { useMemo, useState } from "react";
import type { Canvas } from "fabric";
import { AlignLeft, AlignCenter, AlignRight, Bold, Italic, Type, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FEATURED_FONTS, GOOGLE_FONTS, loadFont } from "@/lib/card-fonts";
import { cardCanvasHelpers } from "./CardCanvas";
import { ObjectProperties } from "./ObjectProperties";

interface Props {
  canvas: Canvas | null;
  obj: any;
  onChange: () => void;
}

export function TextProperties({ canvas, obj, onChange }: Props) {
  const [search, setSearch] = useState("");
  const [useGradient, setUseGradient] = useState(!!obj.__gradient);
  const g = obj.__gradient ?? { angle: 90, stops: [{ offset: 0, color: "#0f172a" }, { offset: 1, color: "#3b82f6" }] };
  const [gAngle, setGAngle] = useState<number>(g.angle);
  const [s1, setS1] = useState(g.stops[0]?.color ?? "#0f172a");
  const [s2, setS2] = useState(g.stops[1]?.color ?? "#3b82f6");

  const filtered = useMemo(
    () => GOOGLE_FONTS.filter((f) => f.toLowerCase().includes(search.trim().toLowerCase())),
    [search],
  );

  const applyFont = async (f: string) => {
    if (!canvas) return;
    await cardCanvasHelpers.setFontFamily(canvas, obj, f);
    onChange();
  };

  const patch = (p: Record<string, any>) => {
    if (!canvas) return;
    cardCanvasHelpers.setTextProp(canvas, obj, p);
    onChange();
  };

  const applyGrad = (a = gAngle, a1 = s1, a2 = s2) => {
    if (!canvas) return;
    cardCanvasHelpers.applyGradient(canvas, obj, { angle: a, stops: [{ offset: 0, color: a1 }, { offset: 1, color: a2 }] });
    onChange();
  };

  const family = obj.fontFamily ?? "Tajawal";
  const fill = typeof obj.fill === "string" ? obj.fill : "#000000";
  const align = obj.textAlign ?? "right";
  const isBold = String(obj.fontWeight ?? "").toString() === "bold" || obj.fontWeight === 700;
  const isItalic = obj.fontStyle === "italic";
  const charSpacing = obj.charSpacing ?? 0;
  const skewX = obj.skewX ?? 0;
  const bgColor = obj.backgroundColor ?? "";
  const padding = obj.padding ?? 0;
  const hasBg = !!bgColor;

  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs">الخط</Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-full justify-between mt-1.5" type="button">
              <span style={{ fontFamily: family }} className="truncate">{family}</span>
              <Type className="w-4 h-4 opacity-60" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 p-2">
            <Input placeholder="ابحث..." value={search} onChange={(e) => setSearch(e.target.value)} className="mb-2 h-8" />
            <div className="max-h-64 overflow-y-auto space-y-0.5">
              <div className="text-[10px] uppercase text-muted-foreground px-2 pt-1">مميزة</div>
              {FEATURED_FONTS.map((f) => (<FontRow key={f} f={f} active={family === f} onPick={applyFont} onHover={loadFont} />))}
              <div className="text-[10px] uppercase text-muted-foreground px-2 pt-2">جميع الخطوط</div>
              {filtered.filter((f) => !FEATURED_FONTS.includes(f as any)).map((f) => (
                <FontRow key={f} f={f} active={family === f} onPick={applyFont} onHover={loadFont} />
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">الحجم</Label>
          <Input type="number" min={8} max={400} value={Math.round(obj.fontSize ?? 48)} onChange={(e) => patch({ fontSize: Number(e.target.value) || 48 })} className="mt-1.5 h-9" />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">اللون</Label>
            <div className="flex text-[10px] rounded-md border border-border overflow-hidden">
              <button type="button" onClick={() => { setUseGradient(false); patch({ fill: fill }); }} className={`px-1.5 ${!useGradient ? "bg-primary text-primary-foreground" : ""}`}>لون</button>
              <button type="button" onClick={() => { setUseGradient(true); applyGrad(); }} className={`px-1.5 flex items-center ${useGradient ? "bg-primary text-primary-foreground" : ""}`}><Sparkles className="w-3 h-3" /></button>
            </div>
          </div>
          {!useGradient ? (
            <input type="color" value={fill} onChange={(e) => patch({ fill: e.target.value })} className="w-full h-9 mt-1.5 rounded-md border border-border cursor-pointer bg-transparent" />
          ) : (
            <div className="flex items-center gap-1 mt-1.5">
              <input type="color" value={s1} onChange={(e) => { setS1(e.target.value); applyGrad(gAngle, e.target.value, s2); }} className="w-9 h-9 rounded-md border border-border cursor-pointer bg-transparent" />
              <input type="color" value={s2} onChange={(e) => { setS2(e.target.value); applyGrad(gAngle, s1, e.target.value); }} className="w-9 h-9 rounded-md border border-border cursor-pointer bg-transparent" />
            </div>
          )}
        </div>
      </div>

      {useGradient && (
        <div>
          <div className="flex justify-between text-[10px] text-muted-foreground"><span>زاوية التدرج</span><span className="font-mono">{gAngle}°</span></div>
          <Slider value={[gAngle]} min={0} max={360} step={1} onValueChange={([v]) => { setGAngle(v); applyGrad(v, s1, s2); }} />
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        <Button type="button" size="sm" variant={isBold ? "default" : "outline"} onClick={() => patch({ fontWeight: isBold ? "normal" : "bold" })}><Bold className="w-3.5 h-3.5" /></Button>
        <Button type="button" size="sm" variant={isItalic ? "default" : "outline"} onClick={() => patch({ fontStyle: isItalic ? "normal" : "italic" })}><Italic className="w-3.5 h-3.5" /></Button>
        <div className="w-px bg-border mx-1" />
        <Button type="button" size="sm" variant={align === "right" ? "default" : "outline"} onClick={() => patch({ textAlign: "right" })}><AlignRight className="w-3.5 h-3.5" /></Button>
        <Button type="button" size="sm" variant={align === "center" ? "default" : "outline"} onClick={() => patch({ textAlign: "center" })}><AlignCenter className="w-3.5 h-3.5" /></Button>
        <Button type="button" size="sm" variant={align === "left" ? "default" : "outline"} onClick={() => patch({ textAlign: "left" })}><AlignLeft className="w-3.5 h-3.5" /></Button>
      </div>

      <div>
        <div className="flex justify-between text-xs"><Label className="text-xs">المسافة بين الأحرف</Label><span className="font-mono text-muted-foreground">{charSpacing}</span></div>
        <Slider value={[charSpacing]} min={-200} max={800} step={10} onValueChange={([v]) => patch({ charSpacing: v })} />
      </div>

      <div>
        <div className="flex justify-between text-xs"><Label className="text-xs">إمالة (Slant)</Label><span className="font-mono text-muted-foreground">{skewX}°</span></div>
        <Slider value={[skewX]} min={-45} max={45} step={1} onValueChange={([v]) => patch({ skewX: v })} />
      </div>

      <div className="rounded-md border border-border p-2 space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs">خلفية النص</Label>
          <input type="checkbox" checked={hasBg} onChange={(e) => patch({ backgroundColor: e.target.checked ? "#fde68a" : "" })} className="w-4 h-4 accent-primary" />
        </div>
        {hasBg && (
          <>
            <div className="flex items-center gap-1.5">
              <input type="color" value={bgColor} onChange={(e) => patch({ backgroundColor: e.target.value })} className="w-9 h-9 rounded-md border border-border cursor-pointer bg-transparent" />
              <Input value={bgColor} onChange={(e) => patch({ backgroundColor: e.target.value })} className="h-9 font-mono text-xs" />
            </div>
            <div>
              <div className="flex justify-between text-xs"><Label className="text-xs">الحشو</Label><span className="font-mono text-muted-foreground">{padding}px</span></div>
              <Slider value={[padding]} min={0} max={60} step={1} onValueChange={([v]) => patch({ padding: v })} />
            </div>
          </>
        )}
      </div>

      {/* Shared geometry/opacity/binding controls */}
      <div className="pt-2 border-t border-border">
        <ObjectProperties canvas={canvas} obj={obj} onChange={onChange} hideFill />
      </div>
    </div>
  );
}

function FontRow({ f, active, onPick, onHover }: { f: string; active: boolean; onPick: (f: string) => void; onHover: (f: string) => void }) {
  return (
    <button
      type="button"
      onMouseEnter={() => onHover(f)}
      onClick={() => onPick(f)}
      className={`w-full text-right px-2 py-1.5 rounded-md text-sm hover:bg-muted transition-colors ${active ? "bg-primary/10 text-primary font-bold" : ""}`}
      style={{ fontFamily: f }}
    >
      {f}
    </button>
  );
}
