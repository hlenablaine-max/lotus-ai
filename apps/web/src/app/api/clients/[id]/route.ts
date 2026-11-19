import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { portalToken } from '@/lib/portal-token'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const client = await prisma.client.findUnique({
      where: { id },
      include: {
        contacts: true,
        missions: { orderBy: { createdAt: 'desc' } },
        assessments: { orderBy: { createdAt: 'desc' }, take: 5 },
        clientSolutions: { include: { solution: { select: { name: true, category: true } } } },
        memories: { where: { scope: 'CLIENT' }, orderBy: { updatedAt: 'desc' }, take: 10, select: { id: true, content: true, updatedAt: true } },
        _count: { select: { missions: true, documents: true } },
      },
    })
    if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    // Link assinado para o cliente acompanhar as entregas sem precisar de login
    const portalPath = `/portal/${client.id}?t=${await portalToken(client.id)}`
    return NextResponse.json({ client, portalPath })
  } catch (err) {
    console.error('[API /clients/:id GET]', err)
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const body = await req.json()
    const { name, segment, website, instagram, description, status } = body
    const client = await prisma.client.update({
      where: { id },
      data: { name, segment, website, instagram, description, status },
    })
    return NextResponse.json({ client })
  } catch {
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const missions = await prisma.mission.count({ where: { clientId: id } })
    if (missions > 0) {
      return NextResponse.json(
        { error: `Este cliente tem ${missions} missão(ões). Marque como CHURNED em vez de excluir, para preservar o histórico.` },
        { status: 409 }
      )
    }
    await prisma.client.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
  }
}
