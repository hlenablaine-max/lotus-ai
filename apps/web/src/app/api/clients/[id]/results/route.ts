import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/require-owner";
import { clientResults, monthRange } from "@/lib/crm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Resultados do mês do cliente (funil, conversão, faturamento, custo por lead)
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;
  const { id } = await params;
  return Response.json(await clientResults(id, request.nextUrl.searchParams.get("month") ?? undefined, ["whatsapp", "instagram"].includes(request.nextUrl.searchParams.get("canal") ?? "") ? request.nextUrl.searchParams.get("canal") : null));
}

// Números do mês que só o cliente sabe: { month, patientBase, adSpend, revenue }
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const { month } = monthRange(typeof body.month === "string" ? body.month : undefined);
  const num = (v: unknown) => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(String(v).replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  };
  const data = {
    patientBase: num(body.patientBase) === null ? null : Math.round(num(body.patientBase)!),
    adSpend: num(body.adSpend),
    revenue: num(body.revenue),
    notes: typeof body.notes === "string" ? body.notes : null,
  };
  await prisma.clientMonthlyNumbers.upsert({ where: { clientId_month: { clientId: id, month } }, create: { clientId: id, month, ...data }, update: data });
  return Response.json(await clientResults(id, month));
}
