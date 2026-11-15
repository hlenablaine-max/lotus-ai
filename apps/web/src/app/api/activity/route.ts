import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") || "100"), 200);
  const level = searchParams.get("level");
  const agentId = searchParams.get("agentId");
  const clientId = searchParams.get("clientId");
  const missionId = searchParams.get("missionId");

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
}
