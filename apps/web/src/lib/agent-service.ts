// Camada de acesso a agentes: tenta Prisma, cai para agent-store em memória
// Garante que o SSE e o HQ continuam funcionando mesmo sem DB configurado

import { getAgentStore, type Agent, type AgentStatus } from './agent-store'

// Verifica se o Prisma pode ser usado (DATABASE_URL configurada)
function dbAvailable(): boolean {
  return Boolean(process.env.DATABASE_URL)
}

// Importa o Prisma dinamicamente para não quebrar o build sem DATABASE_URL
async function getPrisma() {
  if (!dbAvailable()) return null
  try {
    const { prisma } = await import('./prisma')
    return prisma
  } catch {
    return null
  }
}

export async function getAllAgents(): Promise<Agent[]> {
  const prisma = await getPrisma()

  if (prisma) {
    try {
      const agents = await prisma.agent.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
      })

      // Converter formato Prisma → formato Agent do store
      return agents.map((a) => ({
        id: a.id,
        name: a.name,
        role: a.title,
        departmentId: a.department,
        status: (a.status.toLowerCase() as AgentStatus) || 'idle',
        currentMission: undefined,
        lastActivity: [],
        tasksCompleted: a.tasksCompleted,
        tasksPending: a.tasksTotal - a.tasksCompleted,
      }))
    } catch (err) {
      console.warn('[agent-service] Prisma failed, falling back to memory store:', err)
    }
  }

  // Fallback: in-memory store (sempre funciona)
  return getAgentStore().getAll()
}

// Maps in-memory status → DB enum
const STATUS_TO_DB: Record<AgentStatus, string> = {
  idle: 'IDLE',
  working: 'EXECUTING',
  meeting: 'IN_MEETING',
  thinking: 'PLANNING',
  waiting_approval: 'REVIEWING',
  error: 'IDLE',
  offline: 'IDLE',
}

export async function updateAgentStatus(
  id: string,
  status: AgentStatus,
  currentMission?: string
): Promise<boolean> {
  const store = getAgentStore()
  let success = store.updateStatus(id, status, currentMission)

  // Fallback: DB UUID not in store — find matching slot by department
  if (!success) {
    const prisma = await getPrisma()
    if (prisma) {
      try {
        const agent = await prisma.agent.findUnique({
          where: { id },
          select: { department: true, name: true },
        })
        if (agent) {
          const storeAgents = store.getAll()
          const match = storeAgents.find(
            (a) =>
              a.departmentId === agent.department ||
              a.name.toLowerCase().includes(agent.name.split(' ')[0].toLowerCase())
          )
          if (match) success = store.updateStatus(match.id, status, currentMission)
        }
      } catch {
        // silent — SSE best-effort
      }
    }
  }

  // Persist status to DB (best-effort, non-blocking)
  const prisma = await getPrisma()
  if (prisma) {
    try {
      const prismaStatus = STATUS_TO_DB[status] ?? 'IDLE'
      await prisma.agent.update({
        where: { id },
        data: {
          status: prismaStatus as Parameters<typeof prisma.agent.update>[0]['data']['status'],
        },
      })
    } catch (err) {
      console.warn('[agent-service] Failed to persist status to DB:', err)
    }
  }

  return success
}
