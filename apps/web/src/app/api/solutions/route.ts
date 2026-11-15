import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const complexity = searchParams.get("complexity");
    const category = searchParams.get("category");

    const where: Record<string, unknown> = {};
    if (complexity) where.complexity = complexity;
    if (category) where.category = category;

    const solutions = await prisma.solution.findMany({
      where,
      orderBy: [{ category: "asc" }, { baseSetupPrice: "asc" }],
    });

    return NextResponse.json({ solutions });
  } catch (err) {
    console.error('[API /solutions GET]', err);
    return NextResponse.json({ solutions: [] });
  }
}
