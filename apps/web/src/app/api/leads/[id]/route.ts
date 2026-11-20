import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/require-owner";
import { applyLeadUpdate } from "@/lib/lead-update";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Atualiza um lead (etapa, valor fechado, orçamento, data da consulta, observação...)
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const lead = await applyLeadUpdate(id, body);
  if (!lead) return Response.json({ error: "Lead não encontrado" }, { status: 404 });
  return Response.json({ lead });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;
  const { id } = await params;
  await prisma.lead.delete({ where: { id } }).catch(() => null);
  return Response.json({ ok: true });
}
