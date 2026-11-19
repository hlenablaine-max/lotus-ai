import { NextResponse } from 'next/server'
import { type AgentStatus } from '@/lib/agent-store'
import { updateAgentStatus } from '@/lib/agent-service'
import { getLiveAgents } from '@/lib/agent-live'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PATCHABLE_STATUSES: AgentStatus[] = [
  'idle', 'working', 'meeting', 'thinking', 'waiting_approval', 'error', 'offline',
]

export async function GET() {
  try {
    const agents = await getLiveAgents()
    return NextResponse.json({ agents })
  } catch (err) {
    console.error('[api/agents/status]', err)
    return NextResponse.json({ agents: [], error: 'Falha ao consultar agentes' }, { status: 503 })
  }
}

export async function PATCH(req: Request) {
  let body: { id?: unknown; status?: unknown; currentMission?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { id, status, currentMission } = body
  if (typeof id !== 'string' || !id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }
  if (typeof status !== 'string' || !PATCHABLE_STATUSES.includes(status as AgentStatus)) {
    return NextResponse.json(
      { error: `status must be one of: ${PATCHABLE_STATUSES.join(', ')}` },
      { status: 400 }
    )
  }

  const success = await updateAgentStatus(
    id,
    status as AgentStatus,
    typeof currentMission === 'string' ? currentMission : undefined
  )

  if (!success) {
    return NextResponse.json({ error: `Agent '${id}' not found` }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}
