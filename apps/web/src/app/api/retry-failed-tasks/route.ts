import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { recoverStaleTasks, runTask } from "@/lib/task-runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Reexecuta tarefas que falharam. Com ?missionId= limita a uma missão.
export async function POST(request: NextRequest) {
  const missionId = new URL(request.url).searchParams.get("missionId");
  await recoverStaleTasks();

  const failedTasks = await prisma.task.findMany({
    where: { status: "FAILED", agentId: { not: null }, ...(missionId ? { missionId } : {}) },
    select: { id: true, retryCount: true, title: true },
    take: 20,
  });

  if (failedTasks.length === 0) {
    return Response.json({ retried: 0, message: "Nenhuma tarefa com falha para reexecutar" });
  }

  // Reexecução manual zera o contador para a tarefa ganhar novas tentativas automáticas
  await prisma.task.updateMany({ where: { id: { in: failedTasks.map((t) => t.id) } }, data: { retryCount: 0 } });
  for (const task of failedTasks) runTask(task.id);

  return Response.json({
    retried: failedTasks.length,
    tasks: failedTasks.map((t) => ({ id: t.id, title: t.title })),
  });
}

export async function GET() {
  const [failed, inProgress, completed] = await Promise.all([
    prisma.task.count({ where: { status: "FAILED" } }),
    prisma.task.count({ where: { status: "IN_PROGRESS" } }),
    prisma.task.count({ where: { status: "COMPLETED" } }),
  ]);
  return Response.json({ failed, inProgress, completed });
}
