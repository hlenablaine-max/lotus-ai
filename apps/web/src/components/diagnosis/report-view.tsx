"use client";

// Painel do Playbook de Faturamento: lê o bloco de dados que o estrategista coloca no fim do
// relatório e mostra notas, gargalos e próximos passos em cartões. O texto completo fica abaixo.

import { useState } from "react";
import { AlertTriangle, ArrowRight, ChevronDown, ExternalLink, Globe, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { RichText } from "@/components/ui/rich-text";
import { parseReport, type Gargalo, type Placar } from "@/lib/playbook";

export { parseReport };

const scoreColor = (n: number) => (n >= 7 ? "bg-emerald-400" : n >= 5 ? "bg-amber-400" : "bg-red-400");
const scoreText = (n: number) => (n >= 7 ? "text-emerald-300" : n >= 5 ? "text-amber-300" : "text-red-300");
const severity: Record<string, string> = {
  alta: "border-red-400/40 bg-red-400/5",
  media: "border-amber-400/40 bg-amber-400/5",
  média: "border-amber-400/40 bg-amber-400/5",
  baixa: "border-white/15 bg-white/3",
};

function GargaloCard({ g, index }: { g: Gargalo; index: number }) {
  const [open, setOpen] = useState(index < 2);
  const level = (g.gravidade ?? "media").toLowerCase();
  return (
    <div className={cn("rounded-2xl border p-4", severity[level] ?? severity.media)}>
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-start gap-3 text-left">
        <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-bold text-white">{index + 1}</span>
        <span className="flex-1 text-[15px] font-semibold text-white leading-snug">{g.titulo}</span>
        <span className="text-[10px] uppercase tracking-wider text-white/40 mt-1">{level}</span>
        <ChevronDown className={cn("w-4 h-4 text-white/40 mt-0.5 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 pl-9">
          {[
            ["O problema", g.problema],
            ["A prova", g.prova],
            ["Por que custa dinheiro", g.porQueCusta],
            ["O que fazer", g.oQueFazer],
          ]
            .filter(([, v]) => v)
            .map(([label, value]) => (
              <div key={label}>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-white/40 mb-1">{label}</div>
                <p className="text-sm leading-6 text-white/80">{value}</p>
              </div>
            ))}
          {g.impacto && (
            <div className="sm:col-span-2 flex items-start gap-2 rounded-xl bg-emerald-400/10 border border-emerald-400/20 px-3 py-2">
              <TrendingUp className="w-4 h-4 text-emerald-300 mt-0.5 flex-shrink-0" />
              <p className="text-sm leading-6 text-emerald-100">{g.impacto}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ReportView({ content, site }: { content: string; site?: { url: string | null; approved: boolean | null; score: number | null } }) {
  const { placar, text } = parseReport(content);
  const [showFull, setShowFull] = useState(!placar);

  return (
    <div className="space-y-5">
      {placar && (
        <>
          <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5 flex flex-col items-center justify-center text-center">
              <div className="text-[11px] uppercase tracking-wider text-white/40">Nota geral hoje</div>
              <div className={cn("text-6xl font-bold mt-1", scoreText(placar.notaGeral ?? 0))}>{placar.notaGeral ?? "—"}</div>
              <div className="text-xs text-white/40">de 10</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-2.5">
              {(placar.notas ?? []).map((n) => (
                <div key={n.area} title={n.motivo} className="grid grid-cols-[160px_1fr_32px] items-center gap-3">
                  <span className="text-sm text-white/80 truncate">{n.area}</span>
                  <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                    <div className={cn("h-full rounded-full", scoreColor(n.nota))} style={{ width: `${Math.max(4, n.nota * 10)}%` }} />
                  </div>
                  <span className={cn("text-sm font-semibold text-right", scoreText(n.nota))}>{n.nota}</span>
                </div>
              ))}
            </div>
          </div>

          {placar.ganhoPotencial && (
            <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-4 flex gap-3">
              <TrendingUp className="w-5 h-5 text-emerald-300 flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-[11px] uppercase tracking-wider text-emerald-300/80 mb-1">Quanto a clínica pode ganhar</div>
                <p className="text-[15px] leading-7 text-white">{placar.ganhoPotencial}</p>
              </div>
            </div>
          )}

          {site?.url && (
            <a href={site.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-2xl border border-pink-400/30 bg-pink-500/10 p-4 hover:bg-pink-500/15 transition-colors">
              <Globe className="w-5 h-5 text-pink-300 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[11px] uppercase tracking-wider text-pink-300/80">Site novo da clínica</div>
                <div className="text-sm text-white truncate">{site.url}</div>
                <div className="text-xs text-white/50">
                  {site.approved === true ? `Aprovado pela revisão de qualidade (nota ${site.score}/10)` : site.approved === false ? `Publicado com pontos a melhorar (nota ${site.score}/10)` : "Em revisão de qualidade"}
                </div>
              </div>
              <ExternalLink className="w-4 h-4 text-white/50" />
            </a>
          )}

          {(placar.gargalos ?? []).length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/50">
                <AlertTriangle className="w-4 h-4 text-amber-300" /> O que trava o faturamento ({placar.gargalos?.length})
              </div>
              {(placar.gargalos ?? []).map((g, i) => (
                <GargaloCard key={`${g.titulo}-${i}`} g={g} index={i} />
              ))}
            </div>
          )}

          {(placar.proximosPassos ?? []).length > 0 && (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-white/50 mb-2">Próximos passos</div>
              <ol className="space-y-2">
                {(placar.proximosPassos ?? []).map((step, i) => (
                  <li key={i} className="flex gap-3 text-sm leading-6 text-white/85">
                    <ArrowRight className="w-4 h-4 text-pink-300 flex-shrink-0 mt-1" /> {step}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </>
      )}

      {placar && (
        <button type="button" onClick={() => setShowFull(!showFull)} className="text-xs text-pink-300 hover:underline">
          {showFull ? "Esconder o playbook completo" : "Ler o playbook completo"}
        </button>
      )}
      {showFull && (
        <div className="rounded-2xl border border-white/10 bg-black/30 p-5">
          <RichText content={text} />
        </div>
      )}
    </div>
  );
}
