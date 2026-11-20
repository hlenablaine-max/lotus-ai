import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/require-owner";
import { SOURCES, STAGES, type Source, type Stage } from "@/lib/crm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Atualiza um lead (mudar de etapa, valor fechado, observação...)
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;
  const { id } = await params;
  const current = await prisma.lead.findUnique({ where: { id }, select: { stage: true, firstContactAt: true } });
  if (!current) return Response.json({ error: "Lead não encontrado" }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  for (const key of ["name", "phone", "email", "campaign", "interest", "notes", "lostReason"] as const) {
    if (typeof body[key] === "string") data[key] = (body[key] as string).trim() || null;
  }
  if (typeof body.viaLotus === "boolean") data.viaLotus = body.viaLotus;
  if (body.value !== undefined) {
    const n = body.value === null || body.value === "" ? null : Number(String(body.value).replace(",", "."));
    data.value = n === null || Number.isFinite(n) ? n : null;
  }
  if (typeof body.source === "string" && (SOURCES as readonly string[]).includes(body.source)) data.source = body.source as Source;
  if (typeof body.stage === "string" && (STAGES as readonly string[]).includes(body.stage) && body.stage !== current.stage) {
    const stage = body.stage as Stage;
    data.stage = stage;
    data.stageChangedAt = new Date();
    if (stage !== "NOVO" && !current.firstContactAt) data.firstContactAt = new Date();
    data.closedAt = stage === "FECHADO" ? new Date() : null;
  }
  const lead = await prisma.lead.update({ where: { id }, data });
  return Response.json({ lead });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;
  const { id } = await params;
  await prisma.lead.delete({ where: { id } }).catch(() => null);
  return Response.json({ ok: true });
}
