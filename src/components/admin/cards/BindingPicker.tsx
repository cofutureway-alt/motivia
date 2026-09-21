import { useEffect, useMemo, useState } from "react";
import { Search, Link as LinkIcon, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { fetchBindingSources, type BindingSource } from "@/lib/card-bindings";

interface Props {
  currentBinding?: { key: string; label: string; kind: string } | null;
  allowedKinds: Array<"text" | "image" | "qr">;
  onPick: (src: BindingSource) => void;
  onUnbind: () => void;
}

export function BindingPicker({ currentBinding, allowedKinds, onPick, onUnbind }: Props) {
  const [sources, setSources] = useState<BindingSource[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchBindingSources().then(setSources).catch(() => setSources([]));
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sources
      .filter((s) => allowedKinds.includes(s.kind))
      .filter((s) => !q || s.label.toLowerCase().includes(q) || s.key.toLowerCase().includes(q));
  }, [sources, search, allowedKinds]);

  return (
    <div className="space-y-2">
      <Popover>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" className="w-full justify-between gap-2">
            <span className="truncate flex items-center gap-2">
              <LinkIcon className="w-3.5 h-3.5 text-primary" />
              {currentBinding ? currentBinding.label : "ربط ببيانات الطالب"}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 p-2">
          <div className="relative mb-2">
            <Search className="w-3.5 h-3.5 absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="ابحث عن حقل..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pr-7"
            />
          </div>
          <div className="max-h-64 overflow-y-auto space-y-0.5">
            {filtered.length === 0 && (
              <div className="text-xs text-muted-foreground text-center py-4">
                لا توجد حقول متاحة لهذا النوع
              </div>
            )}
            {filtered.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => onPick(s)}
                className={`w-full text-right px-2 py-1.5 rounded-md text-sm hover:bg-muted transition-colors flex items-center justify-between gap-2 ${
                  currentBinding?.key === s.key ? "bg-primary/10 text-primary font-bold" : ""
                }`}
              >
                <span className="truncate">{s.label}</span>
                <span className="text-[10px] font-mono text-muted-foreground">{s.kind}</span>
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
      {currentBinding && (
        <Button type="button" size="sm" variant="ghost" onClick={onUnbind} className="w-full gap-2 text-destructive hover:text-destructive">
          <Unlink className="w-3.5 h-3.5" /> إلغاء الربط
        </Button>
      )}
    </div>
  );
}
