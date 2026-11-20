"use client";

// Painel do atendimento: o dia (ou período) da clínica no WhatsApp, de onde veio cada lead e onde ele se perde.
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Clock, Loader2, MessageCircle, Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, Kpi, SOURCE_META, brl, fmtMinutes } from "./ui";

interface Metrics {
  arrived: number;
  viaLotus: number;
  answered: number;
  answeredRate: number | null;
  answeredIn5: number;
  avgFirstResponseMin: number | null;
  medianFirstResponseMin: number | null;
  scheduled: number;
  closed: number;
  lost: number;
  open: number;
  revenue: number;
  closeRate: number | null;
  waitingNow: number;
  waitingOver1h: number;
  messagesIn: number;
  messagesOut: number;
  messagesAuto: number;
  bySource: Array<{ source: string; label: string; leads: number; answered: number; scheduled: number; closed: number; revenue: number }>;
  byCampaign: Array<{ campaign: string; leads: number; closed: number; revenue: number }>;
  byHour: Array<{ hour: number; leads: number; fast: number }>;
}

const PERIODS = [
  { id: "hoje", label: "Hoje" },
  { id: "ontem", label: "Ontem" },
  { id: "7d", label: "7 dias" },
  { id: "30d", label: "30 dias" },
  { id: "mes", label: "Este mês" },
];

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

export function AttendancePanel({ clientId, onOpenWaiting }: { clientId: string; onOpenWaiting: () => void }) {
  const [period, setPeriod] = useState("hoje");
  const [m, setM] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/clients/${clientId}/whatsapp/metrics?periodo=${period}`).catch(() => null);
    if (!res?.ok) return setError("Não foi possível carregar o painel.");
    setError(null);
    setM((await res.json()) as Metrics);
  }, [clientId, period]);

  useEffect(() => {
    setM(null);
    void load();
    const t = setInterval(() => document.visibilityState === "visible" && void load(), 15_000);
    return () => clearInterval(t);
  }, [load]);

  const maxHour = Math.max(1, ...(m?.byHour.map((h) => h.leads) ?? [1]));
  const funnel = m
    ? [
        { label: "Chegaram", value: m.arrived, cls: "bg-sky-400" },
        { label: "Foram respondidos", value: m.answered, cls: "bg-blue-400" },
        { label: "Agendaram", value: m.scheduled, cls: "bg-violet-400" },
        { label: "Fecharam", value: m.closed, cls: "bg-emerald-400" },
      ]
    : [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {PERIODS.map((p) => (
          <button key={p.id} onClick={() => setPeriod(p.id)} className={cn("px-3 py-1.5 rounded-lg text-xs font-medium border", period === p.id ? "bg-primary/15 border-primary/40 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>
            {p.label}
          </button>
        ))}
        <span className="text-[11px] text-muted-foreground ml-auto">Atualiza sozinho a cada 15 segundos</span>
      </div>
      {error && <p className="text-sm text-red-300">{error}</p>}
      {!m && !error && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Calculando…
        </div>
      )}
      {m && (
        <>
          {m.waitingNow > 0 && (
            <button onClick={onOpenWaiting} className="w-full text-left rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200 flex items-center gap-2 hover:bg-amber-500/15">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>
                <b>{m.waitingNow}</b> conversa(s) esperando resposta agora{m.waitingOver1h ? <>, <b>{m.waitingOver1h}</b> há mais de 1 hora</> : null}. Lead que espera esfria: clique para responder.
              </span>
            </button>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
            <Kpi label="Chegaram" value={String(m.arrived)} sub={`${m.viaLotus} pela LOTUS`} icon={<MessageCircle className="w-4 h-4" />} />
            <Kpi label="Respondidos" value={String(m.answered)} sub={m.answeredRate !== null ? `${m.answeredRate}% dos que chegaram` : ""} tone={m.answeredRate !== null && m.answeredRate < 80 ? "warn" : undefined} />
            <Kpi label="Tempo da 1ª resposta" value={fmtMinutes(m.avgFirstResponseMin)} sub={m.answered ? `${m.answeredIn5} em até 5 min` : "média"} tone={m.avgFirstResponseMin !== null && m.avgFirstResponseMin > 15 ? "warn" : m.avgFirstResponseMin !== null && m.avgFirstResponseMin <= 5 ? "good" : undefined} icon={<Timer className="w-4 h-4" />} />
            <Kpi label="Agendaram" value={String(m.scheduled)} sub={pct(m.scheduled, m.arrived) + " dos leads"} />
            <Kpi label="Fecharam" value={String(m.closed)} sub={m.closeRate !== null ? `${m.closeRate}% dos leads` : ""} tone={m.closed ? "good" : undefined} />
            <Kpi label="Não fecharam" value={String(m.lost)} sub={`${m.open} ainda em aberto`} tone={m.lost ? "bad" : undefined} />
            <Kpi label="Faturou" value={brl(m.revenue)} sub={m.closed ? `ticket ${brl(m.revenue / m.closed)}` : ""} tone={m.revenue ? "good" : undefined} />
            <Kpi label="Mensagens" value={String(m.messagesIn + m.messagesOut)} sub={`${m.messagesIn} recebidas · ${m.messagesOut} enviadas${m.messagesAuto ? ` (${m.messagesAuto} automáticas)` : ""}`} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card title="Funil do atendimento" subtitle="Do primeiro oi ao fechamento">
              <div className="space-y-3">
                {funnel.map((f, i) => (
                  <div key={f.label}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-foreground">{f.label}</span>
                      <span className="text-muted-foreground">
                        {f.value}
                        {i > 0 && funnel[i - 1].value ? <span className="ml-2 text-[10px]">({pct(f.value, funnel[i - 1].value)} da etapa anterior)</span> : null}
                      </span>
                    </div>
                    <div className="h-3 rounded-full bg-muted/40 overflow-hidden">
                      <div className={cn("h-full rounded-full transition-all", f.cls)} style={{ width: `${m.arrived ? (f.value / m.arrived) * 100 : 0}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card title="Quando os leads chegam" subtitle="Barra cheia = leads que chegaram; parte verde = respondidos em até 5 min">
              <div className="flex items-end gap-[3px] h-32">
                {m.byHour.map((h) => (
                  <div key={h.hour} className="flex-1 flex flex-col justify-end h-full group relative" title={`${h.hour}h: ${h.leads} leads, ${h.fast} respondidos em até 5 min`}>
                    <div className="w-full rounded-t bg-muted/60 relative overflow-hidden" style={{ height: `${(h.leads / maxHour) * 100}%`, minHeight: h.leads ? 3 : 0 }}>
                      <div className="absolute bottom-0 left-0 right-0 bg-emerald-500/80" style={{ height: h.leads ? `${(h.fast / h.leads) * 100}%` : 0 }} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                <span>0h</span>
                <span>6h</span>
                <span>12h</span>
                <span>18h</span>
                <span>23h</span>
              </div>
              {m.byHour.some((h) => (h.hour < 8 || h.hour >= 19) && h.leads > 0) && (
                <p className="text-[11px] text-amber-300 mt-2 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Chegam leads fora do horário comercial. Ligue as boas-vindas automáticas em Automações para ninguém ficar sem resposta.
                </p>
              )}
            </Card>
          </div>

          <Card title="Resultado por origem" subtitle="Cada canal tem uma saudação diferente: é assim que a LOTUS sabe de onde o lead veio">
            {m.bySource.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhum lead neste período.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-muted-foreground text-left">
                      <th className="pb-2 font-medium">Origem</th>
                      <th className="pb-2 font-medium text-right">Chegaram</th>
                      <th className="pb-2 font-medium text-right">Respondidos</th>
                      <th className="pb-2 font-medium text-right">Agendaram</th>
                      <th className="pb-2 font-medium text-right">Fecharam</th>
                      <th className="pb-2 font-medium text-right">Conversão</th>
                      <th className="pb-2 font-medium text-right">Faturou</th>
                    </tr>
                  </thead>
                  <tbody>
                    {m.bySource.map((s) => (
                      <tr key={s.source} className="border-t border-border/60">
                        <td className="py-2.5">
                          <span className="flex items-center gap-2 text-foreground">
                            <span className={cn("w-2 h-2 rounded-full", SOURCE_META[s.source]?.dot ?? "bg-zinc-500")} />
                            {SOURCE_META[s.source]?.label ?? s.label}
                          </span>
                        </td>
                        <td className="py-2.5 text-right">{s.leads}</td>
                        <td className="py-2.5 text-right">{s.answered}</td>
                        <td className="py-2.5 text-right">{s.scheduled}</td>
                        <td className="py-2.5 text-right">{s.closed}</td>
                        <td className="py-2.5 text-right">{pct(s.closed, s.leads)}</td>
                        <td className="py-2.5 text-right text-emerald-300">{brl(s.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {m.byCampaign.length > 0 && (
            <Card title="Resultado por campanha, criativo ou conteúdo" subtitle="Cada anúncio, vídeo ou post com link próprio mostra quanto realmente vendeu">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground text-left">
                    <th className="pb-2 font-medium">Campanha</th>
                    <th className="pb-2 font-medium text-right">Leads</th>
                    <th className="pb-2 font-medium text-right">Fecharam</th>
                    <th className="pb-2 font-medium text-right">Faturou</th>
                  </tr>
                </thead>
                <tbody>
                  {m.byCampaign.map((c) => (
                    <tr key={c.campaign} className="border-t border-border/60">
                      <td className="py-2 text-foreground">{c.campaign}</td>
                      <td className="py-2 text-right">{c.leads}</td>
                      <td className="py-2 text-right">{c.closed}</td>
                      <td className="py-2 text-right text-emerald-300">{brl(c.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
