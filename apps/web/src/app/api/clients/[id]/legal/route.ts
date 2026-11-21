import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/require-owner";
import { legalDocHtml } from "@/lib/legal-docs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ?doc=contrato|dpa → página pronta para imprimir/salvar em PDF; sem doc → situação das assinaturas
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;
  const { id } = await params;
  const doc = request.nextUrl.searchParams.get("doc");
  if (doc === "contrato" || doc === "dpa") {
    try {
      return new Response(await legalDocHtml(id, doc), { headers: { "Content-Type": "text/html; charset=utf-8" } });
    } catch (err) {
      return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 404 });
    }
  }
  const c = await prisma.client.findUnique({ where: { id }, select: { contractSignedAt: true, dpaSignedAt: true } });
  return Response.json(c ?? {});
}

// { doc: "contrato" | "dpa", signed: boolean }
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;
  const { id } = await params;
  const b = (await request.json().catch(() => ({}))) as { doc?: string; signed?: boolean };
  const field = b.doc === "contrato" ? "contractSignedAt" : b.doc === "dpa" ? "dpaSignedAt" : null;
  if (!field) return Response.json({ error: "Documento inválido" }, { status: 400 });
  const c = await prisma.client.update({ where: { id }, data: { [field]: b.signed ? new Date() : null }, select: { contractSignedAt: true, dpaSignedAt: true } });
  return Response.json(c);
}
