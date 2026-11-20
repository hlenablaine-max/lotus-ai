// CRM da própria LOTUS: o funil de vendas da agência (prospecção → call → proposta → fechou) e a carteira de clientes
// (pacote, mensalidade, implantação). É aqui que o Ícaro vê quantas clínicas fechou, quanto entra por mês e
// em que etapa está cada cliente novo.
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notify";

export const PIPELINE = [
  { id: "ABORDADA", label: "Abordadas", statuses: ["NA_FILA", "ENVIADO"] },
  { id: "RESPONDEU", label: "Responderam", statuses: ["RESPONDEU", "CONVERSANDO"] },
  { id: "CALL", label: "Call marcada", statuses: ["CALL_MARCADA"] },
  { id: "PROPOSTA", label: "Proposta enviada", statuses: ["PROPOSTA"] },
  { id: "FECHOU", label: "Fechou", statuses: ["FECHOU"] },
  { id: "PERDIDO", label: "Não fechou", statuses: ["PERDIDO", "SEM_INTERESSE"] },
] as const;

export const ONBOARDING = [
  { id: "KICKOFF", label: "Kickoff (reunião de início)" },
  { id: "ACESSOS", label: "Acessos (WhatsApp, Instagram, ManyChat, anúncios)" },
  { id: "SITE", label: "Site no ar" },
  { id: "CAMPANHAS", label: "Campanhas no ar" },
  { id: "RODANDO", label: "Rodando (resultados chegando)" },
] as const;

const TZ = "America/Sao_Paulo";
function monthStart(): Date {
  const ym = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", timeZone: TZ }).format(new Date());
  return new Date(`${ym}-01T00:00:00-03:00`);
}

export async function agencyOverview() {
  const start = monthStart();
  const [prospects, clients] = await Promise.all([
    prisma.prospect.findMany({
      where: { status: { in: PIPELINE.flatMap((p) => [...p.statuses]) } },
      orderBy: { updatedAt: "desc" },
      take: 400,
      select: { id: true, name: true, status: true, phone: true, ownerContact: true, siteUrl: true, callAt: true, dealPackage: true, dealMonthly: true, dealSetup: true, closedAt: true, sentAt: true, repliedAt: true, lostReason: true, score: true, campaign: true, clientId: true, updatedAt: true },
    }),
    prisma.client.findMany({
      where: { status: { in: ["ACTIVE", "PAUSED", "CHURNED"] }, slug: { not: "lotus-interno" } },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, status: true, package: true, monthlyFee: true, setupFee: true, contractStart: true, onboardingStage: true, churnedAt: true, createdAt: true },
    }),
  ]);
  const all = await prisma.prospect.groupBy({ by: ["status"], _count: { _all: true } });
  const count = (statuses: readonly string[]) => all.filter((g) => statuses.includes(g.status)).reduce((a, g) => a + g._count._all, 0);
  const reached = count(["ENVIADO", "RESPONDEU", "CONVERSANDO", "CALL_MARCADA", "PROPOSTA", "FECHOU", "PERDIDO", "SEM_INTERESSE"]);
  const replied = count(["RESPONDEU", "CONVERSANDO", "CALL_MARCADA", "PROPOSTA", "FECHOU", "PERDIDO"]);
  const calls = count(["CALL_MARCADA", "PROPOSTA", "FECHOU"]);
  const won = count(["FECHOU"]);
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : null);
  const active = clients.filter((c) => c.status === "ACTIVE");
  const mrr = active.reduce((a, c) => a + (c.monthlyFee ?? 0), 0);
  const wonThisMonth = prospects.filter((p) => p.status === "FECHOU" && p.closedAt && p.closedAt >= start);
  const callsUpcoming = prospects.filter((p) => p.status === "CALL_MARCADA" && p.callAt && p.callAt >= new Date()).sort((a, b) => a.callAt!.getTime() - b.callAt!.getTime());
  return {
    kpis: {
      reached,
      replied,
      replyRate: pct(replied, reached),
      calls,
      callRate: pct(calls, replied),
      won,
      closeRate: pct(won, calls),
      wonThisMonth: wonThisMonth.length,
      setupThisMonth: wonThisMonth.reduce((a, p) => a + (p.dealSetup ?? 0), 0),
      activeClients: active.length,
      mrr,
      ticket: active.length ? Math.round(mrr / active.length) : null,
      onboarding: active.filter((c) => c.onboardingStage && c.onboardingStage !== "RODANDO").length,
      churned: clients.filter((c) => c.status === "CHURNED").length,
    },
    pipeline: PIPELINE.map((stage) => ({ id: stage.id, label: stage.label, items: prospects.filter((p) => (stage.statuses as readonly string[]).includes(p.status)).slice(0, 60) })),
    callsUpcoming,
    clients,
  };
}

// Fechou: a clínica vira cliente da LOTUS (aproveita o cadastro do site grátis, se existir)
export async function closeDeal(prospectId: string, deal: { package: string; monthly: number | null; setup: number | null }) {
  const p = await prisma.prospect.findUnique({ where: { id: prospectId } });
  if (!p) throw new Error("Clínica não encontrada");
  const now = new Date();
  let clientId = p.clientId;
  if (!clientId && p.siteMissionId && p.siteMissionId !== "preparando") {
    const m = await prisma.mission.findUnique({ where: { id: p.siteMissionId }, select: { clientId: true } });
    clientId = m?.clientId ?? null;
  }
  const name = p.name.replace(/\s*\((prospecção|TESTE)\)\s*/gi, "").trim();
  const data = { name, status: "ACTIVE" as const, package: deal.package || null, monthlyFee: deal.monthly, setupFee: deal.setup, contractStart: now, onboardingStage: "KICKOFF" };
  if (clientId) {
    await prisma.client.update({ where: { id: clientId }, data });
  } else {
    const slug = `${name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40)}-${now.getTime().toString(36)}`;
    const c = await prisma.client.create({ data: { ...data, slug, instagram: p.instagram ? `@${p.instagram}` : null, website: p.site, segment: p.category } });
    clientId = c.id;
  }
  await prisma.prospect.update({ where: { id: p.id }, data: { status: "FECHOU", dealPackage: deal.package || null, dealMonthly: deal.monthly, dealSetup: deal.setup, closedAt: now, clientId } });
  await notify({ kind: "sistema", title: `Fechou: ${name} 🎉`, body: `${deal.package || "Pacote"}${deal.monthly ? ` · R$ ${deal.monthly.toLocaleString("pt-BR")}/mês` : ""}. O cliente entrou na carteira em "Kickoff".`, href: `/clients/${clientId}` });
  return { clientId };
}
