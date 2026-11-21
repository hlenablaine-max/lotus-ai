import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/require-owner";
import { handleApprovalDecision } from "@/lib/approval-actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const approval = await prisma.approval.findUnique({
    where: { id },
    include: { mission: { select: { title: true, client: { select: { name: true } } } } },
  });
  if (!approval) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ approval });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;

  const { id } = await params;
  const body = await request.json();
  const { action, decisionNote } = body as { action?: string; decisionNote?: string };

  if (action !== "APPROVED" && action !== "REJECTED") {
    return Response.json({ error: "action must be APPROVED or REJECTED" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email: owner.email }, select: { id: true } });

  // Só decide o que ainda está pendente (evita executar a mesma ação duas vezes)
  const claimed = await prisma.approval.updateMany({
    where: { id, status: "PENDING" },
    data: {
      status: action,
      decisionNote: decisionNote || null,
      decidedAt: new Date(),
      decidedBy: user?.id ?? null,
    },
  });
  if (claimed.count === 0) {
    const existing = await prisma.approval.findUnique({ where: { id }, select: { status: true } });
    if (!existing) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json({ error: `Aprovação já decidida (${existing.status})` }, { status: 409 });
  }

  const approval = await prisma.approval.findUniqueOrThrow({ where: { id } });

  await prisma.activityLog.create({
    data: {
      userId: user?.id ?? null,
      missionId: approval.missionId || undefined,
      action: `APPROVAL_${action}`,
      details: { approvalId: id, title: approval.title, decisionNote },
      level: "INFO",
    },
  });

  // Recusa com motivo vira aprendizado da empresa: os agentes leem isso antes de cada trabalho
  if (action === "REJECTED" && decisionNote && decisionNote.trim().length >= 5) {
    await prisma.memory
      .create({ data: { scope: "GLOBAL", key: `recusa:${id}`, content: `O dono recusou "${approval.title}": ${decisionNote.trim().slice(0, 400)}`, metadata: { approvalId: id, type: approval.type } } })
      .catch(() => undefined);
  }

  const outcome = await handleApprovalDecision(approval);

  return Response.json({ approval, outcome });
}
