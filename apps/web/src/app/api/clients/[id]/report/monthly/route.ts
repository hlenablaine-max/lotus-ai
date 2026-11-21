import { NextRequest } from "next/server";
import { requireOwner } from "@/lib/require-owner";
import { monthlyReportHtml } from "@/lib/monthly-report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Relatório mensal em página pronta para imprimir/salvar em PDF (?month=2026-11)
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;
  const { id } = await params;
  try {
    return new Response(await monthlyReportHtml(id, request.nextUrl.searchParams.get("month") ?? undefined), { headers: { "Content-Type": "text/html; charset=utf-8" } });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 404 });
  }
}
