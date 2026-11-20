import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/require-owner";
import { createReactivationCampaign } from "@/lib/whatsapp-automations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Campanha de reativação: quem não volta há X meses recebe uma mensagem pelo WhatsApp da clínica, aos poucos.
// Com { preview: true } só conta quantos receberiam, sem colocar nada na fila.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { months?: number; text?: string; limit?: number; preview?: boolean };
  const months = Math.min(60, Math.max(1, Number(body.months) || 6));
  const limit = Math.min(2000, Math.max(1, Number(body.limit) || 200));
  const cutoff = new Date(Date.now() - months * 30 * 86_400_000);
  const reachable = await prisma.patient.count({ where: { clientId: id, optOut: false, phone: { not: null }, OR: [{ lastVisitAt: { lt: cutoff } }, { lastVisitAt: null }] } });
  if (body.preview) return Response.json({ reachable, willSend: Math.min(reachable, limit) });
  const text = String(body.text ?? "").trim();
  if (text.length < 10) return Response.json({ error: "Escreva a mensagem da campanha" }, { status: 400 });
  const channel = await prisma.whatsappChannel.findUnique({ where: { clientId: id }, select: { status: true } });
  if (channel?.status !== "conectado") return Response.json({ error: "Conecte o WhatsApp da clínica antes de criar a campanha." }, { status: 400 });
  return Response.json(await createReactivationCampaign(id, { months, text, limit }));
}
