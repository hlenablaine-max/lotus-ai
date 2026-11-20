import { NextRequest } from "next/server";
import { registry } from "@lotus/ai-engine";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/require-owner";
import { sourceLabel } from "@/lib/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TZ = "America/Sao_Paulo";

// A IA lê a conversa como um vendedor experiente de clínica e sugere a próxima mensagem (não envia sozinha)
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;
  const { id } = await params;
  const conv = await prisma.conversation.findUnique({ where: { id }, include: { client: { select: { name: true, segment: true, description: true } } } });
  if (!conv) return Response.json({ error: "Conversa não encontrada" }, { status: 404 });
  const messages = await prisma.whatsappMessage.findMany({ where: { conversationId: id }, orderBy: { sentAt: "desc" }, take: 40 });
  if (messages.length === 0) return Response.json({ error: "A conversa ainda não tem mensagens" }, { status: 400 });
  const lead = conv.leadId ? await prisma.lead.findUnique({ where: { id: conv.leadId } }) : null;
  const fmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: TZ });
  const transcript = messages
    .reverse()
    .map((m) => `[${fmt.format(m.sentAt)}] ${m.direction === "IN" ? "PACIENTE" : "CLÍNICA"}: ${m.body}`)
    .join("\n")
    .slice(-9000);

  const system = `Você é o melhor atendente comercial de clínicas do Brasil (odontologia, estética, saúde). Seu trabalho é transformar conversa de WhatsApp em consulta agendada, com educação e sem pressão chata.
Regras: português do Brasil, tom humano e acolhedor, mensagens curtas como de WhatsApp (no máximo 3 frases), sem emojis exagerados (no máximo 1), nunca invente preço, promoção, horário ou dado clínico que não esteja na conversa; quando faltar informação, faça uma pergunta que leve ao agendamento. Sempre termine conduzindo para um próximo passo concreto (ex.: oferecer 2 opções de horário).
Responda SOMENTE com JSON válido neste formato:
{"temperatura":"quente|morno|frio","interesse":"o que a pessoa quer, em poucas palavras","objecao":"principal objeção ou null","resumo":"1 frase do momento da conversa","proximoPasso":"o que a clínica deve fazer agora","resposta":"a mensagem pronta para mandar"}`;
  const user = `Clínica: ${conv.client.name}${conv.client.segment ? ` (${conv.client.segment})` : ""}
${conv.client.description ? `Sobre a clínica: ${conv.client.description.slice(0, 600)}\n` : ""}Contato: ${conv.name ?? "sem nome"} — origem: ${sourceLabel(conv.source)}${conv.campaign ? ` (${conv.campaign})` : ""}
${lead ? `Etapa no CRM: ${lead.stage}${lead.quotedValue ? `, orçamento passado R$ ${lead.quotedValue}` : ""}${lead.appointmentAt ? `, consulta marcada ${fmt.format(lead.appointmentAt)}` : ""}\n` : ""}
Conversa (mais antiga primeiro):
${transcript}`;

  try {
    const result = await registry.getDefault().complete({
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      maxTokens: 700,
      temperature: 0.5,
    });
    const raw = result.content.trim();
    const json = raw.match(/\{[\s\S]*\}/)?.[0];
    if (!json) return Response.json({ error: "A IA não devolveu uma sugestão válida. Tente de novo." }, { status: 502 });
    const parsed = JSON.parse(json) as { temperatura?: string; interesse?: string; objecao?: string | null; resumo?: string; proximoPasso?: string; resposta?: string };
    const hint = [parsed.temperatura, parsed.interesse, parsed.objecao ? `objeção: ${parsed.objecao}` : null].filter(Boolean).join(" · ");
    await prisma.conversation.update({ where: { id }, data: { aiHint: hint.slice(0, 300) } });
    if (lead && parsed.interesse && !lead.interest) await prisma.lead.update({ where: { id: lead.id }, data: { interest: parsed.interesse.slice(0, 120) } });
    return Response.json({ suggestion: parsed, provider: result.provider });
  } catch (err) {
    return Response.json({ error: `A IA não respondeu (${err instanceof Error ? err.message : String(err)}).` }, { status: 502 });
  }
}
