import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { executeTask, type ExecutorDB } from "@lotus/ai-engine";
import { createRuntimeClient } from "@/lib/runtime-client";

export const runtime = "nodejs";

export async function POST(_request: NextRequest) {
  const failedTasks = await prisma.task.findMany({
    where: { status: "FAILED", retryCount: { lt: 3 } },
    select: { id: true, retryCount: true, title: true },
    take: 10,
  });

  if (failedTasks.length === 0) {
    return Response.json({ retried: 0, message: "Nenhuma task FAILED para retentar" });
  }

  const db = { ...(prisma as unknown as ExecutorDB), runtime: createRuntimeClient() };
  for (const task of failedTasks) {
    executeTask(task.id, db).catch(() => {});
  }

  return Response.json({
    retried: failedTasks.length,
    tasks: failedTasks.map((t) => ({ id: t.id, title: t.title, retryCount: t.retryCount })),
  });
}

export async function GET(_request: NextRequest) {
  const [failed, inProgress, completed] = await Promise.all([
    prisma.task.count({ where: { status: "FAILED" } }),
    prisma.task.count({ where: { status: "IN_PROGRESS" } }),
    prisma.task.count({ where: { status: "COMPLETED" } }),
  ]);
  return Response.json({ failed, inProgress, completed });
}
