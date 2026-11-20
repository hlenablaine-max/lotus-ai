import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/require-owner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EDITABLE = ["APROVAR", "DESCARTADO", "SEM_INTERESSE", "CALL_MARCADA", "CONVERSANDO"];

// Editar a mensagem antes de aprovar, descartar a clínica ou mudar a etapa à mão
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { message?: string; status?: string; notes?: string };
  const data: Record<string, unknown> = {};
  if (typeof body.message === "string") data.message = body.message.trim().slice(0, 1000);
  if (typeof body.notes === "string") data.notes = body.notes.slice(0, 1000);
  if (typeof body.status === "string" && EDITABLE.includes(body.status)) data.status = body.status;
  // Descartar quem estava na fila tira a mensagem da fila
  if (data.status === "DESCARTADO") await prisma.outboundMessage.updateMany({ where: { kind: "prospeccao", refId: id, status: "PENDENTE" }, data: { status: "CANCELADO", error: "Descartado pelo Ícaro" } });
  const p = await prisma.prospect.update({ where: { id }, data }).catch(() => null);
  if (!p) return Response.json({ error: "Clínica não encontrada" }, { status: 404 });
  return Response.json({ prospect: p });
}
