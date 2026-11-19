import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runTask } from "@/lib/task-runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const { taskId } = (await request.json()) as { taskId: string };
    if (!taskId) {
      return NextResponse.json({ error: "taskId is required" }, { status: 400 });
    }

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { agent: { select: { id: true, name: true } } },
    });

    if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });
    if (!task.agentId || !task.agent) {
      return NextResponse.json({ error: "Task has no assigned agent" }, { status: 400 });
    }
    if (task.status === "IN_PROGRESS") {
      return NextResponse.json({ error: "Task already running" }, { status: 409 });
    }
    if (task.status === "COMPLETED") {
      return NextResponse.json({ error: "Task already completed" }, { status: 409 });
    }

    runTask(taskId);

    return NextResponse.json(
      {
        success: true,
        taskId,
        agentId: task.agentId,
        agentName: task.agent.name,
        message: `Tarefa "${task.title}" iniciada. ${task.agent.name} está executando.`,
      },
      { status: 202 }
    );
  } catch (err) {
    console.error("[execute]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
