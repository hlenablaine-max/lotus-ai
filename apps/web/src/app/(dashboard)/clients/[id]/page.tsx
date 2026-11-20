"use client";

import { useState, useEffect, use } from "react";
import {
  ArrowLeft, Building2, Globe, Instagram, Target, MessageSquare,
  TrendingUp, Calendar, Users, ChevronRight, ExternalLink, Briefcase,
  Loader2, AlertCircle, CheckCircle, Clock, Link2, FileText
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { ClientAvatar } from "@/components/ui/client-avatar";

interface Client {
  id: string;
  name: string;
  slug: string;
  segment?: string;
  website?: string;
  instagram?: string;
  description?: string;
  status: string;
  createdAt: string;
  _count: { missions: number; documents?: number };
  assessments?: Array<{
    id: string;
    recommendedSetupPrice: number;
    recommendedMonthlyPrice: number;
    estimatedMonthlyROI: number;
    paybackMonths: number;
    pricingRationale: string;
    createdAt: string;
  }>;
  memories?: Array<{ id: string; content: string; updatedAt: string }>;
}

interface Mission {
  id: string;
  title: string;
  status: string;
  priority: string;
  objective: string;
  createdAt: string;
  _count?: { tasks: number };
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  ACTIVE:   { label: "Ativo",    color: "text-emerald-400", bg: "bg-emerald-400/10 border-emerald-400/20" },
  PAUSED:   { label: "Pausado",  color: "text-amber-400",   bg: "bg-amber-400/10 border-amber-400/20" },
  CHURNED:  { label: "Perdido",       color: "text-red-400",     bg: "bg-red-400/10 border-red-400/20" },
  PROSPECT: { label: "Em prospecção", color: "text-blue-400",    bg: "bg-blue-400/10 border-blue-400/20" },
};

const MISSION_STATUS: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  DRAFT:       { label: "Rascunho",  color: "text-muted-foreground", icon: Clock },
  PENDING:     { label: "Pendente",  color: "text-muted-foreground", icon: Clock },
  PLANNING:    { label: "Planejando", color: "text-blue-400",        icon: Clock },
  WAITING_APPROVAL: { label: "Aguardando aprovação", color: "text-amber-400", icon: AlertCircle },
  IN_REVIEW:   { label: "Em revisão", color: "text-purple-400",      icon: Clock },
  FAILED:      { label: "Falhou",    color: "text-red-400",          icon: AlertCircle },
  IN_PROGRESS: { label: "Em andamento", color: "text-amber-400",     icon: Loader2 },
  COMPLETED:   { label: "Concluída", color: "text-emerald-400",      icon: CheckCircle },
  CANCELLED:   { label: "Cancelada", color: "text-red-400",          icon: AlertCircle },
};

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(iso));
}

function formatCurrency(v?: number) {
  if (!v) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);
}

export default function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [client, setClient] = useState<Client | null>(null);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"overview" | "missions" | "chat">("overview");
  const [portalPath, setPortalPath] = useState<string | null>(null);
  const [portalCopied, setPortalCopied] = useState(false);

  const [portalWarning, setPortalWarning] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // O portal roda neste computador: um link "localhost" não abre no celular do cliente.
  // Com NEXT_PUBLIC_PORTAL_URL configurado (endereço público), o link vai com ele.
  const copyPortalLink = async () => {
    if (!portalPath) return;
    const publicBase = process.env.NEXT_PUBLIC_PORTAL_URL?.replace(/\/$/, "");
    const base = publicBase || window.location.origin;
    try {
      await navigator.clipboard.writeText(`${base}${portalPath}`);
      setPortalCopied(true);
      setTimeout(() => setPortalCopied(false), 2500);
    } catch {
      setPortalWarning("Não deu para copiar o link.");
      return;
    }
    setPortalWarning(
      !publicBase && /localhost|127\.0\.0\.1/.test(base)
        ? "Atenção: este link só abre neste computador. Para o cliente, mande o relatório em PDF (em Missões ou no Diagnóstico) ou configure um endereço público para o portal."
        : null
    );
  };

  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    Promise.all([
      fetch(`/api/clients/${id}`).then(async (r) => ({ ok: r.ok, status: r.status, data: await r.json().catch(() => ({})) })),
      fetch(`/api/missions?clientId=${id}`).then((r) => r.json()).catch(() => ({ missions: [] })),
    ])
      .then(([clientRes, missionsData]) => {
        if (!clientRes.ok && clientRes.status !== 404) throw new Error(clientRes.data.error ?? `erro ${clientRes.status}`);
        setClient(clientRes.data.client ?? null);
        setPortalPath(clientRes.data.portalPath ?? null);
        setMissions(missionsData.missions ?? []);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [id, reloadKey]);

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="p-8">
        <p className="text-muted-foreground">{loadError ? `Não foi possível carregar o cliente (${loadError}).` : "Cliente não encontrado."}</p>
        {loadError && (
          <button onClick={() => setReloadKey((k) => k + 1)} className="text-primary text-sm mt-2 mr-4 hover:underline">Tentar de novo</button>
        )}
        <Link href="/clients" className="text-primary text-sm mt-2 inline-flex items-center gap-1 hover:underline">
          <ArrowLeft className="w-3 h-3" /> Voltar para Clientes
        </Link>
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[client.status] ?? STATUS_CONFIG.ACTIVE;
  const activeMissions = missions.filter((m) => m.status === "IN_PROGRESS").length;
  const completedMissions = missions.filter((m) => m.status === "COMPLETED").length;

  return (
    <div className="p-8 space-y-6">
      {/* Breadcrumb + Back */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/clients" className="hover:text-foreground transition-colors flex items-center gap-1">
          <ArrowLeft className="w-3.5 h-3.5" /> Clientes
        </Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-foreground">{client.name}</span>
      </div>

      {/* Client header */}
      <div className="flex items-start gap-6 p-6 rounded-2xl bg-card border border-border">
        <ClientAvatar clientId={client.id} name={client.name} size={72} className="rounded-2xl flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold text-foreground">{client.name}</h1>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                {client.segment && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Briefcase className="w-3 h-3" /> {client.segment}
                  </span>
                )}
                <span className={cn("inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border", statusCfg.bg, statusCfg.color)}>
                  {statusCfg.label}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {client.website && (
                <a href={client.website.startsWith("http") ? client.website : `https://${client.website}`} target="_blank" rel="noopener noreferrer"
                  className="p-2 rounded-lg bg-muted/50 border border-border hover:border-primary/30 transition-all text-muted-foreground hover:text-primary">
                  <Globe className="w-4 h-4" />
                </a>
              )}
              {client.instagram && (
                <a href={`https://instagram.com/${client.instagram.replace("@", "")}`} target="_blank" rel="noopener noreferrer"
                  className="p-2 rounded-lg bg-muted/50 border border-border hover:border-pink-500/30 transition-all text-muted-foreground hover:text-pink-400">
                  <Instagram className="w-4 h-4" />
                </a>
              )}
              {portalPath && (
                <button onClick={copyPortalLink} title="Link assinado para o cliente acompanhar as entregas (sem login)"
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 border border-border text-sm text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all">
                  <Link2 className="w-4 h-4" /> {portalCopied ? "Link copiado" : "Portal do cliente"}
                </button>
              )}
              {portalWarning && (
                <span className="text-[11px] text-amber-300 max-w-[280px] leading-snug">{portalWarning}</span>
              )}
              <Link href={`/ceo?clientId=${client.id}&clientName=${encodeURIComponent(client.name)}`}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/15 border border-primary/20 text-primary text-sm font-medium hover:bg-primary/25 transition-all">
                <MessageSquare className="w-4 h-4" /> CEO Chat
              </Link>
            </div>
          </div>
          {client.description && (
            <p className="text-sm text-muted-foreground mt-3 leading-relaxed max-w-2xl">{client.description}</p>
          )}
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Missões totais",  value: client._count.missions, icon: Target,    color: "text-primary" },
          { label: "Em andamento",    value: activeMissions,         icon: TrendingUp, color: "text-amber-400" },
          { label: "Concluídas",      value: completedMissions,      icon: CheckCircle, color: "text-emerald-400" },
          { label: "Entregáveis",     value: client._count.documents ?? 0, icon: FileText, color: "text-primary" },
        ].map((kpi) => (
          <div key={kpi.label} className="p-4 rounded-xl bg-card border border-border">
            <div className="flex items-center gap-2 mb-2">
              <kpi.icon className={cn("w-4 h-4", kpi.color)} />
              <span className="text-xs text-muted-foreground">{kpi.label}</span>
            </div>
            <p className={cn("text-2xl font-bold", kpi.color)}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 rounded-lg bg-muted/50 border border-border w-fit">
        {(["overview", "missions", "chat"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={cn("px-4 py-1.5 rounded-md text-sm font-medium transition-all",
              tab === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}>
            {t === "overview" ? "Visão Geral" : t === "missions" ? "Missões" : "Chat com CEO"}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="p-5 rounded-xl bg-card border border-border">
            <h3 className="text-sm font-semibold text-foreground mb-4">Informações do Cliente</h3>
            <dl className="space-y-3">
              {[
                { label: "Segmento", value: client.segment ?? "—" },
                { label: "Website", value: client.website ?? "—" },
                { label: "Instagram", value: client.instagram ?? "—" },
                { label: "Cliente desde", value: formatDate(client.createdAt) },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between gap-2 py-2 border-b border-border/50 last:border-0">
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="text-sm text-foreground font-medium">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="p-5 rounded-xl bg-card border border-border">
            <h3 className="text-sm font-semibold text-foreground mb-4">Últimas Missões</h3>
            {missions.slice(0, 5).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhuma missão encontrada</p>
            ) : (
              <div className="space-y-2">
                {missions.slice(0, 5).map((m) => {
                  const mCfg = MISSION_STATUS[m.status] ?? MISSION_STATUS.DRAFT;
                  const MIcon = mCfg.icon;
                  return (
                    <Link key={m.id} href={`/missions/${m.id}`}
                      className="flex items-center justify-between gap-3 p-3 rounded-lg hover:bg-muted/30 transition-all group">
                      <div className="flex items-center gap-3 min-w-0">
                        <MIcon className={cn("w-4 h-4 flex-shrink-0", mCfg.color, m.status === "IN_PROGRESS" && "animate-spin")} />
                        <span className="text-sm text-foreground truncate">{m.title}</span>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="p-5 rounded-xl bg-card border border-border">
            <h3 className="text-sm font-semibold text-foreground mb-4">Precificação (avaliação de preço)</h3>
            {!client.assessments?.length ? (
              <p className="text-sm text-muted-foreground py-4">
                Nenhum assessment ainda. Peça ao Advisor: &quot;faça o assessment de preço de {client.name}&quot;.
              </p>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-muted/30 border border-border p-3">
                    <div className="text-xs text-muted-foreground">Setup recomendado</div>
                    <div className="text-lg font-bold text-foreground">{formatCurrency(client.assessments[0].recommendedSetupPrice)}</div>
                  </div>
                  <div className="rounded-lg bg-muted/30 border border-border p-3">
                    <div className="text-xs text-muted-foreground">Mensalidade recomendada</div>
                    <div className="text-lg font-bold text-foreground">{formatCurrency(client.assessments[0].recommendedMonthlyPrice)}</div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{client.assessments[0].pricingRationale}</p>
                <p className="text-[11px] text-muted-foreground/70">Registrado em {formatDate(client.assessments[0].createdAt)}</p>
              </div>
            )}
          </div>
          <div className="p-5 rounded-xl bg-card border border-border">
            <h3 className="text-sm font-semibold text-foreground mb-4">Memória do cliente</h3>
            {!client.memories?.length ? (
              <p className="text-sm text-muted-foreground py-4">
                Vazia. Cada tarefa concluída para este cliente grava um resumo aqui, e os agentes leem isso nas próximas missões.
              </p>
            ) : (
              <ul className="space-y-2 max-h-64 overflow-y-auto">
                {client.memories.map((m) => (
                  <li key={m.id} className="text-xs text-muted-foreground leading-relaxed border-b border-border/50 pb-2 last:border-0">
                    {m.content}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {tab === "missions" && (
        <div className="space-y-3">
          {missions.length === 0 ? (
            <div className="p-12 rounded-xl bg-card border border-border text-center">
              <Target className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Nenhuma missão para este cliente</p>
              <Link href="/missions" className="text-primary text-sm mt-2 inline-flex items-center gap-1 hover:underline">
                Criar primeira missão <ExternalLink className="w-3 h-3" />
              </Link>
            </div>
          ) : (
            missions.map((m) => {
              const mCfg = MISSION_STATUS[m.status] ?? MISSION_STATUS.DRAFT;
              const MIcon = mCfg.icon;
              return (
                <Link key={m.id} href={`/missions/${m.id}`}
                  className="flex items-start gap-4 p-4 rounded-xl bg-card border border-border hover:border-primary/30 transition-all group">
                  <div className="w-9 h-9 rounded-lg bg-muted/50 border border-border flex items-center justify-center flex-shrink-0 mt-0.5">
                    <MIcon className={cn("w-4 h-4", mCfg.color, m.status === "IN_PROGRESS" && "animate-spin")} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-medium text-foreground group-hover:text-primary transition-colors">{m.title}</h4>
                      <span className={cn("text-xs px-2 py-0.5 rounded-md border flex-shrink-0", STATUS_CONFIG[m.status]?.bg ?? "bg-muted/30 border-border", mCfg.color)}>
                        {mCfg.label}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{m.objective}</p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {formatDate(m.createdAt)}</span>
                      {m._count && <span className="flex items-center gap-1"><Target className="w-3 h-3" /> {m._count.tasks} tarefas</span>}
                    </div>
                  </div>
                </Link>
              );
            })
          )}
        </div>
      )}

      {tab === "chat" && (
        <div className="p-6 rounded-xl bg-card border border-border text-center">
          <MessageSquare className="w-10 h-10 text-primary/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground mb-4">
            Converse com o CEO sobre estratégias para <strong className="text-foreground">{client.name}</strong>
          </p>
          <Link href={`/ceo?clientId=${client.id}&clientName=${encodeURIComponent(client.name)}`}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-all">
            <MessageSquare className="w-4 h-4" /> Abrir CEO Chat
          </Link>
        </div>
      )}
    </div>
  );
}
