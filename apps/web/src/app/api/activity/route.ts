import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "100") || 100, 1), 200);
  const level = searchParams.get("level");
  const agentId = searchParams.get("agentId");
  const clientId = searchParams.get("clientId");
  const missionId = searchParams.get("missionId");

  try {
  const logs = await prisma.activityLog.findMany({
    where: {
      ...(level ? { level: level as "DEBUG" | "INFO" | "WARN" | "ERROR" | "CRITICAL" } : {}),
      ...(agentId ? { agentId } : {}),
      ...(clientId ? { clientId } : {}),
      ...(missionId ? { missionId } : {}),
    },
    include: {
      user: { select: { name: true, email: true } },
      agent: { select: { name: true, slug: true } },
      client: { select: { name: true } },
      mission: { select: { title: true } },
      task: { select: { title: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return Response.json({ logs });
  } catch (err) {
    console.error("[API /activity GET]", err);
    return Response.json({ error: "Falha ao consultar o log de atividades", logs: [] }, { status: 500 });
  }
}
