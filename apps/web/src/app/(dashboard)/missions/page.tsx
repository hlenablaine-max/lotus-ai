"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Target, Plus, X, Calendar, ChevronRight, AlertCircle, Search, Flag,
  Loader2, CheckCircle2, Clock, XCircle, FileText, Play, ChevronLeft,
  User, Zap, ArrowRight, RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { RichText } from "@/components/ui/rich-text";
import { ReportDownloadButton } from "@/components/reports/report-download";
import { ClientAvatar } from "@/components/ui/client-avatar";
import { AgentAvatar } from "@/components/ui/agent-avatar";

interface Mission {
  id: string;
  title: string;
  description: string;
  objective: string;
  priority: string;
  status: string;
  createdAt: string;
  dueAt?: string;
  client: { id: string; name: string; segment?: string };
  _count: { tasks: number };
}

const DOC_TYPE_LABEL: Record<string, string> = {
  RESEARCH_REPORT: 'Dados coletados',
  ANALYSIS: 'Análise',
  STRATEGY: 'Estratégia',
  DELIVERABLE: 'Entrega',
  COPY: 'Textos',
  CREATIVE_BRIEF: 'Criativos',
  CAMPAIGN_STRUCTURE: 'Campanha',
  PROPOSAL: 'Proposta',
  AUDIT_REPORT: 'Auditoria',
  MEETING_NOTES: 'Reunião',
  OTHER: 'Documento',
};

interface Client {
  id: string;
  name: string;
}

interface TaskDocument {
  title: string;
  content: string;
  type?: string;
}

interface TaskOutput {
  text?: string;
  documents?: TaskDocument[];
  clarifications?: string[];
}

interface DbDocument {
  id: string;
  title: string;
  content: string;
  type: string;
}

interface Task {
  id: string;
  title: string;
  description?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  agent?: { id: string; name: string; title?: string };
  output?: TaskOutput;
  documents?: DbDocument[];
}

// Cache de módulo — sobrevive entre navegações, limpo só no reload
let _pageCache: { missions: Mission[]; clients: Client[]; ts: number } | null = null;

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  PENDING:          { label: 'Pendente',    color: 'text-zinc-400',    bg: 'bg-zinc-400/10 border-zinc-400/20' },
  PLANNING:         { label: 'Planejando',  color: 'text-blue-400',    bg: 'bg-blue-400/10 border-blue-400/20' },
  IN_PROGRESS:      { label: 'Em Progresso',color: 'text-amber-400',   bg: 'bg-amber-400/10 border-amber-400/20' },
  WAITING_APPROVAL: { label: 'Aguardando',  color: 'text-yellow-400',  bg: 'bg-yellow-400/10 border-yellow-400/20' },
  IN_REVIEW:        { label: 'Em Revisão',  color: 'text-purple-400',  bg: 'bg-purple-400/10 border-purple-400/20' },
  COMPLETED:        { label: 'Concluída',   color: 'text-emerald-400', bg: 'bg-emerald-400/10 border-emerald-400/20' },
  FAILED:           { label: 'Falhou',      color: 'text-red-400',     bg: 'bg-red-400/10 border-red-400/20' },
  CANCELLED:        { label: 'Cancelada',   color: 'text-zinc-500',    bg: 'bg-zinc-500/10 border-zinc-500/20' },
};

const TASK_STATUS_LABEL: Record<string, { label: string; color: string }> = {
  PENDING:            { label: 'Pendente',                 color: 'text-zinc-400' },
  QUEUED:             { label: 'Na fila',                  color: 'text-zinc-400' },
  WAITING_DEPENDENCY: { label: 'Aguardando outra tarefa',  color: 'text-blue-400' },
  IN_PROGRESS:        { label: 'Em execução',              color: 'text-amber-400' },
  COMPLETED:          { label: 'Concluída',                color: 'text-emerald-400' },
  FAILED:             { label: 'Falhou',                   color: 'text-red-400' },
  CANCELLED:          { label: 'Cancelada',                color: 'text-zinc-500' },
  SKIPPED:            { label: 'Ignorada',                 color: 'text-zinc-500' },
};

const OPEN_TASK_STATUSES = ['IN_PROGRESS', 'QUEUED', 'WAITING_DEPENDENCY'];

const TASK_STATUS_ICON: Record<string, React.ReactNode> = {
  QUEUED:             <Clock className="w-4 h-4 text-zinc-400" />,
  WAITING_DEPENDENCY: <Clock className="w-4 h-4 text-blue-400" />,
  SKIPPED:            <XCircle className="w-4 h-4 text-zinc-500" />,
  PENDING:     <Clock className="w-4 h-4 text-zinc-400" />,
  IN_PROGRESS: <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />,
  COMPLETED:   <CheckCircle2 className="w-4 h-4 text-emerald-400" />,
  FAILED:      <XCircle className="w-4 h-4 text-red-400" />,
  CANCELLED:   <XCircle className="w-4 h-4 text-zinc-500" />,
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  LOW:    { label: 'Baixa',   color: 'text-zinc-400' },
  MEDIUM: { label: 'Média',   color: 'text-blue-400' },
  HIGH:   { label: 'Alta',    color: 'text-amber-400' },
  URGENT: { label: 'Urgente', color: 'text-red-400' },
};

function formatDate(dateStr?: string) {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatRelative(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `${mins}m atrás`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h atrás`;
  return formatDate(dateStr) ?? '';
}

export default function MissionsPage() {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    title: '', description: '', objective: '', clientId: '', priority: 'MEDIUM', dueAt: '',
  });

  // Task panel state
  const [selectedMission, setSelectedMission] = useState<Mission | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [runningTaskId, setRunningTaskId] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [mRes, cRes] = await Promise.all([fetch('/api/missions'), fetch('/api/clients')]);
      const mData = await mRes.json();
      const cData = await cRes.json();
      if (!mRes.ok) throw new Error(mData.error ?? 'erro ' + mRes.status);
      if (!cRes.ok) throw new Error(cData.error ?? 'erro ' + cRes.status);
      const m = mData.missions ?? [];
      const c = cData.clients ?? [];
      setMissions(m);
      setClients(c);
      setLoadError(null);
      _pageCache = { missions: m, clients: c, ts: Date.now() };
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const fetchTasks = useCallback(async (missionId: string) => {
    try {
      const res = await fetch(`/api/missions/${missionId}/tasks`);
      if (!res.ok) return;
      const data = await res.json();
      setTasks(data.tasks ?? []);
    } catch {}
  }, []);

  // Atualiza sozinho enquanto houver tarefa em execução, na fila ou aguardando dependência
  useEffect(() => {
    if (!selectedMission) {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }

    const hasRunning = tasks.some((t) => OPEN_TASK_STATUSES.includes(t.status));
    if (hasRunning) {
      pollRef.current = setInterval(() => fetchTasks(selectedMission.id), 4000);
    } else {
      if (pollRef.current) clearInterval(pollRef.current);
    }

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [tasks, selectedMission, fetchTasks]);

  useEffect(() => {
    // Mostra o que já tinha na hora e atualiza por trás (assim uma missão recém-criada também aparece)
    if (_pageCache) {
      setMissions(_pageCache.missions);
      setClients(_pageCache.clients);
      setLoading(false);
      fetchData(true);
      return;
    }
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Link direto (/missions?open=<id>) abre o painel da missão
  const openedFromUrl = useRef(false);
  useEffect(() => {
    if (openedFromUrl.current || missions.length === 0) return;
    const openId = new URLSearchParams(window.location.search).get('open');
    if (!openId) return;
    const target = missions.find((m) => m.id === openId);
    if (target) {
      openedFromUrl.current = true;
      openMission(target);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missions]);

  const openMission = async (mission: Mission) => {
    setSelectedMission(mission);
    setTasksLoading(true);
    setTasks([]);
    await fetchTasks(mission.id);
    setTasksLoading(false);
  };

  const closePanel = () => {
    setSelectedMission(null);
    setTasks([]);
    if (pollRef.current) clearInterval(pollRef.current);
  };

  const retryFailed = async () => {
    setRetrying(true);
    setActionError(null);
    try {
      if (!selectedMission) return;
      const res = await fetch(`/api/retry-failed-tasks?missionId=${selectedMission.id}`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `erro ${res.status}`);
      }
      setTimeout(() => fetchTasks(selectedMission.id), 1000);
    } catch (err) {
      setActionError(`Não deu para reexecutar: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRetrying(false);
    }
  };

  const runTask = async (task: Task) => {
    if (!task.agent) return;
    setRunningTaskId(task.id);
    setActionError(null);
    try {
      const res = await fetch('/api/agents/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: task.id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `erro ${res.status}`);
      }
      // Refresh tasks after short delay
      setTimeout(() => selectedMission && fetchTasks(selectedMission.id), 800);
    } catch (err) {
      setActionError(`Não deu para executar "${task.title}": ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRunningTaskId(null);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.clientId) { setError('Título e cliente são obrigatórios'); return; }
    setCreating(true);
    setError('');
    try {
      const res = await fetch('/api/missions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error();
      await fetchData();
      setShowCreate(false);
      setForm({ title: '', description: '', objective: '', clientId: '', priority: 'MEDIUM', dueAt: '' });
    } catch {
      setError('Erro ao criar missão. Tente novamente.');
    } finally {
      setCreating(false);
    }
  };

  const filtered = missions.filter((m) => {
    const matchSearch = m.title.toLowerCase().includes(search.toLowerCase()) || m.client.name.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === 'all' || m.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const statuses = Array.from(new Set(missions.map((m) => m.status)));

  return (
    <div className="flex h-full overflow-hidden">
      {/* Main list */}
      <div className={cn("flex-1 p-8 space-y-8 overflow-y-auto transition-all duration-300", selectedMission ? "pr-4" : "")}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Missões</h1>
            <p className="text-muted-foreground mt-1">
              {missions.length} {missions.length === 1 ? 'missão' : 'missões'} · {missions.filter((m) => ['IN_PROGRESS', 'PLANNING', 'WAITING_APPROVAL', 'IN_REVIEW'].includes(m.status)).length} em andamento
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-all"
          >
            <Plus className="w-4 h-4" />
            Nova Missão
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar missões..."
              className="w-full pl-10 pr-4 py-2.5 bg-muted/50 border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setFilterStatus('all')}
              className={cn("px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
                filterStatus === 'all' ? "bg-primary/15 text-primary border-primary/30" : "bg-muted/30 text-muted-foreground border-border hover:text-foreground"
              )}
            >Todas</button>
            {statuses.map((s) => {
              const cfg = STATUS_CONFIG[s] ?? STATUS_CONFIG['PENDING'];
              return (
                <button key={s} onClick={() => setFilterStatus(s)}
                  className={cn("px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
                    filterStatus === s ? cn(cfg.color, cfg.bg) : "bg-muted/30 text-muted-foreground border-border hover:text-foreground"
                  )}
                >{cfg.label}</button>
              );
            })}
          </div>
        </div>

        {loadError && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300 flex items-center justify-between gap-3">
            <span>{loadError}</span>
            <button onClick={() => fetchData()} className="text-xs underline">Tentar de novo</button>
          </div>
        )}

        {/* List */}
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-border bg-card p-5 animate-pulse">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-muted flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-muted rounded w-48" />
                    <div className="h-3 bg-muted rounded w-64" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card/50 p-16 text-center">
            <Target className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-30" />
            <p className="text-muted-foreground mb-2">
              {loadError ? 'Não foi possível carregar as missões' : missions.length === 0 ? 'Nenhuma missão criada ainda' : 'Nenhuma missão encontrada'}
            </p>
            {missions.length === 0 && (
              <p className="text-xs text-muted-foreground/60 max-w-xs mx-auto mt-1">
                {clients.length === 0
                  ? 'Primeiro crie um cliente, depois inicie uma missão para ele.'
                  : 'Clique em "Nova Missão" ou peça ao assistente para criar tarefas.'}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((mission) => {
              const statusCfg = STATUS_CONFIG[mission.status] ?? STATUS_CONFIG['PENDING'];
              const priorityCfg = PRIORITY_CONFIG[mission.priority] ?? PRIORITY_CONFIG['MEDIUM'];
              const dueFormatted = formatDate(mission.dueAt);
              const isOverdue = mission.dueAt && new Date(mission.dueAt) < new Date() && mission.status !== 'COMPLETED';
              const isSelected = selectedMission?.id === mission.id;

              return (
                <div
                  key={mission.id}
                  onClick={() => isSelected ? closePanel() : openMission(mission)}
                  className={cn(
                    "rounded-xl border bg-card p-5 transition-all group cursor-pointer",
                    isSelected ? "border-primary/50 bg-primary/5" : "border-border hover:border-primary/30"
                  )}
                >
                  <div className="flex items-start gap-4">
                    <ClientAvatar clientId={mission.client.id} name={mission.client.name} size={40} className={cn("mt-0.5 rounded-lg", isSelected && "ring-2 ring-primary/50")} />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-3 flex-wrap">
                        <h3 className="font-semibold text-foreground leading-snug">{mission.title}</h3>
                        <span className={cn("inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border", statusCfg.bg, statusCfg.color)}>
                          {statusCfg.label}
                        </span>
                      </div>

                      <div className="flex items-center gap-4 mt-1.5 flex-wrap">
                        <span className="text-sm text-muted-foreground">{mission.client.name}</span>
                        <span className={cn("flex items-center gap-1 text-xs font-medium", priorityCfg.color)}>
                          <Flag className="w-3 h-3" /> {priorityCfg.label}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {mission._count?.tasks ?? 0} tarefa{(mission._count?.tasks ?? 0) !== 1 ? 's' : ''}
                        </span>
                        {dueFormatted && (
                          <span className={cn("flex items-center gap-1 text-xs", isOverdue ? "text-red-400" : "text-muted-foreground")}>
                            <Calendar className="w-3 h-3" />
                            {isOverdue && <AlertCircle className="w-3 h-3" />}
                            {dueFormatted}
                          </span>
                        )}
                      </div>

                      {mission.description && (
                        <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{mission.description}</p>
                      )}
                    </div>

                    <ChevronRight className={cn(
                      "w-4 h-4 transition-all mt-1 flex-shrink-0",
                      isSelected ? "rotate-90 text-primary" : "text-muted-foreground group-hover:text-foreground"
                    )} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Task panel */}
      {selectedMission && (
        <div className="w-[420px] flex-shrink-0 border-l border-border bg-card/50 flex flex-col overflow-hidden">
          {/* Panel header */}
          <div className="p-5 border-b border-border flex items-start gap-3">
            <button onClick={closePanel} className="mt-0.5 text-muted-foreground hover:text-foreground transition-colors flex-shrink-0">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold text-foreground truncate">{selectedMission.title}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">{selectedMission.client.name}</p>
            </div>
            <button
              onClick={() => fetchTasks(selectedMission.id)}
              className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0 mt-0.5"
              title="Atualizar tasks"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>

          {actionError && (
            <div className="mx-5 mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300 flex items-start justify-between gap-2">
              <span>{actionError}</span>
              <button onClick={() => setActionError(null)} className="flex-shrink-0"><X className="w-3.5 h-3.5" /></button>
            </div>
          )}

          {/* Relatório do cliente em PDF */}
          <div className="px-5 py-3 border-b border-border flex flex-wrap items-start gap-2">
            <ReportDownloadButton missionId={selectedMission.id} />
            <ReportDownloadButton missionId={selectedMission.id} internal />
          </div>

          {/* Retry button when there are FAILED tasks */}
          {tasks.some((t) => t.status === 'FAILED') && (
            <div className="px-5 pb-3">
              <button
                onClick={retryFailed}
                disabled={retrying}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-red-400/10 border border-red-400/20 text-red-400 text-xs font-medium hover:bg-red-400/20 disabled:opacity-50 transition-all"
              >
                {retrying ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                {retrying ? 'Reexecutando...' : `Reexecutar ${tasks.filter(t => t.status === 'FAILED').length} tarefa(s) com falha`}
              </button>
            </div>
          )}

          {/* Tasks */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {tasksLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 2 }).map((_, i) => (
                  <div key={i} className="rounded-lg border border-border bg-background/50 p-4 animate-pulse">
                    <div className="h-3 bg-muted rounded w-3/4 mb-2" />
                    <div className="h-3 bg-muted rounded w-1/2" />
                  </div>
                ))}
              </div>
            ) : tasks.length === 0 ? (
              <div className="text-center py-12">
                <Zap className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-30" />
                <p className="text-sm text-muted-foreground">Nenhuma tarefa ainda</p>
                <p className="text-xs text-muted-foreground/60 mt-1 max-w-[200px] mx-auto">
                  Peça ao assistente para criar tarefas para esta missão
                </p>
              </div>
            ) : (
              tasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onRun={runTask}
                  isRunning={runningTaskId === task.id}
                />
              ))
            )}
          </div>
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowCreate(false)} />
          <div className="relative z-10 w-full max-w-lg rounded-2xl bg-card border border-border shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-foreground">Nova Missão</h2>
              <button onClick={() => setShowCreate(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            {clients.length === 0 && (
              <div className="mb-4 p-3 rounded-lg bg-amber-400/10 border border-amber-400/20 text-amber-400 text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                Crie um cliente primeiro antes de criar missões.
              </div>
            )}

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Cliente *</label>
                <select
                  value={form.clientId}
                  onChange={(e) => setForm((p) => ({ ...p, clientId: e.target.value }))}
                  className="w-full px-3 py-2.5 bg-muted/50 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                  disabled={clients.length === 0}
                >
                  <option value="">Selecione um cliente</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Título da Missão *</label>
                <input
                  value={form.title}
                  onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                  placeholder="Ex: Lançamento Campanha Janeiro"
                  className="w-full px-3 py-2.5 bg-muted/50 border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Objetivo</label>
                <input
                  value={form.objective}
                  onChange={(e) => setForm((p) => ({ ...p, objective: e.target.value }))}
                  placeholder="O que deve ser alcançado?"
                  className="w-full px-3 py-2.5 bg-muted/50 border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Descrição</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  placeholder="Contexto e detalhes da missão..."
                  rows={3}
                  className="w-full px-3 py-2.5 bg-muted/50 border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Prioridade</label>
                  <select
                    value={form.priority}
                    onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value }))}
                    className="w-full px-3 py-2.5 bg-muted/50 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                  >
                    <option value="LOW">Baixa</option>
                    <option value="MEDIUM">Média</option>
                    <option value="HIGH">Alta</option>
                    <option value="URGENT">Urgente</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Prazo</label>
                  <input
                    type="date"
                    value={form.dueAt}
                    onChange={(e) => setForm((p) => ({ ...p, dueAt: e.target.value }))}
                    className="w-full px-3 py-2.5 bg-muted/50 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                  />
                </div>
              </div>

              {error && (
                <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">{error}</p>
              )}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowCreate(false)}
                  className="flex-1 py-2.5 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all"
                >Cancelar</button>
                <button type="submit" disabled={creating || clients.length === 0}
                  className="flex-1 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-all"
                >{creating ? 'Criando...' : 'Criar Missão'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── TaskCard component ────────────────────────────────────────────────────────

function TaskCard({ task, onRun, isRunning }: { task: Task; onRun: (t: Task) => void; isRunning: boolean }) {
  const [expanded, setExpanded] = useState(task.status === 'COMPLETED');
  const statusCfg = TASK_STATUS_LABEL[task.status] ?? TASK_STATUS_LABEL['PENDING'];
  const icon = TASK_STATUS_ICON[task.status] ?? <Clock className="w-4 h-4 text-zinc-400" />;
  const dbDocs = task.documents ?? [];
  const hasOutput = (task.output && (task.output.text || (task.output.documents && task.output.documents.length > 0))) || dbDocs.length > 0;
  const canRun = (task.status === 'PENDING' || task.status === 'FAILED' || task.status === 'QUEUED') && task.agent;

  return (
    <div className={cn(
      "rounded-lg border bg-background/50 overflow-hidden transition-all",
      task.status === 'IN_PROGRESS' ? "border-amber-400/30" : "border-border"
    )}>
      {/* Task header */}
      <div
        className={cn("p-4 flex items-start gap-3", (hasOutput || canRun) && "cursor-pointer hover:bg-muted/20 transition-colors")}
        onClick={() => (hasOutput || canRun) && setExpanded((p) => !p)}
      >
        <div className="mt-0.5 flex-shrink-0">{icon}</div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground leading-snug">{task.title}</p>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <span className={cn("text-xs font-medium", statusCfg.color)}>{statusCfg.label}</span>
            {task.agent && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <AgentAvatar slug={task.agent.id} name={task.agent.name} size={18} /> {task.agent.name}
              </span>
            )}
            <span className="text-xs text-muted-foreground">{formatRelative(task.updatedAt)}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {canRun && (
            <button
              onClick={(e) => { e.stopPropagation(); onRun(task); }}
              disabled={isRunning}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-primary/15 text-primary text-xs font-medium border border-primary/20 hover:bg-primary/25 disabled:opacity-50 transition-all"
            >
              {isRunning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
              {isRunning ? 'Iniciando...' : 'Executar'}
            </button>
          )}
          {hasOutput && (
            <ChevronRight className={cn("w-4 h-4 text-muted-foreground transition-transform", expanded && "rotate-90")} />
          )}
        </div>
      </div>

      {/* IN_PROGRESS pulse bar */}
      {task.status === 'IN_PROGRESS' && (
        <div className="h-0.5 bg-gradient-to-r from-transparent via-amber-400 to-transparent animate-pulse" />
      )}

      {/* Expanded output */}
      {expanded && hasOutput && (
        <div className="border-t border-border bg-muted/20 p-4 space-y-4">
          {task.output?.text && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Resultado</p>
              <RichText content={task.output.text} />
            </div>
          )}

          {/* DB-persisted documents (full content) */}
          {dbDocs.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-emerald-400 uppercase tracking-wide flex items-center gap-1.5">
                <FileText className="w-3 h-3" />
                Entregáveis salvos ({dbDocs.length})
              </p>
              {dbDocs.map((doc) => (
                <DocumentCard key={doc.id} doc={doc} />
              ))}
            </div>
          )}

          {/* In-memory doc list (titles only, shown when no DB docs) */}
          {dbDocs.length === 0 && task.output?.documents && task.output.documents.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <FileText className="w-3 h-3" />
                Documentos gerados ({task.output.documents.length})
              </p>
              {task.output.documents.map((doc, i) => (
                <DocumentCard key={i} doc={doc} />
              ))}
            </div>
          )}

          {task.output?.clarifications && task.output.clarifications.length > 0 && (
            <div>
              <p className="text-xs font-medium text-amber-400 mb-2 uppercase tracking-wide flex items-center gap-1.5">
                <AlertCircle className="w-3 h-3" />
                Clarificações necessárias
              </p>
              <ul className="space-y-1">
                {task.output.clarifications.map((c, i) => (
                  <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                    <ArrowRight className="w-3 h-3 mt-1 flex-shrink-0 text-amber-400" />{c}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DocumentCard({ doc }: { doc: TaskDocument }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md border border-border bg-background overflow-hidden">
      <button
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-muted/30 transition-colors text-left"
      >
        <FileText className="w-3.5 h-3.5 text-primary flex-shrink-0" />
        <span className="text-sm font-medium text-foreground flex-1 truncate">{doc.title || 'Documento'}</span>
        {doc.type && <span className="text-xs text-muted-foreground px-1.5 py-0.5 rounded bg-muted">{DOC_TYPE_LABEL[doc.type] ?? 'Documento'}</span>}
        <ChevronRight className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform flex-shrink-0", open && "rotate-90")} />
      </button>
      {open && doc.content && (
        <div className="border-t border-border px-3 py-3">
          <RichText content={doc.content} />
        </div>
      )}
    </div>
  );
}
