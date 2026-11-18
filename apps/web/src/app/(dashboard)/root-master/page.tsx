"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  Brain, Zap, CheckCircle2, Clock, AlertTriangle, ArrowRight,
  Send, Activity, Target, Users, TrendingUp, Plus, RefreshCw, Loader2,
} from "lucide-react";

// ============================================================
// TYPES
// ============================================================
type MissionStatus = "queued" | "running" | "done" | "blocked" | "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
type Priority = "critical" | "high" | "normal" | "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

interface Mission {
  id: string;
  title: string;
  description?: string;
  status: MissionStatus;
  priority: Priority;
  clientId?: string;
  client?: { name: string };
  assignedTo?: string;
  department?: string;
  dueDate?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface ChatMessage {
  role: "luna" | "user";
  content: string;
  time: string;
}

// ============================================================
// HELPERS
// ============================================================
const STATUS_NORM: Record<string, "queued" | "running" | "done" | "blocked"> = {
  queued: "queued", PENDING: "queued",
  running: "running", IN_PROGRESS: "running",
  done: "done", COMPLETED: "done",
  blocked: "blocked", CANCELLED: "blocked",
};

const STATUS_CONFIG = {
  queued:  { label: "Na fila",    color: "text-zinc-400",   bg: "bg-zinc-400/10",   icon: Clock },
  running: { label: "Executando", color: "text-blue-400",   bg: "bg-blue-400/10",   icon: Activity },
  done:    { label: "Concluído",  color: "text-emerald-400",bg: "bg-emerald-400/10",icon: CheckCircle2 },
  blocked: { label: "Bloqueado",  color: "text-red-400",    bg: "bg-red-400/10",    icon: AlertTriangle },
};

const PRIORITY_COLOR: Record<string, string> = {
  critical: "text-red-400 bg-red-400/10",
  CRITICAL: "text-red-400 bg-red-400/10",
  high: "text-orange-400 bg-orange-400/10",
  HIGH: "text-orange-400 bg-orange-400/10",
  normal: "text-zinc-400 bg-zinc-400/10",
  MEDIUM: "text-amber-400 bg-amber-400/10",
  LOW: "text-zinc-400 bg-zinc-400/10",
};

function getTimeStr() {
  const d = new Date();
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

function normalizeStatus(s: string): "queued" | "running" | "done" | "blocked" {
  return STATUS_NORM[s] ?? "queued";
}

function normalizePriority(p: string): string {
  return p?.toLowerCase() || "normal";
}

// ============================================================
// NEW MISSION MODAL
// ============================================================
function NewMissionModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (m: Mission) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleCreate() {
    if (!title.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/missions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), description, priority, status: "PENDING" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao criar missão");
      onCreated(data);
      onClose();
    } catch (e) {
      setError(String(e));
    }
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#111] border border-white/15 rounded-xl p-6 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-foreground">Nova Missão</h3>
        <div>
          <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Título *</label>
          <input
            autoFocus
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Ex: Landing page — Clínica Renata"
            className="mt-1 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-white/30"
          />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Descrição</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={3}
            className="mt-1 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-white/30 resize-none"
          />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Prioridade</label>
          <select
            value={priority}
            onChange={e => setPriority(e.target.value)}
            className="mt-1 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-white/30"
          >
            <option value="CRITICAL">Crítica</option>
            <option value="HIGH">Alta</option>
            <option value="MEDIUM">Normal</option>
            <option value="LOW">Baixa</option>
          </select>
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-white/10 text-sm text-muted-foreground hover:bg-white/5">
            Cancelar
          </button>
          <button
            onClick={handleCreate}
            disabled={loading || !title.trim()}
            className="flex-1 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium disabled:opacity-50"
          >
            {loading ? <Loader2 size={14} className="animate-spin mx-auto" /> : "Criar Missão"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MAIN PAGE
// ============================================================
export default function RootMasterPage() {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [loadingMissions, setLoadingMissions] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showNewMission, setShowNewMission] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const fetchMissions = useCallback(async (quiet = false) => {
    if (!quiet) setLoadingMissions(true);
    else setRefreshing(true);
    try {
      const [mRes, cRes] = await Promise.all([
        fetch("/api/missions"),
        fetch("/api/clients"),
      ]);
      const mData = await mRes.json();
      const cData = await cRes.json();
      const mList = Array.isArray(mData) ? mData : mData.missions || [];
      const cList = Array.isArray(cData) ? cData : cData.clients || [];
      setMissions(mList);
      setClients(cList);

      // Set Luna's initial message based on real data
      const running = mList.filter((m: Mission) => normalizeStatus(m.status) === "running").length;
      const queued = mList.filter((m: Mission) => normalizeStatus(m.status) === "queued").length;
      setMessages([{
        role: "luna",
        content: mList.length === 0
          ? "Olá! Sou Luna, Root Master da LOTUS. Nenhuma missão cadastrada ainda. Crie a primeira missão para começarmos."
          : `Olá! Sou Luna, Root Master da LOTUS. Tenho ${mList.length} missão(ões) no sistema: ${running} executando, ${queued} na fila. ${running > 0 ? "Equipe em operação." : "Prontos para iniciar."} O que precisa?`,
        time: getTimeStr(),
      }]);
    } catch {
      setMissions([]);
    }
    setLoadingMissions(false);
    setRefreshing(false);
  }, []);

  // Initial load
  useEffect(() => {
    fetchMissions();
  }, [fetchMissions]);

  // Poll for updates every 30s
  useEffect(() => {
    const timer = setInterval(() => fetchMissions(true), 30000);
    return () => clearInterval(timer);
  }, [fetchMissions]);

  async function sendMessage() {
    if (!input.trim() || isLoading) return;
    const userMsg: ChatMessage = { role: "user", content: input, time: getTimeStr() };
    setMessages(prev => [...prev, userMsg]);
    const question = input;
    setInput("");
    setIsLoading(true);

    const running = missions.filter(m => normalizeStatus(m.status) === "running");
    const queued = missions.filter(m => normalizeStatus(m.status) === "queued");
    const done = missions.filter(m => normalizeStatus(m.status) === "done");
    const blocked = missions.filter(m => normalizeStatus(m.status) === "blocked");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMsg].map(m => ({ role: m.role === "luna" ? "assistant" : "user", content: m.content })),
          systemPrompt: `Você é Luna, Root Master da LOTUS AI — sistema operacional para PMEs do setor de saúde brasileiro.
Você orquestra 8 departamentos de agentes IA e supervisiona todas as missões em andamento.

ESTADO ATUAL DAS MISSÕES (dados reais do banco):
- Total: ${missions.length} missões
- Executando (${running.length}): ${running.map(m => m.title).join(", ") || "nenhuma"}
- Na fila (${queued.length}): ${queued.map(m => m.title).join(", ") || "nenhuma"}
- Concluídas (${done.length}): ${done.map(m => m.title).join(", ") || "nenhuma"}
- Bloqueadas (${blocked.length}): ${blocked.map(m => m.title).join(", ") || "nenhuma"}

CLIENTES ATIVOS: ${clients.map(c => c.name).join(", ") || "nenhum cadastrado"}

Seja direta, estratégica e use os dados reais acima. Responda em português. Máximo 3 parágrafos.`,
        }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: "luna", content: data.message || "Processando...", time: getTimeStr() }]);
    } catch {
      setMessages(prev => [...prev, { role: "luna", content: "Conexão com IA momentaneamente indisponível. Tente novamente.", time: getTimeStr() }]);
    }
    setIsLoading(false);
  }

  async function updateMissionStatus(id: string, status: string) {
    try {
      await fetch(`/api/missions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      fetchMissions(true);
    } catch {
      // silent
    }
  }

  const running = missions.filter(m => normalizeStatus(m.status) === "running").length;
  const done = missions.filter(m => normalizeStatus(m.status) === "done").length;
  const blocked = missions.filter(m => normalizeStatus(m.status) === "blocked").length;

  return (
    <div className="flex h-full overflow-hidden">
      {showNewMission && (
        <NewMissionModal
          onClose={() => setShowNewMission(false)}
          onCreated={m => setMissions(prev => [m, ...prev])}
        />
      )}

      {/* Left — Missions panel */}
      <div className="w-[420px] flex-shrink-0 border-r border-white/10 flex flex-col h-full">
        {/* Header */}
        <div className="p-4 border-b border-white/10">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-violet-500/20 border border-violet-500/30 flex items-center justify-center">
              <Brain size={16} className="text-violet-400" />
            </div>
            <div className="flex-1">
              <h2 className="text-sm font-bold text-foreground">Root Master — Luna</h2>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs text-muted-foreground">Operacional</span>
              </div>
            </div>
            <button
              onClick={() => fetchMissions(true)}
              className="p-1.5 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors"
              title="Atualizar"
            >
              <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
            </button>
            <button
              onClick={() => setShowNewMission(true)}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-violet-600/20 border border-violet-600/30 text-violet-400 text-xs hover:bg-violet-600/30 transition-colors"
            >
              <Plus size={12} /> Nova
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Executando", value: running, color: "text-blue-400", icon: Activity },
              { label: "Concluídas", value: done, color: "text-emerald-400", icon: CheckCircle2 },
              { label: "Bloqueadas", value: blocked, color: "text-red-400", icon: AlertTriangle },
            ].map(stat => (
              <div key={stat.label} className="bg-white/5 rounded-lg p-2 text-center">
                <div className={cn("text-lg font-bold", stat.color)}>{stat.value}</div>
                <div className="text-[10px] text-muted-foreground">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Mission list */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1 mb-2">
            Missões ({missions.length})
          </div>

          {loadingMissions ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-16 rounded-lg bg-white/3 animate-pulse" />
              ))}
            </div>
          ) : missions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground/50 text-xs">
              <Brain size={24} className="mx-auto mb-2 opacity-30" />
              Nenhuma missão. Crie a primeira acima.
            </div>
          ) : (
            missions.map(mission => {
              const normStatus = normalizeStatus(mission.status);
              const cfg = STATUS_CONFIG[normStatus];
              const StatusIcon = cfg.icon;
              const prio = normalizePriority(mission.priority);
              return (
                <div key={mission.id} className="rounded-lg border border-white/8 bg-white/3 p-3 hover:bg-white/5 transition-colors">
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-foreground leading-tight">{mission.title}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {mission.client?.name && (
                          <span className="text-[10px] text-muted-foreground">{mission.client.name}</span>
                        )}
                        {mission.department && (
                          <>
                            <span className="text-muted-foreground/30">•</span>
                            <span className="text-[10px] text-muted-foreground">{mission.department}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className={cn("flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0", cfg.bg, cfg.color)}>
                      <StatusIcon size={9} />
                      {cfg.label}
                    </div>
                  </div>

                  {mission.description && (
                    <p className="text-[10px] text-muted-foreground/60 leading-tight line-clamp-1 mb-1.5">{mission.description}</p>
                  )}

                  <div className="flex items-center justify-between">
                    <span className={cn("text-[10px] px-1.5 py-0.5 rounded", PRIORITY_COLOR[prio] || PRIORITY_COLOR.normal)}>
                      {prio}
                    </span>
                    {/* Quick status change */}
                    {normStatus === "queued" && (
                      <button
                        onClick={() => updateMissionStatus(mission.id, "IN_PROGRESS")}
                        className="text-[10px] text-blue-400 hover:text-blue-300 px-2 py-0.5 rounded border border-blue-400/20 hover:bg-blue-400/10 transition-colors"
                      >
                        Iniciar →
                      </button>
                    )}
                    {normStatus === "running" && (
                      <button
                        onClick={() => updateMissionStatus(mission.id, "COMPLETED")}
                        className="text-[10px] text-emerald-400 hover:text-emerald-300 px-2 py-0.5 rounded border border-emerald-400/20 hover:bg-emerald-400/10 transition-colors"
                      >
                        Concluir ✓
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Right — Chat with Luna */}
      <div className="flex-1 flex flex-col h-full">
        {/* Chat header */}
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-violet-500/20 border border-violet-500/40 flex items-center justify-center">
              <Brain size={14} className="text-violet-400" />
            </div>
            <div>
              <span className="text-sm font-semibold text-foreground">Luna — Root Master</span>
              <div className="text-[10px] text-muted-foreground">CEO de Operações LOTUS</div>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Target size={12} />
              <span>{missions.length} missões</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Users size={12} />
              <span>{clients.length} clientes</span>
            </div>
            <div className="flex items-center gap-1.5">
              <TrendingUp size={12} />
              <span>8 engines</span>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg, i) => (
            <div key={i} className={cn("flex gap-3", msg.role === "user" ? "flex-row-reverse" : "flex-row")}>
              {msg.role === "luna" && (
                <div className="w-7 h-7 rounded-full bg-violet-500/20 border border-violet-500/40 flex items-center justify-center flex-shrink-0">
                  <Brain size={13} className="text-violet-400" />
                </div>
              )}
              <div className={cn(
                "max-w-[75%] rounded-xl px-4 py-2.5",
                msg.role === "luna"
                  ? "bg-white/5 border border-white/10 text-foreground"
                  : "bg-violet-500/20 border border-violet-500/30 text-foreground"
              )}>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                <span className="text-[10px] text-muted-foreground/50 mt-1 block">{msg.time}</span>
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex gap-3">
              <div className="w-7 h-7 rounded-full bg-violet-500/20 border border-violet-500/40 flex items-center justify-center flex-shrink-0">
                <Brain size={13} className="text-violet-400 animate-pulse" />
              </div>
              <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3">
                <div className="flex gap-1.5">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="w-1.5 h-1.5 rounded-full bg-violet-400/60 animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
                  ))}
                </div>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Quick actions */}
        <div className="px-4 py-2 border-t border-white/5">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {[
              "Status das missões ativas",
              "Qual cliente precisa de atenção?",
              "Resumo de hoje",
              "Próximas prioridades",
              "Crie uma missão de diagnóstico para Odonto Marco",
            ].map(q => (
              <button
                key={q}
                onClick={() => setInput(q)}
                className="flex-shrink-0 text-xs text-muted-foreground hover:text-foreground border border-white/10 hover:border-white/20 rounded-full px-3 py-1 transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        {/* Input */}
        <div className="p-4 border-t border-white/10">
          <div className="flex gap-2">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              placeholder="Fale com Luna — Root Master da LOTUS..."
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-white/25"
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || isLoading}
              className="p-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
