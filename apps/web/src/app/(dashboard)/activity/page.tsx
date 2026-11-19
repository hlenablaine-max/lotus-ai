"use client";

import { useState, useEffect, useCallback } from "react";
import { Activity, RefreshCw, AlertCircle, Info, AlertTriangle, XCircle, Zap, User, Bot } from "lucide-react";
import { cn } from "@/lib/utils";

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

const LEVEL_CONFIG: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  DEBUG:    { icon: Info,          color: "text-zinc-400",   bg: "bg-zinc-400/10" },
  INFO:     { icon: Info,          color: "text-blue-400",   bg: "bg-blue-400/10" },
  WARN:     { icon: AlertTriangle, color: "text-amber-400",  bg: "bg-amber-400/10" },
  ERROR:    { icon: XCircle,       color: "text-red-400",    bg: "bg-red-400/10" },
  CRITICAL: { icon: AlertCircle,   color: "text-rose-500",   bg: "bg-rose-500/10" },
};

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `${mins}m atrás`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h atrás`;
  const days = Math.floor(hours / 24);
  return `${days}d atrás`;
}

function formatAction(action: string): string {
  return action
    .split("_")
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");
}

export default function ActivityPage() {
  const [logs, setLogs] = useState<ActivityLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterLevel, setFilterLevel] = useState("ALL");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch("/api/activity");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setLogs(data.logs || []);
      setLoadError(null);
    } catch (err) {
      setLoadError(`Não foi possível carregar o log (${err instanceof Error ? err.message : String(err)})`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchLogs]);

  const filtered = filterLevel === "ALL"
    ? logs
    : logs.filter((l) => l.level === filterLevel);

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center">
            <Activity className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-white">Activity Log</h1>
            <p className="text-sm text-zinc-400">Auditoria em tempo real de todas as operações</p>
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
            {autoRefresh ? "Live" : "Auto-refresh"}
          </button>
          <button
            onClick={fetchLogs}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-400 border border-zinc-700 hover:border-zinc-600 text-sm transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Atualizar
          </button>
        </div>
      </div>

      {/* Level filter */}
      <div className="flex items-center gap-2 mb-6">
        {["ALL", "INFO", "WARN", "ERROR", "CRITICAL"].map((level) => (
          <button
            key={level}
            onClick={() => setFilterLevel(level)}
            className={cn(
              "px-3 py-1 rounded-lg text-xs font-medium transition-colors",
              filterLevel === level
                ? "bg-violet-500/20 text-violet-300 border border-violet-500/30"
                : "bg-zinc-800/50 text-zinc-500 border border-zinc-700/50 hover:border-zinc-600"
            )}
          >
            {level}
          </button>
        ))}
        <span className="ml-auto text-xs text-zinc-500">
          {filtered.length} eventos
        </span>
      </div>

      {loadError && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <AlertCircle className="w-4 h-4 shrink-0" /> {loadError}
        </div>
      )}

      {/* Log feed */}
      <div className="space-y-1">
        {loading ? (
          Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-14 rounded-xl bg-zinc-800/40 animate-pulse" />
          ))
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-zinc-500">
            <Activity className="w-8 h-8 mx-auto mb-3 opacity-30" />
            <p>Nenhuma atividade registrada</p>
          </div>
        ) : (
          filtered.map((log) => {
            const cfg = LEVEL_CONFIG[log.level] || LEVEL_CONFIG.INFO;
            const Icon = cfg.icon;

            return (
              <div
                key={log.id}
                className="flex items-start gap-3 px-4 py-3 rounded-xl bg-zinc-900/50 border border-zinc-800/50 hover:border-zinc-700/50 transition-colors"
              >
                {/* Level indicator */}
                <div className={cn("mt-0.5 w-6 h-6 rounded-lg flex items-center justify-center shrink-0", cfg.bg)}>
                  <Icon className={cn("w-3 h-3", cfg.color)} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-white">
                      {formatAction(log.action)}
                    </span>

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
                    {log.mission && (
                      <span className="text-xs text-zinc-500 truncate max-w-[200px]">
                        → {log.mission.title}
                      </span>
                    )}
                    {log.client && (
                      <span className="text-xs text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded-md">
                        {log.client.name}
                      </span>
                    )}
                  </div>

                  {log.details && Object.keys(log.details).length > 0 && (
                    <p className="text-xs text-zinc-500 mt-0.5 truncate">
                      {JSON.stringify(log.details)}
                    </p>
                  )}
                </div>

                {/* Timestamp */}
                <span className="text-xs text-zinc-600 shrink-0 mt-0.5">
                  {timeAgo(log.createdAt)}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
