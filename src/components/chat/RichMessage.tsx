import { Fragment, type ReactNode } from "react";
import { Link2 } from "lucide-react";

export interface ChartData {
  type: "bar";
  title?: string;
  data: { label: string; value: number }[];
}

/** Extract ```chart {"title":...,"data":[...]} ``` blocks and their positions. */
function splitChartBlocks(text: string): { parts: Array<{ kind: "text" | "chart"; value: string | ChartData }> } {
  const parts: Array<{ kind: "text" | "chart"; value: string | ChartData }> = [];
  const rx = /```chart\s*\n?([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(text)) !== null) {
    if (m.index > last) parts.push({ kind: "text", value: text.slice(last, m.index) });
    try {
      const parsed = JSON.parse(m[1]);
      if (parsed && Array.isArray(parsed.data)) parts.push({ kind: "chart", value: parsed });
      else parts.push({ kind: "text", value: m[0] });
    } catch {
      parts.push({ kind: "text", value: m[0] });
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ kind: "text", value: text.slice(last) });
  return { parts };
}

/** Inline formatting: [text](url) links, **bold**, `code`. */
function renderInline(text: string, keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const rx = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|`([^`]+)`/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = rx.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[1] && m[2]) {
      nodes.push(
        <a
          key={`${keyBase}-l${i++}`}
          href={m[2]}
          target={m[2].startsWith("http") ? "_blank" : undefined}
          rel="noreferrer"
          dir="auto"
          className="inline-flex max-w-full items-center gap-1 rounded-lg border border-primary/40 bg-primary/10 px-2 py-0.5 align-middle text-primary transition-colors hover:bg-primary/20"
        >
          <Link2 className="h-3 w-3 shrink-0" />
          <span className="truncate">{m[1]}</span>
        </a>
      );
    } else if (m[3]) {
      nodes.push(
        <strong key={`${keyBase}-b${i++}`} className="font-bold">
          {m[3]}
        </strong>
      );
    } else if (m[4]) {
      nodes.push(
        <code key={`${keyBase}-c${i++}`} dir="ltr" className="rounded bg-muted px-1 py-0.5 text-[0.85em]">
          {m[4]}
        </code>
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

/** Block-level rendering with dir="auto" so mixed Arabic/English keeps proper direction. */
function renderBlocks(text: string, keyBase: string): ReactNode[] {
  const blocks = text.split(/\n{2,}/);
  return blocks.map((block, bi) => {
    const lines = block.split("\n");
    const items: ReactNode[] = [];
    let listBuffer: { ordered: boolean; text: string }[] = [];

    const flushList = (key: string) => {
      if (!listBuffer.length) return;
      const ordered = listBuffer[0].ordered;
      const ListTag = ordered ? "ol" : "ul";
      items.push(
        <ListTag
          key={key}
          dir="auto"
          className={`my-1 space-y-1 ps-5 ${ordered ? "list-decimal" : "list-disc"}`}
        >
          {listBuffer.map((li, i) => (
            <li key={i} className="leading-relaxed">
              {renderInline(li.text, `${key}-${i}`)}
            </li>
          ))}
        </ListTag>
      );
      listBuffer = [];
    };

    lines.forEach((line, li) => {
      const heading = line.match(/^(#{1,4})\s+(.*)$/);
      const orderedItem = line.match(/^\s*\d+[.)]\s+(.*)$/);
      const bulletItem = line.match(/^\s*[-•*]\s+(.*)$/);
      if (heading) {
        flushList(`${keyBase}-bl${bi}-list`);
        items.push(
          <div key={`${keyBase}-bl${bi}-h${li}`} dir="auto" className="mt-2 mb-1 font-bold">
            {renderInline(heading[2], `${keyBase}-bl${bi}-h${li}`)}
          </div>
        );
      } else if (orderedItem || bulletItem) {
        listBuffer.push({ ordered: Boolean(orderedItem), text: (orderedItem ?? bulletItem)![1] });
      } else if (line.trim() === "") {
        flushList(`${keyBase}-bl${bi}-list`);
      } else {
        flushList(`${keyBase}-bl${bi}-list`);
        items.push(
          <div key={`${keyBase}-bl${bi}-p${li}`} dir="auto" className="leading-relaxed">
            {renderInline(line, `${keyBase}-bl${bi}-p${li}`)}
          </div>
        );
      }
    });
    flushList(`${keyBase}-bl${bi}-list-end`);
    return <Fragment key={`${keyBase}-bl${bi}`}>{items}</Fragment>;
  });
}

const ChatChart = ({ chart }: { chart: ChartData }) => {
  const max = Math.max(...chart.data.map((d) => Number(d.value) || 0), 1);
  return (
    <div className="my-2 rounded-xl border border-border/60 bg-background/60 p-3" dir="rtl">
      {chart.title && <div className="mb-2 text-xs font-bold">{chart.title}</div>}
      <div className="space-y-1.5">
        {chart.data.slice(0, 10).map((d, i) => (
          <div key={i} className="flex items-center gap-2">
            <span dir="auto" className="w-28 shrink-0 truncate text-[11px] text-muted-foreground">
              {d.label}
            </span>
            <div className="h-3 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary/80"
                style={{ width: `${Math.max(((Number(d.value) || 0) / max) * 100, 3)}%` }}
              />
            </div>
            <span dir="ltr" className="w-10 shrink-0 text-left text-[11px] font-semibold tabular-nums">
              {d.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * Renders assistant messages: markdown-ish blocks with dir="auto" (mixed
 * Arabic/English safe), clickable links as chips, bold/code, and ```chart
 * JSON blocks as mini bar charts.
 */
const RichMessage = ({ content }: { content: string }) => {
  const { parts } = splitChartBlocks(content);
  return (
    <div className="space-y-1">
      {parts.map((part, i) =>
        part.kind === "chart" ? (
          <ChatChart key={`c${i}`} chart={part.value as ChartData} />
        ) : (
          <Fragment key={`t${i}`}>{renderBlocks(part.value as string, `p${i}`)}</Fragment>
        )
      )}
    </div>
  );
};

export default RichMessage;
