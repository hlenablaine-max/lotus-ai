// Automações do WhatsApp da clínica. A cada minuto:
// 1) agenda o que precisa sair (lembrete da consulta, avaliação no Google, orçamento parado, retorno, aniversário, indicação);
// 2) manda o que já está na hora, só dentro do horário permitido e com limite por hora (protege o número de bloqueio).
// Tudo começa desligado: cada automação é ligada pelo Ícaro na aba Atendimento > Automações.
import { prisma } from "@/lib/prisma";
import { createRuntimeClient } from "@/lib/runtime-client";
import { fillTemplate, getSettings, normalizePhone, processInboundEvents, referralLink, sendNow, type AutomationSettings } from "@/lib/whatsapp";
import { planWeeklyReports, runAiQueue } from "@/lib/whatsapp-ai-queue";
import { ownerMessageSent, prospectSent } from "@/lib/prospecting";

const TZ = "America/Sao_Paulo";
const HOUR = 3_600_000;
const DAY = 86_400_000;

const firstName = (name: string | null | undefined) => (name ?? "").trim().split(/\s+/)[0] ?? "";
const fmtDate = (d: Date) => new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: TZ }).format(d);
const fmtTime = (d: Date) => new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(d);
const localHour = (d: Date) => Number(new Intl.DateTimeFormat("pt-BR", { hour: "numeric", hour12: false, timeZone: TZ }).format(d)) % 24;
const localMonthDay = (d: Date) => new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" }).format(d);

async function queue(data: { clientId: string; kind: string; refId: string; body: string; phone?: string | null; jid?: string | null; scheduledFor: Date; campaignId?: string }) {
  try {
    await prisma.outboundMessage.create({
      data: { clientId: data.clientId, kind: data.kind, refId: data.refId, body: data.body, phone: data.phone ?? null, jid: data.jid ?? null, scheduledFor: data.scheduledFor, campaignId: data.campaignId ?? null },
    });
    return true;
  } catch {
    return false; // já estava na fila (mesmo tipo e mesmo lead/paciente)
  }
}

async function planClient(clientId: string, clinic: string, s: AutomationSettings) {
  const now = Date.now();
  const base = { clinica: clinic };

  if (s.lembrete.on) {
    const leads = await prisma.lead.findMany({
      where: { clientId, stage: "AGENDADO", appointmentAt: { gte: new Date(now + 30 * 60_000), lte: new Date(now + 26 * HOUR) }, phone: { not: null } },
      select: { id: true, name: true, phone: true, appointmentAt: true, conversationId: true },
    });
    for (const l of leads) {
      const at = l.appointmentAt!;
      const conv = l.conversationId ? await prisma.conversation.findUnique({ where: { id: l.conversationId }, select: { jid: true } }) : null;
      const vars = { ...base, nome: l.name, primeiro_nome: firstName(l.name), data: fmtDate(at), hora: fmtTime(at) };
      if (at.getTime() - now > 6 * HOUR) {
        await queue({ clientId, kind: "lembrete_1d", refId: `${l.id}:${at.toISOString()}`, body: fillTemplate(s.lembrete.texto1d, vars), phone: l.phone, jid: conv?.jid, scheduledFor: new Date(Math.max(now, at.getTime() - 24 * HOUR)) });
      }
      await queue({ clientId, kind: "lembrete_2h", refId: `${l.id}:${at.toISOString()}`, body: fillTemplate(s.lembrete.texto2h, vars), phone: l.phone, jid: conv?.jid, scheduledFor: new Date(Math.max(now, at.getTime() - 2 * HOUR)) });
    }
  }

  if (s.avaliacao.on && s.avaliacao.link.trim()) {
    const leads = await prisma.lead.findMany({
      where: { clientId, stage: { in: ["COMPARECEU", "FECHADO"] }, stageChangedAt: { gte: new Date(now - 3 * DAY) }, phone: { not: null } },
      select: { id: true, name: true, phone: true, stageChangedAt: true, patientId: true, conversationId: true },
    });
    for (const l of leads) {
      const conv = l.conversationId ? await prisma.conversation.findUnique({ where: { id: l.conversationId }, select: { jid: true } }) : null;
      await queue({
        clientId, kind: "avaliacao", refId: l.patientId ?? l.id,
        body: fillTemplate(s.avaliacao.texto, { ...base, nome: l.name, primeiro_nome: firstName(l.name), link_avaliacao: s.avaliacao.link.trim() }),
        phone: l.phone, jid: conv?.jid, scheduledFor: new Date(l.stageChangedAt.getTime() + s.avaliacao.horasDepois * HOUR),
      });
    }
  }

  if (s.orcamento.on) {
    const limit = new Date(now - s.orcamento.diasSemResposta * DAY);
    const leads = await prisma.lead.findMany({
      where: { clientId, quotedValue: { not: null }, stage: { in: ["EM_CONTATO", "AGENDADO", "COMPARECEU"] }, conversationId: { not: null }, stageChangedAt: { lte: limit } },
      select: { id: true, name: true, phone: true, conversationId: true },
    });
    for (const l of leads) {
      const conv = await prisma.conversation.findUnique({ where: { id: l.conversationId! }, select: { jid: true, lastMessageAt: true } });
      if (!conv || conv.lastMessageAt > limit) continue; // conversa ainda andando
      await queue({ clientId, kind: "orcamento", refId: l.id, body: fillTemplate(s.orcamento.texto, { ...base, nome: l.name, primeiro_nome: firstName(l.name) }), phone: l.phone, jid: conv.jid, scheduledFor: new Date() });
    }
  }

  if (s.retorno.on) {
    // Pacientes sem visita há X meses: alguns por dia, para não parecer disparo em massa
    const queuedToday = await prisma.outboundMessage.count({ where: { clientId, kind: "retorno", createdAt: { gte: new Date(now - 20 * HOUR) } } });
    const room = Math.max(0, s.retorno.porDia - queuedToday);
    if (room > 0) {
      const cutoff = new Date(now - s.retorno.meses * 30 * DAY);
      const period = `${new Date().getFullYear()}-${Math.floor(new Date().getMonth() / 6)}`;
      const candidates = await prisma.patient.findMany({
        where: { clientId, optOut: false, phone: { not: null }, lastVisitAt: { lt: cutoff } },
        orderBy: { totalSpent: "desc" },
        take: room * 4,
        select: { id: true, name: true, phone: true },
      });
      let added = 0;
      for (const p of candidates) {
        if (added >= room) break;
        if (await queue({ clientId, kind: "retorno", refId: `${p.id}:${period}`, body: fillTemplate(s.retorno.texto, { ...base, nome: p.name, primeiro_nome: firstName(p.name) }), phone: p.phone, scheduledFor: new Date() })) added += 1;
      }
    }
  }

  if (s.aniversario.on) {
    const today = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: TZ }).format(new Date());
    const withBirthday = await prisma.patient.findMany({ where: { clientId, optOut: false, phone: { not: null }, birthDate: { not: null } }, select: { id: true, name: true, phone: true, birthDate: true } });
    for (const p of withBirthday.filter((x) => localMonthDay(x.birthDate!) === today)) {
      await queue({ clientId, kind: "aniversario", refId: `${p.id}:${new Date().getFullYear()}`, body: fillTemplate(s.aniversario.texto, { ...base, nome: p.name, primeiro_nome: firstName(p.name) }), phone: p.phone, scheduledFor: new Date() });
    }
  }

  if (s.indicacao.on) {
    const from = new Date(now - (s.indicacao.diasDepois + 5) * DAY);
    const to = new Date(now - s.indicacao.diasDepois * DAY);
    const closed = await prisma.lead.findMany({ where: { clientId, stage: "FECHADO", closedAt: { gte: from, lte: to }, patientId: { not: null } }, select: { name: true, patientId: true, phone: true } });
    for (const l of closed) {
      const exists = await prisma.outboundMessage.findUnique({ where: { kind_refId: { kind: "indicacao", refId: l.patientId! } }, select: { id: true } });
      if (exists) continue;
      const link = await referralLink(clientId, l.patientId!).catch(() => null);
      if (!link) continue;
      await queue({ clientId, kind: "indicacao", refId: l.patientId!, body: fillTemplate(s.indicacao.texto, { ...base, nome: l.name, primeiro_nome: firstName(l.name), link_indicacao: link }), phone: l.phone, scheduledFor: new Date() });
    }
  }
}

// Confere, na hora de mandar, se a mensagem ainda faz sentido (consulta desmarcada, paciente pediu para parar)
async function stillValid(job: { kind: string; refId: string | null; clientId: string; phone: string | null }) {
  if (!job.refId) return true;
  if (job.kind.startsWith("lembrete")) {
    const [leadId, at] = job.refId.split(":");
    const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { stage: true, appointmentAt: true } });
    return !!lead && lead.stage === "AGENDADO" && lead.appointmentAt?.toISOString() === job.refId.slice(leadId.length + 1) && !!at;
  }
  if (["retorno", "aniversario", "reativacao", "indicacao"].includes(job.kind)) {
    const patientId = job.kind === "reativacao" ? job.refId.split(":")[1] : job.refId.split(":")[0];
    const p = await prisma.patient.findUnique({ where: { id: patientId }, select: { optOut: true } });
    return !!p && !p.optOut;
  }
  if (job.kind === "orcamento") {
    const lead = await prisma.lead.findUnique({ where: { id: job.refId }, select: { stage: true } });
    return !!lead && !["FECHADO", "PERDIDO"].includes(lead.stage);
  }
  return true;
}

async function sendDue(clientId: string, s: AutomationSettings) {
  const now = new Date();
  const h = localHour(now);
  const urgent = ["boas_vindas", "manual"];
  const inWindow = h >= s.janela.inicio && h < s.janela.fim;
  const sentLastHour = await prisma.outboundMessage.count({ where: { clientId, status: "ENVIADO", sentAt: { gte: new Date(now.getTime() - HOUR) }, kind: { notIn: urgent } } });
  const lastSent = await prisma.outboundMessage.findFirst({ where: { clientId, status: "ENVIADO" }, orderBy: { sentAt: "desc" }, select: { sentAt: true } });
  // Intervalo de 25 a 45 s entre mensagens automáticas, como uma pessoa mandando
  const gap = 25_000 + Math.random() * 20_000;
  const due = await prisma.outboundMessage.findMany({
    where: { clientId, status: "PENDENTE", scheduledFor: { lte: now }, kind: { not: "ia" } },
    orderBy: [{ scheduledFor: "asc" }],
    take: 5,
  });
  let sentThisTick = 0;
  for (const job of due) {
    const isUrgent = urgent.includes(job.kind);
    if (!isUrgent && (!inWindow || sentLastHour + sentThisTick >= s.porHora)) continue;
    if (!isUrgent && lastSent?.sentAt && now.getTime() - lastSent.sentAt.getTime() < gap) continue;
    if (sentThisTick >= (isUrgent ? 3 : 1)) break;
    // Lembrete que perdeu a hora (app fechado) não sai atrasado
    if (job.kind.startsWith("lembrete") && now.getTime() - job.scheduledFor.getTime() > 3 * HOUR) {
      await prisma.outboundMessage.update({ where: { id: job.id }, data: { status: "CANCELADO", error: "Passou da hora do lembrete" } });
      continue;
    }
    if (!(await stillValid(job))) {
      await prisma.outboundMessage.update({ where: { id: job.id }, data: { status: "CANCELADO", error: "Não faz mais sentido (etapa mudou ou paciente pediu para parar)" } });
      continue;
    }
    // Trava para duas rodadas não mandarem a mesma mensagem
    const claimed = await prisma.outboundMessage.updateMany({ where: { id: job.id, status: "PENDENTE" }, data: { status: "ENVIANDO" } });
    if (claimed.count === 0) continue;
    try {
      // A fila não fica parada esperando o escudo: se ele pedir mais de 20 s, a mensagem é reagendada
      await sendNow(clientId, { jid: job.jid, phone: job.phone }, job.body, job.kind === "manual" ? "lotus" : "automacao", 20_000);
      await prisma.outboundMessage.update({ where: { id: job.id }, data: { status: "ENVIADO", sentAt: new Date(), error: null } });
      if (job.kind === "prospeccao" && job.refId) await prospectSent(job.refId, true).catch(() => undefined);
      if (job.kind === "prospeccao_dono" && job.refId) await ownerMessageSent(job.refId).catch(() => undefined);
      sentThisTick += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const shieldWait = msg.match(/Escudo anti-ban:.*Tenta de novo em (\d+) s/);
      if (shieldWait) {
        await prisma.outboundMessage.update({ where: { id: job.id }, data: { status: "PENDENTE", error: msg, scheduledFor: new Date(Date.now() + Number(shieldWait[1]) * 1000) } });
        break;
      }
      const retry = /não está conectado|Abra o aplicativo/.test(msg);
      await prisma.outboundMessage.update({ where: { id: job.id }, data: retry ? { status: "PENDENTE", error: msg } : { status: "FALHOU", error: msg } });
      if (!retry && job.kind === "prospeccao" && job.refId) await prospectSent(job.refId, false, msg).catch(() => undefined);
      if (retry) break;
    }
  }
}

let running = false;
export async function runWhatsappAutomations(): Promise<void> {
  if (running) return;
  running = true;
  try {
    // Mensagens presas em "ENVIANDO" por um reinício voltam para a fila
    await prisma.outboundMessage.updateMany({ where: { status: "ENVIANDO", createdAt: { lt: new Date(Date.now() - 10 * 60_000) } }, data: { status: "PENDENTE" } });
    await planWeeklyReports().catch((err) => console.error("[whatsapp] relatório semanal:", err instanceof Error ? err.message : err));
    const channels = await prisma.whatsappChannel.findMany({ where: { status: "conectado" }, select: { clientId: true, client: { select: { name: true } } } });
    if (channels.length === 0) return;
    const runtime = createRuntimeClient();
    if (!(await runtime.available())) return;
    for (const ch of channels) {
      try {
        const s = await getSettings(ch.clientId);
        await planClient(ch.clientId, ch.client.name, s);
        await sendDue(ch.clientId, s);
      } catch (err) {
        console.error("[whatsapp] automação do cliente falhou:", err instanceof Error ? err.message : err);
      }
    }
  } finally {
    running = false;
  }
}

export function scheduleWhatsappAutomations() {
  const g = globalThis as unknown as { __lotusWaTimer?: NodeJS.Timeout };
  if (g.__lotusWaTimer) return;
  g.__lotusWaTimer = setInterval(() => void runWhatsappAutomations().catch(() => undefined), 60_000);
  // IA atendente: olha a fila a cada 15 s (responder rápido é o que mais converte)
  setInterval(() => void runAiQueue().catch(() => undefined), 15_000);
  // Mensagens que chegaram pelo recebedor na internet (DMs do Instagram pelo ManyChat)
  setInterval(() => void processInboundEvents().catch(() => undefined), 10_000);
}

// Campanha de reativação disparada pelo Ícaro na aba Pacientes: entra na fila e sai aos poucos
export async function createReactivationCampaign(clientId: string, input: { months: number; text: string; limit: number }) {
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { name: true } });
  const cutoff = new Date(Date.now() - input.months * 30 * DAY);
  const patients = await prisma.patient.findMany({
    where: { clientId, optOut: false, phone: { not: null }, OR: [{ lastVisitAt: { lt: cutoff } }, { lastVisitAt: null }] },
    orderBy: { totalSpent: "desc" },
    take: Math.min(Math.max(1, input.limit), 2000),
    select: { id: true, name: true, phone: true },
  });
  const campaignId = `camp_${Date.now().toString(36)}`;
  let queued = 0;
  for (const p of patients) {
    const phone = normalizePhone(p.phone);
    if (!phone) continue;
    if (await queue({ clientId, kind: "reativacao", refId: `${campaignId}:${p.id}`, campaignId, body: fillTemplate(input.text, { clinica: client?.name, nome: p.name, primeiro_nome: firstName(p.name) }), phone, scheduledFor: new Date() })) queued += 1;
  }
  return { campaignId, queued };
}
