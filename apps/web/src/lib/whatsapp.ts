// Atendimento por WhatsApp de cada clínica: recebe as mensagens que o app de PC repassa, monta as conversas,
// descobre de onde o contato veio pela saudação (cada canal tem um texto diferente), cria o lead sozinho,
// mede o tempo de resposta e liga o contato ao paciente da base (para o LTV).
import * as crypto from "crypto";
import type { LeadSource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createRuntimeClient } from "@/lib/runtime-client";
import { defaultAi, type AiSettings } from "@/lib/ai-attendant";
import { notify } from "@/lib/notify";

export interface TrackedLink {
  id: string;
  label: string;
  source: LeadSource;
  campaign?: string | null;
  text: string;
  code?: string | null; // código curto no fim da mensagem (ex.: V3) — identifica o conteúdo mesmo se a pessoa mexer no texto
  keyword?: string | null; // palavra falada no vídeo ("manda SORRISO no WhatsApp") para quem digita sem clicar no link
}

export interface MessageEvent {
  type: "message";
  clientId: string;
  waId: string;
  jid: string;
  phone: string | null;
  name: string | null;
  fromMe: boolean;
  text: string;
  kind: string;
  sentAt: string;
  history: boolean;
  viaApi?: boolean; // saiu pela LOTUS (app, IA, automação), não digitado no celular
  channel?: "whatsapp" | "instagram";
}
export interface StatusEvent {
  type: "status";
  clientId: string;
  state: string;
  phone: string | null;
  name: string | null;
  at: string;
}
export type WaEvent = MessageEvent | StatusEvent;

// Origens que contam como "veio pela LOTUS" quando chegam pelo link rastreado
const LOTUS_SOURCES = new Set<LeadSource>(["META_ADS", "GOOGLE_ADS", "SITE", "INSTAGRAM", "GOOGLE_MAPS", "INDICACAO", "REATIVACAO"]);
// Depois de tanto tempo calado, uma nova mensagem do mesmo contato vira uma nova oportunidade
const NEW_OPPORTUNITY_DAYS = 30;

export const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

// Número brasileiro completo (55 + DDD + número); números de outros países ficam como vieram
export function normalizePhone(raw: string | null | undefined): string | null {
  let d = digits(raw);
  if (!d) return null;
  if (d.startsWith("0")) d = d.replace(/^0+/, "");
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  return d.length >= 10 ? d : null;
}

// Chave para achar o mesmo celular com ou sem o 9º dígito: DDD + últimos 8 números
export function phoneKey(phone: string | null | undefined): string | null {
  const d = normalizePhone(phone);
  if (!d) return null;
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) return d.slice(2, 4) + d.slice(-8);
  return d;
}

export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const firstName = (name: string | null | undefined) => (name ?? "").trim().split(/\s+/)[0] ?? "";

// Saudações padrão: cada canal tem um texto que já vem escrito quando a pessoa clica no link.
// Assim, só de ler a primeira mensagem, a LOTUS sabe se veio do anúncio, do Instagram, do site...
export function defaultLinks(clinicName: string): TrackedLink[] {
  const c = clinicName.trim();
  return [
    { id: "meta", label: "Anúncio no Facebook/Instagram", source: "META_ADS", text: `Olá! Vi o anúncio da ${c} e quero saber mais.` },
    { id: "google", label: "Anúncio no Google", source: "GOOGLE_ADS", text: `Olá! Encontrei a ${c} no Google e gostaria de agendar.` },
    { id: "insta", label: "Instagram (bio, stories, direct)", source: "INSTAGRAM", text: `Oi! Vim pelo Instagram da ${c} e queria mais informações.` },
    { id: "site", label: "Site", source: "SITE", text: `Olá! Vim pelo site da ${c} e quero agendar uma avaliação.` },
    { id: "maps", label: "Google Maps", source: "GOOGLE_MAPS", text: `Olá! Achei a ${c} no Google Maps e gostaria de um horário.` },
    { id: "indicacao", label: "Indicação de paciente", source: "INDICACAO", text: `Olá! Fui indicado(a) por um paciente da ${c}.` },
  ];
}

export function waLink(phone: string, text: string): string {
  return `https://wa.me/${digits(phone)}?text=${encodeURIComponent(text)}`;
}

// Compara a primeira mensagem com cada saudação rastreada. A pessoa às vezes apaga ou muda um pouco o texto,
// então vale a parecença das palavras, não o texto exato.
export function detectSource(text: string, links: TrackedLink[]): { link: TrackedLink; score: number } | null {
  const msg = normalizeText(text);
  if (!msg) return null;
  const msgWords = new Set(msg.split(" "));
  let best: { link: TrackedLink; score: number } | null = null;
  // Código do link (cód. V3) ou palavra-chave do vídeo: vale mais que a parecença do texto
  for (const link of links) {
    const code = normalizeText(link.code ?? "");
    if (code && new RegExp(`(^| )cod ${code}( |$)`).test(msg)) return { link, score: 1 };
  }
  for (const link of links) {
    const kw = normalizeText(link.keyword ?? "");
    if (kw && new RegExp(`(^| )${kw}( |$)`).test(msg)) return { link, score: 0.95 };
  }
  for (const link of links) {
    const words = normalizeText(link.text).split(" ").filter((w) => w.length > 2);
    if (words.length === 0) continue;
    const hit = words.filter((w) => msgWords.has(w)).length / words.length;
    const exact = msg.includes(normalizeText(link.text)) ? 1 : 0;
    const score = Math.max(hit, exact);
    if (!best || score > best.score) best = { link, score };
  }
  return best && best.score >= 0.7 ? best : null;
}

// Código pessoal de indicação escrito na mensagem ("código MARIA27")
const REFERRAL_RE = /c[oó]digo\s*[:#-]?\s*([A-Za-z0-9]{4,12})/i;

export async function getLinks(clientId: string): Promise<TrackedLink[]> {
  const [channel, client] = await Promise.all([
    prisma.whatsappChannel.findUnique({ where: { clientId }, select: { links: true } }),
    prisma.client.findUnique({ where: { id: clientId }, select: { name: true } }),
  ]);
  const saved = Array.isArray(channel?.links) ? (channel!.links as unknown as TrackedLink[]) : null;
  return saved && saved.length ? saved : defaultLinks(client?.name ?? "clínica");
}

async function findPatientByPhone(clientId: string, phone: string | null) {
  const key = phoneKey(phone);
  if (!key) return null;
  const last8 = key.slice(-8);
  const candidates = await prisma.patient.findMany({ where: { clientId, phone: { endsWith: last8 } }, take: 5 });
  return candidates.find((p) => phoneKey(p.phone) === key) ?? null;
}

// Mensagem de reativação/retorno mandada há pouco para este número: a resposta conta como "veio da campanha"
async function recentCampaignTo(clientId: string, phone: string | null) {
  const key = phoneKey(phone);
  if (!key) return null;
  return prisma.outboundMessage.findFirst({
    where: {
      clientId,
      status: "ENVIADO",
      kind: { in: ["reativacao", "retorno", "aniversario"] },
      phone: { endsWith: key.slice(-8) },
      sentAt: { gte: new Date(Date.now() - 21 * 86_400_000) },
    },
    orderBy: { sentAt: "desc" },
  });
}

interface Attribution {
  source: LeadSource;
  sourceBy: string | null;
  linkId: string | null;
  campaign: string | null;
  viaLotus: boolean;
  patientId: string | null;
  referredById: string | null;
}

async function attribute(clientId: string, text: string, phone: string | null, channel = "whatsapp"): Promise<Attribution> {
  const [links, patient, campaign] = await Promise.all([getLinks(clientId), findPatientByPhone(clientId, phone), recentCampaignTo(clientId, phone)]);
  const ref = text.match(REFERRAL_RE)?.[1]?.toUpperCase();
  if (ref) {
    const referrer = await prisma.patient.findFirst({ where: { clientId, referralCode: ref }, select: { id: true } });
    if (referrer) return { source: "INDICACAO", sourceBy: "codigo", linkId: null, campaign: `Indicação ${ref}`, viaLotus: true, patientId: patient?.id ?? null, referredById: referrer.id };
  }
  const hit = detectSource(text, links);
  if (hit) {
    return { source: hit.link.source, sourceBy: "saudacao", linkId: hit.link.id, campaign: hit.link.campaign ?? null, viaLotus: LOTUS_SOURCES.has(hit.link.source), patientId: patient?.id ?? null, referredById: null };
  }
  if (campaign) {
    return { source: "REATIVACAO", sourceBy: "campanha", linkId: null, campaign: campaign.kind === "retorno" ? "Lembrete de retorno" : campaign.kind === "aniversario" ? "Aniversário" : "Reativação da base", viaLotus: true, patientId: patient?.id ?? null, referredById: null };
  }
  if (patient) return { source: "PACIENTE_BASE", sourceBy: "base", linkId: null, campaign: null, viaLotus: false, patientId: patient.id, referredById: null };
  // DM no Instagram sem saudação de link: veio pelo Instagram (orgânico)
  if (channel === "instagram") return { source: "INSTAGRAM", sourceBy: "canal", linkId: null, campaign: null, viaLotus: false, patientId: null, referredById: null };
  return { source: "WHATSAPP", sourceBy: null, linkId: null, campaign: null, viaLotus: false, patientId: null, referredById: null };
}

async function touchChannel(clientId: string, data: { status?: string; phone?: string | null; displayName?: string | null }) {
  const now = new Date();
  await prisma.whatsappChannel.upsert({
    where: { clientId },
    create: { clientId, status: data.status ?? "conectado", phone: data.phone ?? null, displayName: data.displayName ?? null, connectedAt: data.status === "conectado" ? now : null, lastEventAt: now },
    update: {
      lastEventAt: now,
      ...(data.status ? { status: data.status } : {}),
      ...(data.status === "conectado" ? { connectedAt: now } : {}),
      ...(data.phone !== undefined && data.phone !== null ? { phone: data.phone } : {}),
      ...(data.displayName ? { displayName: data.displayName } : {}),
    },
  });
}

async function findConversation(clientId: string, jid: string, phone: string | null) {
  const byJid = await prisma.conversation.findUnique({ where: { clientId_jid: { clientId, jid } } });
  if (byJid) return byJid;
  if (phone) return prisma.conversation.findFirst({ where: { clientId, phone } });
  return null;
}

// Uma mensagem em tempo real (chegou agora ou a clínica acabou de responder)
async function ingestLive(ev: MessageEvent) {
  const clientExists = await prisma.client.findUnique({ where: { id: ev.clientId }, select: { id: true } });
  if (!clientExists) return;
  const dup = await prisma.whatsappMessage.findUnique({ where: { clientId_waId: { clientId: ev.clientId, waId: ev.waId } }, select: { id: true } });
  if (dup) return;
  const sentAt = new Date(ev.sentAt);
  const phone = normalizePhone(ev.phone);
  const direction = ev.fromMe ? "OUT" : "IN";
  let conv = await findConversation(ev.clientId, ev.jid, phone);
  let newOpportunity = false;

  if (!conv) {
    conv = await prisma.conversation.create({
      data: { clientId: ev.clientId, jid: ev.jid, phone, name: ev.fromMe ? null : ev.name, firstMessageAt: sentAt, lastMessageAt: sentAt, channel: ev.channel ?? "whatsapp" },
    });
    newOpportunity = !ev.fromMe;
  } else if (!ev.fromMe) {
    const openLead = conv.leadId ? await prisma.lead.findUnique({ where: { id: conv.leadId }, select: { stage: true } }) : null;
    const quietDays = (sentAt.getTime() - conv.lastMessageAt.getTime()) / 86_400_000;
    const leadOpen = openLead && !["FECHADO", "PERDIDO"].includes(openLead.stage);
    // Conversa que já vinha do histórico do celular só vira lead se a pessoa ficou dias sem falar e voltou
    if (!leadOpen && (quietDays >= NEW_OPPORTUNITY_DAYS || (conv.fromHistory && !conv.leadId && quietDays >= 3))) newOpportunity = true;
  }

  await prisma.whatsappMessage.create({
    data: { conversationId: conv.id, clientId: ev.clientId, waId: ev.waId, direction, body: ev.text, kind: ev.kind, sentBy: ev.fromMe ? "clinica" : "paciente", sentAt },
  });

  const update: Record<string, unknown> = {
    lastMessageAt: sentAt > conv.lastMessageAt ? sentAt : conv.lastMessageAt,
    lastPreview: `${ev.fromMe ? "Você: " : ""}${ev.text}`.slice(0, 160),
  };
  if (!conv.phone && phone) update.phone = phone;
  if (!ev.fromMe && ev.name && !conv.name) update.name = ev.name;

  if (direction === "IN") {
    update.lastInboundAt = sentAt;
    update.unread = { increment: 1 };
    // "PARAR", "sair", "não quero mais": a LOTUS não manda mais mensagens automáticas para essa pessoa
    if (conv.patientId && /^(parar|pare|sair|stop|cancelar mensagens|nao quero mais|descadastrar)\b/.test(normalizeText(ev.text))) {
      await prisma.patient.update({ where: { id: conv.patientId }, data: { optOut: true } }).catch(() => undefined);
    }
  } else {
    update.lastOutboundAt = sentAt;
    update.unread = 0;
  }

  if (newOpportunity) {
    const a = await attribute(ev.clientId, ev.text, phone ?? conv.phone, conv.channel);
    const lead = await prisma.lead.create({
      data: {
        clientId: ev.clientId,
        name: ev.name || conv.name || (phone ? `+${phone}` : "Contato do WhatsApp"),
        phone: phone ?? conv.phone,
        source: a.source,
        campaign: a.campaign,
        viaLotus: a.viaLotus,
        conversationId: conv.id,
        channel: conv.channel,
        patientId: a.patientId,
        createdAt: sentAt,
        notes: a.referredById ? `Indicado pelo paciente ${a.referredById}` : null,
      },
    });
    Object.assign(update, {
      leadId: lead.id,
      source: a.source,
      sourceBy: a.sourceBy,
      linkId: a.linkId,
      campaign: a.campaign,
      patientId: a.patientId,
      fromHistory: false,
      firstMessageAt: sentAt, // começo desta oportunidade: base do tempo de resposta
      firstResponseAt: null,
      firstResponseMin: null,
    });
    await enqueueWelcome(ev.clientId, lead.id, conv.jid, phone, ev.name);
  } else if (direction === "OUT" && !conv.firstResponseAt && conv.leadId && conv.lastInboundAt) {
    // Primeira resposta da clínica depois que o lead chegou: é o tempo de resposta
    const minutes = Math.max(0, (sentAt.getTime() - conv.firstMessageAt.getTime()) / 60_000);
    update.firstResponseAt = sentAt;
    update.firstResponseMin = Math.round(minutes * 10) / 10;
    await prisma.lead.updateMany({
      where: { id: conv.leadId, stage: "NOVO" },
      data: { stage: "EM_CONTATO", firstContactAt: sentAt, stageChangedAt: sentAt },
    });
  }

  await prisma.conversation.update({ where: { id: conv.id }, data: update });
  await afterLiveMessage(ev, conv.id).catch((err) => console.error("[whatsapp] pós-mensagem:", err instanceof Error ? err.message : err));
}

// Histórico que o celular manda ao conectar: entra em lote, sem criar leads (não são contatos novos)
async function ingestHistory(clientId: string, events: MessageEvent[]) {
  const clientExists = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } });
  if (!clientExists) return;
  const byJid = new Map<string, MessageEvent[]>();
  for (const ev of events) byJid.set(ev.jid, [...(byJid.get(ev.jid) ?? []), ev]);
  for (const [jid, list] of byJid) {
    list.sort((a, b) => a.sentAt.localeCompare(b.sentAt));
    const phone = normalizePhone(list.find((e) => e.phone)?.phone ?? null);
    const name = list.find((e) => !e.fromMe && e.name)?.name ?? null;
    const first = new Date(list[0].sentAt);
    const last = new Date(list[list.length - 1].sentAt);
    let conv = await findConversation(clientId, jid, phone);
    if (!conv) {
      const patient = await findPatientByPhone(clientId, phone);
      conv = await prisma.conversation.create({
        data: { clientId, jid, phone, name, fromHistory: true, firstMessageAt: first, lastMessageAt: last, patientId: patient?.id ?? null, source: patient ? "PACIENTE_BASE" : "OUTRO", sourceBy: patient ? "base" : null },
      });
    }
    await prisma.whatsappMessage.createMany({
      data: list.map((e) => ({ conversationId: conv!.id, clientId, waId: e.waId, direction: e.fromMe ? "OUT" : "IN", body: e.text, kind: e.kind, sentBy: e.fromMe ? "clinica" : "paciente", sentAt: new Date(e.sentAt) })),
      skipDuplicates: true,
    });
    const lastIn = [...list].reverse().find((e) => !e.fromMe);
    const lastOut = [...list].reverse().find((e) => e.fromMe);
    const lastEv = list[list.length - 1];
    const newer = last > conv.lastMessageAt;
    await prisma.conversation.update({
      where: { id: conv.id },
      data: {
        ...(first < conv.firstMessageAt && conv.fromHistory ? { firstMessageAt: first } : {}),
        ...(newer ? { lastMessageAt: last, lastPreview: `${lastEv.fromMe ? "Você: " : ""}${lastEv.text}`.slice(0, 160) } : {}),
        ...(lastIn && (!conv.lastInboundAt || new Date(lastIn.sentAt) > conv.lastInboundAt) ? { lastInboundAt: new Date(lastIn.sentAt) } : {}),
        ...(lastOut && (!conv.lastOutboundAt || new Date(lastOut.sentAt) > conv.lastOutboundAt) ? { lastOutboundAt: new Date(lastOut.sentAt) } : {}),
        ...(!conv.name && name ? { name } : {}),
        ...(!conv.phone && phone ? { phone } : {}),
      },
    });
  }
}

export async function ingestEvents(events: WaEvent[]): Promise<{ processed: number }> {
  let processed = 0;
  const history = new Map<string, MessageEvent[]>();
  for (const ev of events) {
    try {
      if (ev.type === "status") {
        const exists = await prisma.client.findUnique({ where: { id: ev.clientId }, select: { id: true } });
        if (exists) await touchChannel(ev.clientId, { status: ev.state === "conectado" ? "conectado" : "desconectado", phone: ev.phone, displayName: ev.name });
      } else if (ev.type === "message") {
        if (ev.history) history.set(ev.clientId, [...(history.get(ev.clientId) ?? []), ev]);
        else await ingestLive(ev);
      }
      processed += 1;
    } catch (err) {
      console.error("[whatsapp] evento não processado:", err instanceof Error ? err.message : err);
      processed += 1; // um evento com defeito não pode travar a fila inteira
    }
  }
  for (const [clientId, list] of history) {
    try {
      await ingestHistory(clientId, list);
    } catch (err) {
      console.error("[whatsapp] histórico não processado:", err instanceof Error ? err.message : err);
    }
  }
  return { processed };
}

// ===== Envio =====

export function fillTemplate(text: string, vars: Record<string, string | null | undefined>): string {
  return text.replace(/\{(\w+)\}/g, (m, key: string) => {
    const v = vars[key];
    return v === undefined || v === null ? "" : String(v);
  }).replace(/\s+([,.!?])/g, "$1").replace(/ {2,}/g, " ").trim();
}

export async function sendNow(clientId: string, to: { jid?: string | null; phone?: string | null }, text: string, sentBy: "lotus" | "automacao" | "ia", maxWaitMs = 120_000) {
  // Instagram (ManyChat): sai pela API oficial, sem passar pelo WhatsApp
  if (to.jid?.startsWith("ig:")) return sendViaInstagram(clientId, to.jid, text, sentBy);
  const runtime = createRuntimeClient();
  if (!(await runtime.available())) throw new Error("Abra o aplicativo LOTUS neste computador para enviar mensagens.");
  const target = to.jid || normalizePhone(to.phone);
  if (!target) throw new Error("Contato sem número.");
  const res = (await runtime.call("/runtime/wa/send", { clientId, to: target, text, maxWaitMs }, maxWaitMs + 45_000)) as { waId: string; jid: string; phone: string | null; sentAt: string };
  const sentAt = new Date(res.sentAt);
  const phone = normalizePhone(res.phone ?? to.phone ?? null);
  let conv = await findConversation(clientId, res.jid, phone);
  if (!conv) conv = await prisma.conversation.create({ data: { clientId, jid: res.jid, phone, firstMessageAt: sentAt, lastMessageAt: sentAt } });
  if (res.waId) {
    await prisma.whatsappMessage.upsert({
      where: { clientId_waId: { clientId, waId: res.waId } },
      create: { conversationId: conv.id, clientId, waId: res.waId, direction: "OUT", body: text, kind: "texto", sentBy, sentAt },
      update: { sentBy },
    });
  }
  const data: Record<string, unknown> = { lastMessageAt: sentAt, lastOutboundAt: sentAt, unread: 0, lastPreview: `Você: ${text}`.slice(0, 160) };
  if (!conv.firstResponseAt && conv.leadId && conv.lastInboundAt) {
    data.firstResponseAt = sentAt;
    data.firstResponseMin = Math.round(((sentAt.getTime() - conv.firstMessageAt.getTime()) / 60_000) * 10) / 10;
    await prisma.lead.updateMany({ where: { id: conv.leadId, stage: "NOVO" }, data: { stage: "EM_CONTATO", firstContactAt: sentAt, stageChangedAt: sentAt } });
  }
  await prisma.conversation.update({ where: { id: conv.id }, data });
  return { conversationId: conv.id, waId: res.waId, sentAt: res.sentAt };
}

// Boas-vindas automáticas assim que o lead chega (responder em segundos é o que mais fecha)
async function enqueueWelcome(clientId: string, leadId: string, jid: string, phone: string | null, name: string | null) {
  const settings = await getSettings(clientId);
  if (!settings.boasVindas.on || !settings.boasVindas.texto.trim()) return;
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { name: true } });
  const body = fillTemplate(settings.boasVindas.texto, { nome: name, primeiro_nome: firstName(name), clinica: client?.name });
  await prisma.outboundMessage.upsert({
    where: { kind_refId: { kind: "boas_vindas", refId: leadId } },
    create: { clientId, jid, phone, body, kind: "boas_vindas", refId: leadId, scheduledFor: new Date(Date.now() + 20_000) },
    update: {},
  });
}

// ===== Automações =====

export interface AutomationSettings {
  janela: { inicio: number; fim: number }; // horário em que a LOTUS pode mandar mensagens
  porHora: number; // limite de mensagens automáticas por hora (protege o número)
  boasVindas: { on: boolean; texto: string };
  lembrete: { on: boolean; texto1d: string; texto2h: string };
  avaliacao: { on: boolean; link: string; texto: string; horasDepois: number };
  orcamento: { on: boolean; texto: string; diasSemResposta: number };
  retorno: { on: boolean; meses: number; texto: string; porDia: number };
  aniversario: { on: boolean; texto: string };
  indicacao: { on: boolean; texto: string; diasDepois: number };
  ia: AiSettings; // IA que atende e agenda sozinha
  relatorio: { on: boolean; telefone: string; dia: number; hora: number }; // resumo semanal no WhatsApp do dono
}

export function defaultSettings(): AutomationSettings {
  return {
    janela: { inicio: 8, fim: 20 },
    porHora: 20,
    boasVindas: { on: false, texto: "Olá, {primeiro_nome}! Aqui é da {clinica}. Recebemos sua mensagem e já vamos te atender. Enquanto isso, me conta: qual tratamento você procura?" },
    lembrete: {
      on: false,
      texto1d: "Oi, {primeiro_nome}! Passando para lembrar da sua consulta na {clinica} amanhã, {data} às {hora}. Pode confirmar respondendo SIM?",
      texto2h: "{primeiro_nome}, sua consulta na {clinica} é hoje às {hora}. Estamos te esperando!",
    },
    avaliacao: { on: false, link: "", texto: "{primeiro_nome}, obrigado por vir à {clinica}! Se puder, deixe sua avaliação no Google, ajuda muito: {link_avaliacao}", horasDepois: 3 },
    orcamento: { on: false, texto: "Oi, {primeiro_nome}! Ficou alguma dúvida sobre o orçamento? Se quiser, consigo reservar um horário para você esta semana.", diasSemResposta: 2 },
    retorno: { on: false, meses: 6, texto: "Oi, {primeiro_nome}! Já faz um tempinho desde sua última visita à {clinica}. Que tal agendar seu retorno? Temos horários nesta semana.", porDia: 25 },
    aniversario: { on: false, texto: "Feliz aniversário, {primeiro_nome}! A {clinica} preparou um presente para você este mês. Quer saber qual é?" },
    indicacao: { on: false, texto: "{primeiro_nome}, que bom ter você com a gente! Se indicar um amigo, ele só precisa mandar mensagem por este link: {link_indicacao}", diasDepois: 7 },
    ia: defaultAi(),
    relatorio: { on: false, telefone: "", dia: 1, hora: 9 },
  };
}

export async function getSettings(clientId: string): Promise<AutomationSettings> {
  const ch = await prisma.whatsappChannel.findUnique({ where: { clientId }, select: { settings: true } });
  const saved = (ch?.settings ?? {}) as Partial<AutomationSettings>;
  const def = defaultSettings();
  const out = { ...def } as AutomationSettings;
  for (const k of Object.keys(def) as Array<keyof AutomationSettings>) {
    const v = saved[k];
    if (v && typeof v === "object" && typeof def[k] === "object") (out as unknown as Record<string, unknown>)[k] = { ...(def[k] as object), ...(v as object) };
    else if (v !== undefined) (out as unknown as Record<string, unknown>)[k] = v;
  }
  return out;
}

// Código pessoal de indicação do paciente (ex.: MARIA27)
export async function ensureReferralCode(patientId: string): Promise<string> {
  const p = await prisma.patient.findUnique({ where: { id: patientId }, select: { id: true, name: true, clientId: true, referralCode: true } });
  if (!p) throw new Error("Paciente não encontrado");
  if (p.referralCode) return p.referralCode;
  const base = normalizeText(firstName(p.name)).replace(/ /g, "").toUpperCase().slice(0, 8) || "AMIGO";
  for (let i = 0; i < 20; i++) {
    const code = `${base}${Math.floor(10 + Math.random() * 90)}`;
    const taken = await prisma.patient.findFirst({ where: { clientId: p.clientId, referralCode: code }, select: { id: true } });
    if (!taken) {
      await prisma.patient.update({ where: { id: p.id }, data: { referralCode: code } });
      return code;
    }
  }
  throw new Error("Não foi possível criar o código");
}

export async function referralLink(clientId: string, patientId: string): Promise<string | null> {
  const ch = await prisma.whatsappChannel.findUnique({ where: { clientId }, select: { phone: true } });
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { name: true } });
  if (!ch?.phone) return null;
  const code = await ensureReferralCode(patientId);
  return waLink(ch.phone, `Olá! Fui indicado(a) por um paciente da ${client?.name ?? "clínica"} (código ${code}).`);
}

// Quando um lead fecha: entra (ou atualiza) na base de pacientes com a compra, para o LTV
export async function recordClosing(leadId: string): Promise<void> {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead || lead.stage !== "FECHADO") return;
  const already = await prisma.purchase.findFirst({ where: { leadId: lead.id }, select: { id: true } });
  if (already) {
    if (lead.value !== null) {
      const p = await prisma.purchase.findUnique({ where: { id: already.id } });
      if (p && p.value !== lead.value) {
        await prisma.purchase.update({ where: { id: p.id }, data: { value: lead.value } });
        await prisma.patient.update({ where: { id: p.patientId }, data: { totalSpent: { increment: lead.value - p.value } } });
      }
    }
    return;
  }
  let patientId = lead.patientId;
  if (!patientId) {
    const found = await findPatientByPhone(lead.clientId, lead.phone);
    if (found) patientId = found.id;
  }
  const when = lead.closedAt ?? new Date();
  if (!patientId) {
    const created = await prisma.patient.create({
      data: { clientId: lead.clientId, name: lead.name, phone: normalizePhone(lead.phone), email: lead.email, firstVisitAt: when, origin: lead.viaLotus ? "lotus" : "base", source: lead.source },
    });
    patientId = created.id;
  }
  await prisma.purchase.create({ data: { clientId: lead.clientId, patientId, date: when, value: lead.value ?? 0, procedure: lead.interest, leadId: lead.id } });
  const patient = await prisma.patient.findUnique({ where: { id: patientId } });
  await prisma.patient.update({
    where: { id: patientId },
    data: {
      totalSpent: { increment: lead.value ?? 0 },
      visits: { increment: 1 },
      lastVisitAt: when,
      lastProcedure: lead.interest ?? patient?.lastProcedure ?? null,
      ...(patient?.firstVisitAt ? {} : { firstVisitAt: when }),
    },
  });
  await prisma.lead.update({ where: { id: lead.id }, data: { patientId } });
  if (lead.conversationId) await prisma.conversation.update({ where: { id: lead.conversationId }, data: { patientId } }).catch(() => undefined);
}

// ===== Métricas de atendimento =====

const SOURCE_LABEL: Record<string, string> = {
  META_ADS: "Anúncio Facebook/Instagram",
  GOOGLE_ADS: "Anúncio Google",
  SITE: "Site",
  INSTAGRAM: "Instagram orgânico",
  WHATSAPP: "WhatsApp direto (sem saudação)",
  INDICACAO: "Indicação",
  REATIVACAO: "Reativação da base",
  GOOGLE_MAPS: "Google Maps",
  PACIENTE_BASE: "Paciente antigo que voltou",
  OUTRO: "Outro",
};
export const sourceLabel = (s: string) => SOURCE_LABEL[s] ?? s;

export async function whatsappMetrics(clientId: string, from: Date, to: Date, channel?: string | null) {
  const leads = await prisma.lead.findMany({
    where: { clientId, conversationId: { not: null }, createdAt: { gte: from, lt: to }, ...(channel ? { channel } : {}) },
    select: { id: true, source: true, stage: true, value: true, viaLotus: true, createdAt: true, conversationId: true, campaign: true, channel: true },
  });
  const convIds = leads.map((l) => l.conversationId!).filter(Boolean);
  const convs = convIds.length
    ? await prisma.conversation.findMany({ where: { id: { in: convIds } }, select: { id: true, firstResponseAt: true, firstResponseMin: true } })
    : [];
  const convById = new Map(convs.map((c) => [c.id, c]));
  const waiting = await prisma.conversation.findMany({
    where: { clientId, fromHistory: false, lastInboundAt: { not: null } },
    select: { id: true, lastInboundAt: true, lastOutboundAt: true },
  });
  const now = Date.now();
  const unanswered = waiting.filter((c) => !c.lastOutboundAt || c.lastOutboundAt < c.lastInboundAt!);
  const [inCount, outCount, autoCount] = await Promise.all([
    prisma.whatsappMessage.count({ where: { clientId, direction: "IN", sentAt: { gte: from, lt: to } } }),
    prisma.whatsappMessage.count({ where: { clientId, direction: "OUT", sentAt: { gte: from, lt: to } } }),
    prisma.whatsappMessage.count({ where: { clientId, direction: "OUT", sentBy: "automacao", sentAt: { gte: from, lt: to } } }),
  ]);

  const answered = leads.filter((l) => convById.get(l.conversationId!)?.firstResponseAt);
  const times = answered.map((l) => convById.get(l.conversationId!)!.firstResponseMin ?? 0).sort((a, b) => a - b);
  const scheduled = leads.filter((l) => ["AGENDADO", "COMPARECEU", "FECHADO"].includes(l.stage));
  const closed = leads.filter((l) => l.stage === "FECHADO");
  const lost = leads.filter((l) => l.stage === "PERDIDO");
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : null);

  const bySourceMap = new Map<string, { source: string; label: string; leads: number; answered: number; scheduled: number; closed: number; revenue: number }>();
  for (const l of leads) {
    const row = bySourceMap.get(l.source) ?? { source: l.source, label: sourceLabel(l.source), leads: 0, answered: 0, scheduled: 0, closed: 0, revenue: 0 };
    row.leads += 1;
    if (convById.get(l.conversationId!)?.firstResponseAt) row.answered += 1;
    if (["AGENDADO", "COMPARECEU", "FECHADO"].includes(l.stage)) row.scheduled += 1;
    if (l.stage === "FECHADO") {
      row.closed += 1;
      row.revenue += l.value ?? 0;
    }
    bySourceMap.set(l.source, row);
  }
  const byCampaign = new Map<string, { campaign: string; leads: number; closed: number; revenue: number }>();
  for (const l of leads.filter((x) => x.campaign)) {
    const row = byCampaign.get(l.campaign!) ?? { campaign: l.campaign!, leads: 0, closed: 0, revenue: 0 };
    row.leads += 1;
    if (l.stage === "FECHADO") {
      row.closed += 1;
      row.revenue += l.value ?? 0;
    }
    byCampaign.set(l.campaign!, row);
  }

  // Quando os leads chegam e quantos são respondidos em até 5 minutos, por hora do dia (onde a clínica perde lead)
  const byHour = Array.from({ length: 24 }, (_, h) => ({ hour: h, leads: 0, fast: 0 }));
  for (const l of leads) {
    const h = Number(new Intl.DateTimeFormat("pt-BR", { hour: "numeric", hour12: false, timeZone: "America/Sao_Paulo" }).format(l.createdAt)) % 24;
    byHour[h].leads += 1;
    const c = convById.get(l.conversationId!);
    if (c?.firstResponseMin !== null && c?.firstResponseMin !== undefined && c.firstResponseMin <= 5) byHour[h].fast += 1;
  }

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    arrived: leads.length,
    viaLotus: leads.filter((l) => l.viaLotus).length,
    answered: answered.length,
    answeredRate: pct(answered.length, leads.length),
    answeredIn5: times.filter((t) => t <= 5).length,
    avgFirstResponseMin: times.length ? Math.round((times.reduce((a, b) => a + b, 0) / times.length) * 10) / 10 : null,
    medianFirstResponseMin: times.length ? times[Math.floor(times.length / 2)] : null,
    scheduled: scheduled.length,
    closed: closed.length,
    lost: lost.length,
    open: leads.length - closed.length - lost.length,
    revenue: closed.reduce((a, l) => a + (l.value ?? 0), 0),
    closeRate: pct(closed.length, leads.length),
    waitingNow: unanswered.length,
    waitingOver1h: unanswered.filter((c) => now - c.lastInboundAt!.getTime() > 3_600_000).length,
    messagesIn: inCount,
    messagesOut: outCount,
    messagesAuto: autoCount,
    bySource: [...bySourceMap.values()].sort((a, b) => b.leads - a.leads),
    // WhatsApp e Instagram separados, para não misturar
    byChannel: ["whatsapp", "instagram"].map((ch) => {
      const list = leads.filter((l) => l.channel === ch);
      const won = list.filter((l) => l.stage === "FECHADO");
      return { channel: ch, leads: list.length, answered: list.filter((l) => convById.get(l.conversationId!)?.firstResponseAt).length, scheduled: list.filter((l) => ["AGENDADO", "COMPARECEU", "FECHADO"].includes(l.stage)).length, closed: won.length, revenue: won.reduce((a, l) => a + (l.value ?? 0), 0) };
    }),
    byCampaign: [...byCampaign.values()].sort((a, b) => b.leads - a.leads),
    byHour,
  };
}

// ===== Base de pacientes e LTV =====

export async function patientStats(clientId: string) {
  const patients = await prisma.patient.findMany({
    where: { clientId },
    select: { id: true, name: true, phone: true, totalSpent: true, visits: true, lastVisitAt: true, origin: true, source: true, lastProcedure: true, referralCode: true, referredById: true },
  });
  const now = Date.now();
  const sixMonths = 182 * 86_400_000;
  const buyers = patients.filter((p) => p.totalSpent > 0 || p.visits > 0);
  const repeat = patients.filter((p) => p.visits >= 2);
  const revenue = patients.reduce((a, p) => a + p.totalSpent, 0);
  const visits = patients.reduce((a, p) => a + p.visits, 0);
  const active = patients.filter((p) => p.lastVisitAt && now - p.lastVisitAt.getTime() <= sixMonths);
  const inactive = patients.filter((p) => !p.lastVisitAt || now - p.lastVisitAt.getTime() > sixMonths);
  const withPhone = inactive.filter((p) => p.phone);
  const ltv = buyers.length ? revenue / buyers.length : null;
  const byOrigin = (o: string) => {
    const list = patients.filter((p) => p.origin === o);
    const r = list.reduce((a, p) => a + p.totalSpent, 0);
    return { patients: list.length, revenue: r, ltv: list.length ? r / list.length : null };
  };
  const referrers = new Map<string, number>();
  for (const p of patients) if (p.referredById) referrers.set(p.referredById, (referrers.get(p.referredById) ?? 0) + 1);
  const byId = new Map(patients.map((p) => [p.id, p]));
  return {
    total: patients.length,
    buyers: buyers.length,
    repeatBuyers: repeat.length,
    repeatRate: buyers.length ? Math.round((repeat.length / buyers.length) * 1000) / 10 : null,
    revenue,
    ltv: ltv === null ? null : Math.round(ltv),
    ticket: visits ? Math.round(revenue / visits) : null,
    avgVisits: buyers.length ? Math.round((visits / buyers.length) * 10) / 10 : null,
    active: active.length,
    inactive: inactive.length,
    inactiveReachable: withPhone.length,
    // Dinheiro parado: quanto a base inativa gastaria se 1 em cada 10 voltasse com o ticket médio
    reactivationPotential: visits ? Math.round(withPhone.length * 0.1 * (revenue / visits)) : null,
    base: byOrigin("base"),
    lotus: byOrigin("lotus"),
    top: [...patients].sort((a, b) => b.totalSpent - a.totalSpent).slice(0, 10).map((p) => ({ id: p.id, name: p.name, totalSpent: p.totalSpent, visits: p.visits, lastVisitAt: p.lastVisitAt, origin: p.origin })),
    topReferrers: [...referrers.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, count]) => ({ id, name: byId.get(id)?.name ?? "—", count })),
  };
}

// ===== Depois de cada mensagem ao vivo: IA atendente, pausa quando humano assume, prospect respondeu =====

export const LOTUS_SLUG = "lotus-interno";

// Cliente interno da LOTUS: o WhatsApp do Ícaro (prospecção, avisos de diagnóstico, relatórios para os donos)
export async function ensureLotusClient(): Promise<{ id: string; name: string }> {
  const found = await prisma.client.findUnique({ where: { slug: LOTUS_SLUG }, select: { id: true, name: true } });
  if (found) return found;
  return prisma.client.create({ data: { name: "LOTUS (interno)", slug: LOTUS_SLUG, segment: "Agência de marketing para clínicas", description: "Número da própria LOTUS: prospecção, avisos e relatórios." }, select: { id: true, name: true } });
}

async function afterLiveMessage(ev: MessageEvent, conversationId: string) {
  const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conv) return;
  const now = Date.now();
  const settings = await getSettings(ev.clientId);

  if (ev.fromMe) {
    // Alguém da clínica respondeu pelo celular: a IA sai da conversa por um tempo
    if (!ev.viaApi && settings.ia.on) {
      await prisma.conversation.update({ where: { id: conv.id }, data: { aiPausedUntil: new Date(now + settings.ia.pausaHumanoHoras * 3_600_000), aiDraft: null } });
      await prisma.outboundMessage.updateMany({ where: { clientId: ev.clientId, kind: "ia", status: "PENDENTE", refId: { startsWith: `${conv.id}:` } }, data: { status: "CANCELADO", error: "Um humano assumiu a conversa" } });
    }
    return;
  }

  // Clínica prospectada respondeu
  const client = await prisma.client.findUnique({ where: { id: ev.clientId }, select: { slug: true, name: true } });
  let isProspect = !!conv.prospectId;
  if (client?.slug === LOTUS_SLUG) {
    const key = phoneKey(conv.phone);
    const prospect = conv.prospectId
      ? await prisma.prospect.findUnique({ where: { id: conv.prospectId } })
      : key
        ? (await prisma.prospect.findMany({ where: { phone: { endsWith: key.slice(-8) }, status: { in: ["ENVIADO", "RESPONDEU", "CONVERSANDO"] } }, take: 3 })).find((p) => phoneKey(p.phone) === key) ?? null
        : null;
    if (prospect) {
      isProspect = true;
      if (!conv.prospectId) await prisma.conversation.update({ where: { id: conv.id }, data: { prospectId: prospect.id } });
      const first = prospect.status === "ENVIADO";
      await prisma.prospect.update({ where: { id: prospect.id }, data: { status: first ? "RESPONDEU" : prospect.status === "RESPONDEU" ? "CONVERSANDO" : prospect.status, repliedAt: prospect.repliedAt ?? new Date() } });
      if (first) await notify({ kind: "prospect", title: `${prospect.name} respondeu`, body: ev.text.slice(0, 200), href: `/prospeccao?p=${prospect.id}`, clientId: ev.clientId });
    }
  }

  // IA atendente: espera uns segundos para juntar as mensagens que a pessoa manda em sequência
  if (!settings.ia.on) return;
  // No número da LOTUS a IA só conversa com clínicas da prospecção (nunca conversa pessoal nem teste de atendimento)
  if (client?.slug === LOTUS_SLUG && !isProspect) return;
  if (conv.aiPausedUntil && conv.aiPausedUntil.getTime() > now) return;
  if (conv.fromHistory && !conv.leadId && !conv.prospectId) return;
  await prisma.outboundMessage.updateMany({ where: { clientId: ev.clientId, kind: "ia", status: "PENDENTE", refId: { startsWith: `${conv.id}:` } }, data: { status: "CANCELADO", error: "Chegou mensagem nova: a IA responde tudo junto" } });
  await prisma.outboundMessage.create({
    data: { clientId: ev.clientId, kind: "ia", refId: `${conv.id}:${ev.waId}`, jid: conv.jid, phone: conv.phone, body: "(a IA escreve na hora de enviar)", scheduledFor: new Date(now + 15_000 + Math.random() * 15_000) },
  }).catch(() => undefined);
}

// ===== Instagram (ManyChat) =====

// Manda a resposta pelo ManyChat e registra na conversa (mesmo jeito do WhatsApp)
async function sendViaInstagram(clientId: string, jid: string, text: string, sentBy: string) {
  const { sendInstagram } = await import("@/lib/manychat");
  await sendInstagram(clientId, jid.slice(3), text);
  const sentAt = new Date();
  const conv = await prisma.conversation.findUnique({ where: { clientId_jid: { clientId, jid } } });
  if (!conv) throw new Error("Conversa do Instagram não encontrada");
  const waId = `ig-out-${sentAt.getTime()}-${Math.random().toString(36).slice(2, 8)}`;
  await prisma.whatsappMessage.create({ data: { conversationId: conv.id, clientId, waId, direction: "OUT", body: text, kind: "texto", sentBy, sentAt } });
  const data: Record<string, unknown> = { lastMessageAt: sentAt, lastOutboundAt: sentAt, unread: 0, lastPreview: `Você: ${text}`.slice(0, 160) };
  if (!conv.firstResponseAt && conv.leadId && conv.lastInboundAt) {
    data.firstResponseAt = sentAt;
    data.firstResponseMin = Math.round(((sentAt.getTime() - conv.firstMessageAt.getTime()) / 60_000) * 10) / 10;
    await prisma.lead.updateMany({ where: { id: conv.leadId, stage: "NOVO" }, data: { stage: "EM_CONTATO", firstContactAt: sentAt, stageChangedAt: sentAt } });
  }
  await prisma.conversation.update({ where: { id: conv.id }, data });
  return { conversationId: conv.id, waId, sentAt: sentAt.toISOString() };
}

// DM que o ManyChat repassou: vira conversa no Atendimento com o canal "instagram"
export async function ingestManychat(token: string, body: Record<string, unknown>): Promise<{ ok: boolean; reason?: string }> {
  const acc = await prisma.manychatAccount.findUnique({ where: { inboundToken: token } });
  if (!acc) return { ok: false, reason: "token inválido" };
  const { parseManychatPayload } = await import("@/lib/manychat");
  const p = parseManychatPayload(body);
  if (!p.id || !p.text) return { ok: false, reason: "sem contato ou sem texto" };
  const now = new Date();
  // O ManyChat não manda o id da mensagem: o mesmo texto do mesmo contato em 2 minutos conta uma vez só
  const repeated = await prisma.whatsappMessage.findFirst({
    where: { clientId: acc.clientId, direction: "IN", body: p.text, sentAt: { gte: new Date(now.getTime() - 120_000) }, conversation: { jid: `ig:${p.id}` } },
    select: { id: true },
  });
  if (repeated) return { ok: true, reason: "repetida" };
  const waId = `ig-in-${p.id}-${crypto.createHash("sha1").update(`${p.text}|${Math.floor(now.getTime() / 60_000)}`).digest("hex").slice(0, 16)}`;
  await ingestLive({ type: "message", clientId: acc.clientId, waId, jid: `ig:${p.id}`, phone: p.phone, name: p.name, fromMe: false, text: p.text, kind: "texto", sentAt: now.toISOString(), history: false, channel: "instagram" });
  await prisma.manychatAccount.update({ where: { id: acc.id }, data: { lastEventAt: now } });
  return { ok: true };
}

// O que chegou pelo recebedor na internet (Vercel) enquanto o app estava fechado ou ocupado: vira conversa aqui
let inboundRunning = false;
export async function processInboundEvents(): Promise<number> {
  if (inboundRunning) return 0;
  inboundRunning = true;
  let done = 0;
  try {
    const events = await prisma.inboundEvent.findMany({ where: { processedAt: null }, orderBy: { createdAt: "asc" }, take: 50 });
    for (const ev of events) {
      let error: string | null = null;
      try {
        if (ev.source === "manychat") {
          const r = await ingestManychat(ev.token, (ev.payload ?? {}) as Record<string, unknown>);
          if (!r.ok) error = r.reason ?? "não processada";
        } else error = "origem desconhecida";
      } catch (err) {
        error = err instanceof Error ? err.message.slice(0, 300) : String(err);
      }
      await prisma.inboundEvent.update({ where: { id: ev.id }, data: { processedAt: new Date(), error } });
      done += 1;
    }
  } finally {
    inboundRunning = false;
  }
  return done;
}
