import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const clients = await prisma.client.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        contacts: true,
        _count: { select: { missions: true } },
      },
    })
    return NextResponse.json({ clients })
  } catch (err) {
    console.error('[API /clients GET]', err)
    return NextResponse.json({ clients: [] })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { name, segment, website, instagram, description } = body as {
      name: string
      segment?: string
      website?: string
      instagram?: string
      description?: string
    }

    if (!name?.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }

    const slug = name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      + '-' + Date.now().toString(36)

    const client = await prisma.client.create({
      data: { name, slug, segment, website, instagram, description },
    })

    return NextResponse.json({ client }, { status: 201 })
  } catch (err) {
    console.error('[API /clients POST]', err)
    return NextResponse.json({ error: 'Failed to create client' }, { status: 500 })
  }
}
