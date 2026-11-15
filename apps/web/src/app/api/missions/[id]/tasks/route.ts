import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { executeTask, type ExecutorDB } from "@lotus/ai-engine";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const tasks = await prisma.task.findMany({
    where: { missionId: id },
    include: { agent: { select: { id: true, name: true, slug: true, avatar: true } } },
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

  const task = await prisma.task.create({
    data: {
      missionId: id,
      agentId: agentId || null,
      title,
      description,
      instructions,
      input: input || null,
      dependsOn: dependsOn || [],
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
      details: { title, agentId },
      level: "INFO",
    },
  });

  // Fire-and-forget execution if agent is assigned
  if (agentId) {
    executeTask(task.id, prisma as unknown as ExecutorDB).catch(() => {});
  }

  return Response.json({ task }, { status: 201 });
}
