"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { CeoChat } from "@/components/chat/ceo-chat";
import {
  Brain, CheckCircle2, Clock, AlertTriangle, Activity, Plus, RefreshCw, Loader2, ShieldAlert, XCircle,
} from "lucide-react";

interface Mission {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  type?: string;
  client?: { id: string; name: string };
  _count?: { tasks: number };
}

interface ClientOption {
  id: string;
  name: string;
}

type Bucket = "queued" | "running" | "waiting" | "done" | "blocked";

const STATUS_BUCKET: Record<string, Bucket> = {
  PENDING: "queued",
  PLANNING: "queued",
  IN_PROGRESS: "running",
  IN_REVIEW: "running",
  WAITING_APPROVAL: "waiting",
  COMPLETED: "done",
  FAILED: "blocked",
  CANCELLED: "blocked",
};

const BUCKET_CONFIG: Record<Bucket, { label: string; color: string; bg: string; icon: React.ComponentType<{ size?: number }> }> = {
  queued: { label: "Na fila", color: "text-zinc-400", bg: "bg-zinc-400/10", icon: Clock },
  running: { label: "Executando", color: "text-blue-400", bg: "bg-blue-400/10", icon: Activity },
  waiting: { label: "Aguardando aprovação", color: "text-amber-400", bg: "bg-amber-400/10", icon: ShieldAlert },
  done: { label: "Concluída", color: "text-emerald-400", bg: "bg-emerald-400/10", icon: CheckCircle2 },
  blocked: { label: "Parada", color: "text-red-400", bg: "bg-red-400/10", icon: AlertTriangle },
};

const PRIORITY: Record<string, { label: string; color: string }> = {
  URGENT: { label: "Urgente", color: "text-red-400 bg-red-400/10" },
  HIGH: { label: "Alta", color: "text-orange-400 bg-orange-400/10" },
  MEDIUM: { label: "Média", color: "text-amber-400 bg-amber-400/10" },
  LOW: { label: "Baixa", color: "text-zinc-400 bg-zinc-400/10" },
};

const TYPE_LABEL: Record<string, string> = {
  GROWTH: "Crescimento",
  TRANSFORMATION: "Transformação",
  INTELLIGENCE: "Inteligência",
  HYBRID: "Híbrida",
  INTERNAL: "Interna",
};

const bucketOf = (status: string): Bucket => STATUS_BUCKET[status] ?? "queued";

function NewMissionModal({
  clients,
  onClose,
  onCreated,
}: {
  clients: ClientOption[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({ title: "", description: "", clientId: "", priority: "MEDIUM" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleCreate() {
    if (!form.title.trim() || !form.clientId) {
      setError("Informe o título e o cliente.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/missions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, title: form.title.trim(), objective: form.description || form.title }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao criar missão");
      onCreated();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const field = "mt-1 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-white/30";

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-foreground">Nova missão</h3>
        {clients.length === 0 && (
          <p className="text-xs text-amber-400">
            Cadastre um cliente primeiro em <Link href="/clients" className="underline">Clientes</Link> (ou peça ao Root Master no chat).
          </p>
        )}
        <div>
          <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Cliente *</label>
          <select value={form.clientId} onChange={(e) => setForm((p) => ({ ...p, clientId: e.target.value }))} className={field}>
            <option value="">Selecione</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Título *</label>
          <input autoFocus value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} placeholder="Ex: Campanha de implantes — janeiro" className={field} />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Objetivo</label>
          <textarea value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} rows={3} className={cn(field, "resize-none")} />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Prioridade</label>
          <select value={form.priority} onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value }))} className={field}>
            <option value="URGENT">Urgente</option>
            <option value="HIGH">Alta</option>
            <option value="MEDIUM">Média</option>
            <option value="LOW">Baixa</option>
          </select>
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted/50">Cancelar</button>
          <button
            onClick={handleCreate}
            disabled={loading || !form.title.trim() || !form.clientId}
            className="flex-1 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium disabled:opacity-50"
          >
            {loading ? <Loader2 size={14} className="animate-spin mx-auto" /> : "Criar missão"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function RootMasterPage() {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [showNewMission, setShowNewMission] = useState(false);

  const fetchData = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    try {
      const [mRes, cRes, aRes] = await Promise.all([
        fetch("/api/missions"),
        fetch("/api/clients"),
        fetch("/api/approvals?status=PENDING"),
      ]);
      if (!mRes.ok || !cRes.ok) throw new Error("Falha ao carregar missões");
      const mData = await mRes.json();
      const cData = await cRes.json();
      const aData = aRes.ok ? await aRes.json() : { pendingCount: 0 };
      setMissions(mData.missions ?? []);
      setClients(cData.clients ?? []);
      setPendingApprovals(aData.pendingCount ?? 0);
      setLoadError("");
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const timer = setInterval(() => fetchData(true), 10_000);
    return () => clearInterval(timer);
  }, [fetchData]);

  async function setMissionStatus(id: string, status: string) {
    const res = await fetch(`/api/missions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) setLoadError("Não foi possível atualizar a missão.");
    fetchData(true);
  }

  const count = (bucket: Bucket) => missions.filter((m) => bucketOf(m.status) === bucket).length;
  const order: Bucket[] = ["waiting", "running", "queued", "blocked", "done"];
  const sorted = [...missions].sort((a, b) => order.indexOf(bucketOf(a.status)) - order.indexOf(bucketOf(b.status)));

  return (
    <div className="flex h-full overflow-hidden">
      {showNewMission && (
        <NewMissionModal clients={clients} onClose={() => setShowNewMission(false)} onCreated={() => fetchData(true)} />
      )}

      {/* Painel de missões */}
      <div className="w-[380px] flex-shrink-0 border-r border-border flex flex-col h-full">
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center">
              <Brain size={16} className="text-primary" />
            </div>
            <div className="flex-1">
              <h2 className="text-sm font-bold text-foreground">Central de Missões</h2>
              <span className="text-xs text-muted-foreground">{missions.length} missões · {clients.length} clientes</span>
            </div>
            <button onClick={() => fetchData(true)} className="p-1.5 rounded-lg hover:bg-muted/50 text-muted-foreground hover:text-foreground" title="Atualizar">
              <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
            </button>
            <button
              onClick={() => setShowNewMission(true)}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-primary/15 border border-primary/30 text-primary text-xs hover:bg-primary/25"
            >
              <Plus size={12} /> Nova
            </button>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {(["running", "waiting", "done", "blocked"] as Bucket[]).map((bucket) => (
              <div key={bucket} className="bg-muted/30 rounded-lg p-2 text-center">
                <div className={cn("text-lg font-bold", BUCKET_CONFIG[bucket].color)}>{count(bucket)}</div>
                <div className="text-[9px] text-muted-foreground leading-tight">{BUCKET_CONFIG[bucket].label}</div>
              </div>
            ))}
          </div>

          {pendingApprovals > 0 && (
            <Link
              href="/approvals"
              className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-400/10 border border-amber-400/30 text-amber-300 text-xs hover:bg-amber-400/15"
            >
              <ShieldAlert size={13} />
              {pendingApprovals} aprovação(ões) aguardando sua decisão
            </Link>
          )}
          {loadError && (
            <p className="mt-3 flex items-center gap-2 text-xs text-red-400"><XCircle size={12} /> {loadError}</p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {loading ? (
            [1, 2, 3].map((i) => <div key={i} className="h-16 rounded-lg bg-muted/30 animate-pulse" />)
          ) : missions.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-xs">
              <Brain size={24} className="mx-auto mb-2 opacity-30" />
              Nenhuma missão ainda. Peça ao Root Master no chat ou crie uma acima.
            </div>
          ) : (
            sorted.map((mission) => {
              const bucket = bucketOf(mission.status);
              const cfg = BUCKET_CONFIG[bucket];
              const StatusIcon = cfg.icon;
              const priority = PRIORITY[mission.priority] ?? PRIORITY.MEDIUM;
              return (
                <div key={mission.id} className="rounded-lg border border-border bg-card/60 p-3 hover:border-primary/30 transition-colors">
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <Link href={`/missions?open=${mission.id}`} className="flex-1 min-w-0 group">
                      <div className="text-xs font-medium text-foreground leading-tight group-hover:text-primary">{mission.title}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {mission.client?.name ?? "Sem cliente"} · {mission._count?.tasks ?? 0} tarefa(s)
                        {mission.type ? ` · ${TYPE_LABEL[mission.type] ?? mission.type}` : ""}
                      </div>
                    </Link>
                    <div className={cn("flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0", cfg.bg, cfg.color)}>
                      <StatusIcon size={9} />
                      {cfg.label}
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={cn("text-[10px] px-1.5 py-0.5 rounded", priority.color)}>{priority.label}</span>
                    <div className="flex gap-1.5">
                      {bucket === "queued" && (
                        <button onClick={() => setMissionStatus(mission.id, "IN_PROGRESS")} className="text-[10px] text-blue-400 px-2 py-0.5 rounded border border-blue-400/20 hover:bg-blue-400/10">
                          Iniciar
                        </button>
                      )}
                      {bucket === "running" && (
                        <button onClick={() => setMissionStatus(mission.id, "COMPLETED")} className="text-[10px] text-emerald-400 px-2 py-0.5 rounded border border-emerald-400/20 hover:bg-emerald-400/10">
                          Concluir
                        </button>
                      )}
                      {bucket === "waiting" && (
                        <Link href="/approvals" className="text-[10px] text-amber-400 px-2 py-0.5 rounded border border-amber-400/20 hover:bg-amber-400/10">
                          Decidir
                        </Link>
                      )}
                      {(bucket === "blocked" || bucket === "done") && (
                        <button onClick={() => setMissionStatus(mission.id, "IN_PROGRESS")} className="text-[10px] text-muted-foreground px-2 py-0.5 rounded border border-border hover:bg-muted/50">
                          Reabrir
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Chat com o Root Master (a mesma conversa do CEO Chat) */}
      <div className="flex-1 min-w-0 h-full">
        <CeoChat />
      </div>
    </div>
  );
}
