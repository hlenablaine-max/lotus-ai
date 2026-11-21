// Saúde do funil de cada clínica: comparação com as outras clínicas do mesmo segmento e onde o funil está vazando.
// Toda segunda de manhã a LOTUS olha o funil das clínicas ativas e avisa o Ícaro do que precisa de correção.
// Nada de número inventado: a média do segmento só aparece quando há outras clínicas com dados suficientes,
// e as metas usadas para apontar vazamento são metas internas da LOTUS (ditas como tal).
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notify";
import { LOTUS_SLUG } from "@/lib/whatsapp";

const DAY = 86_400_000;
const RANK: Record<string, number> = { NOVO: 0, EM_CONTATO: 1, AGENDADO: 2, COMPARECEU: 3, FECHADO: 4, PERDIDO: -1 };
const MIN_LEADS = 10; // abaixo disso a taxa não diz nada

export type RateKey = "contato" | "agendamento" | "comparecimento" | "fechamento" | "leadParaVenda";
export const RATE_LABEL: Record<RateKey, string> = {
  contato: "Respondidos",
  agendamento: "Agendaram",
  comparecimento: "Compareceram",
  fechamento: "Fecharam (de quem veio)",
  leadParaVenda: "Lead → paciente",
};
// Metas internas da LOTUS (o que uma clínica bem atendida costuma alcançar). São metas, não dados medidos.
export const LOTUS_GOALS: Record<RateKey, number> = { contato: 90, agendamento: 35, comparecimento: 70, fechamento: 45, leadParaVenda: 12 };

type Rates = Record<RateKey, number | null>;
// Taxa só existe com pelo menos 5 pessoas na base (1 de 1 = 100% não diz nada)
const pct = (a: number, b: number) => (b >= 5 ? Math.round((a / b) * 1000) / 10 : null);

function ratesOf(leads: Array<{ stage: string }>): Rates & { leads: number } {
  const reached = (s: string) => leads.filter((l) => (RANK[l.stage] ?? -1) >= RANK[s]).length;
  return {
    leads: leads.length,
    contato: pct(reached("EM_CONTATO"), leads.length),
    agendamento: pct(reached("AGENDADO"), reached("EM_CONTATO")),
    comparecimento: pct(reached("COMPARECEU"), reached("AGENDADO")),
    fechamento: pct(reached("FECHADO"), reached("COMPARECEU")),
    leadParaVenda: pct(leads.filter((l) => l.stage === "FECHADO").length, leads.length),
  };
}

export interface FunnelHealth {
  days: number;
  segment: string | null;
  mine: Rates & { leads: number };
  benchmark: { clinics: number; rates: Rates } | null; // média das outras clínicas do mesmo segmento
  leaks: Array<{ key: RateKey | "semContato"; title: string; detail: string; fix: string; severity: "alta" | "media" }>;
  slowContact: number;
}

export async function funnelHealth(clientId: string, days = 30): Promise<FunnelHealth> {
  const since = new Date(Date.now() - days * DAY);
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { segment: true } });
  const segment = client?.segment?.trim() || null;
  const [mineLeads, peers] = await Promise.all([
    prisma.lead.findMany({ where: { clientId, createdAt: { gte: since } }, select: { stage: true, createdAt: true } }),
    segment
      ? prisma.client.findMany({ where: { id: { not: clientId }, slug: { not: LOTUS_SLUG }, status: "ACTIVE", segment: { equals: segment, mode: "insensitive" } }, select: { id: true } })
      : Promise.resolve([] as Array<{ id: string }>),
  ]);
  const mine = ratesOf(mineLeads);

  // Média do segmento: só clínicas com leads suficientes nos mesmos dias
  let benchmark: FunnelHealth["benchmark"] = null;
  if (peers.length) {
    const peerLeads = await prisma.lead.findMany({ where: { clientId: { in: peers.map((p) => p.id) }, createdAt: { gte: since } }, select: { clientId: true, stage: true } });
    const perClinic = peers.map((p) => ratesOf(peerLeads.filter((l) => l.clientId === p.id))).filter((r) => r.leads >= MIN_LEADS);
    if (perClinic.length >= 2) {
      const avg = (k: RateKey) => {
        const vals = perClinic.map((r) => r[k]).filter((v): v is number => v !== null);
        return vals.length >= 2 ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
      };
      benchmark = { clinics: perClinic.length, rates: { contato: avg("contato"), agendamento: avg("agendamento"), comparecimento: avg("comparecimento"), fechamento: avg("fechamento"), leadParaVenda: avg("leadParaVenda") } };
    }
  }

  const slowContact = mineLeads.filter((l) => l.stage === "NOVO" && Date.now() - l.createdAt.getTime() > 2 * 3600_000).length;
  const leaks: FunnelHealth["leaks"] = [];
  if (slowContact > 0) {
    leaks.push({ key: "semContato", title: `${slowContact} lead(s) sem resposta há mais de 2 horas`, detail: "Quem não é respondido rápido costuma fechar com outra clínica.", fix: "Ligar a IA de atendimento no modo automático ou cobrar a recepção pela caixa de conversas.", severity: "alta" });
  }
  if (mine.leads >= MIN_LEADS) {
    const FIX: Record<RateKey, string> = {
      contato: "Ligar a resposta automática da IA e as boas-vindas em segundos.",
      agendamento: "Revisar o roteiro da recepção/IA: oferecer 2 horários na primeira resposta e ancorar valor antes do preço.",
      comparecimento: "Conferir se os lembretes de 1 dia e 2 horas antes estão ligados e se pedem confirmação.",
      fechamento: "Ativar o acompanhamento de orçamento (lembrete 2 e 7 dias depois) e treinar a apresentação do plano.",
      leadParaVenda: "Olhar a origem dos leads: canais com muito lead e pouca venda pedem ajuste na campanha ou na oferta.",
    };
    for (const k of ["contato", "agendamento", "comparecimento", "fechamento"] as RateKey[]) {
      const v = mine[k];
      if (v === null) continue;
      const ref = benchmark?.rates[k] ?? null;
      const goal = LOTUS_GOALS[k];
      const belowPeers = ref !== null && v < ref - 5;
      const belowGoal = v < goal;
      if (!belowPeers && !belowGoal) continue;
      const comp = [belowPeers ? `média de ${benchmark!.clinics} clínicas do segmento: ${ref}%` : null, belowGoal ? `meta da LOTUS: ${goal}%` : null].filter(Boolean).join("; ");
      leaks.push({ key: k, title: `${RATE_LABEL[k]}: ${v}%`, detail: `Abaixo do esperado (${comp}).`, fix: FIX[k], severity: belowPeers || v < goal * 0.7 ? "alta" : "media" });
    }
  }
  return { days, segment, mine, benchmark, leaks, slowContact };
}

// Rotina semanal (segunda, a partir das 9h): avisa o Ícaro onde o funil de cada clínica ativa está vazando
export async function runWeeklyOptimization(now = new Date()): Promise<number> {
  const local = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  if (local.getDay() !== 1 || local.getHours() < 9) return 0;
  const clients = await prisma.client.findMany({ where: { status: "ACTIVE", slug: { not: LOTUS_SLUG } }, select: { id: true, name: true } });
  let sent = 0;
  for (const c of clients) {
    const recent = await prisma.appNotification.findFirst({ where: { kind: "otimizacao", clientId: c.id, createdAt: { gte: new Date(now.getTime() - 6 * DAY) } }, select: { id: true } });
    if (recent) continue;
    const h = await funnelHealth(c.id, 30);
    if (h.mine.leads < 5 && !h.slowContact) continue; // sem movimento, nada a dizer
    const name = c.name.split("|")[0].trim();
    const body = h.leaks.length
      ? h.leaks.slice(0, 3).map((l) => `• ${l.title}. ${l.fix}`).join("\n")
      : `Funil saudável nos últimos 30 dias (${h.mine.leads} leads, ${h.mine.leadParaVenda ?? 0}% viraram paciente).`;
    await notify({ kind: "otimizacao", title: h.leaks.length ? `Otimização da semana: ${name} (${h.leaks.length} ponto${h.leaks.length > 1 ? "s" : ""})` : `Otimização da semana: ${name} está bem`, body, href: `/clients/${c.id}?tab=crm`, clientId: c.id });
    sent++;
  }
  return sent;
}
