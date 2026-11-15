import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const agents = await prisma.agent.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        tasks: {
          where: { status: "IN_PROGRESS" },
          select: { id: true, title: true, mission: { select: { title: true } } },
          take: 1,
        },
      },
    });

    const hqAgents = agents.map((a) => ({
      id: a.id,
      name: a.name,
      department: a.department,
      status: a.status.toLowerCase() as "idle" | "working" | "error",
      specialty: a.specialty,
      tasksCompleted: a.tasksCompleted,
      tasksTotal: a.tasksTotal,
      currentTask: a.tasks[0]?.title ?? null,
      currentMission: a.tasks[0]?.mission?.title ?? null,
      avgQualityScore: a.avgQualityScore,
      lastActive: a.updatedAt,
    }));

    return NextResponse.json({ agents: hqAgents, ts: Date.now() });
  } catch (err) {
    console.error("[api/hq/agents]", err);
    return NextResponse.json({ agents: [], ts: Date.now() });
  }
}
