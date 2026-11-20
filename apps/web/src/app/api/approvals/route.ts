import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES = ["PENDING", "APPROVED", "REJECTED", "EXPIRED"] as const;
type Status = (typeof STATUSES)[number];

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const statusParam = (searchParams.get("status") || "PENDING").toUpperCase();
  const missionId = searchParams.get("missionId");

  if (statusParam !== "ALL" && !STATUSES.includes(statusParam as Status)) {
    return Response.json({ error: `status inválido: ${statusParam}` }, { status: 400 });
  }

  // Só o número de pendentes (selo do menu): consulta leve, sem carregar os pedidos
  if (searchParams.get("countOnly") === "1") {
    const pendingCount = await prisma.approval.count({ where: { status: "PENDING" } });
    return Response.json({ pendingCount });
  }

  const approvals = await prisma.approval.findMany({
    where: {
      ...(statusParam !== "ALL" ? { status: statusParam as Status } : {}),
      ...(missionId ? { missionId } : {}),
    },
    include: {
      mission: { select: { id: true, title: true, client: { select: { name: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  // Nome de quem pediu (agente) em vez do ID cru
  const agentIds = [...new Set(approvals.map((a) => a.requestedBy))];
  const agents = await prisma.agent.findMany({ where: { id: { in: agentIds } }, select: { id: true, name: true } });
  const names = new Map(agents.map((a) => [a.id, a.name]));

  const pendingCount = await prisma.approval.count({ where: { status: "PENDING" } });

  return Response.json({
    approvals: approvals.map((a) => ({
      ...a,
      requestedByName: names.get(a.requestedBy) ?? (a.requestedBy === "root-master" ? "Root Master (chat)" : a.requestedBy),
    })),
    pendingCount,
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { missionId, requestedBy, type, title, description, payload } = body;

  if (!requestedBy || !type || !title || !description || !payload) {
    return Response.json({ error: "requestedBy, type, title, description, payload are required" }, { status: 400 });
  }

  const approval = await prisma.approval.create({
    data: { missionId, requestedBy, type, title, description, payload, status: "PENDING" },
  });

  return Response.json({ approval }, { status: 201 });
}
