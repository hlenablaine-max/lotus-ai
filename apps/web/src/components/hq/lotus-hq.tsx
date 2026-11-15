"use client"

import { useState, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  X, ZoomIn, ZoomOut, Users, Activity, CheckCircle,
  Clock, Zap, ChevronRight, Radio, Building2
} from "lucide-react"
import { cn } from "@/lib/utils"

// ─── Types ────────────────────────────────────────────────────────────────────

type AgentStatus = 'idle' | 'working' | 'meeting' | 'waiting_approval' | 'error' | 'offline'

interface Agent {
  id: string
  name: string
  role: string
  deptId: string
  status: AgentStatus
  currentMission?: string
  hairColor: string
  skinTone: string
  recentActivity: string[]
  tasksCompleted: number
  tasksPending: number
}

interface Department {
  id: string
  name: string
  shortName: string
  color: string
  x: number
  y: number
  width: number
  height: number
  description: string
  agentBaseX: number
  agentBaseY: number
}

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CFG: Record<AgentStatus, { color: string; label: string; pulse: boolean }> = {
  idle:             { color: '#6B7280', label: 'Aguardando',    pulse: false },
  working:          { color: '#3B82F6', label: 'Trabalhando',   pulse: true  },
  meeting:          { color: '#8B5CF6', label: 'Em Reunião',    pulse: true  },
  waiting_approval: { color: '#F59E0B', label: 'Ag. Aprovação', pulse: true  },
  error:            { color: '#EF4444', label: 'Erro',          pulse: true  },
  offline:          { color: '#1F2937', label: 'Offline',       pulse: false },
}

// ─── Floor layout (1600 × 1100 virtual canvas) ───────────────────────────────

const DEPARTMENTS: Department[] = [
  { id: 'ceo',         name: 'CEO Office',            shortName: 'CEO',      color: '#D97706', x: 0,    y: 0,   width: 480, height: 310, description: 'Sede executiva — Root Master comanda tudo aqui', agentBaseX: 230, agentBaseY: 190 },
  { id: 'meeting',     name: 'Sala de Reunião',        shortName: 'REUNIÃO',  color: '#7C3AED', x: 500,  y: 0,   width: 340, height: 310, description: 'Encontros estratégicos e missões em equipe',    agentBaseX: 670, agentBaseY: 190 },
  { id: 'mission',     name: 'Mission Control',        shortName: 'MISSÃO',   color: '#DC2626', x: 860,  y: 0,   width: 340, height: 310, description: 'Monitoramento operacional de todas as missões', agentBaseX: 1000, agentBaseY: 190 },
  { id: 'intel',       name: 'Business Intelligence',  shortName: 'B.I.',     color: '#2563EB', x: 0,    y: 330, width: 390, height: 250, description: 'Pesquisa de mercado e análise competitiva',     agentBaseX: 75,  agentBaseY: 490 },
  { id: 'strategy',    name: 'Strategy',               shortName: 'STRATEGY', color: '#059669', x: 410,  y: 330, width: 390, height: 250, description: 'Planejamento estratégico e OKRs',              agentBaseX: 485, agentBaseY: 490 },
  { id: 'copy',        name: 'Copywriting',            shortName: 'COPY',     color: '#D97706', x: 820,  y: 330, width: 390, height: 250, description: 'Direct response copy, VSL e email sequences',  agentBaseX: 895, agentBaseY: 490 },
  { id: 'creative',    name: 'Creative Studio',        shortName: 'CREATIVE', color: '#DB2777', x: 1210, y: 330, width: 390, height: 250, description: 'Design, identidade visual e criativos',         agentBaseX: 1285, agentBaseY: 490 },
  { id: 'performance', name: 'Performance Marketing',  shortName: 'PERFMKT',  color: '#EA580C', x: 0,    y: 600, width: 390, height: 250, description: 'Tráfego pago, Meta Ads, Google Ads, TikTok',   agentBaseX: 75,  agentBaseY: 760 },
  { id: 'webdev',      name: 'Web Dev & Funnels',      shortName: 'WEBDEV',   color: '#0891B2', x: 410,  y: 600, width: 390, height: 250, description: 'Sites, landing pages e funis de vendas',       agentBaseX: 485, agentBaseY: 760 },
  { id: 'sales',       name: 'Sales & CS',             shortName: 'SALES',    color: '#65A30D', x: 820,  y: 600, width: 390, height: 250, description: 'Vendas, CRM e sucesso do cliente',             agentBaseX: 895, agentBaseY: 760 },
  { id: 'data',        name: 'Data & Analytics',       shortName: 'DATA',     color: '#4F46E5', x: 1210, y: 600, width: 390, height: 250, description: 'Dados, dashboards e relatórios',               agentBaseX: 1285, agentBaseY: 760 },
  { id: 'health',      name: 'Healthcare Growth',      shortName: 'HEALTH',   color: '#0D9488', x: 605,  y: 870, width: 390, height: 220, description: 'Especialização em saúde — clínicas e médicos',  agentBaseX: 680, agentBaseY: 1020 },
]

const MEETING_SEATS = [
  { x: 572, y: 95  }, { x: 630, y: 85  }, { x: 690, y: 95  },
  { x: 572, y: 215 }, { x: 630, y: 230 }, { x: 690, y: 215 },
]

// ─── Demo agents (initial state — overwritten by SSE) ────────────────────────

const DEMO_AGENTS: Agent[] = [
  { id: 'root-master',   name: 'Root Master',    role: 'CEO & Orquestrador',          deptId: 'ceo',         status: 'idle',             hairColor: '#E5E7EB', skinTone: '#FBBF24', recentActivity: ['Sistema inicializado', 'Aguardando instruções'],            tasksCompleted: 0,  tasksPending: 0 },
  { id: 'intel-ana',     name: 'Ana Intel',       role: 'BI Analyst',                  deptId: 'intel',       status: 'working',          currentMission: 'Análise competitiva — saúde SP', hairColor: '#6D28D9', skinTone: '#E5A07A', recentActivity: ['Analisando 42 concorrentes', 'Relatório em progresso'], tasksCompleted: 12, tasksPending: 2 },
  { id: 'strategy-leo',  name: 'Leo Strategy',   role: 'Strategic Planner',           deptId: 'strategy',    status: 'idle',             hairColor: '#1E3A5F', skinTone: '#C68642', recentActivity: ['Plano Q1 finalizado'],                                       tasksCompleted: 8,  tasksPending: 1 },
  { id: 'copy-maya',     name: 'Maya Copy',       role: 'Direct Response Writer',      deptId: 'copy',        status: 'working',          currentMission: 'VSL para Clínica Estética Renata', hairColor: '#B45309', skinTone: '#FBBF24', recentActivity: ['Escrevendo VSL', 'Email sequence em produção'],    tasksCompleted: 24, tasksPending: 3 },
  { id: 'creative-kai',  name: 'Kai Creative',   role: 'Creative Director',           deptId: 'creative',    status: 'waiting_approval', currentMission: 'Identidade visual — aguardando aprovação', hairColor: '#D1D5DB', skinTone: '#E5A07A', recentActivity: ['ID visual pronta', 'Aguardando cliente'],           tasksCompleted: 15, tasksPending: 1 },
  { id: 'perf-zara',     name: 'Zara Perf',       role: 'Performance Marketing Lead',  deptId: 'performance', status: 'working',          currentMission: 'Meta Ads — ROAS 4.2x', hairColor: '#7C3AED', skinTone: '#C68642', recentActivity: ['ROAS 4.2x', 'CPL reduzido 18%'],                             tasksCompleted: 31, tasksPending: 4 },
  { id: 'web-noah',      name: 'Noah Web',        role: 'Full-Stack Developer',        deptId: 'webdev',      status: 'idle',             hairColor: '#1E3A5F', skinTone: '#8D5524', recentActivity: ['Landing page publicada'],                                    tasksCompleted: 19, tasksPending: 2 },
  { id: 'sales-luna',    name: 'Luna Sales',      role: 'Sales Dev Rep',               deptId: 'sales',       status: 'idle',             hairColor: '#B45309', skinTone: '#FBBF24', recentActivity: ['Pipeline atualizado — 5 leads'],                             tasksCompleted: 7,  tasksPending: 5 },
  { id: 'data-rex',      name: 'Rex Data',        role: 'Data Analyst',                deptId: 'data',        status: 'working',          currentMission: 'Dashboard Q4 — conversões', hairColor: '#1E293B', skinTone: '#E5A07A', recentActivity: ['Dashboard em construção', 'Dados processados'],            tasksCompleted: 22, tasksPending: 2 },
  { id: 'health-sofia',  name: 'Sofia Health',   role: 'Healthcare Specialist',       deptId: 'health',      status: 'idle',             hairColor: '#7C3AED', skinTone: '#C68642', recentActivity: ['Auditando perfil clínica'],                                  tasksCompleted: 9,  tasksPending: 3 },
  { id: 'mission-ctrl',  name: 'MC Controller',  role: 'Mission Controller',          deptId: 'mission',     status: 'working',          currentMission: 'Monitorando 7 missões ativas', hairColor: '#E5E7EB', skinTone: '#FBBF24', recentActivity: ['7 missões ativas', 'Alerta: aprovação pendente'],         tasksCompleted: 44, tasksPending: 7 },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getDeptColor(deptId: string): string {
  return DEPARTMENTS.find((d) => d.id === deptId)?.color ?? '#6B7280'
}

function getAgentPosition(agent: Agent, allAgents: Agent[]): { x: number; y: number } {
  if (agent.status === 'meeting') {
    const inMeeting = allAgents.filter((a) => a.status === 'meeting')
    const idx = inMeeting.findIndex((a) => a.id === agent.id)
    return MEETING_SEATS[Math.min(idx, MEETING_SEATS.length - 1)] ?? MEETING_SEATS[0]
  }
  const dept = DEPARTMENTS.find((d) => d.id === agent.deptId)
  return dept ? { x: dept.agentBaseX, y: dept.agentBaseY } : { x: 100, y: 100 }
}

// ─── Character Sprite (40×64 viewBox, centered at x=20) ──────────────────────

function CharacterSprite({
  agent,
  deptColor,
  scale = 1,
}: {
  agent: Agent
  deptColor: string
  scale?: number
}) {
  const sc = STATUS_CFG[agent.status]
  const firstName = agent.name.split(' ')[0]

  return (
    <svg
      width={40 * scale}
      height={64 * scale}
      viewBox="0 0 40 64"
      style={{ overflow: 'visible' }}
    >
      {/* Status pulse ring */}
      {sc.pulse && (
        <circle cx="20" cy="6" r="8" fill={sc.color} opacity="0.15">
          <animate attributeName="r" values="4;10;4" dur="2s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.3;0;0.3" dur="2s" repeatCount="indefinite" />
        </circle>
      )}

      {/* Status dot */}
      <circle cx="20" cy="6" r="4" fill={sc.color} />

      {/* Hair */}
      <ellipse cx="20" cy="17" rx="12" ry="10" fill={agent.hairColor} />

      {/* Head */}
      <circle cx="20" cy="22" r="11" fill={agent.skinTone} />

      {/* Eyes */}
      <circle cx="16" cy="22" r="1.8" fill="#1E293B" />
      <circle cx="24" cy="22" r="1.8" fill="#1E293B" />

      {/* Eye shine */}
      <circle cx="17" cy="21.2" r="0.6" fill="white" />
      <circle cx="25" cy="21.2" r="0.6" fill="white" />

      {/* Mouth */}
      <path
        d={agent.status === 'error' ? 'M 15 27 Q 20 25 25 27' : 'M 15 27 Q 20 30 25 27'}
        stroke="#1E293B"
        strokeWidth="1"
        fill="none"
        strokeLinecap="round"
      />

      {/* Body / Shirt */}
      <rect x="9" y="35" width="22" height="16" rx="6" fill={deptColor} />

      {/* Collar */}
      <line x1="20" y1="35" x2="18.5" y2="40" stroke="white" strokeWidth="1.2" opacity="0.7" strokeLinecap="round" />
      <line x1="20" y1="35" x2="21.5" y2="40" stroke="white" strokeWidth="1.2" opacity="0.7" strokeLinecap="round" />

      {/* Arms */}
      <rect
        x="2"
        y="36"
        width="6"
        height="12"
        rx="3"
        fill={deptColor}
        transform={agent.status === 'working' ? 'rotate(-15 5 36)' : ''}
      />
      <rect
        x="32"
        y="36"
        width="6"
        height="12"
        rx="3"
        fill={deptColor}
        transform={agent.status === 'working' ? 'rotate(15 35 36)' : ''}
      />

      {/* Pants */}
      <rect x="10" y="51" width="8" height="10" rx="3" fill="#1E293B" />
      <rect x="22" y="51" width="8" height="10" rx="3" fill="#1E293B" />

      {/* Shoes */}
      <rect x="9"  y="59" width="10" height="4" rx="2" fill="#374151" />
      <rect x="21" y="59" width="10" height="4" rx="2" fill="#374151" />

      {/* Name tag */}
      <text
        x="20"
        y="78"
        textAnchor="middle"
        fill="white"
        fontSize="7"
        fontWeight="700"
        fontFamily="ui-monospace, monospace"
        opacity="0.95"
      >
        {firstName}
      </text>
    </svg>
  )
}

// ─── Room SVG: background + furniture ────────────────────────────────────────

function RoomSVG({ dept, isActive }: { dept: Department; isActive: boolean }) {
  const c = dept.color
  return (
    <g>
      {/* Floor fill */}
      <rect
        x={dept.x + 1} y={dept.y + 1}
        width={dept.width - 2} height={dept.height - 2}
        rx="10"
        fill={`${c}08`}
        className={isActive ? 'opacity-100' : ''}
      />

      {/* Top accent bar */}
      <rect
        x={dept.x + 1} y={dept.y + 1}
        width={dept.width - 2} height="4"
        rx="10"
        fill={c}
        opacity="0.6"
      />

      {/* Border */}
      <rect
        x={dept.x + 1} y={dept.y + 1}
        width={dept.width - 2} height={dept.height - 2}
        rx="10"
        fill="none"
        stroke={c}
        strokeWidth="1"
        strokeOpacity="0.3"
      />

      {/* Dept label */}
      <text
        x={dept.x + 14} y={dept.y + 23}
        fill={c}
        fontSize="8"
        fontWeight="800"
        letterSpacing="2.5"
        opacity="0.9"
        fontFamily="ui-monospace, monospace"
      >
        {dept.shortName}
      </text>

      {/* Furniture: desk + monitor (skip for meeting room) */}
      {dept.id !== 'meeting' && (
        <g transform={`translate(${dept.x + dept.width / 2 - 55}, ${dept.y + 40})`}>
          {/* Desk surface */}
          <rect x="0" y="30" width="110" height="12" rx="3" fill={c} opacity="0.18" />
          {/* Desk legs */}
          <rect x="4"   y="42" width="6" height="20" rx="2" fill={c} opacity="0.12" />
          <rect x="100" y="42" width="6" height="20" rx="2" fill={c} opacity="0.12" />
          {/* Monitor */}
          <rect x="25" y="2" width="60" height="38" rx="4" fill="#0A0F1E" />
          <rect x="27" y="4" width="56" height="32" rx="3" fill={`${c}22`} />
          {/* Screen glow lines */}
          <rect x="31" y="10" width="30" height="2" rx="1" fill={c} opacity="0.3" />
          <rect x="31" y="15" width="20" height="2" rx="1" fill={c} opacity="0.2" />
          <rect x="31" y="20" width="25" height="2" rx="1" fill={c} opacity="0.2" />
          <rect x="31" y="25" width="18" height="2" rx="1" fill={c} opacity="0.15" />
          {/* Monitor stand */}
          <rect x="52" y="40" width="6" height="8"  rx="1" fill={c} opacity="0.2" />
          <rect x="44" y="47" width="22" height="4" rx="2" fill={c} opacity="0.2" />
          {/* Keyboard */}
          <rect x="20" y="33" width="30" height="8" rx="2" fill="#1E293B" opacity="0.6" />
          {/* Coffee */}
          <rect x="92" y="20" width="12" height="14" rx="4" fill={c} opacity="0.25" />
        </g>
      )}

      {/* CEO Office extra: second visitor chairs */}
      {dept.id === 'ceo' && (
        <>
          <rect x={dept.x + 30}  y={dept.y + 220} width="50" height="40" rx="8" fill={c} opacity="0.1" />
          <rect x={dept.x + 100} y={dept.y + 220} width="50" height="40" rx="8" fill={c} opacity="0.1" />
          {/* Bookshelf right wall */}
          <rect x={dept.x + dept.width - 60} y={dept.y + 30} width="45" height={dept.height - 50} rx="4" fill={c} opacity="0.08" />
          <rect x={dept.x + dept.width - 58} y={dept.y + 50} width="40" height="6" rx="1" fill={c} opacity="0.3" />
          <rect x={dept.x + dept.width - 58} y={dept.y + 70} width="40" height="6" rx="1" fill={c} opacity="0.25" />
          <rect x={dept.x + dept.width - 58} y={dept.y + 90} width="40" height="6" rx="1" fill={c} opacity="0.2" />
        </>
      )}

      {/* Mission Control extra: big screens */}
      {dept.id === 'mission' && (
        <>
          <rect x={dept.x + 20} y={dept.y + 30} width={dept.width - 40} height="80" rx="6" fill="#0A0F1E" />
          <rect x={dept.x + 22} y={dept.y + 32} width={dept.width - 44} height="76" rx="5" fill={`${c}18`} />
          {[0,1,2,3].map(i => (
            <g key={i}>
              <rect x={dept.x + 28 + i * 73} y={dept.y + 38} width="62" height="62" rx="3" fill="#060A14" />
              <rect x={dept.x + 30 + i * 73} y={dept.y + 40} width="58" height="56" rx="2" fill={`${c}20`} />
              <rect x={dept.x + 34 + i * 73} y={dept.y + 50} width="25" height="2" rx="1" fill={c} opacity="0.4" />
              <rect x={dept.x + 34 + i * 73} y={dept.y + 55} width="20" height="2" rx="1" fill={c} opacity="0.3" />
              <rect x={dept.x + 34 + i * 73} y={dept.y + 60} width="30" height="2" rx="1" fill={c} opacity="0.2" />
            </g>
          ))}
        </>
      )}

      {/* Meeting Room: conference table */}
      {dept.id === 'meeting' && (
        <>
          {/* Table oval */}
          <ellipse
            cx={dept.x + dept.width / 2}
            cy={dept.y + dept.height / 2}
            rx="110"
            ry="60"
            fill={c}
            opacity="0.08"
          />
          <ellipse
            cx={dept.x + dept.width / 2}
            cy={dept.y + dept.height / 2}
            rx="110"
            ry="60"
            fill="none"
            stroke={c}
            strokeWidth="1.5"
            opacity="0.3"
          />
          {/* Chair positions (circles) */}
          {[
            [dept.x + 560, dept.y + 100],
            [dept.x + 610, dept.y + 90],
            [dept.x + 660, dept.y + 100],
            [dept.x + 560, dept.y + 220],
            [dept.x + 610, dept.y + 230],
            [dept.x + 660, dept.y + 220],
          ].map(([cx, cy], i) => (
            <circle key={i} cx={cx} cy={cy} r="14" fill={c} opacity="0.08" stroke={c} strokeWidth="0.5" strokeOpacity="0.3" />
          ))}
          {/* Screen */}
          <rect x={dept.x + 20} y={dept.y + 100} width="80" height="110" rx="4" fill="#0A0F1E" />
          <rect x={dept.x + 22} y={dept.y + 102} width="76" height="106" rx="3" fill={`${c}20`} />
          <rect x={dept.x + 26} y={dept.y + 115} width="30" height="2" rx="1" fill={c} opacity="0.4" />
          <rect x={dept.x + 26} y={dept.y + 122} width="22" height="2" rx="1" fill={c} opacity="0.3" />
          <text
            x={dept.x + 60}
            y={dept.y + 145}
            textAnchor="middle"
            fill={c}
            fontSize="11"
            fontWeight="700"
            fontFamily="ui-monospace, monospace"
            opacity="0.5"
          >
            LOTUS
          </text>
        </>
      )}

      {/* Hover glow (shown when active) */}
      {isActive && (
        <rect
          x={dept.x} y={dept.y}
          width={dept.width} height={dept.height}
          rx="11"
          fill="none"
          stroke={c}
          strokeWidth="2"
          opacity="0.5"
          filter={`drop-shadow(0 0 8px ${c}60)`}
        />
      )}
    </g>
  )
}

// ─── Agent Detail Panel ───────────────────────────────────────────────────────

function AgentPanel({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  const dept = DEPARTMENTS.find((d) => d.id === agent.deptId)
  const sc = STATUS_CFG[agent.status]
  const deptColor = dept?.color ?? '#6B7280'

  return (
    <motion.div
      initial={{ x: 420, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 420, opacity: 0 }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="absolute right-0 top-0 bottom-0 w-[380px] bg-[#07080F] border-l border-white/10 flex flex-col z-30 shadow-2xl"
    >
      {/* Header */}
      <div
        className="p-5 border-b border-white/10 flex items-start justify-between"
        style={{ borderTopColor: `${deptColor}50` }}
      >
        <div className="flex items-center gap-4">
          {/* Avatar */}
          <div
            className="w-16 h-20 flex items-center justify-center rounded-xl border"
            style={{ backgroundColor: `${deptColor}10`, borderColor: `${deptColor}30` }}
          >
            <CharacterSprite agent={agent} deptColor={deptColor} scale={1.5} />
          </div>
          <div>
            <div className="text-xs font-mono tracking-widest mb-1" style={{ color: `${deptColor}` }}>
              {dept?.shortName}
            </div>
            <h3 className="text-white font-bold text-lg leading-tight">{agent.name}</h3>
            <p className="text-white/50 text-xs mt-0.5">{agent.role}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-white/40 hover:text-white/80 transition-colors mt-1"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Status badge */}
      <div className="px-5 pt-4 pb-3">
        <div
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold"
          style={{
            color: sc.color,
            borderColor: `${sc.color}40`,
            backgroundColor: `${sc.color}10`,
          }}
        >
          {sc.pulse && (
            <span
              className="w-2 h-2 rounded-full animate-pulse"
              style={{ backgroundColor: sc.color }}
            />
          )}
          {!sc.pulse && (
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: sc.color }}
            />
          )}
          {sc.label}
        </div>
      </div>

      {/* Current mission */}
      {agent.currentMission && (
        <div className="mx-5 mb-4 p-3 rounded-xl border" style={{ borderColor: `${deptColor}25`, backgroundColor: `${deptColor}08` }}>
          <div className="flex items-center gap-2 mb-1.5">
            <Zap className="w-3 h-3" style={{ color: deptColor }} />
            <span className="text-[10px] font-mono tracking-widest uppercase" style={{ color: `${deptColor}80` }}>
              Missão Atual
            </span>
          </div>
          <p className="text-white/80 text-sm leading-snug">{agent.currentMission}</p>
        </div>
      )}

      {/* Stats */}
      <div className="px-5 pb-4 grid grid-cols-2 gap-3">
        <div className="bg-white/5 rounded-xl p-3 border border-white/8">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[10px] text-white/50 uppercase tracking-wide">Concluídas</span>
          </div>
          <span className="text-2xl font-bold text-white">{agent.tasksCompleted}</span>
        </div>
        <div className="bg-white/5 rounded-xl p-3 border border-white/8">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-[10px] text-white/50 uppercase tracking-wide">Pendentes</span>
          </div>
          <span className="text-2xl font-bold text-white">{agent.tasksPending}</span>
        </div>
      </div>

      {/* Activity feed */}
      <div className="flex-1 overflow-y-auto px-5 pb-4">
        <div className="text-[10px] font-mono tracking-widest text-white/30 mb-3 uppercase">
          Atividade Recente
        </div>
        <div className="space-y-2">
          {agent.recentActivity.map((item, i) => (
            <div
              key={i}
              className="flex items-start gap-2.5 text-sm text-white/60 py-2 border-b border-white/5"
            >
              <ChevronRight className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: `${deptColor}70` }} />
              <span className="leading-snug">{item}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Quick actions */}
      <div className="p-5 border-t border-white/10 space-y-2">
        <DemoStatusButton
          agentId={agent.id}
          label="Enviar para Reunião"
          newStatus="meeting"
          color={deptColor}
        />
        <DemoStatusButton
          agentId={agent.id}
          label="Marcar como Trabalhando"
          newStatus="working"
          color={deptColor}
        />
      </div>
    </motion.div>
  )
}

// Quick action button — calls PATCH /api/agents/status to demo state changes
function DemoStatusButton({
  agentId, label, newStatus, color,
}: {
  agentId: string
  label: string
  newStatus: AgentStatus
  color: string
}) {
  const [loading, setLoading] = useState(false)

  const handleClick = useCallback(async () => {
    setLoading(true)
    try {
      await fetch('/api/agents/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: agentId, status: newStatus }),
      })
    } finally {
      setLoading(false)
    }
  }, [agentId, newStatus])

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="w-full text-left px-4 py-2.5 rounded-xl border text-xs font-semibold transition-all duration-150 disabled:opacity-50"
      style={{ borderColor: `${color}30`, color: `${color}`, backgroundColor: `${color}10` }}
    >
      {loading ? 'Atualizando...' : label}
    </button>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function LotusHQ() {
  const [agents, setAgents] = useState<Agent[]>(DEMO_AGENTS)
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)
  const [zoom, setZoom] = useState(0.58)
  const [hoveredDept, setHoveredDept] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)

  // SSE subscription
  useEffect(() => {
    const es = new EventSource('/api/agents/events')

    es.onopen = () => setConnected(true)
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as { type: string; agents?: Agent[] }
        if (data.type === 'init' || data.type === 'update') {
          if (data.agents) {
            setAgents(data.agents)
            // Refresh selected agent data
            setSelectedAgent(prev =>
              prev ? (data.agents!.find(a => a.id === prev.id) ?? null) : null
            )
          }
        }
      } catch {
        // ignore parse errors
      }
    }
    es.onerror = () => setConnected(false)

    return () => {
      es.close()
      setConnected(false)
    }
  }, [])

  const totalWorking = agents.filter((a) => a.status === 'working').length
  const totalMeeting = agents.filter((a) => a.status === 'meeting').length
  const totalPending = agents.filter((a) => a.status === 'waiting_approval').length

  return (
    <div className="flex flex-col h-full bg-[#030507] relative overflow-hidden">
      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-white/8 flex-shrink-0 z-10">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-primary" />
            <span className="text-white font-bold tracking-tight">LOTUS HQ</span>
            <span className="text-white/30 text-xs font-mono">· Virtual Office</span>
          </div>

          {/* Live stats */}
          <div className="flex items-center gap-3 pl-4 border-l border-white/10">
            <span className="flex items-center gap-1.5 text-xs text-white/50">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
              <span className="text-blue-400 font-semibold">{totalWorking}</span> trabalhando
            </span>
            {totalMeeting > 0 && (
              <span className="flex items-center gap-1.5 text-xs text-white/50">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" />
                <span className="text-purple-400 font-semibold">{totalMeeting}</span> em reunião
              </span>
            )}
            {totalPending > 0 && (
              <span className="flex items-center gap-1.5 text-xs text-white/50">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                <span className="text-amber-400 font-semibold">{totalPending}</span> aguardando
              </span>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          {/* SSE status */}
          <div className={cn("flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border",
            connected
              ? "text-emerald-400 border-emerald-400/30 bg-emerald-400/10"
              : "text-white/30 border-white/10"
          )}>
            <Radio className="w-3 h-3" />
            <span>{connected ? 'Live' : 'Connecting…'}</span>
          </div>

          {/* Zoom */}
          <div className="flex items-center gap-1 bg-white/5 rounded-lg border border-white/10 p-1">
            <button
              onClick={() => setZoom((z) => Math.max(0.3, z - 0.08))}
              className="w-6 h-6 flex items-center justify-center text-white/50 hover:text-white transition-colors"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[10px] text-white/40 font-mono w-10 text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => setZoom((z) => Math.min(1.2, z + 0.08))}
              className="w-6 h-6 flex items-center justify-center text-white/50 hover:text-white transition-colors"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            onClick={() => setZoom(0.58)}
            className="text-[10px] px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-white/40 hover:text-white/70 transition-colors font-mono"
          >
            Reset
          </button>
        </div>
      </div>

      {/* ── Floor viewport ── */}
      <div
        className="flex-1 overflow-auto"
        style={{
          background: 'radial-gradient(ellipse at 50% 20%, #0D1020 0%, #030507 70%)',
        }}
      >
        {/* Perspective stage */}
        <div
          className="flex items-start justify-center min-h-full pt-8 pb-16"
          style={{ minWidth: 1600 * zoom + 80 }}
        >
          <div
            style={{
              transform: `perspective(2000px) rotateX(18deg) scale(${zoom})`,
              transformOrigin: '50% 0%',
              transformStyle: 'flat',
              position: 'relative',
              width: 1600,
              height: 1100,
            }}
          >
            {/* Floor SVG */}
            <svg
              width="1600"
              height="1100"
              viewBox="0 0 1600 1100"
              style={{ position: 'absolute', top: 0, left: 0 }}
            >
              <defs>
                {/* Subtle grid */}
                <pattern id="hq-grid" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.025)" strokeWidth="0.5" />
                </pattern>
              </defs>

              {/* Background */}
              <rect width="1600" height="1100" fill="transparent" />
              <rect width="1600" height="1100" fill="url(#hq-grid)" />

              {/* Dept rooms */}
              {DEPARTMENTS.map((dept) => (
                <RoomSVG
                  key={dept.id}
                  dept={dept}
                  isActive={hoveredDept === dept.id}
                />
              ))}
            </svg>

            {/* Characters HTML layer (absolutely positioned on top of SVG) */}
            {agents.map((agent) => {
              const pos = getAgentPosition(agent, agents)
              const deptColor = getDeptColor(agent.deptId)
              const isSelected = selectedAgent?.id === agent.id

              return (
                <motion.div
                  key={agent.id}
                  animate={{ left: pos.x - 20, top: pos.y - 32 }}
                  transition={{ type: 'spring', damping: 20, stiffness: 80, mass: 1.2 }}
                  style={{ position: 'absolute', cursor: 'pointer', zIndex: isSelected ? 10 : 2 }}
                  whileHover={{ scale: 1.15, zIndex: 20 }}
                  onClick={() => setSelectedAgent(agent)}
                  onHoverStart={() => setHoveredDept(agent.deptId)}
                  onHoverEnd={() => setHoveredDept(null)}
                >
                  {/* Selection ring */}
                  {isSelected && (
                    <div
                      className="absolute -inset-2 rounded-full border-2 animate-pulse"
                      style={{ borderColor: deptColor }}
                    />
                  )}
                  <CharacterSprite agent={agent} deptColor={deptColor} />
                </motion.div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Dept tooltip (bottom-left, when hovering a dept) ── */}
      <AnimatePresence>
        {hoveredDept && (
          <motion.div
            key={hoveredDept}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="absolute bottom-5 left-5 bg-[#0D1020] border border-white/15 rounded-xl px-4 py-3 shadow-xl z-20"
          >
            {(() => {
              const dept = DEPARTMENTS.find((d) => d.id === hoveredDept)
              if (!dept) return null
              return (
                <div className="flex items-center gap-3">
                  <div className="w-2 h-8 rounded-full" style={{ backgroundColor: dept.color }} />
                  <div>
                    <div className="text-white font-semibold text-sm">{dept.name}</div>
                    <div className="text-white/40 text-xs">{dept.description}</div>
                  </div>
                </div>
              )
            })()}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Legend (bottom-right) ── */}
      <div className="absolute bottom-5 right-5 flex items-center gap-3 z-20">
        {(Object.entries(STATUS_CFG) as [AgentStatus, typeof STATUS_CFG[AgentStatus]][]).map(([status, cfg]) => (
          <div key={status} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: cfg.color }} />
            <span className="text-[10px] text-white/35 font-mono">{cfg.label}</span>
          </div>
        ))}
      </div>

      {/* ── Agent Detail Panel ── */}
      <AnimatePresence>
        {selectedAgent && (
          <AgentPanel
            key={selectedAgent.id}
            agent={selectedAgent}
            onClose={() => setSelectedAgent(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
