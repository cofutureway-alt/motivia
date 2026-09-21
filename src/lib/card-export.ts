import { Canvas, FabricImage, Rect } from "fabric";
import jsPDF from "jspdf";
import { CARD_WIDTH, CARD_HEIGHT, CUSTOM_PROPS } from "@/components/admin/cards/CardCanvas";
import { preloadFontsFromJson } from "@/lib/card-fonts";
import { generateQrDataUrl } from "@/lib/card-qr";
import { fetchBindingSources, type BindingSource } from "@/lib/card-bindings";

export interface ExportStudent {
  id: string;
  full_name: string | null;
  phone_number: string | null;
  student_id: string | null;
  email: string | null;
  auth_email: string | null;
  governorate: string | null;
  registration_type: string | null;
  gender: string | null;
  guardian_phone?: string | null;
  stage_id: string | null;
  stage_name: string | null;
  avatar_url: string | null;
  qr_token: string | null;
  custom_fields: Record<string, any> | null;
}

/**
 * Resolve a binding key to the student's real value. Text-first, no side effects.
 */
export function resolveValue(student: ExportStudent, key: string): string {
  if (key === "stage_id") return student.stage_name ?? "";
  if (key === "email") return student.email ?? student.auth_email ?? "";
  const direct = (student as any)[key];
  if (direct !== undefined && direct !== null && direct !== "") return String(direct);
  const custom = student.custom_fields?.[key];
  if (custom !== undefined && custom !== null && custom !== "") return String(custom);
  return "";
}

async function loadImageDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

const QR_BINDING = { key: "qr_token", label: "رمز QR", kind: "qr" } as const;

function objectBounds(obj: any, fallbackSize: number) {
  return {
    left: obj.left ?? 0,
    top: obj.top ?? 0,
    width: Math.max(1, (obj.width ?? fallbackSize) * (obj.scaleX ?? 1)),
    height: Math.max(1, (obj.height ?? fallbackSize) * (obj.scaleY ?? 1)),
    angle: obj.angle ?? 0,
    opacity: obj.opacity ?? 1,
  };
}

function replaceObjectAtSameLayer(c: Canvas, oldObj: any, newObj: any) {
  const index = c.getObjects().indexOf(oldObj);
  c.remove(oldObj);
  if (index >= 0 && typeof (c as any).insertAt === "function") {
    (c as any).insertAt(index, newObj);
  } else {
    c.add(newObj);
  }
}

async function createQrImageForBounds(student: ExportStudent, bounds: ReturnType<typeof objectBounds>) {
  const token = student.qr_token ?? student.id;
  const size = Math.max(512, Math.ceil(Math.max(bounds.width, bounds.height) * 2));
  const dataUrl = await generateQrDataUrl(`${window.location.origin}/s/${token}`, size);
  const img = await FabricImage.fromURL(dataUrl, { crossOrigin: "anonymous" });
  img.set({
    left: bounds.left,
    top: bounds.top,
    angle: bounds.angle,
    opacity: bounds.opacity,
    scaleX: bounds.width / (img.width || 1),
    scaleY: bounds.height / (img.height || 1),
  });
  return img;
}

/**
 * Render one design JSON for one student to a PNG data URL at print quality.
 */
export async function renderStudentFaceToDataUrl(
  design: any,
  student: ExportStudent,
  multiplier = 2,
): Promise<string> {
  const el = document.createElement("canvas");
  el.width = CARD_WIDTH;
  el.height = CARD_HEIGHT;
  const c = new Canvas(el, {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    backgroundColor: "#ffffff",
    enableRetinaScaling: false,
  });
  try {
    if (design && Object.keys(design).length > 0) {
      await preloadFontsFromJson(design);
      await c.loadFromJSON(design);
      c.setDimensions({ width: CARD_WIDTH, height: CARD_HEIGHT });
      // Fabric v7 may not restore unknown props onto instances — copy them back
      const rawObjs: any[] = Array.isArray(design?.objects) ? design.objects : [];
      const liveObjs = c.getObjects();
      for (let i = 0; i < Math.min(rawObjs.length, liveObjs.length); i++) {
        const raw = rawObjs[i];
        const live: any = liveObjs[i];
        if (raw?.__binding && !live.__binding) live.__binding = raw.__binding;
        if (raw?.__isQrPlaceholder) live.__isQrPlaceholder = true;
        if (raw?.__imagePlaceholder) live.__imagePlaceholder = true;
        if (raw?.__gradient) live.__gradient = raw.__gradient;
      }
    }
    // Walk objects, apply real student data
    const objs = c.getObjects().slice();
    // Build label -> binding source lookup for legacy designs (no __binding stored)
    const sources: BindingSource[] = await fetchBindingSources().catch(() => []);
    const byLabel = new Map<string, BindingSource>(sources.map((s) => [`{{${s.label}}}`, s] as [string, BindingSource]));
    for (const obj of objs) {
      let b = (obj as any).__binding;
      if (!b && (obj as any).__isQrPlaceholder) b = QR_BINDING;
      const objType = String((obj as any).type ?? "").toLowerCase();
      const isLegacyQrSquare =
        !b &&
        objType === "rect" &&
        Math.abs(((obj as any).width ?? 0) * ((obj as any).scaleX ?? 1) - ((obj as any).height ?? 0) * ((obj as any).scaleY ?? 1)) <= 3 &&
        ((obj as any).width ?? 0) >= 120 &&
        Array.isArray((obj as any).strokeDashArray);
      if (isLegacyQrSquare) b = QR_BINDING;
      // Legacy fallback: infer from placeholder text
      if (!b && typeof (obj as any).text === "string") {
        const hit = byLabel.get((obj as any).text.trim());
        if (hit) b = { key: hit.key, label: hit.label, kind: hit.kind };
      }
      if (!b) continue;
      if (b.kind === "text" && (objType === "textbox" || objType === "text" || objType === "i-text" || typeof (obj as any).text === "string")) {
        const val = resolveValue(student, b.key) || "";
        (obj as any).set({ text: val });
        (obj as any).initDimensions?.();
      } else if (b.kind === "qr") {
        const bounds = objectBounds(obj, 180);
        const pad = Math.max(8, Math.round(Math.min(bounds.width, bounds.height) * 0.045));
        const backing = new Rect({
          left: bounds.left,
          top: bounds.top,
          width: bounds.width,
          height: bounds.height,
          angle: bounds.angle,
          opacity: bounds.opacity,
          fill: "#ffffff",
          stroke: "#0f172a",
          strokeWidth: Math.max(2, Math.round(Math.min(bounds.width, bounds.height) * 0.012)),
          rx: Math.round(Math.min(bounds.width, bounds.height) * 0.03),
          ry: Math.round(Math.min(bounds.width, bounds.height) * 0.03),
        });
        const img = await createQrImageForBounds(student, {
          ...bounds,
          left: bounds.left + pad,
          top: bounds.top + pad,
          width: Math.max(1, bounds.width - pad * 2),
          height: Math.max(1, bounds.height - pad * 2),
        });
        const layer = c.getObjects().indexOf(obj);
        c.remove(obj);
        if (layer >= 0 && typeof (c as any).insertAt === "function") {
          (c as any).insertAt(layer, backing, img);
        } else {
          c.add(backing, img);
        }
      } else if (b.kind === "image") {
        const avatarUrl = student.avatar_url;
        if (!avatarUrl) continue;
        const dataUrl = await loadImageDataUrl(avatarUrl);
        if (!dataUrl) continue;
        try {
          const img = await FabricImage.fromURL(dataUrl, { crossOrigin: "anonymous" });
          const w = (obj.width ?? 200) * ((obj as any).scaleX ?? 1);
          const h = (obj.height ?? 200) * ((obj as any).scaleY ?? 1);
          const iw = img.width || 1;
          const ih = img.height || 1;
          // Cover-fit: scale to fill, center-crop
          const s = Math.max(w / iw, h / ih);
          const drawW = iw * s;
          const drawH = ih * s;
          img.set({
            left: (obj.left ?? 0) + (w - drawW) / 2,
            top: (obj.top ?? 0) + (h - drawH) / 2,
            angle: obj.angle,
            scaleX: s,
            scaleY: s,
            clipPath: undefined,
          });
          replaceObjectAtSameLayer(c, obj, img);
        } catch {
          /* ignore */
        }
      }
    }

    // Final safety pass: any QR placeholder that survived matching is forced into a real QR image.
    for (const obj of c.getObjects().slice() as any[]) {
      if (!obj.__isQrPlaceholder) continue;
      const bounds = objectBounds(obj, 180);
      const img = await createQrImageForBounds(student, bounds);
      replaceObjectAtSameLayer(c, obj, img);
    }
    c.renderAll();
    const url = c.toDataURL({ format: "png", multiplier });
    return url;
  } finally {
    c.dispose();
  }
}

interface ExportOptions {
  onProgress?: (done: number, total: number, label: string) => void;
  filename?: string;
}

/**
 * Sequentially render every student's front + back face and compose into one PDF.
 * One student per page. Front on top half, back on bottom half.
 */
export async function exportStudentsPdf(
  frontDesign: any,
  backDesign: any,
  students: ExportStudent[],
  opts: ExportOptions = {},
): Promise<void> {
  const total = students.length;
  if (total === 0) throw new Error("لم يتم اختيار أي طالب");

  // A4 portrait, mm units
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 10;
  const gap = 6;
  const availableW = pageW - margin * 2;
  const availableH = (pageH - margin * 2 - gap) / 2;
  const aspect = CARD_WIDTH / CARD_HEIGHT;

  // Fit each card into the available half — respect aspect
  let cardW = availableW;
  let cardH = cardW / aspect;
  if (cardH > availableH) {
    cardH = availableH;
    cardW = cardH * aspect;
  }
  const xOffset = (pageW - cardW) / 2;

  for (let i = 0; i < total; i++) {
    const s = students[i];
    const label = s.full_name || s.student_id || `طالب ${i + 1}`;
    opts.onProgress?.(i, total, label);

    // Yield to the UI thread so progress bar updates smoothly
    await new Promise((r) => setTimeout(r, 0));

    const [frontUrl, backUrl] = await Promise.all([
      renderStudentFaceToDataUrl(frontDesign, s, 2),
      renderStudentFaceToDataUrl(backDesign, s, 2),
    ]);

    if (i > 0) pdf.addPage();
    const drawFramedCard = (url: string, y: number) => {
      pdf.addImage(url, "PNG", xOffset, y, cardW, cardH, undefined, "FAST");
      // Rounded border/frame around the card
      pdf.setDrawColor(15, 23, 42); // slate-900
      pdf.setLineWidth(0.4);
      const radius = Math.min(cardW, cardH) * 0.045;
      pdf.roundedRect(xOffset, y, cardW, cardH, radius, radius, "S");
    };
    drawFramedCard(frontUrl, margin);
    drawFramedCard(backUrl, margin + cardH + gap);
  }

  opts.onProgress?.(total, total, "");
  const filename = opts.filename ?? `student-cards-${new Date().toISOString().slice(0, 10)}.pdf`;
  pdf.save(filename);
}
