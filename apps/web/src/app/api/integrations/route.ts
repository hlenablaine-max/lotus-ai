import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/require-owner";
import { integrationsView, saveIntegration, testIntegration } from "@/lib/integrations-catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function pingDatabase(): Promise<{ ok: boolean; error?: string }> {
  if (!process.env.DATABASE_URL) return { ok: false };
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message.split("\n").pop() : String(err) };
  }
}

// Integrações configuráveis (valores mascarados) + estado real do banco compartilhado.
export async function GET() {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;
  const db = await pingDatabase();
  const integrations = integrationsView();
  return Response.json({
    integrations,
    database: { ok: db.ok, error: db.error ?? null },
    summary: { total: integrations.length, connected: integrations.filter((i) => i.configured).length },
  });
}

// { action: "save", id, values } grava o que foi colado; { action: "test", id } testa a conexão.
export async function POST(request: NextRequest) {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;
  const body = (await request.json().catch(() => ({}))) as { action?: string; id?: string; values?: Record<string, string> };
  if (!body.id) return Response.json({ error: "Informe a integração." }, { status: 400 });
  try {
    if (body.action === "save") {
      saveIntegration(body.id, body.values ?? {});
      return Response.json({ ok: true, integrations: integrationsView() });
    }
    if (body.action === "test") return Response.json(await testIntegration(body.id));
    return Response.json({ error: "Ação inválida." }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
