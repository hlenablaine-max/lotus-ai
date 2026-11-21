"use client";

// Cartão "Saúde do funil": taxas da clínica nos últimos 30 dias ao lado da média das clínicas do mesmo segmento
// e da meta da LOTUS, com os pontos onde o funil está vazando e o que fazer.
import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Gauge } from "lucide-react";
import { cn } from "@/lib/utils";

type RateKey = "contato" | "agendamento" | "comparecimento" | "fechamento" | "leadParaVenda";
interface Health {
  segment: string | null;
  mine: Record<RateKey, number | null> & { leads: number };
  benchmark: { clinics: number; rates: Record<RateKey, number | null> } | null;
  leaks: Array<{ key: string; title: string; detail: string; fix: string; severity: "alta" | "media" }>;
  goals: Record<RateKey, number>;
  labels: Record<RateKey, string>;
}
const KEYS: RateKey[] = ["contato", "agendamento", "comparecimento", "fechamento", "leadParaVenda"];

export function FunnelHealthCard({ clientId, refreshKey }: { clientId: string; refreshKey?: unknown }) {
  const [h, setH] = useState<Health | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(`/api/clients/${clientId}/health`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => alive && setH(d as Health | null))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [clientId, refreshKey]);
  if (!h) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><Gauge className="w-4 h-4 text-primary" /> Saúde do funil (últimos 30 dias)</h3>
        <span className="text-[11px] text-muted-foreground">
          {h.benchmark
            ? `Comparado com ${h.benchmark.clinics} clínicas de ${h.segment} atendidas pela LOTUS`
            : h.segment
              ? `Ainda sem outras clínicas de ${h.segment} com dados suficientes para comparar; usando a meta da LOTUS`
              : "Sem segmento cadastrado; usando a meta da LOTUS"}
        </span>
      </div>

      {h.mine.leads < 10 ? (
        <p className="text-xs text-muted-foreground">Só {h.mine.leads} lead(s) nos últimos 30 dias. Com menos de 10, as taxas ainda não dizem muita coisa.</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {KEYS.map((k) => {
            const v = h.mine[k];
            const ref = h.benchmark?.rates[k] ?? null;
            const goal = h.goals[k];
            const bad = v !== null && (v < goal || (ref !== null && v < ref - 5));
            return (
              <div key={k} className={cn("rounded-lg border p-2.5", bad ? "border-amber-500/40 bg-amber-500/5" : "border-border bg-muted/10")}>
                <div className="text-[10px] text-muted-foreground">{h.labels[k]}</div>
                <div className={cn("text-lg font-bold", bad ? "text-amber-300" : "text-foreground")}>{v === null ? "—" : `${v}%`}</div>
                <div className="text-[10px] text-muted-foreground">
                  {ref !== null ? `segmento ${ref}% · ` : ""}meta {goal}%
                </div>
              </div>
            );
          })}
        </div>
      )}

      {h.leaks.length > 0 ? (
        <div className="space-y-2">
          {h.leaks.map((l) => (
            <div key={l.key} className="flex gap-2 text-xs">
              <AlertTriangle className={cn("w-4 h-4 flex-shrink-0", l.severity === "alta" ? "text-red-300" : "text-amber-300")} />
              <div>
                <span className="text-foreground font-medium">{l.title}.</span> <span className="text-muted-foreground">{l.detail}</span>
                <div className="text-primary/90">O que fazer: {l.fix}</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        h.mine.leads >= 10 && (
          <div className="flex items-center gap-2 text-xs text-emerald-300"><CheckCircle2 className="w-4 h-4" /> Nenhum vazamento importante no funil.</div>
        )
      )}
      <p className="text-[10px] text-muted-foreground/70">As metas são da LOTUS (o que uma clínica bem atendida costuma alcançar), não dados medidos. Toda segunda, 9h, você recebe um aviso com os pontos da semana.</p>
    </div>
  );
}
