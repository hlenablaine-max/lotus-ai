import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/require-owner";
import { weeklyReportText } from "@/lib/whatsapp-ai-queue";
import { ensureLotusClient, getSettings, normalizePhone } from "@/lib/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Prévia do relatório semanal que vai para o dono da clínica
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;
  const { id } = await params;
  return Response.json({ text: await weeklyReportText(id) });
}

// Mandar agora (sai pelo WhatsApp da LOTUS, com o escudo anti-ban)
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;
  const { id } = await params;
  const settings = await getSettings(id);
  const body0 = (await request.json().catch(() => ({}))) as { telefone?: string };
  const phone = normalizePhone(body0.telefone || settings.relatorio.telefone);
  if (!phone) return Response.json({ error: "Informe o WhatsApp do dono da clínica no relatório semanal." }, { status: 400 });
  const lotus = await ensureLotusClient();
  const ch = await prisma.whatsappChannel.findUnique({ where: { clientId: lotus.id }, select: { status: true } });
  if (ch?.status !== "conectado") return Response.json({ error: "Conecte o WhatsApp da LOTUS (o seu) para mandar relatórios: Prospecção > Conectar meu WhatsApp." }, { status: 400 });
  const body = await weeklyReportText(id);
  await prisma.outboundMessage.create({ data: { clientId: lotus.id, kind: "relatorio", refId: `${id}:agora-${Date.now()}`, body, phone, scheduledFor: new Date() } });
  return Response.json({ queued: true });
}
