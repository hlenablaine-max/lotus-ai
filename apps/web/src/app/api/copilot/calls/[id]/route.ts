import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/require-owner";
import { initializeProviders, registry } from "@lotus/ai-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;
  const { id } = await params;
  const call = await prisma.salesCall.findUnique({ where: { id }, include: { suggestions: { orderBy: { createdAt: "asc" } }, client: { select: { name: true } } } });
  if (!call) return Response.json({ error: "Call não encontrada" }, { status: 404 });
  return Response.json({ call });
}

// Salva a transcrição; com { end: true } encerra a call e a IA escreve o resumo, as objeções e o próximo passo
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;
  const { id } = await params;
  const b = (await request.json().catch(() => ({}))) as { transcript?: string; end?: boolean };
  const call = await prisma.salesCall.findUnique({ where: { id }, select: { id: true, client: { select: { name: true } } } });
  if (!call) return Response.json({ error: "Call não encontrada" }, { status: 404 });
  const transcript = typeof b.transcript === "string" ? b.transcript.slice(0, 200_000) : undefined;
  if (!b.end) {
    await prisma.salesCall.update({ where: { id }, data: { transcript } });
    return Response.json({ ok: true });
  }

  let summary: string | null = null;
  let keyInsights: Record<string, unknown> | null = null;
  const text = transcript ?? (await prisma.salesCall.findUnique({ where: { id }, select: { transcript: true } }))?.transcript ?? "";
  if (text.trim().length > 40) {
    try {
      initializeProviders();
      const res = await registry.getDefault().complete({
        messages: [
          {
            role: "system",
            content:
              'Você resume calls de venda da LOTUS (agência de marketing para clínicas). Use só o que está na transcrição, sem inventar. Responda em JSON puro: {"resumo":"3 a 5 frases","dores":["..."],"objecoes":["..."],"compromissos":["o que cada lado ficou de fazer"],"proximoPasso":"uma frase","chanceDeFechar":"baixa|media|alta","motivo":"uma frase"}',
          },
          { role: "user", content: `Call com ${call.client.name}.\n\nTranscrição (Cliente = a clínica, Você = Ícaro):\n${text.slice(-30_000)}` },
        ],
        maxTokens: 900,
      });
      const m = res.content.match(/\{[\s\S]*\}/);
      if (m) {
        keyInsights = JSON.parse(m[0]) as Record<string, unknown>;
        summary = typeof keyInsights.resumo === "string" ? keyInsights.resumo : null;
      }
    } catch (err) {
      summary = `Resumo não gerado: ${err instanceof Error ? err.message.slice(0, 200) : String(err)}`;
    }
  } else {
    summary = "Call encerrada sem fala suficiente para resumir.";
  }
  const updated = await prisma.salesCall.update({
    where: { id },
    data: { transcript, status: "COMPLETED", endedAt: new Date(), summary, keyInsights: (keyInsights ?? undefined) as never },
    select: { id: true, summary: true, keyInsights: true },
  });
  return Response.json({ call: updated });
}
