import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const mission = await prisma.mission.findUnique({
    where: { id },
    select: { title: true, client: { select: { name: true } } },
  });
  if (!mission) return Response.json({ error: "Mission not found" }, { status: 404 });

  const documents = await prisma.document.findMany({
    where: { missionId: id },
    select: { id: true, title: true, content: true, type: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  return Response.json({ mission: { title: mission.title, client: mission.client.name }, documents });
}
