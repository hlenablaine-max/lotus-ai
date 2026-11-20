import { NextResponse } from "next/server";
import { getLiveAgents, getActivityFeed } from "@/lib/agent-live";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Visitas recentes entre agentes (um passou recado ao outro): o escritório 3D anima o trajeto
async function recentVisits() {
  const logs = await prisma.activityLog.findMany({
    where: { action: "AGENT_DELEGATED", createdAt: { gte: new Date(Date.now() - 60_000) } },
    orderBy: { createdAt: "desc" },
    select: { agentId: true, details: true, createdAt: true },
    take: 10,
  });
  return logs
    .map((l) => ({ fromAgentId: l.agentId, toAgentId: String(((l.details ?? {}) as Record<string, unknown>).toAgentId ?? ""), startedAt: l.createdAt.getTime() }))
    .filter((v) => v.fromAgentId && v.toAgentId);
}

export async function GET() {
  try {
    const [agents, feed, visits] = await Promise.all([getLiveAgents(), getActivityFeed(25), recentVisits()]);
    return NextResponse.json({ agents, feed, visits, ts: Date.now() });
  } catch (err) {
    console.error("[api/hq/agents]", err);
    return NextResponse.json({ error: "Falha ao consultar agentes" }, { status: 503 });
  }
}
