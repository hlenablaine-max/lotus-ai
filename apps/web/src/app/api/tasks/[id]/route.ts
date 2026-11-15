import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

  const allowedFields = ["status", "output", "startedAt", "completedAt"];
  const data: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (field in body) data[field] = body[field];
  }

  const updated = await prisma.task.update({ where: { id }, data });
  return NextResponse.json({ task: updated });
}
