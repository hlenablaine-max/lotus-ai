"use client";

import { useState, useEffect, useCallback } from "react";
import { CheckCircle2, XCircle, Clock, RefreshCw, Bell, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface Approval {
  id: string;
  type: string;
  title: string;
  description: string;
  payload: Record<string, unknown>;
  status: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";
  requestedBy: string;
  requestedByName?: string;
  createdAt: string;
  decidedAt?: string;
  decisionNote?: string;
  mission?: { id: string; title: string; client: { name: string } };
}

const TYPE_LABELS: Record<string, string> = {
  PUBLISH_CAMPAIGN: "Publicar Campanha",
  SPEND_BUDGET: "Gastar Orçamento",
  SEND_EXTERNAL_MESSAGE: "Enviar Mensagem",
  EXTERNAL_ACTION: "Ação Externa",
  SEND_PROPOSAL: "Enviar Proposta",
  CREATE_AGENT: "Contratar Agente",
  GRANT_PERMISSION: "Conceder Permissão",
  IMPLEMENT_IN_PRODUCTION: "Implementar em Produção",
  OTHER: "Outro",
};

const TYPE_COLORS: Record<string, string> = {
  PUBLISH_CAMPAIGN: "text-violet-400 bg-violet-400/10 border-violet-400/20",
  SPEND_BUDGET: "text-amber-400 bg-amber-400/10 border-amber-400/20",
  SEND_EXTERNAL_MESSAGE: "text-blue-400 bg-blue-400/10 border-blue-400/20",
  EXTERNAL_ACTION: "text-orange-400 bg-orange-400/10 border-orange-400/20",
  SEND_PROPOSAL: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
  CREATE_AGENT: "text-pink-400 bg-pink-400/10 border-pink-400/20",
  GRANT_PERMISSION: "text-cyan-400 bg-cyan-400/10 border-cyan-400/20",
  IMPLEMENT_IN_PRODUCTION: "text-red-400 bg-red-400/10 border-red-400/20",
  OTHER: "text-muted-foreground bg-muted/50 border-border",
};

// Nomes legíveis para os campos mais comuns dos pedidos de aprovação
const FIELD_LABELS: Record<string, string> = {
  phone: "Telefone", message: "Mensagem", to: "Para", url: "Link", amount: "Valor", budget: "Orçamento",
  dailyBudget: "Orçamento diário", campaign: "Campanha", platform: "Plataforma", command: "Comando", path: "Arquivo",
  reason: "Motivo", handle: "Perfil", business: "Negócio", businessName: "Negócio", clientName: "Cliente",
  missionId: "Missão", taskId: "Tarefa", action: "Ação", title: "Título", description: "Descrição", text: "Texto",
};

function humanizeKey(key: string): string {
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  const spaced = key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function PayloadValue({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === "") return <span className="text-muted-foreground/60">—</span>;
  if (typeof value === "boolean") return <>{value ? "Sim" : "Não"}</>;
  if (typeof value === "string" || typeof value === "number") return <span className="whitespace-pre-wrap break-words">{String(value)}</span>;
  if (Array.isArray(value)) {
    return (
      <ul className="list-disc pl-4 space-y-0.5">
        {value.map((v, i) => (
          <li key={i}><PayloadValue value={v} /></li>
        ))}
      </ul>
    );
  }
  return <PayloadView payload={value as Record<string, unknown>} nested />;
}

function PayloadView({ payload, nested = false }: { payload: Record<string, unknown> | null | undefined; nested?: boolean }) {
  const entries = Object.entries(payload ?? {}).filter(([k]) => !/token|secret|password|apikey/i.test(k));
  if (entries.length === 0) return <p className="text-xs text-muted-foreground">Sem detalhes adicionais.</p>;
  return (
    <dl className={cn("grid grid-cols-[minmax(90px,auto)_1fr] gap-x-4 gap-y-1.5 text-xs", !nested && "bg-muted/30 rounded-lg p-3")}>
      {entries.map(([key, value]) => (
        <div key={key} className="contents">
          <dt className="text-muted-foreground">{humanizeKey(key)}</dt>
          <dd className="text-foreground/90 min-w-0"><PayloadValue value={value} /></dd>
        </div>
      ))}
    </dl>
  );
}

function ApprovalCard({ approval, onDecision }: {
  approval: Approval;
  onDecision: (id: string, action: "APPROVED" | "REJECTED", note?: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [deciding, setDeciding] = useState(false);
  const [note, setNote] = useState("");

  const isPending = approval.status === "PENDING";

  async function decide(action: "APPROVED" | "REJECTED") {
    setDeciding(true);
    try {
      await onDecision(approval.id, action, note || undefined);
    } finally {
      setDeciding(false);
    }
  }

  return (
    <div className={cn(
      "rounded-xl border bg-card transition-all",
      isPending ? "border-amber-500/20 hover:border-amber-500/40" : "border-border opacity-60"
    )}>
      {/* Header */}
      <div className="p-5 flex items-start gap-4">
        <div className={cn(
          "w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 border",
          isPending
            ? "bg-amber-400/10 border-amber-400/20"
            : approval.status === "APPROVED"
            ? "bg-emerald-400/10 border-emerald-400/20"
            : "bg-red-400/10 border-red-400/20"
        )}>
          {isPending
            ? <Clock className="w-5 h-5 text-amber-400" />
            : approval.status === "APPROVED"
            ? <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            : <XCircle className="w-5 h-5 text-red-400" />
          }
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h3 className="font-semibold text-foreground text-sm">{approval.title}</h3>
            <span className={cn(
              "text-[10px] font-medium px-1.5 py-0.5 rounded border",
              TYPE_COLORS[approval.type] ?? TYPE_COLORS.OTHER
            )}>
              {TYPE_LABELS[approval.type] ?? approval.type}
            </span>
            {!isPending && (
              <span className={cn(
                "text-[10px] font-medium px-1.5 py-0.5 rounded border",
                approval.status === "APPROVED"
                  ? "text-emerald-400 bg-emerald-400/10 border-emerald-400/20"
                  : "text-red-400 bg-red-400/10 border-red-400/20"
              )}>
                {approval.status === "APPROVED" ? "Aprovado" : approval.status === "EXPIRED" ? "Expirado" : "Rejeitado"}
              </span>
            )}
          </div>

          {approval.mission && (
            <p className="text-[11px] text-muted-foreground">
              {approval.mission.client.name} — {approval.mission.title}
            </p>
          )}

          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{approval.description}</p>

          <p className="text-[10px] text-muted-foreground mt-1">
            {approval.requestedByName ? `Pedido por ${approval.requestedByName} · ` : ""}
            {new Date(approval.createdAt).toLocaleString("pt-BR")}
          </p>
        </div>

        <button
          onClick={() => setExpanded((v) => !v)}
          className="p-1.5 rounded hover:bg-muted/50 text-muted-foreground transition-colors flex-shrink-0"
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Expanded payload */}
      {expanded && (
        <div className="px-5 pb-4 border-t border-border pt-4">
          <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Detalhes do que será feito</p>
          <PayloadView payload={approval.payload} />
        </div>
      )}

      {/* Actions */}
      {isPending && (
        <div className="px-5 pb-5 space-y-3">
          <input
            type="text"
            placeholder="Nota opcional (motivo da aprovação/rejeição)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-lg bg-muted/30 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
          />
          <div className="flex gap-3">
            <button
              onClick={() => decide("APPROVED")}
              disabled={deciding}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-400 text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CheckCircle2 className="w-4 h-4" />
              {deciding ? "Processando..." : "Aprovar"}
            </button>
            <button
              onClick={() => decide("REJECTED")}
              disabled={deciding}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-400 text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <XCircle className="w-4 h-4" />
              Rejeitar
            </button>
          </div>
        </div>
      )}

      {!isPending && approval.decisionNote && (
        <div className="px-5 pb-4">
          <p className="text-xs text-muted-foreground">
            <span className="font-medium">Nota:</span> {approval.decisionNote}
          </p>
        </div>
      )}
    </div>
  );
}

export default function ApprovalsPage() {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"PENDING" | "ALL">("PENDING");
  const [loadError, setLoadError] = useState<string | null>(null);

  const [decisionError, setDecisionError] = useState<string | null>(null);

  // silent = atualização automática: não troca a lista por esqueleto (senão a observação digitada some)
  const fetchApprovals = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`/api/approvals?status=${filter}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setApprovals(data.approvals ?? []);
      setPendingCount(data.pendingCount ?? 0);
      setLoadError(null);
    } catch (err) {
      if (!silent) setApprovals([]);
      setLoadError(`Não foi possível carregar as aprovações (${err instanceof Error ? err.message : String(err)})`);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchApprovals();
    // Atualiza a cada 10 s, só com a janela visível
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") fetchApprovals(true);
    }, 10_000);
    return () => clearInterval(interval);
  }, [fetchApprovals]);

  async function handleDecision(id: string, action: "APPROVED" | "REJECTED", note?: string) {
    setDecisionError(null);
    const res = await fetch(`/api/approvals/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, decisionNote: note }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setDecisionError(`A decisão não foi registrada (${data?.error ?? `HTTP ${res.status}`})`);
      return;
    }
    await fetchApprovals(true);
  }

  const displayedApprovals = filter === "PENDING"
    ? approvals.filter((a) => a.status === "PENDING")
    : approvals;

  return (
    <div className="p-8 space-y-6 overflow-auto h-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-foreground">Aprovações</h1>
            {pendingCount > 0 && (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-400/15 border border-amber-400/30 text-amber-400 text-sm font-semibold">
                <Bell className="w-3.5 h-3.5" />
                {pendingCount} pendente{pendingCount !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          <p className="text-muted-foreground mt-1">
            Decisões críticas que precisam da sua aprovação antes de executar
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex rounded-lg border border-border overflow-hidden">
            <button
              onClick={() => setFilter("PENDING")}
              className={cn(
                "px-4 py-2 text-sm transition-colors",
                filter === "PENDING"
                  ? "bg-primary/15 text-primary border-r border-primary/20"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50 border-r border-border"
              )}
            >
              Pendentes
            </button>
            <button
              onClick={() => setFilter("ALL")}
              className={cn(
                "px-4 py-2 text-sm transition-colors",
                filter === "ALL"
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              Todas
            </button>
          </div>
          <button
            onClick={() => fetchApprovals()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-muted/50 hover:bg-muted border border-border text-sm text-muted-foreground hover:text-foreground transition-all"
          >
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
            Atualizar
          </button>
        </div>
      </div>

      {/* Stats */}
      {pendingCount > 0 && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 flex items-center gap-3">
          <Bell className="w-5 h-5 text-amber-400 flex-shrink-0" />
          <p className="text-sm text-amber-200">
            <span className="font-semibold">{pendingCount} ação{pendingCount !== 1 ? "ões aguardam" : " aguarda"} sua aprovação.</span>{" "}
            As ações só são executadas depois da sua decisão.
          </p>
        </div>
      )}

      {loadError && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">{loadError}</div>
      )}
      {decisionError && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300 flex items-start justify-between gap-3">
          <span>{decisionError}</span>
          <button onClick={() => setDecisionError(null)} className="text-xs underline flex-shrink-0">Fechar</button>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-5 animate-pulse h-28" />
          ))}
        </div>
      ) : displayedApprovals.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <CheckCircle2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">
            {filter === "PENDING" ? "Nenhuma aprovação pendente" : "Nenhuma aprovação registrada"}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {displayedApprovals.map((approval) => (
            <ApprovalCard
              key={approval.id}
              approval={approval}
              onDecision={handleDecision}
            />
          ))}
        </div>
      )}
    </div>
  );
}
