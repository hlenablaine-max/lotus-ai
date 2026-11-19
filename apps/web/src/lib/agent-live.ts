// Estado AO VIVO dos agentes, derivado do banco (tasks, approvals, activity logs).
// Não confia em agent.status gravado — ele pode ficar preso em EXECUTING.

import { prisma } from '@/lib/prisma'

export type LiveAgentStatus = 'idle' | 'working' | 'thinking' | 'waiting_approval' | 'offline'

export interface LiveAgent {
  id: string
  name: string
  slug: string
  role: string
  departmentId: string
  specialty: string
  status: LiveAgentStatus
  currentTask: string | null
  currentMission: string | null
  tasksCompleted: number
  tasksPending: number
  avgQualityScore: number | null
  lastActivity: string[]
}

export interface ActivityFeedItem {
  id: string
  agentId: string | null
  agentName: string
  role: string
  departmentId: string
  action: string
  level: string
  time: string
}

const DEPARTMENT_ALIASES: Record<string, string> = {
  executive: 'ceo',
  business_intelligence: 'bi',
  'business-intelligence': 'bi',
  business_transformation: 'bto',
  'business-transformation': 'bto',
  creative_studio: 'creative',
  'creative-studio': 'creative',
  performance_marketing: 'performance',
  'performance-marketing': 'performance',
  web_development: 'web-dev',
  'web-development': 'web-dev',
  data_analytics: 'data-analytics',
  sales_cs: 'sales',
  sales_intelligence: 'sales',
  healthcare_growth: 'strategy',
}

export function normalizeDepartment(department: string | null | undefined): string {
  const key = (department ?? '').trim().toLowerCase()
  return DEPARTMENT_ALIASES[key] ?? key
}

const ACTION_LABELS: Record<string, string> = {
  TASK_CREATED: 'Recebeu a tarefa',
  TASK_STARTED: 'Iniciou a tarefa',
  TASK_COMPLETED: 'Concluiu a tarefa',
  TASK_FAILED: 'Falhou na tarefa',
  APPROVAL_REQUESTED: 'Solicitou aprovação',
  APPROVAL_APPROVED: 'Aprovação concedida',
  APPROVAL_REJECTED: 'Aprovação rejeitada',
  MISSION_CREATED: 'Missão criada',
  MISSION_COMPLETED: 'Missão concluída',
  DOCUMENT_SAVED: 'Salvou um entregável',
}

const OPEN_TASK_STATUSES = ['IN_PROGRESS', 'PENDING', 'QUEUED', 'WAITING_DEPENDENCY'] as const

const LOG_SELECT = {
  id: true,
  agentId: true,
  action: true,
  level: true,
  details: true,
  createdAt: true,
  agent: { select: { id: true, name: true, title: true, department: true } },
  mission: { select: { title: true } },
  task: {
    select: {
      title: true,
      agentId: true,
      agent: { select: { id: true, name: true, title: true, department: true } },
    },
  },
} as const

type LogRow = Awaited<ReturnType<typeof fetchLogs>>[number]

function fetchLogs(take: number) {
  return prisma.activityLog.findMany({
    orderBy: { createdAt: 'desc' },
    take,
    select: LOG_SELECT,
  })
}

function describeLog(log: LogRow): string {
  const label =
    ACTION_LABELS[log.action] ??
    log.action.toLowerCase().replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())
  const details = (log.details ?? null) as Record<string, unknown> | null
  const subject =
    log.task?.title ??
    (typeof details?.title === 'string' ? details.title : null) ??
    log.mission?.title ??
    null
  return subject ? `${label}: ${subject}` : label
}

function formatWhen(date: Date): string {
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  })
}

export async function getLiveAgents(): Promise<LiveAgent[]> {
  const [agents, openTasks, pendingApprovals, logs] = await Promise.all([
    prisma.agent.findMany({ orderBy: [{ department: 'asc' }, { name: 'asc' }] }),
    prisma.task.findMany({
      where: { status: { in: [...OPEN_TASK_STATUSES] }, agentId: { not: null } },
      orderBy: { updatedAt: 'desc' },
      select: {
        title: true,
        status: true,
        agentId: true,
        mission: { select: { title: true } },
      },
    }),
    prisma.approval.findMany({ where: { status: 'PENDING' }, select: { requestedBy: true } }),
    fetchLogs(300),
  ])

  const tasksByAgent = new Map<string, typeof openTasks>()
  for (const task of openTasks) {
    if (!task.agentId) continue
    const list = tasksByAgent.get(task.agentId)
    if (list) list.push(task)
    else tasksByAgent.set(task.agentId, [task])
  }

  const awaitingApproval = new Set(pendingApprovals.map((a) => a.requestedBy))

  const activityByAgent = new Map<string, string[]>()
  for (const log of logs) {
    const agentId = log.agentId ?? log.task?.agentId
    if (!agentId) continue
    const list = activityByAgent.get(agentId) ?? []
    if (list.length >= 5) continue
    list.push(`${describeLog(log)} — ${formatWhen(log.createdAt)}`)
    activityByAgent.set(agentId, list)
  }

  return agents.map((agent) => {
    const tasks = tasksByAgent.get(agent.id) ?? []
    const running = tasks.find((t) => t.status === 'IN_PROGRESS')

    let status: LiveAgentStatus = 'idle'
    if (!agent.isActive) status = 'offline'
    else if (running) status = 'working'
    else if (awaitingApproval.has(agent.id)) status = 'waiting_approval'
    else if (tasks.length > 0) status = 'thinking'

    const focus = running ?? tasks[0]

    return {
      id: agent.id,
      name: agent.name,
      slug: agent.slug,
      role: agent.title,
      departmentId: normalizeDepartment(agent.department),
      specialty: agent.specialty,
      status,
      currentTask: focus?.title ?? null,
      currentMission: focus?.mission?.title ?? null,
      tasksCompleted: agent.tasksCompleted,
      tasksPending: tasks.length,
      avgQualityScore: agent.avgQualityScore,
      lastActivity: activityByAgent.get(agent.id) ?? [],
    }
  })
}

export async function getActivityFeed(limit = 25): Promise<ActivityFeedItem[]> {
  const logs = await fetchLogs(Math.min(Math.max(limit, 1), 100))
  return logs.map((log) => {
    const actor = log.agent ?? log.task?.agent ?? null
    return {
      id: log.id,
      agentId: actor?.id ?? null,
      agentName: actor?.name ?? 'Sistema',
      role: actor?.title ?? 'LOTUS',
      departmentId: actor ? normalizeDepartment(actor.department) : 'mission-control',
      action: describeLog(log),
      level: log.level,
      time: log.createdAt.toISOString(),
    }
  })
}
