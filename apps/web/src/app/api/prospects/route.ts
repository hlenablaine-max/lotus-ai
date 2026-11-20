import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/require-owner";
import { createRuntimeClient } from "@/lib/runtime-client";
import { approveProspects, prepareFreeSite, searchStatus, startSearch, syncFreeSites } from "@/lib/prospecting";
import { notify } from "@/lib/notify";
import { ensureLotusClient } from "@/lib/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES = ["APROVAR", "NA_FILA", "ENVIADO", "RESPONDEU", "CONVERSANDO", "CALL_MARCADA", "SEM_INTERESSE", "DESCARTADO", "SEM_WHATSAPP"];

// Painel da prospecção: clínicas por etapa, busca em andamento e o estado do WhatsApp da LOTUS (com o escudo)
export async function GET(request: NextRequest) {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;
  const sp = request.nextUrl.searchParams;
  const status = sp.get("status");
  await syncFreeSites().catch(() => undefined);
  const where: Prisma.ProspectWhereInput = status && STATUSES.includes(status) ? { status } : status === "ativos" ? { status: { in: ["RESPONDEU", "CONVERSANDO", "CALL_MARCADA"] } } : {};
  const [prospects, grouped, lotus] = await Promise.all([
    prisma.prospect.findMany({ where, orderBy: [{ score: "desc" }, { createdAt: "desc" }], take: 200 }),
    prisma.prospect.groupBy({ by: ["status"], _count: { _all: true } }),
    ensureLotusClient(),
  ]);
  const counts = Object.fromEntries(grouped.map((g) => [g.status, g._count._all]));
  const channel = await prisma.whatsappChannel.findUnique({ where: { clientId: lotus.id }, select: { status: true, phone: true } });
  const rt = createRuntimeClient();
  let shield: unknown = null;
  if (await rt.available()) shield = ((await rt.call("/runtime/wa/shield", { clientId: lotus.id }, 10_000).catch(() => null)) as { shield?: unknown } | null)?.shield ?? null;
  const queue = await prisma.outboundMessage.count({ where: { clientId: lotus.id, kind: "prospeccao", status: { in: ["PENDENTE", "ENVIANDO"] } } });
  return Response.json({ prospects, counts, search: searchStatus(), lotus: { clientId: lotus.id, connected: channel?.status === "conectado", phone: channel?.phone ?? null, shield, queue } });
}

// buscar: { action: "buscar", niche, city, max } | aprovar: { action: "aprovar", ids }
export async function POST(request: NextRequest) {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;
  const body = (await request.json().catch(() => ({}))) as { action?: string; niche?: string; city?: string; max?: number; ids?: string[] };
  if (body.action === "buscar") {
    const niche = String(body.niche ?? "").trim();
    const city = String(body.city ?? "").trim();
    if (!niche || !city) return Response.json({ error: "Diga o nicho e a cidade" }, { status: 400 });
    const r = await startSearch({ niche, city, max: Math.min(20, Math.max(1, Number(body.max) || 8)) });
    return Response.json(r, { status: r.started ? 202 : 409 });
  }
  // Site grátis: monta em segundo plano (kit de marca + criação + revisão levam alguns minutos)
  if (body.action === "site" && typeof (body as { id?: string }).id === "string") {
    const id = (body as { id: string }).id;
    void prepareFreeSite(id)
      .then((r) => (r.started ? undefined : notify({ kind: "sistema", title: "Site grátis não começou", body: r.reason ?? "", href: "/prospeccao" })))
      .catch((err) => notify({ kind: "sistema", title: "Site grátis falhou", body: err instanceof Error ? err.message : String(err), href: "/prospeccao" }));
    return Response.json({ started: true }, { status: 202 });
  }
  if (body.action === "aprovar") {
    const r = await approveProspects(Array.isArray(body.ids) ? body.ids.slice(0, 100) : []);
    return Response.json(r, { status: r.reason ? 400 : 200 });
  }
  return Response.json({ error: "Ação inválida" }, { status: 400 });
}
