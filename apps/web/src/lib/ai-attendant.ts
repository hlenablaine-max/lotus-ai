// IA atendente do WhatsApp: responde o lead como a melhor recepcionista da clínica, tira dúvidas com o que
// a clínica ensinou (serviços, preços permitidos, endereço, convênios), oferece horários livres da agenda,
// marca a consulta e passa para um humano quando precisa. Para a LOTUS (número interno), faz o papel de
// SDR: conversa com a clínica prospectada e tenta marcar uma call com o Ícaro.
import { registry } from "@lotus/ai-engine";
import { prisma } from "@/lib/prisma";

const TZ = "America/Sao_Paulo";

export interface AiSettings {
  on: boolean;
  modo: "automatico" | "rascunho"; // rascunho: a IA escreve e você aprova antes de sair
  conhecimento: string; // o que a IA pode dizer: serviços, valores permitidos, endereço, convênios, diferenciais
  agenda: { dias: number[]; inicio: string; fim: string; duracaoMin: number; almoco: string };
  pausaHumanoHoras: number; // quando alguém da clínica responde, a IA fica quieta nessa conversa por X horas
}

export function defaultAi(): AiSettings {
  return {
    on: false,
    modo: "rascunho",
    conhecimento: "",
    agenda: { dias: [1, 2, 3, 4, 5], inicio: "08:00", fim: "18:00", duracaoMin: 60, almoco: "12:00-13:00" },
    pausaHumanoHoras: 12,
  };
}

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map((x) => Number(x));
  return (h || 0) * 60 + (m || 0);
};
const fmtSlot = (d: Date) =>
  new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(d);

// Data no fuso de Brasília -> Date (UTC)
function brDate(y: number, mo: number, d: number, minutes: number): Date {
  return new Date(Date.UTC(y, mo, d, Math.floor(minutes / 60) + 3, minutes % 60));
}

// Próximos horários livres (até `max`), de amanhã em diante, sem chocar com consultas já marcadas
export async function freeSlots(clientId: string, ag: AiSettings["agenda"], max = 10): Promise<Date[]> {
  const now = new Date();
  const until = new Date(now.getTime() + 8 * 86_400_000);
  const taken = await prisma.lead.findMany({ where: { clientId, appointmentAt: { gte: now, lte: until }, stage: { in: ["AGENDADO", "COMPARECEU"] } }, select: { appointmentAt: true } });
  const busy = taken.map((t) => t.appointmentAt!.getTime());
  const [lunchA, lunchB] = (ag.almoco || "").split("-").map((x) => (x ? toMin(x.trim()) : -1));
  const out: Date[] = [];
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now).split("-").map(Number);
  for (let day = 1; day <= 8 && out.length < max; day++) {
    const base = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + day, 12));
    const wd = base.getUTCDay();
    if (!ag.dias.includes(wd)) continue;
    for (let m = toMin(ag.inicio); m + ag.duracaoMin <= toMin(ag.fim) && out.length < max; m += ag.duracaoMin) {
      if (lunchA >= 0 && m < lunchB && m + ag.duracaoMin > lunchA) continue;
      const slot = brDate(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), m);
      if (busy.some((b) => Math.abs(b - slot.getTime()) < ag.duracaoMin * 60_000)) continue;
      out.push(slot);
    }
  }
  // Espalha as opções: 2 por dia no máximo, para a pessoa ter escolha real
  const perDay = new Map<string, number>();
  return out.filter((s) => {
    const k = s.toISOString().slice(0, 10);
    perDay.set(k, (perDay.get(k) ?? 0) + 1);
    return (perDay.get(k) ?? 0) <= 3;
  });
}

export interface AiDecision {
  acao: "responder" | "agendar" | "humano" | "aguardar";
  resposta: string;
  horario?: string | null; // ISO do horário escolhido pela pessoa (quando acao = agendar)
  motivo?: string;
  contatoDono?: string | null; // prospecção: nome/telefone do responsável conseguido na conversa
}

// Decide e escreve a próxima mensagem da conversa
export async function decideReply(conversationId: string, opts: { role: "clinica" | "lotus"; settings: AiSettings }): Promise<AiDecision | null> {
  const conv = await prisma.conversation.findUnique({ where: { id: conversationId }, include: { client: { select: { id: true, name: true, segment: true, description: true } } } });
  if (!conv) return null;
  const prospect = conv.prospectId ? await prisma.prospect.findUnique({ where: { id: conv.prospectId } }) : null;
  // Privacidade: a IA só lê a conversa a partir do começo do assunto (mensagem de prospecção ou chegada do lead),
  // nunca o histórico pessoal anterior do número
  const since = prospect ? new Date((prospect.sentAt ?? prospect.createdAt).getTime() - 60_000) : conv.leadId ? new Date(conv.firstMessageAt.getTime() - 60_000) : new Date(Date.now() - 2 * 86_400_000);
  const last8 = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "").slice(-8);
  const isOwner = !!prospect?.ownerPhone && !!conv.phone && last8(prospect.ownerPhone) === last8(conv.phone);
  const msgs = await prisma.whatsappMessage.findMany({ where: { conversationId, sentAt: { gte: since } }, orderBy: { sentAt: "desc" }, take: 30 });
  if (!msgs.length) return null;
  const lead = conv.leadId ? await prisma.lead.findUnique({ where: { id: conv.leadId } }) : null;
  const fmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: TZ });
  const transcript = msgs
    .reverse()
    .map((m) => `[${fmt.format(m.sentAt)}] ${m.direction === "IN" ? "CONTATO" : opts.role === "lotus" ? "LOTUS" : "CLÍNICA"}: ${m.body}`)
    .join("\n")
    .slice(-8000);
  const slots = opts.role === "clinica" ? await freeSlots(conv.clientId, opts.settings.agenda) : await freeSlots(conv.clientId, opts.settings.agenda, 8);
  const slotLines = slots.map((s) => `- ${fmtSlot(s)} => ${s.toISOString()}`).join("\n");

  const system =
    opts.role === "clinica"
      ? `Você é a recepcionista da ${conv.client.name}${conv.client.segment ? ` (${conv.client.segment})` : ""}, atendendo pelo WhatsApp. Objetivo: tirar a dúvida e MARCAR a avaliação/consulta, com simpatia e sem pressão.
Regras:
- Português do Brasil, mensagens curtas de WhatsApp (1 a 3 frases), no máximo 1 emoji.
- Use SOMENTE o que está em "O que a clínica ensinou". Nunca invente preço, promoção, convênio, endereço, diagnóstico ou promessa de resultado. Se não souber, diga que vai confirmar com a equipe e ofereça a avaliação.
- Para agendar, ofereça 2 opções dos HORÁRIOS LIVRES (use exatamente esses). Quando a pessoa escolher um, confirme o dia e a hora e use acao "agendar" com o ISO do horário.
- Passe para um humano (acao "humano") se: pedir para falar com alguém, reclamar, falar de dor forte/urgência, assunto que você não sabe, ou negociação de valor. Na resposta, avise com gentileza que a equipe já vai responder.
- Se a última mensagem for só "ok", "obrigado", figurinha ou não pedir nada, use acao "aguardar" e resposta vazia.`
      : `Você é o Ícaro, fundador da LOTUS (ajuda clínicas a ter mais pacientes), conversando pelo próprio WhatsApp com uma clínica que você analisou. Objetivo: falar com QUEM DECIDE (dono/dona, sócio, gestor) e marcar uma conversa de 15 minutos para mostrar o que você encontrou${prospect?.siteUrl ? " e o site novo que você já preparou de presente para a clínica" : ""}.
Como conduzir (persuasão honesta, nunca mentir):
- Português do Brasil, tom de gente, 1 a 3 frases curtas, no máximo 1 emoji. Nunca textão, nunca cara de vendedor, nunca preço. Você é homem (o Ícaro): diga "obrigado", "fico no aguardo", nunca "obrigada".
- Se quem responde parece ser a RECEPÇÃO (fala "vou passar", "a doutora não está", "do que se trata", "qual assunto"): seja simpático, explique em 1 frase que é algo específico da clínica que só faz sentido mostrar para quem decide${prospect?.siteUrl ? " (um site novo pronto, de presente, sem compromisso)" : ""}, e peça o NOME e o melhor CONTATO (WhatsApp) do(a) responsável, ou o melhor dia/horário para falar com ele(a). Quando conseguir um nome ou telefone, preencha "contatoDono".
- Se é o dono/responsável: use o gargalo mais forte em linguagem simples (paciente que procura e vai para o concorrente)${prospect?.siteUrl ? ", conte que o site já está pronto e que você quer mostrar em 15 minutos" : ""} e ofereça 2 HORÁRIOS LIVRES. Quando escolher, confirme e use acao "agendar" com o ISO.
- Se pedirem para ver antes${prospect?.siteUrl ? `, você pode mandar o link do site: ${prospect.siteUrl} e já propor os 15 minutos para explicar o resto` : ", diga que mostra em 15 minutos e ofereça os horários"}.
- Não invente números, clientes, resultados ou preços. Use só os gargalos listados.
- Se pedirem para parar, não tiverem interesse ou for número errado: agradeça curto e use acao "humano" com motivo "sem interesse".
- Se perguntarem preço, contrato ou algo que só o Ícaro responde ao vivo: diga que na conversa de 15 minutos ele explica tudo; se insistirem, acao "humano".
- Se a última mensagem não pedir resposta, use acao "aguardar".`;

  const user = `${opts.role === "clinica" ? `O que a clínica ensinou:\n${opts.settings.conhecimento.trim() || "(nada cadastrado: não informe valores nem detalhes; foque em marcar a avaliação)"}\n${conv.client.description ? `Sobre a clínica: ${conv.client.description.slice(0, 500)}\n` : ""}` : `Clínica prospectada: ${prospect?.name ?? conv.name ?? "clínica"}\nGargalos encontrados: ${JSON.stringify(prospect?.gargalos ?? [])}\n${isOwner ? "QUEM ESTÁ FALANDO AGORA É O DONO/RESPONSÁVEL (contato passado pela recepção). Não peça mais contato: vá direto para a conversa de 15 minutos. Fale do dinheiro que fica na mesa como ESTIMATIVA (nunca número exato) e diga que mostra a conta na call.\n" : ""}${prospect?.siteUrl ? `Site grátis já pronto para mostrar na call: ${prospect.siteUrl}\n` : ""}`}
${lead ? `Etapa atual: ${lead.stage}${lead.appointmentAt ? `, já marcado para ${fmt.format(lead.appointmentAt)}` : ""}\n` : ""}HORÁRIOS LIVRES (use exatamente estes):
${slotLines || "(sem horários livres cadastrados: ofereça confirmar o melhor horário com a equipe)"}

Conversa (mais antiga primeiro):
${transcript}

Responda SOMENTE JSON: {"acao":"responder|agendar|humano|aguardar","resposta":"mensagem pronta","horario":"ISO ou null","motivo":"curto"${opts.role === "lotus" ? ",\"contatoDono\":\"nome e/ou telefone do responsável se a pessoa passou, senão null\"" : ""}}`;

  const res = await registry.getDefault().complete({
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    maxTokens: 600,
    temperature: 0.4,
    // Nunca deixa a fila da IA presa: sem resposta em 60 s, desiste e tenta na próxima
    signal: AbortSignal.timeout(60_000),
  });
  const json = res.content.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return null;
  const d = JSON.parse(json) as AiDecision;
  if (!["responder", "agendar", "humano", "aguardar"].includes(d.acao)) d.acao = "responder";
  d.resposta = String(d.resposta ?? "").trim().slice(0, 1200);
  // Só aceita horário que estava na lista de livres
  if (d.acao === "agendar") {
    const ok = d.horario && slots.some((s) => Math.abs(s.getTime() - new Date(d.horario!).getTime()) < 60_000);
    if (!ok) d.acao = "responder";
  }
  return d;
}
