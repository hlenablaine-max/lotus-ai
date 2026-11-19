"use client";

import { useState, useEffect } from "react";
import {
  Users, Target, CheckCircle2, FileText, Cpu, Bell, TrendingUp,
  RefreshCw, Activity, AlertTriangle, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Metrics {
  clients: number;
  missions: { total: number; completed: number; active: number };
  tasks: { total: number; completed: number; failed: number };
  documents: number;
  agents: number;
  pendingApprovals: number;
  successRate: number | null;
  recentActivity: Array<{
    id: string;
    action: string;
    level: string;
    createdAt: string;
    details: Record<string, unknown> | null;
    mission?: { title: string; client: { name: string } };
  }>;
}

function StatCard({
  label,
  value,
  icon: Icon,
  color = "default",
  sub,
}: {
  label: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
  color?: "default" | "green" | "amber" | "red" | "primary";
  sub?: string;
}) {
  const colors = {
    default: { border: "border-border", bg: "bg-card", icon: "text-muted-foreground", value: "text-foreground" },
    green: { border: "border-emerald-500/20", bg: "bg-emerald-500/5", icon: "text-emerald-400", value: "text-emerald-400" },
    amber: { border: "border-amber-500/20", bg: "bg-amber-500/5", icon: "text-amber-400", value: "text-amber-400" },
    red: { border: "border-red-500/20", bg: "bg-red-500/5", icon: "text-red-400", value: "text-red-400" },
    primary: { border: "border-primary/20", bg: "bg-primary/5", icon: "text-primary", value: "text-primary" },
  };
  const c = colors[color];

  return (
    <div className={cn("rounded-xl border p-5", c.border, c.bg)}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-muted-foreground">{label}</span>
        <Icon className={cn("w-5 h-5", c.icon)} />
      </div>
      <div className={cn("text-3xl font-bold", c.value)}>{value}</div>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

const ACTION_LABELS: Record<string, string> = {
  TASK_COMPLETED: "Task concluída",
  TASK_FAILED: "Task falhou",
  TASK_CREATED: "Task criada",
  APPROVAL_APPROVED: "Aprovação concedida",
  APPROVAL_REJECTED: "Aprovação rejeitada",
  MISSION_CREATED: "Missão criada",
  CLIENT_CREATED: "Cliente criado",
};

const ENGINE_OUTCOME: Record<string, string> = {
  STARTED: "iniciado",
  COMPLETED: "concluído",
  DEMO: "respondeu com dados de demonstração",
  FAILED: "falhou",
};

function describeAction(action: string, details: Record<string, unknown> | null): string {
  if (ACTION_LABELS[action]) return ACTION_LABELS[action];
  const m = action.match(/^ENGINE_(.+)_(STARTED|COMPLETED|DEMO|FAILED)$/);
  if (m) {
    const engine = m[1].toLowerCase().replace(/_/g, " ");
    const client = typeof details?.clientName === "string" && details.clientName ? ` — ${details.clientName}` : "";
    return `Motor ${engine} ${ENGINE_OUTCOME[m[2]]}${client}`;
  }
  return action;
}

export default function MetricsPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [runtimeAvailable, setRuntimeAvailable] = useState<boolean | null>(null);

  const fetchMetrics = async () => {
    setLoading(true);
    try {
      // The runtime check must never hide the metrics (and vice versa)
      fetch("/api/runtime/proxy")
        .then((r) => (r.ok ? r.json() : { available: false }))
        .then((r) => setRuntimeAvailable(r.available ?? false))
        .catch(() => setRuntimeAvailable(false));

      const metricsRes = await fetch("/api/metrics");
      if (!metricsRes.ok) throw new Error(`HTTP ${metricsRes.status}`);
      setMetrics(await metricsRes.json());
    } catch {
      setMetrics(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 30_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="p-8 space-y-8 overflow-auto h-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Métricas da Agência</h1>
          <p className="text-muted-foreground mt-1">Visão completa do desempenho operacional</p>
        </div>
        <button
          onClick={fetchMetrics}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-muted/50 hover:bg-muted border border-border text-sm text-muted-foreground hover:text-foreground transition-all"
        >
          <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
          Atualizar
        </button>
      </div>

      {/* Runtime status */}
      <div className={cn(
        "flex items-center gap-3 px-4 py-3 rounded-xl border text-sm",
        runtimeAvailable === true
          ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-300"
          : runtimeAvailable === false
          ? "border-amber-500/20 bg-amber-500/5 text-amber-300"
          : "border-border bg-muted/20 text-muted-foreground"
      )}>
        <div className={cn(
          "w-2 h-2 rounded-full flex-shrink-0",
          runtimeAvailable === true ? "bg-emerald-400 animate-pulse" : "bg-amber-400"
        )} />
        {runtimeAvailable === true
          ? "Runtime local ativo — Playwright e automações disponíveis"
          : runtimeAvailable === false
          ? "Runtime local offline — abra o app LOTUS desktop para ativar automações"
          : "Verificando runtime..."
        }
        {runtimeAvailable === true && <Zap className="w-4 h-4 ml-1 text-emerald-400" />}
      </div>

      {loading && !metrics ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-5 animate-pulse h-28" />
          ))}
        </div>
      ) : metrics ? (
        <>
          {/* KPI Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Clientes" value={metrics.clients} icon={Users} />
            <StatCard
              label="Missões Ativas"
              value={metrics.missions.active}
              icon={Target}
              color="primary"
            />
            <StatCard
              label="Missões Concluídas"
              value={metrics.missions.completed}
              icon={CheckCircle2}
              color="green"
            />
            <StatCard
              label="Entregáveis"
              value={metrics.documents}
              icon={FileText}
              color="primary"
            />
            <StatCard
              label="Tasks Completadas"
              value={metrics.tasks.completed}
              icon={TrendingUp}
              color="green"
              sub={`de ${metrics.tasks.total} totais`}
            />
            <StatCard
              label="Taxa de Sucesso"
              value={metrics.successRate === null ? "—" : `${metrics.successRate}%`}
              icon={TrendingUp}
              color={metrics.successRate === null ? "default" : metrics.successRate >= 80 ? "green" : metrics.successRate >= 50 ? "amber" : "red"}
              sub="concluídas ÷ (concluídas + falhadas)"
            />
            {metrics.pendingApprovals > 0 && (
              <StatCard
                label="Aprovações Pendentes"
                value={metrics.pendingApprovals}
                icon={Bell}
                color="amber"
                sub="Aguardando sua decisão"
              />
            )}
            {metrics.tasks.failed > 0 && (
              <StatCard
                label="Tasks Falhadas"
                value={metrics.tasks.failed}
                icon={AlertTriangle}
                color="red"
                sub="Verificar retry"
              />
            )}
            <StatCard label="Agentes" value={metrics.agents} icon={Cpu} />
          </div>

          {/* Recent Activity */}
          {metrics.recentActivity.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-6">
              <div className="flex items-center gap-2 mb-4">
                <Activity className="w-4 h-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">Atividade Recente</h2>
              </div>
              <div className="space-y-2">
                {metrics.recentActivity.map((log) => (
                  <div key={log.id} className="flex items-start gap-3 py-2 border-b border-border last:border-0">
                    <div className={cn(
                      "w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0",
                      log.level === "ERROR" ? "bg-red-400" : log.level === "WARN" ? "bg-amber-400" : "bg-emerald-400"
                    )} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-foreground">
                        {describeAction(log.action, log.details)}
                        {log.mission && (
                          <span className="text-muted-foreground">
                            {" "}— {log.mission.client.name}: {log.mission.title}
                          </span>
                        )}
                      </p>
                    </div>
                    <span className="text-[10px] text-muted-foreground flex-shrink-0">
                      {new Date(log.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-16 text-muted-foreground">
          <Activity className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Erro ao carregar métricas</p>
        </div>
      )}
    </div>
  );
}
