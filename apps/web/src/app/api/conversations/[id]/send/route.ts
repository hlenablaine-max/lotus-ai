import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/require-owner";
import { sendNow } from "@/lib/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Manda uma mensagem pelo WhatsApp da clínica, digitada no app da LOTUS
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;
  const { id } = await params;
  const conv = await prisma.conversation.findUnique({ where: { id }, select: { clientId: true, jid: true, phone: true } });
  if (!conv) return Response.json({ error: "Conversa não encontrada" }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as { text?: string };
  const text = String(body.text ?? "").trim();
  if (!text) return Response.json({ error: "Escreva a mensagem" }, { status: 400 });
  if (text.length > 4000) return Response.json({ error: "Mensagem longa demais" }, { status: 400 });
  try {
    return Response.json(await sendNow(conv.clientId, { jid: conv.jid, phone: conv.phone }, text, "lotus"));
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
