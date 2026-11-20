"use client";

// Mostra dados estruturados (resultado de motor da IA) como texto legível em português, sem JSON.
import { humanizeKey, humanizeValue } from "@/lib/data-labels";
import { RichText } from "@/components/ui/rich-text";
import { cn } from "@/lib/utils";

const HIDDEN = /^(_demo|_raw|raw|error|success|engine)$/i;

export function DataView({ data, depth = 0 }: { data: unknown; depth?: number }) {
  if (data === null || data === undefined || data === "") return <span className="text-muted-foreground/60">—</span>;
  if (typeof data === "string") {
    return data.length > 120 || data.includes("\n") ? <RichText content={data} className="text-xs" /> : <span>{data}</span>;
  }
  if (typeof data !== "object") return <span>{humanizeValue(data)}</span>;
  if (Array.isArray(data)) {
    if (data.length === 0) return <span className="text-muted-foreground/60">—</span>;
    return (
      <ul className="space-y-1.5">
        {data.map((item, i) => (
          <li key={i} className={cn("text-xs", item && typeof item === "object" ? "rounded-lg border border-white/8 bg-white/3 p-2.5" : "flex gap-2")}>
            {!(item && typeof item === "object") && <span className="text-muted-foreground">•</span>}
            <DataView data={item} depth={depth + 1} />
          </li>
        ))}
      </ul>
    );
  }
  const entries = Object.entries(data as Record<string, unknown>).filter(([k]) => !HIDDEN.test(k));
  return (
    <div className={cn("space-y-2", depth === 0 && "space-y-3")}>
      {entries.map(([key, value]) => {
        const complex = value !== null && typeof value === "object";
        return (
          <div key={key} className={complex ? "" : "flex flex-wrap gap-x-2 text-xs"}>
            <div className={cn(complex ? "text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1" : "text-muted-foreground")}>
              {humanizeKey(key)}
              {!complex && ":"}
            </div>
            <div className={cn("text-foreground/90 min-w-0", complex && depth < 2 && "pl-2 border-l border-white/10")}>
              <DataView data={value} depth={depth + 1} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
