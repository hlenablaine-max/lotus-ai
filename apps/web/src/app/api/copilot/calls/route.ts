import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/require-owner";
import { ensureLotusClient } from "@/lib/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Calls de venda gravadas pelo Sales Copilot (as mais recentes primeiro)
export async function GET(request: NextRequest) {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;
  const clientId = request.nextUrl.searchParams.get("clientId");
  const calls = await prisma.salesCall.findMany({
    where: clientId ? { clientId } : {},
    orderBy: { createdAt: "desc" },
    take: 30,
    select: { id: true, title: true, status: true, startedAt: true, endedAt: true, summary: true, keyInsights: true, suggestionsCount: true, client: { select: { id: true, name: true } } },
  });
  return Response.json({ calls });
}

// Começa uma call: { clientId?, title? } (sem cliente vai para a LOTUS, que é o caso das calls de prospecção)
export async function POST(request: NextRequest) {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;
  const b = (await request.json().catch(() => ({}))) as { clientId?: string; title?: string };
  const clientId = b.clientId || (await ensureLotusClient()).id;
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { name: true } });
  if (!client) return Response.json({ error: "Cliente não encontrado" }, { status: 404 });
  const now = new Date();
  const call = await prisma.salesCall.create({
    data: {
      clientId,
      title: (b.title?.trim() || `Call com ${client.name.split("|")[0].trim()} — ${now.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}`).slice(0, 160),
      platform: "MANUAL",
      status: "IN_PROGRESS",
      startedAt: now,
    },
    select: { id: true, title: true },
  });
  return Response.json({ call });
}
