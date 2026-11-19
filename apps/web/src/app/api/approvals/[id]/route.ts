import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

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
  const { id } = await params;
  const body = await request.json();
  const { action, decisionNote } = body; // action: "APPROVED" | "REJECTED"

  if (!action || !["APPROVED", "REJECTED"].includes(action)) {
    return Response.json({ error: "action must be APPROVED or REJECTED" }, { status: 400 });
  }

  const approval = await prisma.approval.update({
    where: { id },
    data: {
      status: action,
      decisionNote: decisionNote || null,
      decidedAt: new Date(),
    },
  });

  // Log the decision
  await prisma.activityLog.create({
    data: {
      missionId: approval.missionId || undefined,
      action: `APPROVAL_${action}`,
      details: { approvalId: id, title: approval.title, decisionNote },
      level: "INFO",
    },
  });

  return Response.json({ approval });
}
