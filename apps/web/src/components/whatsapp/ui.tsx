"use client";

// Peças visuais compartilhadas do Atendimento (WhatsApp), Pacientes e CRM.
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const brl = (v: number | null | undefined) =>
  v === null || v === undefined ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export const field =
  "w-full px-3 py-2 text-sm rounded-lg bg-muted/40 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50";

export const btnPrimary = "inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50";
export const btnSoft = "inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-lg bg-primary/15 border border-primary/30 text-primary text-sm font-medium hover:bg-primary/25 disabled:opacity-50";
export const btnGhost = "inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-muted/40 border border-border text-sm text-foreground hover:bg-muted disabled:opacity-50";

export const SOURCE_META: Record<string, { label: string; short: string; cls: string; dot: string }> = {
  META_ADS: { label: "Anúncio Facebook/Instagram", short: "Anúncio Meta", cls: "bg-blue-500/15 text-blue-300 border-blue-500/30", dot: "bg-blue-400" },
  GOOGLE_ADS: { label: "Anúncio Google", short: "Anúncio Google", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30", dot: "bg-amber-400" },
  SITE: { label: "Site", short: "Site", cls: "bg-violet-500/15 text-violet-300 border-violet-500/30", dot: "bg-violet-400" },
  INSTAGRAM: { label: "Instagram orgânico", short: "Instagram", cls: "bg-pink-500/15 text-pink-300 border-pink-500/30", dot: "bg-pink-400" },
  WHATSAPP: { label: "WhatsApp direto (sem saudação)", short: "Direto", cls: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30", dot: "bg-zinc-400" },
  INDICACAO: { label: "Indicação", short: "Indicação", cls: "bg-teal-500/15 text-teal-300 border-teal-500/30", dot: "bg-teal-400" },
  REATIVACAO: { label: "Reativação da base", short: "Reativação", cls: "bg-orange-500/15 text-orange-300 border-orange-500/30", dot: "bg-orange-400" },
  GOOGLE_MAPS: { label: "Google Maps", short: "Maps", cls: "bg-red-500/15 text-red-300 border-red-500/30", dot: "bg-red-400" },
  PACIENTE_BASE: { label: "Paciente antigo que voltou", short: "Paciente", cls: "bg-sky-500/15 text-sky-300 border-sky-500/30", dot: "bg-sky-400" },
  OUTRO: { label: "Outro", short: "Outro", cls: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30", dot: "bg-zinc-500" },
};

export const STAGE_META: Record<string, { label: string; cls: string }> = {
  NOVO: { label: "Novo", cls: "text-sky-300" },
  EM_CONTATO: { label: "Em contato", cls: "text-blue-300" },
  AGENDADO: { label: "Agendado", cls: "text-violet-300" },
  COMPARECEU: { label: "Compareceu", cls: "text-amber-300" },
  FECHADO: { label: "Fechou", cls: "text-emerald-300" },
  PERDIDO: { label: "Perdido", cls: "text-red-300" },
};

export function SourcePill({ source, campaign, className }: { source: string; campaign?: string | null; className?: string }) {
  const m = SOURCE_META[source] ?? SOURCE_META.OUTRO;
  return (
    <span className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] font-medium whitespace-nowrap", m.cls, className)} title={campaign ? `${m.label} · ${campaign}` : m.label}>
      <span className={cn("w-1.5 h-1.5 rounded-full", m.dot)} />
      {m.short}
    </span>
  );
}

export function Kpi({ label, value, sub, tone, icon }: { label: string; value: string; sub?: string; tone?: "good" | "warn" | "bad"; icon?: ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 relative overflow-hidden">
      <div className="flex items-start justify-between gap-2">
        <div className={cn("text-2xl font-bold tracking-tight", tone === "warn" ? "text-amber-400" : tone === "bad" ? "text-red-400" : tone === "good" ? "text-emerald-400" : "text-foreground")}>{value}</div>
        {icon && <div className="text-muted-foreground/60">{icon}</div>}
      </div>
      <div className="text-xs text-muted-foreground mt-1">{label}</div>
      {sub && <div className="text-[11px] text-muted-foreground/70 mt-0.5">{sub}</div>}
    </div>
  );
}

export function Card({ title, subtitle, action, children, className }: { title?: string; subtitle?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-border bg-card p-5", className)}>
      {(title || action) && (
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            {title && <h3 className="text-sm font-semibold text-foreground">{title}</h3>}
            {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

export function Notice({ kind, children }: { kind: "error" | "ok" | "warn" | "info"; children: ReactNode }) {
  const cls = {
    error: "border-red-500/30 bg-red-500/10 text-red-300",
    ok: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    warn: "border-amber-500/30 bg-amber-500/10 text-amber-200",
    info: "border-primary/30 bg-primary/10 text-foreground",
  }[kind];
  return <div className={cn("rounded-lg border px-4 py-2.5 text-sm", cls)}>{children}</div>;
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={cn("relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border transition-colors", on ? "bg-emerald-500/80 border-emerald-400/60" : "bg-muted border-border")}
    >
      <span className={cn("absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white shadow transition-all", on ? "left-[18px]" : "left-0.5")} />
    </button>
  );
}

const TZ = "America/Sao_Paulo";
export const fmtTime = (d: string | Date) => new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(new Date(d));
export const fmtDate = (d: string | Date) => new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: TZ }).format(new Date(d));
export const fmtDayLabel = (d: string | Date) => {
  const date = new Date(d);
  const key = (x: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(x);
  const today = key(new Date());
  const yesterday = key(new Date(Date.now() - 86_400_000));
  if (key(date) === today) return "Hoje";
  if (key(date) === yesterday) return "Ontem";
  return new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long", timeZone: TZ }).format(date);
};
export const fmtWhen = (d: string | Date) => {
  const date = new Date(d);
  const diff = Date.now() - date.getTime();
  if (diff < 86_400_000 && fmtDayLabel(date) === "Hoje") return fmtTime(date);
  if (fmtDayLabel(date) === "Ontem") return "ontem";
  return fmtDate(date);
};
export const fmtWait = (d: string | Date) => {
  const min = Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 60_000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  return `${Math.floor(h / 24)} d`;
};
export const fmtMinutes = (m: number | null | undefined) => {
  if (m === null || m === undefined) return "—";
  if (m < 1) return "< 1 min";
  if (m < 60) return `${Math.round(m)} min`;
  const h = m / 60;
  return h < 24 ? `${h.toFixed(1).replace(".", ",")} h` : `${Math.round(h / 24)} d`;
};
export const formatPhone = (p: string | null | undefined) => {
  if (!p) return "";
  const d = p.replace(/\D/g, "");
  if (d.startsWith("55") && d.length === 13) return `(${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  if (d.startsWith("55") && d.length === 12) return `(${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
  return `+${d}`;
};

// Planilha (CSV, ou colada do Excel/Google): primeira linha é o cabeçalho; mapeia os nomes das colunas
export function parseSheet(text: string, map: Record<string, string>): Array<Record<string, string>> {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const sep = lines[0].includes("\t") ? "\t" : lines[0].split(";").length > lines[0].split(",").length ? ";" : ",";
  const norm = (h: string) => h.trim().replace(/^"|"$/g, "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const split = (line: string) => {
    const out: string[] = [];
    let cur = "";
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (quoted && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = !quoted;
      } else if (ch === sep && !quoted) {
        out.push(cur);
        cur = "";
      } else cur += ch;
    }
    out.push(cur);
    return out;
  };
  const headers = split(lines[0]).map((h) => map[norm(h)] ?? "");
  return lines.slice(1).map((line) => {
    const cells = split(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      if (h && cells[i] !== undefined && cells[i].trim()) row[h] = cells[i].trim();
    });
    return row;
  });
}

// Canal da conversa: WhatsApp e Instagram separados em todo lugar (CRM, painel, caixa de conversas)
export const CHANNELS = [
  { id: "", label: "Todos os canais" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "instagram", label: "Instagram" },
] as const;

export function ChannelFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-border bg-muted/30 p-0.5">
      {CHANNELS.map((c) => (
        <button
          key={c.id || "todos"}
          type="button"
          onClick={() => onChange(c.id)}
          className={cn(
            "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
            value === c.id ? (c.id === "instagram" ? "bg-pink-500/20 text-pink-200" : c.id === "whatsapp" ? "bg-emerald-500/20 text-emerald-200" : "bg-card text-foreground shadow-sm") : "text-muted-foreground hover:text-foreground"
          )}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}

export function ChannelBadge({ channel }: { channel: string }) {
  return channel === "instagram" ? (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-gradient-to-r from-pink-500/25 to-amber-500/25 text-pink-200 border border-pink-500/30">IG</span>
  ) : (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">WA</span>
  );
}
