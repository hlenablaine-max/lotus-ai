import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/require-owner";
import { applyLeadUpdate } from "@/lib/lead-update";
import { referralLink, sendNow } from "@/lib/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Uma conversa aberta: mensagens, lead (etapa, valor, consulta) e o paciente da base, se for um
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;
  const { id } = await params;
  const conv = await prisma.conversation.findUnique({ where: { id } });
  if (!conv) return Response.json({ error: "Conversa não encontrada" }, { status: 404 });
  const before = request.nextUrl.searchParams.get("antes");
  const messages = await prisma.whatsappMessage.findMany({
    where: { conversationId: id, ...(before ? { sentAt: { lt: new Date(before) } } : {}) },
    orderBy: { sentAt: "desc" },
    take: 150,
  });
  const [lead, patient, pending] = await Promise.all([
    conv.leadId ? prisma.lead.findUnique({ where: { id: conv.leadId } }) : null,
    conv.patientId ? prisma.patient.findUnique({ where: { id: conv.patientId }, include: { purchases: { orderBy: { date: "desc" }, take: 10 } } }) : null,
    prisma.outboundMessage.findMany({ where: { clientId: conv.clientId, status: { in: ["PENDENTE", "ENVIANDO"] }, OR: [{ jid: conv.jid }, ...(conv.phone ? [{ phone: conv.phone }] : [])] }, orderBy: { scheduledFor: "asc" }, take: 10 }),
  ]);
  const history = conv.phone
    ? await prisma.lead.findMany({ where: { clientId: conv.clientId, phone: conv.phone, id: { not: conv.leadId ?? "" } }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, stage: true, value: true, createdAt: true, source: true } })
    : [];
  if (conv.unread > 0) await prisma.conversation.update({ where: { id }, data: { unread: 0 } });
  return Response.json({ conversation: conv, messages: messages.reverse(), lead, patient, pending, history, hasMore: messages.length === 150 });
}

// Muda a etapa do lead da conversa, valor, orçamento, data da consulta; ou marca que o paciente pediu para parar
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;
  const { id } = await params;
  const conv = await prisma.conversation.findUnique({ where: { id } });
  if (!conv) return Response.json({ error: "Conversa não encontrada" }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  if (typeof body.name === "string" && body.name.trim()) await prisma.conversation.update({ where: { id }, data: { name: body.name.trim() } });
  // IA: pausar (horas) ou retomar (0) nesta conversa; descartar o rascunho
  if (typeof body.aiPauseHours === "number") {
    await prisma.conversation.update({ where: { id }, data: { aiPausedUntil: body.aiPauseHours > 0 ? new Date(Date.now() + body.aiPauseHours * 3_600_000) : null } });
  }
  if (body.discardDraft) await prisma.conversation.update({ where: { id }, data: { aiDraft: null, aiDraftAction: null } });
  // Enviar o rascunho da IA (do jeito que está ou editado)
  if (body.sendDraft) {
    const text = String(typeof body.draftText === "string" ? body.draftText : conv.aiDraft ?? "").trim();
    if (!text) return Response.json({ error: "Rascunho vazio" }, { status: 400 });
    try {
      await sendNow(conv.clientId, { jid: conv.jid, phone: conv.phone }, text, "ia");
      await prisma.conversation.update({ where: { id }, data: { aiDraft: null, aiDraftAction: null } });
      // A ação que a IA tinha decidido acontece agora, junto com o envio
      const action = conv.aiDraftAction ?? "";
      if (action.startsWith("agendar:")) {
        const when = action.slice(8);
        if (conv.leadId) await applyLeadUpdate(conv.leadId, { appointmentAt: when });
        if (conv.prospectId) await prisma.prospect.update({ where: { id: conv.prospectId }, data: { status: "CALL_MARCADA", callAt: new Date(when), notes: `Call: ${when}` } });
      } else if (action.startsWith("humano:")) {
        await prisma.conversation.update({ where: { id }, data: { aiPausedUntil: new Date(Date.now() + 24 * 3_600_000) } });
      }
    } catch (err) {
      return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
    }
  }
  if (typeof body.optOut === "boolean" && conv.patientId) await prisma.patient.update({ where: { id: conv.patientId }, data: { optOut: body.optOut } });

  let leadId = conv.leadId;
  // Conversa sem lead (veio do histórico ou a clínica puxou o assunto): cria o lead na hora
  if (!leadId && body.createLead) {
    const lead = await prisma.lead.create({
      data: { clientId: conv.clientId, name: conv.name || (conv.phone ? `+${conv.phone}` : "Contato do WhatsApp"), phone: conv.phone, source: conv.source, campaign: conv.campaign, viaLotus: false, conversationId: conv.id, patientId: conv.patientId },
    });
    leadId = lead.id;
    await prisma.conversation.update({ where: { id }, data: { leadId } });
  }
  let lead = null;
  if (leadId && body.lead && typeof body.lead === "object") {
    const leadBody = { ...(body.lead as Record<string, unknown>) };
    if (typeof leadBody.source === "string") await prisma.conversation.update({ where: { id }, data: { source: leadBody.source as never, sourceBy: "manual" } }).catch(() => undefined);
    lead = await applyLeadUpdate(leadId, leadBody);
  } else if (leadId) {
    lead = await prisma.lead.findUnique({ where: { id: leadId } });
  }
  let link: string | null = null;
  const updated = await prisma.conversation.findUnique({ where: { id } });
  if (body.referral && updated?.patientId) link = await referralLink(conv.clientId, updated.patientId).catch(() => null);
  return Response.json({ ok: true, lead, referralLink: link });
}
