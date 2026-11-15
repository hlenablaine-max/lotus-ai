import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const mission = await prisma.mission.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, name: true } },
        tasks: { orderBy: { createdAt: 'asc' } },
      },
    })
    if (!mission) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ mission })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const { title, description, objective, status, priority, dueAt } = body
    const mission = await prisma.mission.update({
      where: { id },
      data: { title, description, objective, status, priority, dueAt: dueAt ? new Date(dueAt) : undefined },
      include: { client: { select: { id: true, name: true } } },
    })
    return NextResponse.json({ mission })
  } catch {
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await prisma.mission.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
  }
}
