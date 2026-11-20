import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/require-owner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  boas_vindas: "Boas-vindas",
  lembrete_1d: "Lembrete (1 dia antes)",
  lembrete_2h: "Lembrete (2 horas antes)",
  avaliacao: "Pedido de avaliação",
  orcamento: "Orçamento parado",
  retorno: "Retorno",
  aniversario: "Aniversário",
  indicacao: "Indicação",
  reativacao: "Campanha de reativação",
  manual: "Mensagem agendada",
};

// O que as automações já mandaram e o que está na fila
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;
  const { id } = await params;
  const [items, grouped] = await Promise.all([
    prisma.outboundMessage.findMany({ where: { clientId: id }, orderBy: [{ createdAt: "desc" }], take: 80 }),
    prisma.outboundMessage.groupBy({ by: ["kind", "status"], where: { clientId: id, createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) } }, _count: { _all: true } }),
  ]);
  const summary: Record<string, { label: string; sent: number; pending: number; failed: number }> = {};
  for (const g of grouped) {
    const row = (summary[g.kind] ??= { label: KIND_LABEL[g.kind] ?? g.kind, sent: 0, pending: 0, failed: 0 });
    if (g.status === "ENVIADO") row.sent += g._count._all;
    else if (g.status === "PENDENTE" || g.status === "ENVIANDO") row.pending += g._count._all;
    else if (g.status === "FALHOU") row.failed += g._count._all;
  }
  return Response.json({ items: items.map((i) => ({ ...i, label: KIND_LABEL[i.kind] ?? i.kind })), summary });
}

// Cancela o que ainda não saiu (uma campanha inteira ou tudo de um tipo)
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;
  const { id } = await params;
  const sp = request.nextUrl.searchParams;
  const campaignId = sp.get("campanha");
  const kind = sp.get("tipo");
  const itemId = sp.get("item");
  const res = await prisma.outboundMessage.updateMany({
    where: { clientId: id, status: "PENDENTE", ...(itemId ? { id: itemId } : {}), ...(campaignId ? { campaignId } : {}), ...(kind ? { kind } : {}) },
    data: { status: "CANCELADO", error: "Cancelado pelo Ícaro" },
  });
  return Response.json({ cancelled: res.count });
}
