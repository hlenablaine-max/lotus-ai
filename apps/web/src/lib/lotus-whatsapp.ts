// WhatsApp da LOTUS (o número do Ícaro) conectado pelo QR que ouve: usado no aviso do diagnóstico,
// no teste de tempo de resposta das clínicas, na prospecção e nos relatórios. Tudo passa pelo escudo anti-ban.
import { prisma } from "@/lib/prisma";
import { createRuntimeClient } from "@/lib/runtime-client";
import { ensureLotusClient, sendNow } from "@/lib/whatsapp";

// Devolve o cliente interno da LOTUS se o WhatsApp dele estiver conectado de verdade agora
export async function lotusWhatsappReady(): Promise<{ clientId: string } | null> {
  const lotus = await ensureLotusClient();
  const ch = await prisma.whatsappChannel.findUnique({ where: { clientId: lotus.id }, select: { status: true } });
  if (ch?.status !== "conectado") return null;
  const rt = createRuntimeClient();
  if (!(await rt.available())) return null;
  const st = (await rt.call("/runtime/wa/status", { clientId: lotus.id }, 10_000).catch(() => null)) as { state?: string } | null;
  return st?.state === "conectado" ? { clientId: lotus.id } : null;
}

export async function lotusSend(phone: string, text: string): Promise<{ conversationId: string; sentAt: Date }> {
  const ready = await lotusWhatsappReady();
  if (!ready) throw new Error("O WhatsApp da LOTUS não está conectado (Integrações > WhatsApp da LOTUS).");
  const r = await sendNow(ready.clientId, { phone }, text, "lotus", 180_000);
  return { conversationId: r.conversationId, sentAt: new Date(r.sentAt) };
}

// Respostas que chegaram nessa conversa depois de um momento (para o teste de atendimento)
export async function lotusRepliesSince(conversationId: string, since: Date) {
  return prisma.whatsappMessage.findMany({ where: { conversationId, direction: "IN", sentAt: { gt: since } }, orderBy: { sentAt: "asc" }, select: { body: true, sentAt: true } });
}
