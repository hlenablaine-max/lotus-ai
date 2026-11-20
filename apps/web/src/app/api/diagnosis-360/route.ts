import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/require-owner";
import { diagnosisProgress, exportDeliverables, startDiagnosis, startProduction, startSite } from "@/lib/diagnosis-360";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Inicia o Diagnóstico 360 de um lead a partir do Instagram.
export async function POST(request: NextRequest) {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;

  const body = (await request.json().catch(() => ({}))) as {
    instagram?: string;
    website?: string;
    city?: string;
    testWhatsApp?: boolean;
    produce?: boolean;
    action?: "produce" | "export" | "site";
    missionId?: string;
  };

  // Ações sobre um diagnóstico que já existe: produzir as soluções ou gravar o pacote em pasta
  if (body.action) {
    if (!body.missionId) return Response.json({ error: "Informe o diagnóstico." }, { status: 400 });
    try {
      if (body.action === "produce") return Response.json(await startProduction(body.missionId), { status: 202 });
      if (body.action === "site") return Response.json(await startSite(body.missionId), { status: 202 });
      const exported = await exportDeliverables(body.missionId);
      if (!exported) return Response.json({ error: "Ainda não há entregáveis para gravar." }, { status: 400 });
      return Response.json(exported);
    } catch (err) {
      return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
    }
  }

  if (!body.instagram?.trim()) {
    return Response.json({ error: "Informe o link ou @ do Instagram." }, { status: 400 });
  }
  try {
    const result = await startDiagnosis({
      instagram: body.instagram,
      website: body.website?.trim() || undefined,
      city: body.city?.trim() || undefined,
      testWhatsApp: !!body.testWhatsApp,
      produce: body.produce !== false,
    });
    return Response.json(result, { status: 202 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}

// ?missionId= devolve o andamento; sem parâmetro lista os diagnósticos recentes.
export async function GET(request: NextRequest) {
  const missionId = new URL(request.url).searchParams.get("missionId");
  if (missionId) {
    const progress = await diagnosisProgress(missionId);
    if (!progress) return Response.json({ error: "Diagnóstico não encontrado" }, { status: 404 });
    return Response.json(progress);
  }
  const recent = await prisma.mission.findMany({
    where: { context: { path: ["diagnosis360"], equals: true } },
    orderBy: { createdAt: "desc" },
    take: 15,
    select: { id: true, title: true, status: true, createdAt: true, client: { select: { id: true, name: true, instagram: true } } },
  });
  return Response.json({ diagnoses: recent });
}
