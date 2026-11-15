import { NextResponse } from 'next/server'
import { getAgentStore, type AgentStatus } from '@/lib/agent-store'

export const dynamic = 'force-dynamic'

export async function GET() {
  const store = getAgentStore()
  return NextResponse.json({ agents: store.getAll() })
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json()
    const { id, status, currentMission } = body as {
      id: string
      status: AgentStatus
      currentMission?: string
    }

    const store = getAgentStore()
    const success = store.updateStatus(id, status, currentMission)

    if (!success) {
      return NextResponse.json({ error: `Agent '${id}' not found` }, { status: 404 })
    }

    return NextResponse.json({ success: true, agent: store.get(id) })
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}
