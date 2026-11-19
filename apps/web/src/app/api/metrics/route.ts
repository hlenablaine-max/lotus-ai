import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest) {
  try {
  const [
    totalClients,
    totalMissions,
    completedMissions,
    activeMissions,
    totalTasks,
    completedTasks,
    failedTasks,
    totalDocuments,
    totalAgents,
    pendingApprovals,
    recentActivity,
  ] = await Promise.all([
    prisma.client.count(),
    prisma.mission.count(),
    prisma.mission.count({ where: { status: "COMPLETED" } }),
    prisma.mission.count({ where: { status: { in: ["IN_PROGRESS", "PLANNING", "WAITING_APPROVAL", "IN_REVIEW"] } } }),
    prisma.task.count(),
    prisma.task.count({ where: { status: "COMPLETED" } }),
    prisma.task.count({ where: { status: "FAILED" } }),
    prisma.document.count(),
    prisma.agent.count({ where: { isActive: true } }),
    prisma.approval.count({ where: { status: "PENDING" } }),
    prisma.activityLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        action: true,
        level: true,
        createdAt: true,
        details: true,
        mission: { select: { title: true, client: { select: { name: true } } } },
      },
    }),
  ]);

  return Response.json({
    clients: totalClients,
    missions: { total: totalMissions, completed: completedMissions, active: activeMissions },
    tasks: { total: totalTasks, completed: completedTasks, failed: failedTasks },
    documents: totalDocuments,
    agents: totalAgents,
    pendingApprovals,
    recentActivity,
    // Success rate over tasks that already finished (completed vs failed); null while nothing finished
    successRate: completedTasks + failedTasks > 0 ? Math.round((completedTasks / (completedTasks + failedTasks)) * 100) : null,
  });
  } catch (err) {
    console.error("[API /metrics GET]", err);
    return Response.json({ error: "Falha ao consultar o banco de dados" }, { status: 500 });
  }
}
