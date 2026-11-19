import { NextRequest, NextResponse } from "next/server";
import { executeTask } from "@lotus/ai-engine";
import { prisma } from "@/lib/prisma";
import { updateAgentStatus } from "@/lib/agent-service";
import { createRuntimeClient } from "@/lib/runtime-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const { taskId } = await request.json() as { taskId: string };

    if (!taskId) {
      return NextResponse.json({ error: "taskId is required" }, { status: 400 });
    }

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        agent: { select: { id: true, name: true } },
        mission: { select: { title: true } },
      },
    });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    if (!task.agentId || !task.agent) {
      return NextResponse.json({ error: "Task has no assigned agent" }, { status: 400 });
    }

    if (task.status === "IN_PROGRESS") {
      return NextResponse.json({ error: "Task already running" }, { status: 409 });
    }

    // Mark agent as working in both DB and in-memory store (SSE push)
    await updateAgentStatus(task.agent.id, "working", task.mission.title);

    const agentId = task.agentId;
    const agentName = task.agent.name;

    // Fire-and-forget — route returns 202 immediately
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = { ...(prisma as any), runtime: createRuntimeClient() };
    executeTask(taskId, db)
      .then(() => updateAgentStatus(agentId, "idle"))
      .catch((err) => {
        console.error(`[execute] Task ${taskId} failed:`, err);
        updateAgentStatus(agentId, "idle");
      });

    return NextResponse.json(
      {
        success: true,
        taskId,
        agentId,
        agentName,
        message: `Tarefa "${task.title}" iniciada. ${agentName} está executando.`,
      },
      { status: 202 }
    );
  } catch (err) {
    console.error("[execute]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
