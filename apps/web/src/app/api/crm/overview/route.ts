import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/require-owner";
import { clientResults } from "@/lib/crm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Resultados do mês de todos os clientes, lado a lado
export async function GET(request: NextRequest) {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;
  const month = request.nextUrl.searchParams.get("month") ?? undefined;
  const clients = await prisma.client.findMany({ where: { slug: { not: "lotus-interno" } }, select: { id: true, name: true, status: true }, orderBy: { name: "asc" } });
  const rows = await Promise.all(clients.map(async (c) => ({ client: c, results: await clientResults(c.id, month) })));
  const totals = rows.reduce(
    (t, r) => ({ leads: t.leads + r.results.leads, closed: t.closed + r.results.closed, revenue: t.revenue + r.results.revenueClosed, slow: t.slow + r.results.slowContact }),
    { leads: 0, closed: 0, revenue: 0, slow: 0 }
  );
  return Response.json({ month: rows[0]?.results.month ?? null, totals, rows });
}
