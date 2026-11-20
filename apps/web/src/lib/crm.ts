// CRM de cada cliente: leads, funil e resultados do mês (o que prova que a LOTUS faz a clínica crescer).
import { prisma } from "@/lib/prisma";

export const STAGES = ["NOVO", "EM_CONTATO", "AGENDADO", "COMPARECEU", "FECHADO", "PERDIDO"] as const;
export type Stage = (typeof STAGES)[number];
export const SOURCES = ["META_ADS", "GOOGLE_ADS", "SITE", "INSTAGRAM", "WHATSAPP", "INDICACAO", "REATIVACAO", "GOOGLE_MAPS", "PACIENTE_BASE", "OUTRO"] as const;
export type Source = (typeof SOURCES)[number];

export const STAGE_LABEL: Record<Stage, string> = {
  NOVO: "Novo",
  EM_CONTATO: "Em contato",
  AGENDADO: "Agendado",
  COMPARECEU: "Compareceu",
  FECHADO: "Fechou",
  PERDIDO: "Perdido",
};
export const SOURCE_LABEL: Record<Source, string> = {
  META_ADS: "Anúncio (Facebook/Instagram)",
  GOOGLE_ADS: "Anúncio (Google)",
  SITE: "Site",
  INSTAGRAM: "Instagram (orgânico)",
  WHATSAPP: "WhatsApp direto",
  INDICACAO: "Indicação",
  REATIVACAO: "Reativação da base",
  GOOGLE_MAPS: "Google Maps",
  PACIENTE_BASE: "Paciente antigo que voltou",
  OUTRO: "Outro",
};

// Ordem do funil: um lead "Fechou" também passou por agendado e compareceu
const RANK: Record<Stage, number> = { NOVO: 0, EM_CONTATO: 1, AGENDADO: 2, COMPARECEU: 3, FECHADO: 4, PERDIDO: -1 };

export function monthRange(month?: string): { month: string; start: Date; end: Date } {
  const now = new Date();
  const m = month && /^\d{4}-\d{2}$/.test(month) ? month : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [y, mm] = m.split("-").map(Number);
  return { month: m, start: new Date(y, mm - 1, 1), end: new Date(y, mm, 1) };
}

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
const money = (v: number | null) => (v === null ? null : Math.round(v * 100) / 100);

export interface ClientResults {
  month: string;
  leads: number;
  leadsViaLotus: number;
  bySource: Array<{ source: Source; label: string; leads: number; closed: number; revenue: number }>;
  funnel: Array<{ stage: Stage; label: string; count: number }>;
  rates: { contato: number | null; agendamento: number | null; comparecimento: number | null; fechamento: number | null; leadParaVenda: number | null };
  closed: number;
  lost: number;
  revenueClosed: number;
  ticket: number | null;
  adSpend: number | null;
  cpl: number | null; // custo por lead
  cac: number | null; // custo por paciente/cliente novo
  roas: number | null; // retorno sobre o investimento em anúncios
  patientBase: number | null;
  revenueTotal: number | null;
  waitingContact: number; // leads novos sem contato
  slowContact: number; // novos parados há mais de 2 h
  previous: { leads: number; closed: number; revenueClosed: number } | null;
}

export async function clientResults(clientId: string, month?: string): Promise<ClientResults> {
  const r = monthRange(month);
  const prev = monthRange(`${r.start.getMonth() === 0 ? r.start.getFullYear() - 1 : r.start.getFullYear()}-${String(r.start.getMonth() === 0 ? 12 : r.start.getMonth()).padStart(2, "0")}`);
  const [leads, numbers, prevLeads] = await Promise.all([
    prisma.lead.findMany({ where: { clientId, createdAt: { gte: r.start, lt: r.end } }, select: { stage: true, source: true, value: true, viaLotus: true, createdAt: true } }),
    prisma.clientMonthlyNumbers.findUnique({ where: { clientId_month: { clientId, month: r.month } } }),
    prisma.lead.findMany({ where: { clientId, createdAt: { gte: prev.start, lt: prev.end } }, select: { stage: true, value: true } }),
  ]);
  const reached = (s: Stage) => leads.filter((l) => RANK[l.stage as Stage] >= RANK[s]).length;
  const closedLeads = leads.filter((l) => l.stage === "FECHADO");
  const revenueClosed = closedLeads.reduce((sum, l) => sum + (l.value ?? 0), 0);
  const adSpend = numbers?.adSpend ?? null;
  const total = leads.length;
  const now = Date.now();

  return {
    month: r.month,
    leads: total,
    leadsViaLotus: leads.filter((l) => l.viaLotus).length,
    bySource: SOURCES.map((s) => {
      const of = leads.filter((l) => l.source === s);
      const closed = of.filter((l) => l.stage === "FECHADO");
      return { source: s, label: SOURCE_LABEL[s], leads: of.length, closed: closed.length, revenue: closed.reduce((sum, l) => sum + (l.value ?? 0), 0) };
    }).filter((s) => s.leads > 0),
    funnel: (["NOVO", "EM_CONTATO", "AGENDADO", "COMPARECEU", "FECHADO"] as Stage[]).map((s) => ({ stage: s, label: STAGE_LABEL[s], count: s === "NOVO" ? total : reached(s) })),
    rates: {
      contato: pct(reached("EM_CONTATO"), total),
      agendamento: pct(reached("AGENDADO"), reached("EM_CONTATO")),
      comparecimento: pct(reached("COMPARECEU"), reached("AGENDADO")),
      fechamento: pct(reached("FECHADO"), reached("COMPARECEU")),
      leadParaVenda: pct(closedLeads.length, total),
    },
    closed: closedLeads.length,
    lost: leads.filter((l) => l.stage === "PERDIDO").length,
    revenueClosed: money(revenueClosed) ?? 0,
    ticket: closedLeads.length ? money(revenueClosed / closedLeads.length) : null,
    adSpend,
    cpl: adSpend !== null && total ? money(adSpend / total) : null,
    cac: adSpend !== null && closedLeads.length ? money(adSpend / closedLeads.length) : null,
    roas: adSpend ? Math.round((revenueClosed / adSpend) * 10) / 10 : null,
    patientBase: numbers?.patientBase ?? null,
    revenueTotal: numbers?.revenue ?? null,
    waitingContact: leads.filter((l) => l.stage === "NOVO").length,
    slowContact: leads.filter((l) => l.stage === "NOVO" && now - l.createdAt.getTime() > 2 * 3600_000).length,
    previous: prevLeads.length
      ? { leads: prevLeads.length, closed: prevLeads.filter((l) => l.stage === "FECHADO").length, revenueClosed: money(prevLeads.filter((l) => l.stage === "FECHADO").reduce((s, l) => s + (l.value ?? 0), 0)) ?? 0 }
      : null,
  };
}

// Resumo em texto (para os agentes e o Root Master)
export function resultsSummary(name: string, r: ClientResults): string {
  const brl = (v: number | null) => (v === null ? "não informado" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
  return [
    `Resultados de ${name} em ${r.month}:`,
    `- Leads: ${r.leads} (${r.leadsViaLotus} vieram por ações da LOTUS). Fontes: ${r.bySource.map((s) => `${s.label} ${s.leads}`).join(", ") || "nenhuma"}.`,
    `- Funil: ${r.funnel.map((f) => `${f.label} ${f.count}`).join(" → ")}. Fechamentos: ${r.closed}; perdidos: ${r.lost}.`,
    `- Taxas: contato ${r.rates.contato ?? "-"}%, agendamento ${r.rates.agendamento ?? "-"}%, comparecimento ${r.rates.comparecimento ?? "-"}%, fechamento ${r.rates.fechamento ?? "-"}%, lead→venda ${r.rates.leadParaVenda ?? "-"}%.`,
    `- Faturamento fechado com esses leads: ${brl(r.revenueClosed)}; ticket médio ${brl(r.ticket)}. Investimento em anúncios: ${brl(r.adSpend)}; custo por lead ${brl(r.cpl)}; custo por cliente novo ${brl(r.cac)}; retorno ${r.roas ?? "-"}x.`,
    `- Base de pacientes/clientes: ${r.patientBase ?? "não informada"}. Faturamento total do mês informado: ${brl(r.revenueTotal)}.`,
    `- Atenção: ${r.waitingContact} leads ainda sem contato (${r.slowContact} esperando há mais de 2 horas).`,
    r.previous ? `- Mês anterior: ${r.previous.leads} leads, ${r.previous.closed} fechamentos, ${brl(r.previous.revenueClosed)}.` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
