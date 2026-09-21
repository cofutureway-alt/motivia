import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent, Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { MathExtension } from "@aarkue/tiptap-math-extension";
import "katex/dist/katex.min.css";
import "katex/contrib/mhchem";
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  ImagePlus,
  Sigma,
  FlaskConical,
  Atom,
  ChevronDown,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  value: unknown;
  onChange: (json: unknown) => void;
  placeholder?: string;
  minHeight?: number;
  compact?: boolean;
}

/** Inserts a LaTeX/math snippet as an inline-math node. */
const insertMath = (editor: Editor | null, latex: string) => {
  if (!editor) return;
  editor
    .chain()
    .focus()
    .insertContent({
      type: "inlineMath",
      attrs: { latex },
    })
    .run();
};

const MATH_TEMPLATES: { label: string; latex: string; hint: string }[] = [
  { label: "كسر", latex: "\\frac{a}{b}", hint: "a/b" },
  { label: "أس", latex: "x^{2}", hint: "x²" },
  { label: "دليل سفلي", latex: "x_{1}", hint: "x₁" },
  { label: "جذر", latex: "\\sqrt{x}", hint: "√x" },
  { label: "جذر نوني", latex: "\\sqrt[n]{x}", hint: "ⁿ√x" },
  { label: "مجموع", latex: "\\sum_{i=1}^{n} x_i", hint: "Σ" },
  { label: "تكامل", latex: "\\int_{a}^{b} f(x)\\,dx", hint: "∫" },
  { label: "π", latex: "\\pi", hint: "pi" },
  { label: "θ", latex: "\\theta", hint: "theta" },
  { label: "Δ", latex: "\\Delta", hint: "delta" },
  { label: "∞", latex: "\\infty", hint: "infinity" },
  { label: "≤", latex: "\\leq", hint: "≤" },
  { label: "≥", latex: "\\geq", hint: "≥" },
  { label: "≠", latex: "\\neq", hint: "≠" },
  { label: "معادلة مخصصة", latex: "", hint: "..." },
];

const PHYSICS_TEMPLATES: { label: string; latex: string; hint: string }[] = [
  { label: "متجه", latex: "\\vec{v}", hint: "v⃗" },
  { label: "m/s²", latex: "\\mathrm{m/s^{2}}", hint: "m/s²" },
  { label: "kg·m/s²", latex: "\\mathrm{kg\\cdot m/s^{2}}", hint: "N" },
  { label: "ω", latex: "\\omega", hint: "omega" },
  { label: "λ", latex: "\\lambda", hint: "lambda" },
  { label: "μ", latex: "\\mu", hint: "mu" },
  { label: "F = ma", latex: "F = m\\,a", hint: "قانون" },
  { label: "E = mc²", latex: "E = mc^{2}", hint: "طاقة" },
];

const CHEMISTRY_TEMPLATES: { label: string; latex: string; hint: string }[] = [
  { label: "H₂O", latex: "\\ce{H2O}", hint: "ماء" },
  { label: "CO₂", latex: "\\ce{CO2}", hint: "ثاني أكسيد" },
  { label: "H₂SO₄", latex: "\\ce{H2SO4}", hint: "حمض" },
  { label: "أيون", latex: "\\ce{Na+}", hint: "Na⁺" },
  { label: "تفاعل →", latex: "\\ce{A + B -> C}", hint: "→" },
  { label: "توازن ⇌", latex: "\\ce{A + B <=> C}", hint: "⇌" },
  { label: "احتراق", latex: "\\ce{CH4 + 2O2 -> CO2 + 2H2O}", hint: "مثال" },
];

const ToolbarBtn = ({
  onClick,
  active,
  disabled,
  children,
  title,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  title?: string;
}) => (
  <button
    type="button"
    onMouseDown={(e) => e.preventDefault()}
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={cn(
      "h-8 min-w-8 px-2 rounded-md border text-xs font-medium transition-colors inline-flex items-center gap-1 shrink-0",
      active
        ? "bg-primary text-primary-foreground border-primary"
        : "bg-background hover:bg-muted border-border/60 text-foreground",
      disabled && "opacity-50 cursor-not-allowed",
    )}
  >
    {children}
  </button>
);

const TemplateGroup = ({
  icon: Icon,
  label,
  templates,
  editor,
}: {
  icon: typeof Sigma;
  label: string;
  templates: { label: string; latex: string; hint: string }[];
  editor: Editor | null;
}) => {
  const [customOpen, setCustomOpen] = useState(false);
  const [customVal, setCustomVal] = useState("");
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="h-8 px-2.5 rounded-md border border-border/60 bg-background hover:bg-muted text-xs font-medium inline-flex items-center gap-1 shrink-0"
        >
          <Icon className="w-3.5 h-3.5" />
          {label}
          <ChevronDown className="w-3 h-3 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2" dir="rtl">
        <div className="grid grid-cols-3 gap-1.5 max-h-72 overflow-y-auto">
          {templates.map((t) => (
            <button
              key={t.label}
              type="button"
              onClick={() => {
                if (!t.latex) {
                  setCustomOpen(true);
                  return;
                }
                insertMath(editor, t.latex);
              }}
              className="text-xs p-2 rounded-md border border-border/50 hover:bg-primary/10 hover:border-primary/40 transition-colors text-center"
              title={t.hint}
            >
              <div className="font-semibold">{t.label}</div>
            </button>
          ))}
        </div>
        {customOpen && (
          <div className="mt-2 pt-2 border-t space-y-2">
            <label className="text-[11px] text-muted-foreground">LaTeX</label>
            <input
              value={customVal}
              onChange={(e) => setCustomVal(e.target.value)}
              placeholder="\\frac{a}{b}"
              className="w-full text-xs h-8 px-2 rounded border bg-background"
              dir="ltr"
            />
            <div className="flex justify-end gap-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setCustomOpen(false);
                  setCustomVal("");
                }}
              >
                إلغاء
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  if (customVal.trim()) {
                    insertMath(editor, customVal.trim());
                    setCustomVal("");
                    setCustomOpen(false);
                  }
                }}
              >
                إدراج
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};

const RichTextEditor = ({
  value,
  onChange,
  placeholder,
  minHeight = 90,
  compact = false,
}: Props) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const initialRef = useRef(value);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
      }),
      Image.configure({ inline: false, allowBase64: false }),
      Placeholder.configure({ placeholder: placeholder ?? "اكتب هنا..." }),
      MathExtension.configure({ evaluation: false, addInlineMath: true }),
    ],
    content: (initialRef.current as object) ?? "",
    onUpdate: ({ editor: e }) => onChange(e.getJSON()),
    editorProps: {
      attributes: {
        dir: "rtl",
        class: cn(
          "prose prose-sm dark:prose-invert max-w-none focus:outline-none px-3 py-2 leading-relaxed",
          "prose-p:my-1 prose-ul:my-1 prose-ol:my-1",
        ),
        style: `min-height: ${minHeight}px`,
      },
    },
  });

  // Sync external value changes (e.g., form reset on edit) without wiping user input.
  useEffect(() => {
    if (!editor) return;
    const current = JSON.stringify(editor.getJSON());
    const incoming = JSON.stringify(value ?? "");
    if (current !== incoming && value !== undefined && value !== null) {
      editor.commands.setContent((value as object) ?? "", { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, value === null || value === undefined ? value : undefined]);

  const handleImageUpload = async (file: File) => {
    if (!editor) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("الحد الأقصى لحجم الصورة 5 ميجابايت");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const { data: currentUser } = await supabase.auth.getUser();
      const path = `${currentUser.user?.id ? `${currentUser.user.id}/` : ""}${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("quiz-images")
        .upload(path, file, { cacheControl: "3600", upsert: false });
      if (upErr) throw upErr;
      const { data: signed, error: signErr } = await supabase.storage
        .from("quiz-images")
        .createSignedUrl(path, 60 * 60 * 24 * 365);
      if (signErr) throw signErr;
      editor.chain().focus().setImage({ src: signed.signedUrl }).run();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "فشل رفع الصورة";
      toast.error(msg);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="rounded-lg border border-border/60 bg-background overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-1 border-b border-border/60 bg-muted/40 px-2 py-1.5 overflow-x-auto">
        <ToolbarBtn
          onClick={() => editor?.chain().focus().toggleBold().run()}
          active={editor?.isActive("bold")}
          title="غامق"
        >
          <Bold className="w-3.5 h-3.5" />
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          active={editor?.isActive("italic")}
          title="مائل"
        >
          <Italic className="w-3.5 h-3.5" />
        </ToolbarBtn>
        {!compact && (
          <>
            <ToolbarBtn
              onClick={() => editor?.chain().focus().toggleBulletList().run()}
              active={editor?.isActive("bulletList")}
              title="قائمة نقطية"
            >
              <List className="w-3.5 h-3.5" />
            </ToolbarBtn>
            <ToolbarBtn
              onClick={() => editor?.chain().focus().toggleOrderedList().run()}
              active={editor?.isActive("orderedList")}
              title="قائمة مرقمة"
            >
              <ListOrdered className="w-3.5 h-3.5" />
            </ToolbarBtn>
          </>
        )}
        <div className="w-px h-5 bg-border mx-1 shrink-0" />
        <ToolbarBtn
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          title="إدراج صورة"
        >
          {uploading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <ImagePlus className="w-3.5 h-3.5" />
          )}
        </ToolbarBtn>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleImageUpload(f);
          }}
        />
        <div className="w-px h-5 bg-border mx-1 shrink-0" />
        <TemplateGroup icon={Sigma} label="رياضيات" templates={MATH_TEMPLATES} editor={editor} />
        <TemplateGroup icon={Atom} label="فيزياء" templates={PHYSICS_TEMPLATES} editor={editor} />
        <TemplateGroup
          icon={FlaskConical}
          label="كيمياء"
          templates={CHEMISTRY_TEMPLATES}
          editor={editor}
        />
      </div>
      <EditorContent editor={editor} />
    </div>
  );
};

export default RichTextEditor;
