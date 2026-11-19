import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || "PENDING";
  const missionId = searchParams.get("missionId");

  const where: Record<string, unknown> = { status };
  if (missionId) where.missionId = missionId;

  const approvals = await prisma.approval.findMany({
    where,
    include: {
      mission: { select: { id: true, title: true, client: { select: { name: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const count = await prisma.approval.count({ where: { status: "PENDING" } });

  return Response.json({ approvals, pendingCount: count });
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
