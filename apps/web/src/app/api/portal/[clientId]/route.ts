import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Internal working documents produced by agent tools — never shown to the client
const INTERNAL_TITLE_PREFIXES = ["WhatsApp Pendente", "Screenshot —", "Resultado exec_local"];
const INTERNAL_DOC_TYPES = ["AUDIT_REPORT", "MEETING_NOTES"];

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const { clientId } = await params;

  try {
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true, name: true, segment: true, website: true, createdAt: true },
    });

    if (!client) {
      return Response.json({ error: "Cliente não encontrado" }, { status: 404 });
    }

    const missions = await prisma.mission.findMany({
      where: { clientId, type: { not: "INTERNAL" }, status: { not: "CANCELLED" } },
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
          where: { status: { not: "REJECTED" }, type: { notIn: INTERNAL_DOC_TYPES as never } },
          select: { id: true, title: true, type: true, content: true, status: true, createdAt: true },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    // A deliverable reaches the client once it was approved/delivered, or once its mission is finished.
    const visibleMissions = missions.map((m) => ({
      id: m.id,
      title: m.title,
      objective: m.objective,
      status: m.status,
      createdAt: m.createdAt,
      completedAt: m.completedAt,
      documents: m.documents
        .filter((d) => !INTERNAL_TITLE_PREFIXES.some((p) => d.title.startsWith(p)))
        .filter((d) => d.status === "APPROVED" || d.status === "DELIVERED" || m.status === "COMPLETED")
        .map((d) => ({ id: d.id, title: d.title, type: d.type, content: d.content, createdAt: d.createdAt })),
    }));

    const totalDocuments = visibleMissions.reduce((sum, m) => sum + m.documents.length, 0);
    const completedMissions = visibleMissions.filter((m) => m.status === "COMPLETED").length;

    return Response.json({
      client,
      missions: visibleMissions,
      stats: { totalMissions: visibleMissions.length, completedMissions, totalDocuments },
    });
  } catch (err) {
    console.error("[API /portal GET]", err);
    return Response.json({ error: "Erro ao carregar o portal" }, { status: 500 });
  }
}
