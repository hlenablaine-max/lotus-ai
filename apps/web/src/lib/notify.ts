// Avisos para o Ícaro dentro do app: aparecem no sino e como notificação do Windows.
import { prisma } from "@/lib/prisma";

export async function notify(n: { kind: string; title: string; body: string; href?: string | null; clientId?: string | null }): Promise<void> {
  try {
    await prisma.appNotification.create({ data: { kind: n.kind, title: n.title.slice(0, 160), body: n.body.slice(0, 600), href: n.href ?? null, clientId: n.clientId ?? null } });
  } catch (err) {
    console.warn("[aviso] não registrado:", err instanceof Error ? err.message : err);
  }
}
