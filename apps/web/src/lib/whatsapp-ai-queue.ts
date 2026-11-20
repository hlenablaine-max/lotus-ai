// IA atendente na prática + relatório semanal do dono.
// - runAiQueue (a cada 15 s): para cada conversa esperando, a IA decide e responde (ou deixa rascunho), marca
//   consulta/call, passa para humano e avisa o Ícaro.
// - planWeeklyReports (a cada minuto): no dia e hora escolhidos, manda o resumo da semana para o dono da clínica
//   pelo número da LOTUS.
import { prisma } from "@/lib/prisma";
import { decideReply } from "@/lib/ai-attendant";
import { applyLeadUpdate } from "@/lib/lead-update";
import { notify } from "@/lib/notify";
import { LOTUS_SLUG, ensureLotusClient, getSettings, normalizePhone, sendNow, whatsappMetrics, type AutomationSettings } from "@/lib/whatsapp";

const TZ = "America/Sao_Paulo";
const HOUR = 3_600_000;
const DAY = 86_400_000;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const localHour = (d: Date) => Number(new Intl.DateTimeFormat("pt-BR", { hour: "numeric", hour12: false, timeZone: TZ }).format(d)) % 24;
const localWeekday = (d: Date) => WEEKDAYS.indexOf(new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: TZ }).format(d));
const SHIELD_WAIT = /Escudo anti-ban:.*Tenta de novo em (\d+) s/;

let aiRunning = false;
export async function runAiQueue(): Promise<void> {
  if (aiRunning) return;
  aiRunning = true;
  try {
    const due = await prisma.outboundMessage.findMany({ where: { kind: "ia", status: "PENDENTE", scheduledFor: { lte: new Date() } }, orderBy: { scheduledFor: "asc" }, take: 4 });
    for (const job of due) {
      const claimed = await prisma.outboundMessage.updateMany({ where: { id: job.id, status: "PENDENTE" }, data: { status: "ENVIANDO" } });
      if (claimed.count === 0) continue;
      const done = (data: { status: string; error?: string | null; body?: string; sentAt?: Date; scheduledFor?: Date }) => prisma.outboundMessage.update({ where: { id: job.id }, data });
      try {
        const convId = (job.refId ?? "").split(":")[0];
        const conv = await prisma.conversation.findUnique({ where: { id: convId }, include: { client: { select: { slug: true, name: true } } } });
        const settings = await getSettings(job.clientId);
        if (!conv || !settings.ia.on) {
          await done({ status: "CANCELADO", error: "IA desligada" });
          continue;
        }
        if (conv.aiPausedUntil && conv.aiPausedUntil > new Date()) {
          await done({ status: "CANCELADO", error: "Um humano assumiu a conversa" });
          continue;
        }
        if (conv.lastOutboundAt && conv.lastInboundAt && conv.lastOutboundAt > conv.lastInboundAt) {
          await done({ status: "CANCELADO", error: "Já respondida" });
          continue;
        }
        const role = conv.client.slug === LOTUS_SLUG ? "lotus" : "clinica";
        const d = await decideReply(conv.id, { role, settings: settings.ia });
        if (!d || d.acao === "aguardar" || !d.resposta) {
          await done({ status: "CANCELADO", error: d ? `IA decidiu aguardar (${d.motivo ?? ""})` : "IA não respondeu" });
          continue;
        }
        const who = conv.name ?? (conv.phone ? `+${conv.phone}` : "contato");
        // Prospecção: a recepção passou o contato do dono
        if (role === "lotus" && conv.prospectId && d.contatoDono && String(d.contatoDono).trim() && String(d.contatoDono) !== "null") {
          await prisma.prospect.update({ where: { id: conv.prospectId }, data: { ownerContact: String(d.contatoDono).slice(0, 200) } });
          await notify({ kind: "prospect", title: `Contato do responsável: ${who}`, body: String(d.contatoDono).slice(0, 200), href: "/prospeccao", clientId: job.clientId });
        }
        const href = role === "lotus" ? "/prospeccao" : `/clients/${job.clientId}?aba=atendimento`;
        // Modo rascunho: a IA escreve, você aprova com 1 clique na conversa
        if (settings.ia.modo === "rascunho") {
          const action = d.acao === "agendar" && d.horario ? `agendar:${d.horario}` : d.acao === "humano" ? `humano:${d.motivo ?? ""}` : null;
          await prisma.conversation.update({ where: { id: conv.id }, data: { aiDraft: d.resposta, aiDraftAction: action } });
          await done({ status: "CANCELADO", body: d.resposta, error: "Rascunho esperando aprovação" });
          await notify({ kind: "resposta", title: `IA escreveu a resposta para ${who}`, body: d.resposta, href, clientId: job.clientId });
          continue;
        }
        await sendNow(job.clientId, { jid: conv.jid, phone: conv.phone }, d.resposta, "ia", 20_000);
        await done({ status: "ENVIADO", body: d.resposta, sentAt: new Date(), error: null });
        if (d.acao === "agendar" && d.horario) {
          if (conv.leadId) await applyLeadUpdate(conv.leadId, { appointmentAt: d.horario });
          if (conv.prospectId) await prisma.prospect.update({ where: { id: conv.prospectId }, data: { status: "CALL_MARCADA", notes: `Call: ${d.horario}` } });
          const when = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(new Date(d.horario));
          await notify({ kind: "agendou", title: role === "lotus" ? `Call marcada com ${who}` : `IA agendou ${who} na ${conv.client.name}`, body: `Para ${when}.`, href, clientId: job.clientId });
        }
        if (d.acao === "humano") {
          await prisma.conversation.update({ where: { id: conv.id }, data: { aiPausedUntil: new Date(Date.now() + 24 * HOUR) } });
          if (conv.prospectId && /interesse|parar|errad/i.test(d.motivo ?? "")) await prisma.prospect.update({ where: { id: conv.prospectId }, data: { status: "SEM_INTERESSE" } });
          await notify({ kind: "humano", title: `${who} precisa de você`, body: `${d.motivo ? `${d.motivo}. ` : ""}A IA pausou nesta conversa por 24 h.`, href, clientId: job.clientId });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const wait = msg.match(SHIELD_WAIT);
        if (wait) await done({ status: "PENDENTE", error: msg, scheduledFor: new Date(Date.now() + Number(wait[1]) * 1000) });
        else await done({ status: /não está conectado|Abra o aplicativo/.test(msg) ? "PENDENTE" : "FALHOU", error: msg.slice(0, 400) });
      }
    }
  } finally {
    aiRunning = false;
  }
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export async function weeklyReportText(clientId: string): Promise<string> {
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { name: true } });
  const to = new Date();
  const m = await whatsappMetrics(clientId, new Date(to.getTime() - 7 * DAY), to);
  const top = m.bySource
    .slice(0, 3)
    .map((s) => `• ${s.label}: ${s.leads} contato(s), ${s.closed} fechou`)
    .join("\n");
  const lines = [
    `Olá! Aqui é a LOTUS com o resumo da semana da ${client?.name ?? "clínica"} 📊`,
    "",
    `• ${m.arrived} contato(s) novo(s) no WhatsApp (${m.viaLotus} pelas ações da LOTUS)`,
    `• ${m.answered} respondido(s)${m.avgFirstResponseMin !== null ? `, em média em ${m.avgFirstResponseMin < 1 ? "menos de 1 min" : `${Math.round(m.avgFirstResponseMin)} min`}` : ""}`,
    `• ${m.scheduled} agendaram e ${m.closed} fecharam${m.revenue ? `: ${brl(m.revenue)} em tratamentos` : ""}`,
    top ? `\nDe onde vieram:\n${top}` : "",
    m.waitingNow ? `\n${m.waitingNow} conversa(s) ainda esperando resposta. Responder rápido é o que mais fecha.` : "",
    "",
    "Qualquer dúvida, é só responder aqui.",
  ];
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export async function planWeeklyReports(): Promise<void> {
  const lotus = await ensureLotusClient();
  const lotusChannel = await prisma.whatsappChannel.findUnique({ where: { clientId: lotus.id }, select: { status: true } });
  if (lotusChannel?.status !== "conectado") return;
  const now = new Date();
  const wd = localWeekday(now);
  const hour = localHour(now);
  const week = `${now.getUTCFullYear()}-${Math.floor((now.getTime() - Date.UTC(now.getUTCFullYear(), 0, 1)) / (7 * DAY))}`;
  const channels = await prisma.whatsappChannel.findMany({ select: { clientId: true, settings: true } });
  for (const ch of channels) {
    const r = ((ch.settings ?? {}) as { relatorio?: AutomationSettings["relatorio"] }).relatorio;
    const phone = normalizePhone(r?.telefone);
    if (!r?.on || !phone || r.dia !== wd || hour < r.hora) continue;
    const exists = await prisma.outboundMessage.findUnique({ where: { kind_refId: { kind: "relatorio", refId: `${ch.clientId}:${week}` } }, select: { id: true } });
    if (exists) continue;
    const body = await weeklyReportText(ch.clientId);
    await prisma.outboundMessage.create({ data: { clientId: lotus.id, kind: "relatorio", refId: `${ch.clientId}:${week}`, body, phone, scheduledFor: new Date() } }).catch(() => undefined);
  }
}
