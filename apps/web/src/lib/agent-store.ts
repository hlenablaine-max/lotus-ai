// Server-side singleton: agent state + SSE broadcasting
// Uses global.__agentStore to survive Next.js hot-reloads in dev

export type AgentStatus =
  | 'idle'
  | 'working'
  | 'meeting'
  | 'thinking'
  | 'waiting_approval'
  | 'error'
  | 'offline'

export interface Agent {
  id: string
  name: string
  role: string
  departmentId: string
  status: AgentStatus
  currentMission?: string
  lastActivity: string[]
  tasksCompleted: number
  tasksPending: number
}

const INITIAL_AGENTS: Agent[] = [
  {
    id: 'agent-ceo',
    name: 'Aurora Mendes',
    role: 'CEO & Estrategista-chefe',
    departmentId: 'ceo',
    status: 'working',
    currentMission: 'Revisando OKRs Q4 e alinhamento estratégico',
    lastActivity: ['Aprovou campanha Black Friday', 'Revisou métricas de crescimento', 'Reunião com board'],
    tasksCompleted: 47,
    tasksPending: 3,
  },
  {
    id: 'agent-root',
    name: 'Luna',
    role: 'Root Master (IA Central)',
    departmentId: 'root-master',
    status: 'working',
    currentMission: 'Orquestrando ciclo completo de campanha',
    lastActivity: ['Disparou 3 missões em paralelo', 'Monitorando KPIs em tempo real', 'Atualizou banco de memória'],
    tasksCompleted: 312,
    tasksPending: 11,
  },
  {
    id: 'agent-bi',
    name: 'Marcos Andrade',
    role: 'Analista de BI',
    departmentId: 'bi',
    status: 'working',
    currentMission: 'Análise competitiva — setor saúde SP',
    lastActivity: ['Analisando 42 concorrentes', 'Relatório de mercado em progresso', 'Dados coletados: 3 fontes'],
    tasksCompleted: 38,
    tasksPending: 2,
  },
  {
    id: 'agent-copy1',
    name: 'Beatriz Carvalho',
    role: 'Copywriter Sênior',
    departmentId: 'copywriting',
    status: 'working',
    currentMission: 'VSL para Clínica Estética Renata — São Paulo',
    lastActivity: ['Escrevendo VSL para clínica', 'Email sequence em produção', 'Hook A/B teste criado'],
    tasksCompleted: 24,
    tasksPending: 3,
  },
  {
    id: 'agent-copy2',
    name: 'Rafael Nunes',
    role: 'Copywriter de Roteiros',
    departmentId: 'copywriting',
    status: 'thinking',
    currentMission: 'Roteiro para webinário Q4',
    lastActivity: ['Pesquisando estrutura de webinário', 'Analisando transcrições de vendas'],
    tasksCompleted: 17,
    tasksPending: 2,
  },
  {
    id: 'agent-creative',
    name: 'Camila Dias',
    role: 'Diretora de Criação',
    departmentId: 'creative',
    status: 'working',
    currentMission: 'Identidade visual completa — aguardando aprovação',
    lastActivity: ['Identidade visual pronta', 'Aguardando aprovação cliente', '3 variantes criadas'],
    tasksCompleted: 29,
    tasksPending: 1,
  },
  {
    id: 'agent-perf',
    name: 'Lucas Rodrigues',
    role: 'Gestor de Tráfego',
    departmentId: 'performance',
    status: 'meeting',
    currentMission: 'Otimização Meta Ads — ROAS 4.2x',
    lastActivity: ['ROAS 4.2x em Meta Ads', 'Google Ads CPL reduzido 18%', 'TikTok Ads testando'],
    tasksCompleted: 31,
    tasksPending: 4,
  },
  {
    id: 'agent-web',
    name: 'Pedro Alves',
    role: 'Desenvolvedor Full-Stack',
    departmentId: 'web-dev',
    status: 'working',
    currentMission: 'Integração API de pagamentos',
    lastActivity: ['Landing page publicada', 'Funil de vendas integrado', 'Bug em checkout corrigido'],
    tasksCompleted: 19,
    tasksPending: 2,
  },
  {
    id: 'agent-data',
    name: 'Ana Souza',
    role: 'Analista de Dados',
    departmentId: 'data-analytics',
    status: 'working',
    currentMission: 'Dashboard Q4 — métricas de conversão',
    lastActivity: ['Dashboard Q4 em construção', 'Dados de conversão processados', 'Relatório semanal gerado'],
    tasksCompleted: 22,
    tasksPending: 2,
  },
  {
    id: 'agent-sales',
    name: 'Rodrigo Castro',
    role: 'Head de Vendas',
    departmentId: 'sales',
    status: 'idle',
    lastActivity: ['Pipeline atualizado — 5 leads', 'Follow-up Clínica Lumina', 'Meta mensal 87% atingida'],
    tasksCompleted: 7,
    tasksPending: 5,
  },
  {
    id: 'agent-strat',
    name: 'Felipe Costa',
    role: 'Estrategista de Growth',
    departmentId: 'strategy',
    status: 'thinking',
    currentMission: 'Estratégia de expansão para 3 novos nichos',
    lastActivity: ['Plano Q1 2026 finalizado', 'OKRs do trimestre definidos', 'Análise de mercado concluída'],
    tasksCompleted: 8,
    tasksPending: 1,
  },
  {
    id: 'agent-mc',
    name: 'Julia Ferreira',
    role: 'Coord. de Operações',
    departmentId: 'mission-control',
    status: 'working',
    currentMission: 'Monitorando 7 missões ativas',
    lastActivity: ['7 missões em andamento', 'Alerta: aprovação necessária', 'KPIs atualizados'],
    tasksCompleted: 44,
    tasksPending: 7,
  },
]

type StoreListener = (update: { type: string; agents: Agent[] }) => void

class AgentStore {
  private agents = new Map<string, Agent>()
  private subscribers = new Set<StoreListener>()

  constructor() {
    for (const agent of INITIAL_AGENTS) {
      this.agents.set(agent.id, agent)
    }
  }

  getAll(): Agent[] {
    return Array.from(this.agents.values())
  }

  get(id: string): Agent | undefined {
    return this.agents.get(id)
  }

  updateStatus(id: string, status: AgentStatus, currentMission?: string): boolean {
    const agent = this.agents.get(id)
    if (!agent) return false

    const activity = currentMission
      ? `Status → ${status}: ${currentMission}`
      : `Status → ${status}`

    this.agents.set(id, {
      ...agent,
      status,
      currentMission: currentMission !== undefined ? currentMission : agent.currentMission,
      lastActivity: [activity, ...agent.lastActivity.slice(0, 4)],
    })

    this.broadcast()
    return true
  }

  subscribe(cb: StoreListener): () => void {
    this.subscribers.add(cb)
    return () => this.subscribers.delete(cb)
  }

  private broadcast(): void {
    const update = { type: 'update', agents: this.getAll() }
    this.subscribers.forEach((cb) => cb(update))
  }
}

const STORE_VERSION = 'v2-lotus-hq'

declare global {
  // eslint-disable-next-line no-var
  var __agentStore: AgentStore | undefined
  // eslint-disable-next-line no-var
  var __agentStoreVersion: string | undefined
}

export function getAgentStore(): AgentStore {
  if (!global.__agentStore || global.__agentStoreVersion !== STORE_VERSION) {
    global.__agentStore = new AgentStore()
    global.__agentStoreVersion = STORE_VERSION
  }
  return global.__agentStore
}
