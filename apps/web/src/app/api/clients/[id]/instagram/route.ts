import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/require-owner";
import { connectManychat } from "@/lib/manychat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Estado do Instagram (ManyChat) do cliente e o que colar no ManyChat
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;
  const { id } = await params;
  const acc = await prisma.manychatAccount.findUnique({ where: { clientId: id } });
  if (!acc) return Response.json({ connected: false });
  const publicBase = process.env.LOTUS_PUBLIC_URL?.replace(/\/$/, "") ?? null;
  return Response.json({
    connected: acc.status === "conectado",
    pageName: acc.pageName,
    igUsername: acc.igUsername,
    lastEventAt: acc.lastEventAt,
    inboundUrl: publicBase ? `${publicBase}/api/integrations/manychat/inbound?t=${acc.inboundToken}` : null,
    localUrl: `${request.nextUrl.origin}/api/integrations/manychat/inbound?t=${acc.inboundToken}`,
  });
}

// Conectar (ou trocar) a chave da API do ManyChat
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { apiKey?: string };
  try {
    const r = await connectManychat(id, String(body.apiKey ?? ""));
    return Response.json({ ok: true, pageName: r.pageName, igUsername: r.igUsername });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}

// Desligar o Instagram deste cliente (as conversas ficam)
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;
  const { id } = await params;
  await prisma.manychatAccount.updateMany({ where: { clientId: id }, data: { status: "desconectado" } });
  return Response.json({ ok: true });
}
