import { NextResponse } from 'next/server'
import { type AgentStatus } from '@/lib/agent-store'
import { getAllAgents, updateAgentStatus } from '@/lib/agent-service'

export const dynamic = 'force-dynamic'

export async function GET() {
  const agents = await getAllAgents()
  return NextResponse.json({ agents })
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json()
    const { id, status, currentMission } = body as {
      id: string
      status: AgentStatus
      currentMission?: string
    }

    const success = await updateAgentStatus(id, status, currentMission)

    if (!success) {
      return NextResponse.json({ error: `Agent '${id}' not found` }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}
