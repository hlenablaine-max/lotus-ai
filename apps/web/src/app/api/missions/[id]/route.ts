import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const STATUSES = ['PENDING', 'PLANNING', 'IN_PROGRESS', 'WAITING_APPROVAL', 'IN_REVIEW', 'COMPLETED', 'FAILED', 'CANCELLED'] as const
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const
const TYPES = ['GROWTH', 'TRANSFORMATION', 'INTELLIGENCE', 'HYBRID', 'INTERNAL'] as const

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
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

// Atualização parcial: só altera os campos enviados.
async function update(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const body = (await req.json()) as Record<string, unknown>
    const data: Record<string, unknown> = {}

    for (const field of ['title', 'description', 'objective'] as const) {
      if (typeof body[field] === 'string') data[field] = body[field]
    }
    if (body.status !== undefined) {
      if (!STATUSES.includes(body.status as (typeof STATUSES)[number])) {
        return NextResponse.json({ error: `status inválido: ${String(body.status)}` }, { status: 400 })
      }
      data.status = body.status
      if (body.status === 'IN_PROGRESS') data.startedAt = new Date()
      data.completedAt = body.status === 'COMPLETED' ? new Date() : null
    }
    if (body.priority !== undefined) {
      if (!PRIORITIES.includes(body.priority as (typeof PRIORITIES)[number])) {
        return NextResponse.json({ error: `priority inválida: ${String(body.priority)}` }, { status: 400 })
      }
      data.priority = body.priority
    }
    if (body.type !== undefined) {
      if (!TYPES.includes(body.type as (typeof TYPES)[number])) {
        return NextResponse.json({ error: `type inválido: ${String(body.type)}` }, { status: 400 })
      }
      data.type = body.type
    }
    if (body.dueAt !== undefined) data.dueAt = body.dueAt ? new Date(String(body.dueAt)) : null

    // "Concluir" com tarefas ainda abertas pede confirmação (force: true)
    if (data.status === 'COMPLETED' && body.force !== true) {
      const open = await prisma.task.count({ where: { missionId: id, status: { in: ['PENDING', 'QUEUED', 'IN_PROGRESS', 'WAITING_DEPENDENCY'] } } })
      if (open > 0) {
        return NextResponse.json(
          { error: `Esta missão ainda tem ${open} tarefa(s) em aberto. Concluir mesmo assim?`, openTasks: open, needsConfirmation: true },
          { status: 409 }
        )
      }
    }

    const mission = await prisma.mission.update({
      where: { id },
      data,
      include: { client: { select: { id: true, name: true } } },
    })

    // "Iniciar" de verdade: põe para rodar as tarefas que não dependem de nenhuma outra
    let started = 0
    if (data.status === 'IN_PROGRESS') {
      const { runTask, advanceMission } = await import('@/lib/task-runner')
      const ready = await prisma.task.findMany({
        where: { missionId: id, status: { in: ['PENDING', 'QUEUED'] }, agentId: { not: null } },
        select: { id: true, dependsOn: true },
      })
      for (const task of ready) {
        const deps = Array.isArray(task.dependsOn) ? task.dependsOn : []
        if (deps.length === 0) {
          runTask(task.id)
          started++
        }
      }
      await advanceMission(id)
    }
    return NextResponse.json({ mission, started })
  } catch {
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }
}

export const PUT = update
export const PATCH = update

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    await prisma.mission.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Failed to delete (a missão pode ter documentos ou aprovações vinculados)' }, { status: 500 })
  }
}
