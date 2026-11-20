"use client";

import { useState, useEffect, useCallback } from "react";
import { Activity, RefreshCw, AlertCircle, Info, AlertTriangle, XCircle, Zap, User, Bot, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { describeAction, summarizeDetails } from "@/lib/activity-labels";

interface ActivityLogEntry {
  id: string;
  action: string;
  level: string;
  details: Record<string, unknown> | null;
  createdAt: string;
  user?: { name: string | null; email: string } | null;
  agent?: { name: string; slug: string } | null;
  client?: { name: string } | null;
  mission?: { title: string } | null;
  task?: { title: string } | null;
}

const PAGE = 100;

const LEVEL_CONFIG: Record<string, { icon: React.ElementType; color: string; bg: string; label: string }> = {
  DEBUG:    { icon: Info,          color: "text-zinc-400",   bg: "bg-zinc-400/10",   label: "Detalhe" },
  INFO:     { icon: Info,          color: "text-blue-400",   bg: "bg-blue-400/10",   label: "Informação" },
  WARN:     { icon: AlertTriangle, color: "text-amber-400",  bg: "bg-amber-400/10",  label: "Atenção" },
  ERROR:    { icon: XCircle,       color: "text-red-400",    bg: "bg-red-400/10",    label: "Erro" },
  CRITICAL: { icon: AlertCircle,   color: "text-rose-500",   bg: "bg-rose-500/10",   label: "Crítico" },
};

const FILTERS: Array<{ value: string; label: string }> = [
  { value: "ALL", label: "Tudo" },
  { value: "INFO", label: "Informação" },
  { value: "WARN", label: "Atenção" },
  { value: "ERROR", label: "Erros" },
  { value: "CRITICAL", label: "Crítico" },
];

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `${mins} min atrás`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h atrás`;
  const days = Math.floor(hours / 24);
  return `${days} d atrás`;
}

export default function ActivityPage() {
  const [logs, setLogs] = useState<ActivityLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [filterLevel, setFilterLevel] = useState("ALL");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const query = useCallback(
    (before?: string) => {
      const params = new URLSearchParams({ limit: String(PAGE) });
      if (filterLevel !== "ALL") params.set("level", filterLevel);
      if (before) params.set("before", before);
      return `/api/activity?${params.toString()}`;
    },
    [filterLevel]
  );

  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch(query());
      if (!res.ok) throw new Error(`erro ${res.status}`);
      const data = await res.json();
      const list: ActivityLogEntry[] = data.logs || [];
      setLogs(list);
      setHasMore(list.length === PAGE);
      setLoadError(null);
    } catch (err) {
      setLoadError(`Não foi possível carregar a atividade (${err instanceof Error ? err.message : String(err)})`);
    } finally {
      setLoading(false);
    }
  }, [query]);

  const loadMore = async () => {
    const last = logs[logs.length - 1];
    if (!last) return;
    setLoadingMore(true);
    try {
      const res = await fetch(query(last.createdAt));
      if (!res.ok) throw new Error(`erro ${res.status}`);
      const data = await res.json();
      const list: ActivityLogEntry[] = data.logs || [];
      setLogs((prev) => [...prev, ...list]);
      setHasMore(list.length === PAGE);
    } catch (err) {
      setLoadError(`Não foi possível carregar mais (${err instanceof Error ? err.message : String(err)})`);
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") fetchLogs();
    }, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchLogs]);

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center">
            <Activity className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-white">Atividade</h1>
            <p className="text-sm text-zinc-400">Tudo o que os agentes e o sistema fizeram, em ordem</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setAutoRefresh((v) => !v)}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors",
              autoRefresh
                ? "bg-violet-500/20 text-violet-300 border border-violet-500/30"
                : "bg-zinc-800 text-zinc-400 border border-zinc-700 hover:border-zinc-600"
            )}
          >
            <Zap className={cn("w-3.5 h-3.5", autoRefresh && "animate-pulse")} />
            {autoRefresh ? "Ao vivo" : "Atualizar sozinho"}
          </button>
          <button
            onClick={() => fetchLogs()}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-400 border border-zinc-700 hover:border-zinc-600 text-sm transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Atualizar
          </button>
        </div>
      </div>

      {/* Filtro por nível (feito no servidor, vale para todo o histórico) */}
      <div className="flex items-center gap-2 mb-6">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilterLevel(f.value)}
            className={cn(
              "px-3 py-1 rounded-lg text-xs font-medium transition-colors",
              filterLevel === f.value
                ? "bg-violet-500/20 text-violet-300 border border-violet-500/30"
                : "bg-zinc-800/50 text-zinc-400 border border-zinc-700/50 hover:border-zinc-600"
            )}
          >
            {f.label}
          </button>
        ))}
        <span className="ml-auto text-xs text-zinc-500">{logs.length} eventos{hasMore ? " (há mais)" : ""}</span>
      </div>

      {loadError && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <AlertCircle className="w-4 h-4 shrink-0" /> {loadError}
        </div>
      )}

      <div className="space-y-1">
        {loading ? (
          Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-14 rounded-xl bg-zinc-800/40 animate-pulse" />)
        ) : logs.length === 0 ? (
          <div className="text-center py-16 text-zinc-500">
            <Activity className="w-8 h-8 mx-auto mb-3 opacity-30" />
            <p>Nenhuma atividade registrada{filterLevel !== "ALL" ? " com esse filtro" : ""}</p>
          </div>
        ) : (
          logs.map((log) => {
            const cfg = LEVEL_CONFIG[log.level] || LEVEL_CONFIG.INFO;
            const Icon = cfg.icon;
            const summary = summarizeDetails(log.details);
            return (
              <div
                key={log.id}
                className="flex items-start gap-3 px-4 py-3 rounded-xl bg-zinc-900/50 border border-zinc-800/50 hover:border-zinc-700/50 transition-colors"
              >
                <div className={cn("mt-0.5 w-6 h-6 rounded-lg flex items-center justify-center shrink-0", cfg.bg)} title={cfg.label}>
                  <Icon className={cn("w-3 h-3", cfg.color)} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-white">{describeAction(log.action, log.details)}</span>
                    {log.agent && (
                      <span className="flex items-center gap-1 text-xs text-violet-400 bg-violet-400/10 px-1.5 py-0.5 rounded-md">
                        <Bot className="w-2.5 h-2.5" />
                        {log.agent.name}
                      </span>
                    )}
                    {log.user && (
                      <span className="flex items-center gap-1 text-xs text-blue-400 bg-blue-400/10 px-1.5 py-0.5 rounded-md">
                        <User className="w-2.5 h-2.5" />
                        {log.user.name || log.user.email}
                      </span>
                    )}
                    {log.client && (
                      <span className="text-xs text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded-md">{log.client.name}</span>
                    )}
                  </div>
                  {(log.task || log.mission) && (
                    <p className="text-xs text-zinc-400 mt-0.5 truncate">
                      {log.task ? log.task.title : ""}
                      {log.task && log.mission ? " · " : ""}
                      {log.mission ? log.mission.title : ""}
                    </p>
                  )}
                  {summary && <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2">{summary}</p>}
                </div>

                <span className="text-xs text-zinc-500 shrink-0 mt-0.5" title={new Date(log.createdAt).toLocaleString("pt-BR")}>
                  {timeAgo(log.createdAt)}
                </span>
              </div>
            );
          })
        )}
      </div>

      {hasMore && !loading && (
        <div className="flex justify-center mt-4">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-800 text-zinc-300 border border-zinc-700 hover:border-zinc-600 text-sm disabled:opacity-50"
          >
            {loadingMore && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Carregar mais
          </button>
        </div>
      )}
    </div>
  );
}
