import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const clientId = searchParams.get("clientId");
    const where = clientId ? { clientId } : {};
    const missions = await prisma.mission.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        client: { select: { id: true, name: true, segment: true } },
        _count: { select: { tasks: true } },
      },
    })
    return NextResponse.json({ missions })
  } catch (err) {
    console.error('[API /missions GET]', err)
    return NextResponse.json({ missions: [] })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { title, description, objective, clientId, priority, dueAt } = body as {
      title: string
      description: string
      objective: string
      clientId: string
      priority?: string
      dueAt?: string
    }

    if (!title?.trim() || !clientId?.trim()) {
      return NextResponse.json({ error: 'title and clientId are required' }, { status: 400 })
    }

    const mission = await prisma.mission.create({
      data: {
        title,
        description: description || '',
        objective: objective || title,
        clientId,
        priority: (priority as 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT') || 'MEDIUM',
        dueAt: dueAt ? new Date(dueAt) : undefined,
      },
      include: {
        client: { select: { id: true, name: true } },
      },
    })

    return NextResponse.json({ mission }, { status: 201 })
  } catch (err) {
    console.error('[API /missions POST]', err)
    return NextResponse.json({ error: 'Failed to create mission' }, { status: 500 })
  }
}
