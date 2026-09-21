import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import type { Canvas } from "fabric";
import {
  ArrowRight,
  ArrowUp,
  ArrowUpToLine,
  ArrowDown,
  ArrowDownToLine,
  Image as ImageIcon,
  Loader2,
  Monitor,
  Palette,
  Save,
  Shapes,
  Trash2,
  Info,
  QrCode,
  ImagePlus,
  Eye,
  Repeat,
  Columns2,
  RotateCw,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CardCanvas,
  cardCanvasHelpers,
  CARD_WIDTH,
  CARD_HEIGHT,
  CUSTOM_PROPS,
  applySampleData,
  restoreFromSample,
} from "@/components/admin/cards/CardCanvas";
import { ElementPalette } from "@/components/admin/cards/ElementPalette";
import { TextProperties } from "@/components/admin/cards/TextProperties";
import { ObjectProperties } from "@/components/admin/cards/ObjectProperties";
import { CardFlipViewer } from "@/components/admin/cards/CardFlipViewer";

type Face = "front" | "back";
type ViewMode = "edit" | "flip" | "side";

const CardBuilder = () => {
  const { templateId } = useParams<{ templateId: string }>();
  const navigate = useNavigate();
  const canvasRef = useRef<Canvas | null>(null);
  const bgFileRef = useRef<HTMLInputElement | null>(null);

  const [canvas, setCanvas] = useState<Canvas | null>(null);
  const [tplName, setTplName] = useState("");
  const [frontDesign, setFrontDesign] = useState<any>(null);
  const [backDesign, setBackDesign] = useState<any>(null);
  const [face, setFace] = useState<Face>("front");
  const [view, setView] = useState<ViewMode>("edit");
  const [flipped, setFlipped] = useState(false);
  const [sample, setSample] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingBg, setUploadingBg] = useState(false);
  const [bgColor, setBgColor] = useState("#0f172a");
  const [selected, setSelected] = useState<any | null>(null);
  const [selInfo, setSelInfo] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [selTick, setSelTick] = useState(0);
  const [isSmall, setIsSmall] = useState(false);

  useEffect(() => {
    const check = () => setIsSmall(window.innerWidth < 900);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    (async () => {
      if (!templateId) return;
      const { data, error } = await (supabase as any)
        .from("card_templates")
        .select("*")
        .eq("id", templateId)
        .maybeSingle();
      if (error) { toast.error("تعذّر تحميل التصميم"); return; }
      if (!data) { toast.error("التصميم غير موجود"); navigate("/admin/cards"); return; }
      setTplName(data.name);
      setFrontDesign(data.front_design ?? {});
      setBackDesign(data.back_design ?? {});
      setLoading(false);
    })();
  }, [templateId, navigate]);

  // Persist edits from current canvas into the correct face state on switch/save.
  const captureCurrent = (): any | null => {
    const c = canvasRef.current;
    if (!c) return null;
    return (c as any).toJSON(CUSTOM_PROPS);
  };

  const onSelectionChange = (obj: any | null) => {
    setSelected(obj);
    if (obj) {
      setSelInfo({
        left: Math.round(obj.left ?? 0),
        top: Math.round(obj.top ?? 0),
        width: Math.round((obj.width ?? 0) * (obj.scaleX ?? 1)),
        height: Math.round((obj.height ?? 0) * (obj.scaleY ?? 1)),
      });
    } else setSelInfo(null);
  };

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const handler = () => onSelectionChange(c.getActiveObject() ?? null);
    c.on("object:modified", handler);
    c.on("object:scaling", handler);
    c.on("object:moving", handler);
    c.on("object:rotating", handler);
    return () => {
      c.off("object:modified", handler);
      c.off("object:scaling", handler);
      c.off("object:moving", handler);
      c.off("object:rotating", handler);
    };
  }, [canvas, face]);

  // Apply/restore sample data on the live edit canvas
  const sampleSnapRef = useRef<any | null>(null);
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || view !== "edit") return;
    (async () => {
      if (sample && !sampleSnapRef.current) {
        sampleSnapRef.current = await applySampleData(c);
      } else if (!sample && sampleSnapRef.current) {
        await restoreFromSample(c, sampleSnapRef.current);
        sampleSnapRef.current = null;
      }
    })();
  }, [sample, canvas, view, face]);

  const switchFace = (next: Face) => {
    if (next === face) return;
    const snapshot = captureCurrent();
    if (snapshot) {
      if (face === "front") setFrontDesign(snapshot); else setBackDesign(snapshot);
    }
    setSelected(null);
    setFace(next);
  };

  const switchView = (next: ViewMode) => {
    if (next === view) return;
    if (view === "edit") {
      const snapshot = captureCurrent();
      if (snapshot) { if (face === "front") setFrontDesign(snapshot); else setBackDesign(snapshot); }
    }
    setView(next);
  };

  const handleUploadBg = async (file: File) => {
    if (!templateId) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("الحجم الأقصى 5 ميجابايت"); return; }
    setUploadingBg(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `${templateId}/${face}-bg-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("card-assets").upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: signed, error: signErr } = await supabase.storage.from("card-assets").createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
      if (signErr || !signed?.signedUrl) throw signErr ?? new Error("no url");
      const c = canvasRef.current;
      if (c) await cardCanvasHelpers.setBackgroundImage(c, signed.signedUrl);
      toast.success("تم تعيين خلفية الصورة");
    } catch (e: any) {
      toast.error(e?.message ?? "تعذّر الرفع");
    } finally { setUploadingBg(false); }
  };

  const save = async () => {
    if (!templateId) return;
    setSaving(true);
    try {
      // Capture current face from live canvas
      const snapshot = captureCurrent();
      const front = face === "front" && snapshot ? snapshot : frontDesign ?? {};
      const back = face === "back" && snapshot ? snapshot : backDesign ?? {};
      const { error } = await (supabase as any)
        .from("card_templates")
        .update({ front_design: front, back_design: back })
        .eq("id", templateId);
      if (error) throw error;
      if (face === "front") setFrontDesign(front); else setBackDesign(back);
      toast.success("تم حفظ التصميم");
    } catch (e: any) {
      toast.error(e?.message ?? "تعذّر الحفظ");
    } finally { setSaving(false); }
  };

  const activeDesign = face === "front" ? frontDesign : backDesign;
  // Re-mount canvas when switching face so it loads the correct JSON.
  const canvasKey = face;

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-4" dir="rtl">
      {/* Top bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" onClick={() => navigate("/admin/cards")} className="gap-2">
          <ArrowRight className="w-4 h-4" /> رجوع
        </Button>
        <div className="min-w-0 flex-1">
          <div className="text-xs text-muted-foreground">تعديل كارت</div>
          <div className="font-black text-lg truncate">{tplName}</div>
        </div>
        <Button onClick={save} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          حفظ
        </Button>
      </div>

      {/* Mode + face controls */}
      <div className="flex flex-wrap gap-3 items-center justify-between rounded-2xl border border-border bg-card p-3">
        <div className="flex items-center gap-2 rounded-xl bg-muted p-1">
          <ModeBtn active={view === "edit"} onClick={() => switchView("edit")} icon={<Pencil className="w-3.5 h-3.5" />}>تحرير</ModeBtn>
          <ModeBtn active={view === "flip"} onClick={() => switchView("flip")} icon={<Repeat className="w-3.5 h-3.5" />}>معاينة بالقلب</ModeBtn>
          <ModeBtn active={view === "side"} onClick={() => switchView("side")} icon={<Columns2 className="w-3.5 h-3.5" />}>الجانبين معًا</ModeBtn>
        </div>

        {view === "edit" && (
          <div className="flex items-center gap-2 rounded-xl bg-muted p-1">
            <ModeBtn active={face === "front"} onClick={() => switchFace("front")}>الوجه الأمامي</ModeBtn>
            <ModeBtn active={face === "back"} onClick={() => switchFace("back")}>الوجه الخلفي</ModeBtn>
          </div>
        )}
        {view === "flip" && (
          <Button variant="outline" size="sm" onClick={() => setFlipped((f) => !f)} className="gap-2">
            <RotateCw className="w-3.5 h-3.5" /> اقلب الكارت
          </Button>
        )}

        <label className="inline-flex items-center gap-2 text-xs cursor-pointer select-none">
          <input type="checkbox" checked={sample} onChange={(e) => setSample(e.target.checked)} className="w-4 h-4 accent-primary" />
          <Eye className="w-3.5 h-3.5" /> معاينة ببيانات تجريبية
        </label>
      </div>

      {isSmall && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300 p-3 flex items-center gap-2 text-sm">
          <Monitor className="w-4 h-4 shrink-0" /> يفضل استخدام شاشة أكبر لتصميم الكروت.
        </div>
      )}

      <div className={`grid grid-cols-1 ${view === "edit" ? "2xl:grid-cols-[minmax(0,1fr)_340px]" : ""} gap-4 items-start`}>
        <div
          className="rounded-2xl border border-border bg-card p-3 md:p-5 min-h-[360px] flex flex-col justify-start overflow-x-auto 2xl:sticky 2xl:top-4"
        >
          <div className="w-full min-w-0">
            <div className="mb-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span className="font-bold text-foreground">
                {view === "edit" ? (face === "front" ? "الوجه الأمامي" : "الوجه الخلفي") :
                  view === "flip" ? "معاينة بالقلب" : "عرض الجانبين"}
              </span>
              <span dir="ltr" className="font-mono">{CARD_WIDTH} × {CARD_HEIGHT}px</span>
            </div>

            <AnimatePresence mode="wait">
              {view === "edit" ? (
                <motion.div key={`edit-${face}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <CardCanvas
                    key={canvasKey}
                    initialJson={activeDesign}
                    onReady={(c) => { canvasRef.current = c; setCanvas(c); }}
                    onSelectionChange={onSelectionChange}
                  />
                </motion.div>
              ) : (
                <motion.div key={`preview-${view}`} initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
                  <CardFlipViewer
                    frontJson={frontDesign}
                    backJson={backDesign}
                    sample={sample}
                    mode={view === "flip" ? "flip" : "side"}
                    flipped={flipped}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {view === "edit" && (
          <aside className="space-y-4">
            <Panel icon={<Palette className="w-4 h-4" />} title="الخلفية">
              <div>
                <Label className="text-xs">لون الخلفية</Label>
                <div className="flex items-center gap-2 mt-1.5">
                  <input type="color" value={bgColor}
                    onChange={(e) => { const v = e.target.value; setBgColor(v); if (canvasRef.current) cardCanvasHelpers.setBackgroundColor(canvasRef.current, v); }}
                    className="w-12 h-10 rounded-md border border-border cursor-pointer bg-transparent" />
                  <Input value={bgColor} onChange={(e) => { setBgColor(e.target.value); if (canvasRef.current) cardCanvasHelpers.setBackgroundColor(canvasRef.current, e.target.value); }} className="font-mono" />
                </div>
              </div>
              <div>
                <input ref={bgFileRef} type="file" accept="image/*" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadBg(f); e.target.value = ""; }} />
                <Button variant="outline" onClick={() => bgFileRef.current?.click()} disabled={uploadingBg} className="w-full gap-2">
                  {uploadingBg ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
                  رفع صورة خلفية
                </Button>
              </div>
            </Panel>

            <Panel icon={<Info className="w-4 h-4" />} title="عناصر البيانات">
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" size="sm" onClick={() => canvas && cardCanvasHelpers.addQrPlaceholder(canvas)} className="gap-1.5">
                  <QrCode className="w-3.5 h-3.5" /> إدراج رمز QR
                </Button>
                <Button variant="outline" size="sm" onClick={() => canvas && cardCanvasHelpers.addImagePlaceholder(canvas)} className="gap-1.5">
                  <ImagePlus className="w-3.5 h-3.5" /> إطار صورة
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                اربط أي عنصر ببيانات الطالب من لوحة الخصائص بعد تحديده.
              </p>
            </Panel>

            <Panel icon={<Shapes className="w-4 h-4" />} title="مكتبة العناصر">
              <ElementPalette canvas={canvas} />
            </Panel>

            <Panel icon={<Info className="w-4 h-4" />} title="خصائص العنصر المحدد">
              {selected && selInfo ? (
                <div className="space-y-3">
                  {selected.type === "textbox" ? (
                    <TextProperties canvas={canvas} obj={selected} onChange={() => setSelTick((n) => n + 1)} key={selTick} />
                  ) : (
                    <ObjectProperties canvas={canvas} obj={selected} onChange={() => setSelTick((n) => n + 1)} key={selTick} />
                  )}

                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border">
                    <Button size="sm" variant="outline" onClick={() => canvas && cardCanvasHelpers.bringToFront(canvas)} className="gap-1.5"><ArrowUpToLine className="w-3.5 h-3.5" /> للأمام</Button>
                    <Button size="sm" variant="outline" onClick={() => canvas && cardCanvasHelpers.bringForward(canvas)} className="gap-1.5"><ArrowUp className="w-3.5 h-3.5" /> مستوى أعلى</Button>
                    <Button size="sm" variant="outline" onClick={() => canvas && cardCanvasHelpers.sendBackwards(canvas)} className="gap-1.5"><ArrowDown className="w-3.5 h-3.5" /> مستوى أدنى</Button>
                    <Button size="sm" variant="outline" onClick={() => canvas && cardCanvasHelpers.sendToBack(canvas)} className="gap-1.5"><ArrowDownToLine className="w-3.5 h-3.5" /> للخلف</Button>
                  </div>
                  <Button variant="destructive" size="sm" onClick={() => canvas && cardCanvasHelpers.deleteActive(canvas)} className="w-full gap-1.5">
                    <Trash2 className="w-3.5 h-3.5" /> حذف العنصر
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-4">اختر عنصرًا على الكارت لعرض خصائصه.</p>
              )}
            </Panel>
          </aside>
        )}
      </div>
    </div>
  );
};

const Panel = ({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) => (
  <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-border bg-card p-4 space-y-3">
    <div className="flex items-center gap-2 font-bold">
      <span className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">{icon}</span>
      {title}
    </div>
    <div className="space-y-3">{children}</div>
  </motion.section>
);

const ModeBtn = ({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon?: React.ReactNode; children: React.ReactNode }) => (
  <button
    type="button"
    onClick={onClick}
    className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${active ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"}`}
  >
    {icon}{children}
  </button>
);

export default CardBuilder;
