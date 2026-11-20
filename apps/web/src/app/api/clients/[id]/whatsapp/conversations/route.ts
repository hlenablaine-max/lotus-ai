import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/require-owner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lista de conversas do WhatsApp do cliente (a coluna da esquerda da caixa de entrada)
// filtro: todas | aguardando (paciente falou por último) | leads (oportunidades abertas) | fechados | base
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;
  const { id } = await params;
  const sp = request.nextUrl.searchParams;
  const q = (sp.get("q") ?? "").trim();
  const filtro = sp.get("filtro") ?? "todas";
  const source = sp.get("origem");

  const where: Prisma.ConversationWhereInput = { clientId: id };
  if (q) where.OR = [{ name: { contains: q, mode: "insensitive" } }, { phone: { contains: q.replace(/\D/g, "") || q } }, { lastPreview: { contains: q, mode: "insensitive" } }];
  if (source) where.source = source as Prisma.ConversationWhereInput["source"];
  const canal = sp.get("canal");
  if (canal === "whatsapp" || canal === "instagram") where.channel = canal;
  if (filtro === "base") where.patientId = { not: null };
  if (filtro === "leads" || filtro === "fechados") where.leadId = { not: null };

  let conversations = await prisma.conversation.findMany({ where, orderBy: { lastMessageAt: "desc" }, take: filtro === "aguardando" ? 400 : 200 });
  if (filtro === "aguardando") conversations = conversations.filter((c) => c.lastInboundAt && (!c.lastOutboundAt || c.lastOutboundAt < c.lastInboundAt)).slice(0, 200);

  const leadIds = conversations.map((c) => c.leadId).filter((x): x is string => !!x);
  const leads = leadIds.length ? await prisma.lead.findMany({ where: { id: { in: leadIds } }, select: { id: true, stage: true, value: true, appointmentAt: true } }) : [];
  const leadById = new Map(leads.map((l) => [l.id, l]));
  let rows = conversations.map((c) => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    source: c.source,
    channel: c.channel,
    sourceBy: c.sourceBy,
    campaign: c.campaign,
    lastPreview: c.lastPreview,
    lastMessageAt: c.lastMessageAt,
    unread: c.unread,
    waiting: !!c.lastInboundAt && (!c.lastOutboundAt || c.lastOutboundAt < c.lastInboundAt),
    waitingSince: c.lastInboundAt,
    isPatient: !!c.patientId,
    fromHistory: c.fromHistory,
    lead: c.leadId ? leadById.get(c.leadId) ?? null : null,
  }));
  if (filtro === "leads") rows = rows.filter((r) => r.lead && !["FECHADO", "PERDIDO"].includes(r.lead.stage));
  if (filtro === "fechados") rows = rows.filter((r) => r.lead?.stage === "FECHADO");

  const totals = {
    all: await prisma.conversation.count({ where: { clientId: id } }),
    unread: (await prisma.conversation.aggregate({ where: { clientId: id }, _sum: { unread: true } }))._sum.unread ?? 0,
  };
  return Response.json({ conversations: rows, totals });
}
