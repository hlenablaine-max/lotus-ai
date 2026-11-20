"use client";

// CRM da LOTUS: funil de vendas da agência (abordadas → responderam → call → proposta → fechou) e carteira de clientes
// (pacote, mensalidade, implantação). Fica na aba "CRM e resultados" da LOTUS (interno).
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CalendarClock, Globe, Loader2, Phone, Trophy, UserCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, Kpi, Notice, brl, btnPrimary, field, fmtDate, fmtTime, formatPhone } from "@/components/whatsapp/ui";

interface Item {
  id: string;
  name: string;
  status: string;
  phone: string | null;
  ownerContact: string | null;
  siteUrl: string | null;
  callAt: string | null;
  dealPackage: string | null;
  dealMonthly: number | null;
  closedAt: string | null;
  lostReason: string | null;
  clientId: string | null;
}
interface ClientRow {
  id: string;
  name: string;
  status: string;
  package: string | null;
  monthlyFee: number | null;
  setupFee: number | null;
  contractStart: string | null;
  onboardingStage: string | null;
}
interface Data {
  kpis: { reached: number; replied: number; replyRate: number | null; calls: number; callRate: number | null; won: number; closeRate: number | null; wonThisMonth: number; setupThisMonth: number; activeClients: number; mrr: number; ticket: number | null; onboarding: number; churned: number };
  pipeline: Array<{ id: string; label: string; items: Item[] }>;
  callsUpcoming: Item[];
  clients: ClientRow[];
}

const MOVE_TO = [
  { id: "ENVIADO", label: "Abordada" },
  { id: "RESPONDEU", label: "Respondeu" },
  { id: "CALL_MARCADA", label: "Call marcada" },
  { id: "PROPOSTA", label: "Proposta enviada" },
  { id: "FECHOU", label: "Fechou" },
  { id: "PERDIDO", label: "Não fechou" },
];
const ONBOARDING = [
  { id: "KICKOFF", label: "Kickoff" },
  { id: "ACESSOS", label: "Acessos" },
  { id: "SITE", label: "Site no ar" },
  { id: "CAMPANHAS", label: "Campanhas no ar" },
  { id: "RODANDO", label: "Rodando" },
];
const COL: Record<string, string> = { ABORDADA: "border-sky-500/30", RESPONDEU: "border-blue-500/30", CALL: "border-violet-500/40", PROPOSTA: "border-amber-500/40", FECHOU: "border-emerald-500/40", PERDIDO: "border-zinc-500/30" };

export function AgencyCrm() {
  const [data, setData] = useState<Data | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [closing, setClosing] = useState<Item | null>(null);
  const [deal, setDeal] = useState({ package: "", monthly: "", setup: "" });

  const load = useCallback(async () => {
    const r = await fetch("/api/lotus/crm").catch(() => null);
    if (r?.ok) setData((await r.json()) as Data);
  }, []);
  useEffect(() => {
    void load();
    const t = setInterval(() => document.visibilityState === "visible" && void load(), 30_000);
    return () => clearInterval(t);
  }, [load]);

  const post = async (body: Record<string, unknown>, ok?: string) => {
    const r = await fetch("/api/lotus/crm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = (await r.json().catch(() => ({}))) as { error?: string };
    if (!r.ok) setMsg({ kind: "error", text: d.error ?? "Não foi possível." });
    else if (ok) setMsg({ kind: "ok", text: ok });
    void load();
    return r.ok;
  };

  const move = async (item: Item, status: string) => {
    if (status === "FECHOU") {
      setDeal({ package: item.dealPackage ?? "", monthly: item.dealMonthly?.toString() ?? "", setup: "" });
      return setClosing(item);
    }
    let callAt: string | undefined;
    let lostReason: string | undefined;
    if (status === "CALL_MARCADA") {
      const v = window.prompt("Dia e hora da call (ex.: 25/11 15:00) — pode deixar em branco", "");
      if (v === null) return;
      const m = v.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s+(\d{1,2})(?::(\d{2}))?/);
      if (m) callAt = new Date(`${m[3] ? (m[3].length === 2 ? `20${m[3]}` : m[3]) : new Date().getFullYear()}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}T${m[4].padStart(2, "0")}:${m[5] ?? "00"}:00-03:00`).toISOString();
    }
    if (status === "PERDIDO") {
      const v = window.prompt("Por que não fechou? (preço, momento, já tem agência…)", "");
      if (v === null) return;
      lostReason = v;
    }
    await post({ action: "mover", prospectId: item.id, status, callAt, lostReason });
  };

  const confirmClose = async () => {
    if (!closing) return;
    const ok = await post({ action: "fechar", prospectId: closing.id, ...deal }, `${closing.name} fechou! Entrou na carteira em "Kickoff".`);
    if (ok) setClosing(null);
  };

  if (!data) {
    return (
      <div className="p-8 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Carregando o CRM da LOTUS…
      </div>
    );
  }
  const k = data.kpis;
  const active = data.clients.filter((c) => c.status === "ACTIVE");

  return (
    <div className="space-y-5">
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
        <Kpi label="Clínicas abordadas" value={String(k.reached)} />
        <Kpi label="Responderam" value={String(k.replied)} sub={k.replyRate !== null ? `${k.replyRate}% das abordadas` : ""} />
        <Kpi label="Calls marcadas" value={String(k.calls)} sub={k.callRate !== null ? `${k.callRate}% de quem respondeu` : ""} />
        <Kpi label="Fecharam" value={String(k.won)} sub={k.closeRate !== null ? `${k.closeRate}% das calls` : ""} tone={k.won ? "good" : undefined} icon={<Trophy className="w-4 h-4" />} />
        <Kpi label="Fechados este mês" value={String(k.wonThisMonth)} sub={k.setupThisMonth ? `${brl(k.setupThisMonth)} de implantação` : ""} tone={k.wonThisMonth ? "good" : undefined} />
        <Kpi label="Clientes ativos" value={String(k.activeClients)} sub={k.onboarding ? `${k.onboarding} em implantação` : ""} />
        <Kpi label="Entra por mês (MRR)" value={brl(k.mrr)} sub={k.ticket ? `ticket ${brl(k.ticket)}` : "informe as mensalidades"} tone={k.mrr ? "good" : undefined} />
        <Kpi label="Cancelaram" value={String(k.churned)} tone={k.churned ? "bad" : undefined} />
      </div>

      {data.callsUpcoming.length > 0 && (
        <Card title="Próximas calls" subtitle="Marcadas pela IA da prospecção ou por você">
          <div className="space-y-2">
            {data.callsUpcoming.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center gap-3 text-sm">
                <CalendarClock className="w-4 h-4 text-violet-300" />
                <span className="text-foreground font-medium">{fmtDate(c.callAt!)} às {fmtTime(c.callAt!)}</span>
                <span className="text-foreground">{c.name}</span>
                {c.ownerContact && <span className="text-xs text-violet-200">{c.ownerContact}</span>}
                {c.siteUrl && (
                  <a href={c.siteUrl} target="_blank" rel="noreferrer" className="text-xs text-emerald-300 hover:underline inline-flex items-center gap-1">
                    <Globe className="w-3 h-3" /> site grátis para mostrar
                  </a>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Funil de vendas da LOTUS</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-3">
          {data.pipeline.map((col) => (
            <div key={col.id} className={cn("rounded-xl border bg-muted/10 p-3 min-h-[140px]", COL[col.id])}>
              <div className="flex justify-between text-xs font-semibold text-foreground mb-2">
                <span>{col.label}</span>
                <span className="text-muted-foreground">{col.items.length}</span>
              </div>
              <div className="space-y-2">
                {col.items.map((it) => (
                  <div key={it.id} className="rounded-lg border border-border bg-card p-2.5 space-y-1">
                    <div className="text-xs font-medium text-foreground truncate" title={it.name}>{it.name}</div>
                    {it.ownerContact && (
                      <div className="text-[10px] text-violet-200 truncate flex items-center gap-1"><UserCheck className="w-3 h-3" /> {it.ownerContact}</div>
                    )}
                    {!it.ownerContact && it.phone && <div className="text-[10px] text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" /> {formatPhone(it.phone)}</div>}
                    {it.callAt && <div className="text-[10px] text-violet-300">call {fmtDate(it.callAt)} {fmtTime(it.callAt)}</div>}
                    {it.dealMonthly ? <div className="text-[10px] text-emerald-300">{it.dealPackage ?? "pacote"} · {brl(it.dealMonthly)}/mês</div> : null}
                    {it.lostReason && <div className="text-[10px] text-red-300 truncate">{it.lostReason}</div>}
                    {it.status !== "FECHOU" && (
                      <select value="" onChange={(e) => e.target.value && void move(it, e.target.value)} className="w-full text-[11px] rounded-md bg-muted/40 border border-border px-1.5 py-1 text-foreground">
                        <option value="">Mover para…</option>
                        {MOVE_TO.map((o) => (
                          <option key={o.id} value={o.id}>{o.label}</option>
                        ))}
                      </select>
                    )}
                    {it.clientId && (
                      <Link href={`/clients/${it.clientId}`} className="block text-[10px] text-primary hover:underline">abrir cliente</Link>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <Card title="Carteira de clientes" subtitle="Pacote, mensalidade e em que etapa da implantação está cada um">
        {active.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum cliente ativo ainda. Quando você marcar uma clínica como &quot;Fechou&quot;, ela aparece aqui.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground text-left">
                  <th className="pb-2 font-medium">Cliente</th>
                  <th className="pb-2 font-medium">Pacote</th>
                  <th className="pb-2 font-medium text-right">Mensalidade</th>
                  <th className="pb-2 font-medium">Desde</th>
                  <th className="pb-2 font-medium">Implantação</th>
                  <th className="pb-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {active.map((c) => (
                  <tr key={c.id} className="border-t border-border/60">
                    <td className="py-2">
                      <Link href={`/clients/${c.id}`} className="text-foreground hover:text-primary">{c.name.split("|")[0].trim()}</Link>
                    </td>
                    <td className="py-2">
                      <input className={cn(field, "py-1 text-xs w-36")} defaultValue={c.package ?? ""} placeholder="ex.: Completo" onBlur={(e) => e.target.value !== (c.package ?? "") && void post({ action: "contrato", clientId: c.id, package: e.target.value })} />
                    </td>
                    <td className="py-2 text-right">
                      <input className={cn(field, "py-1 text-xs w-28 text-right")} defaultValue={c.monthlyFee ?? ""} placeholder="R$ por mês" onBlur={(e) => e.target.value !== String(c.monthlyFee ?? "") && void post({ action: "contrato", clientId: c.id, monthly: e.target.value })} />
                    </td>
                    <td className="py-2 text-muted-foreground">{c.contractStart ? fmtDate(c.contractStart) : "—"}</td>
                    <td className="py-2">
                      <select value={c.onboardingStage ?? ""} onChange={(e) => void post({ action: "etapa", clientId: c.id, stage: e.target.value })} className={cn("text-[11px] rounded-md border px-1.5 py-1 bg-muted/40", c.onboardingStage === "RODANDO" ? "border-emerald-500/40 text-emerald-200" : "border-amber-500/40 text-amber-200")}>
                        <option value="" disabled>Escolha…</option>
                        {ONBOARDING.map((o) => (
                          <option key={o.id} value={o.id}>{o.label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 text-right">
                      <button onClick={() => window.confirm(`Marcar ${c.name.split("|")[0].trim()} como cancelado?`) && void post({ action: "cancelou", clientId: c.id }, "Cliente marcado como cancelado.")} className="text-[10px] text-muted-foreground hover:text-red-300">cancelou</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {closing && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setClosing(null)}>
          <div className="rounded-2xl bg-card border border-border p-6 max-w-md w-full space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-foreground flex items-center gap-2"><Trophy className="w-5 h-5 text-emerald-300" /> {closing.name} fechou!</h3>
            <p className="text-xs text-muted-foreground">Vira cliente da LOTUS e entra na carteira em &quot;Kickoff&quot;.</p>
            <input className={field} placeholder="Pacote (ex.: Completo, Site + Atendimento)" value={deal.package} onChange={(e) => setDeal({ ...deal, package: e.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              <input className={field} placeholder="Mensalidade (R$)" value={deal.monthly} onChange={(e) => setDeal({ ...deal, monthly: e.target.value })} />
              <input className={field} placeholder="Implantação (R$)" value={deal.setup} onChange={(e) => setDeal({ ...deal, setup: e.target.value })} />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setClosing(null)} className="px-3 py-2 text-sm text-muted-foreground">Cancelar</button>
              <button onClick={() => void confirmClose()} className={btnPrimary}>Confirmar fechamento</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
