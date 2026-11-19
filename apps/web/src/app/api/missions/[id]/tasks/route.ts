import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { recoverStaleTasks, runTask } from "@/lib/task-runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await recoverStaleTasks().catch(() => {});

  const tasks = await prisma.task.findMany({
    where: { missionId: id },
    include: {
      agent: { select: { id: true, name: true, slug: true, avatar: true, title: true } },
      documents: {
        select: { id: true, title: true, content: true, type: true },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return Response.json({ tasks });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { title, description, instructions, agentId, input, dependsOn } = body;

  if (!title || !description || !instructions) {
    return Response.json(
      { error: "title, description and instructions are required" },
      { status: 400 }
    );
  }

  const mission = await prisma.mission.findUnique({ where: { id } });
  if (!mission) {
    return Response.json({ error: "Mission not found" }, { status: 404 });
  }

  // Dependências só valem se forem tarefas desta mesma missão
  let validDeps: string[] = [];
  if (Array.isArray(dependsOn) && dependsOn.length > 0) {
    const found = await prisma.task.findMany({
      where: { id: { in: dependsOn.map(String) }, missionId: id },
      select: { id: true },
    });
    validDeps = found.map((t) => t.id);
  }

  const task = await prisma.task.create({
    data: {
      missionId: id,
      agentId: agentId || null,
      title,
      description,
      instructions,
      input: input || undefined,
      dependsOn: validDeps,
      status: "QUEUED",
    },
    include: { agent: { select: { id: true, name: true, slug: true } } },
  });

  await prisma.activityLog.create({
    data: {
      missionId: id,
      taskId: task.id,
      agentId: agentId || null,
      action: "TASK_CREATED",
      details: { title, agentId, dependsOn: validDeps },
      level: "INFO",
    },
  });

  if (agentId) runTask(task.id);

  return Response.json({ task }, { status: 201 });
}
