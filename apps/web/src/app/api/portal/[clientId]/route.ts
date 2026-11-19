import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const { clientId } = await params;

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      id: true,
      name: true,
      segment: true,
      whatsapp: true,
      website: true,
      createdAt: true,
    },
  });

  if (!client) {
    return Response.json({ error: "Cliente não encontrado" }, { status: 404 });
  }

  const missions = await prisma.mission.findMany({
    where: { clientId },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      title: true,
      objective: true,
      status: true,
      createdAt: true,
      completedAt: true,
      documents: {
        select: {
          id: true,
          title: true,
          type: true,
          content: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  const totalDocuments = missions.reduce((sum, m) => sum + m.documents.length, 0);
  const completedMissions = missions.filter((m) => m.status === "COMPLETED").length;

  return Response.json({
    client,
    missions,
    stats: {
      totalMissions: missions.length,
      completedMissions,
      totalDocuments,
    },
  });
}
