import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/require-owner";
import { ONBOARDING, agencyOverview, closeDeal } from "@/lib/agency-crm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// CRM da LOTUS: funil de vendas da agência e carteira de clientes
export async function GET() {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;
  return Response.json(await agencyOverview());
}

const toNum = (v: unknown) => {
  if (v === null || v === undefined || v === "") return null;
  let s = String(v).replace(/[R$\s]/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

const MOVABLE = ["ENVIADO", "RESPONDEU", "CONVERSANDO", "CALL_MARCADA", "PROPOSTA", "PERDIDO"];

// mover: { action: "mover", prospectId, status, callAt?, lostReason? }
// fechar: { action: "fechar", prospectId, package, monthly, setup }
// etapa: { action: "etapa", clientId, stage } | cancelar: { action: "cancelou", clientId }
export async function POST(request: NextRequest) {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    if (b.action === "mover" && typeof b.prospectId === "string" && MOVABLE.includes(String(b.status))) {
      const callAt = b.callAt ? new Date(String(b.callAt)) : undefined;
      await prisma.prospect.update({
        where: { id: b.prospectId },
        data: { status: String(b.status), ...(callAt && !Number.isNaN(callAt.getTime()) ? { callAt } : {}), ...(typeof b.lostReason === "string" ? { lostReason: b.lostReason.slice(0, 300) } : {}) },
      });
      return Response.json({ ok: true });
    }
    if (b.action === "fechar" && typeof b.prospectId === "string") {
      return Response.json(await closeDeal(b.prospectId, { package: String(b.package ?? "").slice(0, 120), monthly: toNum(b.monthly), setup: toNum(b.setup) }));
    }
    if (b.action === "etapa" && typeof b.clientId === "string" && ONBOARDING.some((o) => o.id === b.stage)) {
      await prisma.client.update({ where: { id: b.clientId }, data: { onboardingStage: String(b.stage) } });
      return Response.json({ ok: true });
    }
    if (b.action === "contrato" && typeof b.clientId === "string") {
      await prisma.client.update({ where: { id: b.clientId }, data: { package: typeof b.package === "string" ? b.package.slice(0, 120) : undefined, monthlyFee: b.monthly !== undefined ? toNum(b.monthly) : undefined, setupFee: b.setup !== undefined ? toNum(b.setup) : undefined } });
      return Response.json({ ok: true });
    }
    if (b.action === "cancelou" && typeof b.clientId === "string") {
      await prisma.client.update({ where: { id: b.clientId }, data: { status: "CHURNED", churnedAt: new Date() } });
      return Response.json({ ok: true });
    }
    return Response.json({ error: "Ação inválida" }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
