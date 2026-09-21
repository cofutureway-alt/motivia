import { motion } from "framer-motion";
import type { Canvas } from "fabric";
import {
  Square,
  Squircle,
  Circle as CircleIcon,
  Egg,
  Triangle as TriangleIcon,
  Diamond,
  Pentagon,
  Hexagon,
  Star,
  Heart,
  Minus,
  MoreHorizontal,
  ArrowRight,
  ArrowLeftRight,
  ChevronRight,
  CircleDot,
  MessageCircle,
  Award,
  Type,
} from "lucide-react";
import { cardCanvasHelpers } from "./CardCanvas";

interface Props {
  canvas: Canvas | null;
}

type Tool = {
  label: string;
  icon: any;
  run: (c: Canvas) => void;
};

const TOOLS: Tool[] = [
  { label: "نص", icon: Type, run: (c) => cardCanvasHelpers.addText(c) },
  { label: "مستطيل", icon: Square, run: cardCanvasHelpers.addRect },
  { label: "مستطيل بحواف", icon: Squircle, run: cardCanvasHelpers.addRoundedRect },
  { label: "مربع", icon: Square, run: cardCanvasHelpers.addSquare },
  { label: "دائرة", icon: CircleIcon, run: cardCanvasHelpers.addCircle },
  { label: "بيضاوي", icon: Egg, run: cardCanvasHelpers.addEllipse },
  { label: "مثلث", icon: TriangleIcon, run: cardCanvasHelpers.addTriangle },
  { label: "مثلث قائم", icon: TriangleIcon, run: cardCanvasHelpers.addRightTriangle },
  { label: "معيّن", icon: Diamond, run: cardCanvasHelpers.addDiamond },
  { label: "خماسي", icon: Pentagon, run: cardCanvasHelpers.addPentagon },
  { label: "سداسي", icon: Hexagon, run: cardCanvasHelpers.addHexagon },
  { label: "نجمة", icon: Star, run: cardCanvasHelpers.addStar },
  { label: "قلب", icon: Heart, run: cardCanvasHelpers.addHeart },
  { label: "خط", icon: Minus, run: cardCanvasHelpers.addLine },
  { label: "خط متقطع", icon: MoreHorizontal, run: cardCanvasHelpers.addDashedLine },
  { label: "سهم", icon: ArrowRight, run: cardCanvasHelpers.addArrow },
  { label: "سهم مزدوج", icon: ArrowLeftRight, run: cardCanvasHelpers.addDoubleArrow },
  { label: "شيفرون", icon: ChevronRight, run: cardCanvasHelpers.addChevron },
  { label: "حلقة", icon: CircleDot, run: cardCanvasHelpers.addRing },
  { label: "فقاعة كلام", icon: MessageCircle, run: cardCanvasHelpers.addSpeechBubble },
  { label: "شارة", icon: Award, run: cardCanvasHelpers.addRibbon },
];

export function ElementPalette({ canvas }: Props) {
  return (
    <div className="grid grid-cols-3 gap-2 max-h-[420px] overflow-y-auto pr-1">
      {TOOLS.map((t, i) => (
        <motion.button
          key={t.label}
          type="button"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.015 }}
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
          onClick={() => canvas && t.run(canvas)}
          className="group flex flex-col items-center justify-center gap-1 rounded-xl border border-border bg-muted/30 hover:bg-primary/10 hover:border-primary/40 text-foreground p-3 transition-colors"
        >
          <t.icon className="w-5 h-5 text-primary group-hover:scale-110 transition-transform" />
          <span className="text-[10px] font-medium leading-tight text-center">{t.label}</span>
        </motion.button>
      ))}
    </div>
  );
}
