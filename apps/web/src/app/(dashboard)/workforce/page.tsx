"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Building2, Zap, CheckCircle2, AlertCircle, RefreshCw, Users
} from "lucide-react";
import { cn } from "@/lib/utils";

type AgentStatus = 'idle' | 'working' | 'thinking' | 'waiting_approval' | 'offline';

interface Agent {
  id: string;
  name: string;
  role: string;
  departmentId: string;
  specialty?: string;
  status: AgentStatus;
  tasksCompleted: number;
  tasksPending: number;
  currentTask: string | null;
  currentMission: string | null;
  lastActivity: string[];
}

const DEPT_LABELS: Record<string, { label: string; color: string }> = {
  'ceo':             { label: 'Diretoria',             color: 'text-purple-400 bg-purple-400/10 border-purple-400/20' },
  'root-master':     { label: 'Root Master',           color: 'text-purple-400 bg-purple-400/10 border-purple-400/20' },
  'mission-control': { label: 'Central de Missões',    color: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20' },
  'bi':              { label: 'Inteligência de Negócio', color: 'text-blue-400 bg-blue-400/10 border-blue-400/20' },
  'bto':             { label: 'Transformação de Negócio', color: 'text-sky-400 bg-sky-400/10 border-sky-400/20' },
  'copywriting':     { label: 'Textos e Copy',         color: 'text-amber-400 bg-amber-400/10 border-amber-400/20' },
  'creative':        { label: 'Estúdio de Criação',    color: 'text-pink-400 bg-pink-400/10 border-pink-400/20' },
  'performance':     { label: 'Tráfego e Performance', color: 'text-green-400 bg-green-400/10 border-green-400/20' },
  'web-dev':         { label: 'Sites e Funis',         color: 'text-cyan-400 bg-cyan-400/10 border-cyan-400/20' },
  'data-analytics':  { label: 'Dados e Métricas',      color: 'text-indigo-400 bg-indigo-400/10 border-indigo-400/20' },
  'sales':           { label: 'Vendas e Sucesso do Cliente', color: 'text-orange-400 bg-orange-400/10 border-orange-400/20' },
  'strategy':        { label: 'Estratégia',            color: 'text-teal-400 bg-teal-400/10 border-teal-400/20' },
};

// Status derivado do estado real no banco (tarefas e aprovações) — ver lib/agent-live.ts
const STATUS_CONFIG: Record<AgentStatus, { label: string; color: string; dot: string }> = {
  idle:             { label: 'Disponível',           color: 'text-emerald-400', dot: 'bg-emerald-400' },
  working:          { label: 'Executando tarefa',    color: 'text-amber-400',   dot: 'bg-amber-400 animate-pulse' },
  thinking:         { label: 'Tarefa na fila',       color: 'text-blue-400',    dot: 'bg-blue-400 animate-pulse' },
  waiting_approval: { label: 'Aguardando aprovação', color: 'text-yellow-400',  dot: 'bg-yellow-400 animate-pulse' },
  offline:          { label: 'Offline',              color: 'text-zinc-500',    dot: 'bg-zinc-500' },
};

function agentInitials(name: string) {
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

function agentColor(id: string) {
  const palette = [
    'from-violet-500 to-purple-600',
    'from-cyan-500 to-blue-600',
    'from-amber-500 to-orange-600',
    'from-emerald-500 to-teal-600',
    'from-rose-500 to-pink-600',
    'from-indigo-500 to-violet-600',
    'from-lime-500 to-green-600',
    'from-sky-500 to-cyan-600',
    'from-fuchsia-500 to-purple-600',
    'from-yellow-500 to-amber-600',
    'from-red-500 to-rose-600',
    'from-teal-500 to-emerald-600',
  ];
  const hash = id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return palette[hash % palette.length];
}

export default function WorkforcePage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterDept, setFilterDept] = useState<string>('all');

  const fetchAgents = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const res = await fetch('/api/agents/status', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setAgents(data.agents ?? []);
      setError(null);
    } catch {
      // Mantém o último estado real recebido; nunca substitui por dados fictícios
      setError('Não foi possível consultar os agentes no banco. Tente atualizar.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAgents();
    const timer = setInterval(() => fetchAgents(true), 10_000);
    return () => clearInterval(timer);
  }, [fetchAgents]);

  const departments = Array.from(new Set(agents.map((a) => a.departmentId))).sort();
  const filtered = filterDept === 'all' ? agents : agents.filter((a) => a.departmentId === filterDept);

  const stats = {
    total: agents.length,
    active: agents.filter((a) => a.status === 'working').length,
    waiting: agents.filter((a) => a.status === 'waiting_approval').length,
    tasksCompleted: agents.reduce((s, a) => s + (a.tasksCompleted || 0), 0),
  };

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Workforce</h1>
          <p className="text-muted-foreground mt-1">
            {stats.total} agentes · {stats.active} executando agora
            {stats.waiting > 0 && ` · ${stats.waiting} aguardando aprovação`}
          </p>
        </div>
        <button
          onClick={() => fetchAgents()}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-muted/50 hover:bg-muted border border-border text-sm text-muted-foreground hover:text-foreground transition-all"
        >
          <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
          Atualizar
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-400 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total de Agentes', value: stats.total, icon: Users, color: 'text-primary' },
          { label: 'Executando Agora', value: stats.active, icon: Zap, color: 'text-amber-400' },
          { label: 'Tasks Concluídas', value: stats.tasksCompleted, icon: CheckCircle2, color: 'text-emerald-400' },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-muted-foreground">{stat.label}</span>
              <stat.icon className={cn("w-5 h-5", stat.color)} />
            </div>
            <div className="text-3xl font-bold text-foreground">{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Department filter */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setFilterDept('all')}
          className={cn(
            "px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
            filterDept === 'all'
              ? "bg-primary/15 text-primary border-primary/30"
              : "bg-muted/30 text-muted-foreground border-border hover:border-border hover:text-foreground"
          )}
        >
          Todos
        </button>
        {departments.map((dept) => {
          const cfg = DEPT_LABELS[dept] ?? { label: dept, color: 'text-muted-foreground bg-muted/20 border-border' };
          return (
            <button
              key={dept}
              onClick={() => setFilterDept(dept)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
                filterDept === dept
                  ? cn("border", cfg.color)
                  : "bg-muted/30 text-muted-foreground border-border hover:text-foreground"
              )}
            >
              {cfg.label}
            </button>
          );
        })}
      </div>

      {/* Agents grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-5 animate-pulse">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-xl bg-muted" />
                <div className="space-y-2 flex-1">
                  <div className="h-4 bg-muted rounded w-24" />
                  <div className="h-3 bg-muted rounded w-32" />
                </div>
              </div>
              <div className="h-6 bg-muted rounded w-20 mb-3" />
              <div className="flex gap-3">
                <div className="h-8 bg-muted rounded flex-1" />
                <div className="h-8 bg-muted rounded flex-1" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-16 text-center">
          <Building2 className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-30" />
          <p className="text-muted-foreground">Nenhum agente encontrado</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((agent) => {
            const dept = DEPT_LABELS[agent.departmentId] ?? { label: agent.departmentId, color: 'text-muted-foreground bg-muted/20 border-border' };
            const statusCfg = STATUS_CONFIG[agent.status] ?? STATUS_CONFIG['idle'];
            const total = (agent.tasksCompleted || 0) + (agent.tasksPending || 0);
            const progress = total > 0 ? Math.round(((agent.tasksCompleted || 0) / total) * 100) : 0;

            return (
              <div
                key={agent.id}
                className="rounded-xl border border-border bg-card p-5 hover:border-primary/30 transition-all group"
              >
                {/* Avatar + name */}
                <div className="flex items-start gap-4 mb-4">
                  <div className={cn("w-12 h-12 rounded-xl bg-gradient-to-br flex items-center justify-center text-white font-bold text-sm flex-shrink-0", agentColor(agent.id))}>
                    {agentInitials(agent.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-foreground truncate">{agent.name}</h3>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{agent.role}</p>
                  </div>
                </div>

                {/* Department badge */}
                <div className={cn("inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium border mb-4", dept.color)}>
                  {dept.label}
                </div>

                {/* Status */}
                <div className="flex items-center gap-2 mb-4">
                  <div className={cn("w-2 h-2 rounded-full flex-shrink-0", statusCfg.dot)} />
                  <span className={cn("text-xs font-medium", statusCfg.color)}>{statusCfg.label}</span>
                </div>

                {/* Tarefa atual (real) */}
                {agent.currentTask && (
                  <div className="mb-4 rounded-lg border border-border bg-muted/20 px-3 py-2">
                    <p className="text-xs text-foreground line-clamp-2">{agent.currentTask}</p>
                    {agent.currentMission && (
                      <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{agent.currentMission}</p>
                    )}
                  </div>
                )}

                {/* Task progress */}
                {total > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[11px] text-muted-foreground">
                      <span>Progresso</span>
                      <span>{agent.tasksCompleted}/{total} tasks</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-500"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
