import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/require-owner";
import { dataToMarkdown } from "@/lib/data-labels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Json = Record<string, unknown>;

// Último resultado de cada motor para este cliente (para a tela de Motores não perder o que já rodou)
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;
  const { id } = await params;
  const docs = await prisma.document.findMany({
    where: { clientId: id, metadata: { path: ["engine"], not: "null" } },
    orderBy: { createdAt: "desc" },
    select: { id: true, createdAt: true, metadata: true },
    take: 60,
  });
  const latest: Record<string, { result: unknown; savedAt: string; documentId: string }> = {};
  for (const doc of docs) {
    const meta = (doc.metadata ?? {}) as Json;
    const engine = String(meta.engine ?? "");
    if (engine && !latest[engine]) latest[engine] = { result: meta.result, savedAt: doc.createdAt.toISOString(), documentId: doc.id };
  }
  return Response.json({ results: latest });
}

// Salva o resultado de um motor como documento do cliente (aparece na ficha, no portal e no PDF)
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { engine?: string; engineName?: string; result?: unknown };
  if (!body.engine || !body.result) return Response.json({ error: "engine e result são obrigatórios" }, { status: 400 });
  const client = await prisma.client.findUnique({ where: { id }, select: { name: true } });
  if (!client) return Response.json({ error: "Cliente não encontrado" }, { status: 404 });
  const doc = await prisma.document.create({
    data: {
      clientId: id,
      title: `${body.engineName ?? body.engine} — ${client.name}`,
      type: body.engine === "strategy" ? "STRATEGY" : "ANALYSIS",
      content: dataToMarkdown(body.result),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      metadata: { engine: body.engine, result: body.result } as any,
    },
    select: { id: true, createdAt: true },
  });
  return Response.json({ ok: true, documentId: doc.id, savedAt: doc.createdAt.toISOString() });
}
