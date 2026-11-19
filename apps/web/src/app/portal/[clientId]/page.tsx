"use client";

import { useState, useEffect, use } from "react";
import { FileText, Target, CheckCircle2, Clock, ChevronDown, ChevronUp, Download, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

interface Document {
  id: string;
  title: string;
  type: string;
  content: string;
  createdAt: string;
}

interface Mission {
  id: string;
  title: string;
  objective: string;
  status: string;
  createdAt: string;
  completedAt?: string;
  documents: Document[];
}

interface Client {
  id: string;
  name: string;
  segment?: string;
  website?: string;
}

interface PortalData {
  client: Client;
  missions: Mission[];
  stats: { totalMissions: number; completedMissions: number; totalDocuments: number };
}

const DOC_TYPE_LABELS: Record<string, string> = {
  COPY: "Copy",
  ANALYSIS: "Análise",
  STRATEGY: "Estratégia",
  CREATIVE_BRIEF: "Brief Criativo",
  DELIVERABLE: "Entregável",
  PROPOSAL: "Proposta",
  RESEARCH_REPORT: "Relatório de Pesquisa",
  CAMPAIGN_STRUCTURE: "Estrutura de Campanha",
  OTHER: "Outro",
};

const DOC_TYPE_COLORS: Record<string, string> = {
  COPY: "text-violet-400 bg-violet-400/10 border-violet-400/20",
  ANALYSIS: "text-blue-400 bg-blue-400/10 border-blue-400/20",
  STRATEGY: "text-amber-400 bg-amber-400/10 border-amber-400/20",
  CREATIVE_BRIEF: "text-pink-400 bg-pink-400/10 border-pink-400/20",
  DELIVERABLE: "text-cyan-400 bg-cyan-400/10 border-cyan-400/20",
  PROPOSAL: "text-orange-400 bg-orange-400/10 border-orange-400/20",
  RESEARCH_REPORT: "text-indigo-400 bg-indigo-400/10 border-indigo-400/20",
  CAMPAIGN_STRUCTURE: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
  OTHER: "text-muted-foreground bg-muted/50 border-border",
};

function DocumentCard({ doc }: { doc: Document }) {
  const [expanded, setExpanded] = useState(false);

  function download() {
    const blob = new Blob([doc.content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${doc.title.replace(/[^a-z0-9]/gi, "_")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="rounded-xl border border-border bg-card/50 overflow-hidden">
      <div
        className="flex items-center gap-3 p-4 cursor-pointer hover:bg-muted/20 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-foreground truncate">{doc.title}</span>
            <span className={cn(
              "text-[10px] font-medium px-1.5 py-0.5 rounded border flex-shrink-0",
              DOC_TYPE_COLORS[doc.type] ?? DOC_TYPE_COLORS.OTHER
            )}>
              {DOC_TYPE_LABELS[doc.type] ?? doc.type}
            </span>
          </div>
          <span className="text-[11px] text-muted-foreground">
            {new Date(doc.createdAt).toLocaleDateString("pt-BR")}
          </span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); download(); }}
            className="p-1.5 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
            title="Baixar"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </div>
      {expanded && (
        <div className="px-4 pb-4 border-t border-border pt-3">
          <pre className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
            {doc.content}
          </pre>
        </div>
      )}
    </div>
  );
}

function MissionCard({ mission }: { mission: Mission }) {
  const [expanded, setExpanded] = useState(false);
  const isCompleted = mission.status === "COMPLETED";

  return (
    <div className={cn(
      "rounded-xl border bg-card overflow-hidden",
      isCompleted ? "border-emerald-500/20" : "border-border"
    )}>
      <div
        className="flex items-start gap-4 p-5 cursor-pointer hover:bg-muted/10 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className={cn(
          "w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 border",
          isCompleted ? "bg-emerald-500/10 border-emerald-500/20" : "bg-muted/30 border-border"
        )}>
          {isCompleted
            ? <CheckCircle2 className="w-4.5 h-4.5 text-emerald-400" />
            : <Clock className="w-4.5 h-4.5 text-muted-foreground" />
          }
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h3 className="font-semibold text-foreground text-sm">{mission.title}</h3>
            <span className={cn(
              "text-[10px] font-medium px-1.5 py-0.5 rounded border",
              isCompleted
                ? "text-emerald-400 bg-emerald-400/10 border-emerald-400/20"
                : "text-amber-400 bg-amber-400/10 border-amber-400/20"
            )}>
              {isCompleted ? "Concluída" : mission.status === "FAILED" ? "Em revisão" : mission.status === "PENDING" ? "Agendada" : "Em andamento"}
            </span>
            {mission.documents.length > 0 && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border text-muted-foreground bg-muted/30 border-border">
                {mission.documents.length} entregável{mission.documents.length !== 1 ? "is" : ""}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground line-clamp-2">{mission.objective}</p>
          <p className="text-[11px] text-muted-foreground mt-1">
            {new Date(mission.createdAt).toLocaleDateString("pt-BR")}
            {mission.completedAt && ` — Concluída em ${new Date(mission.completedAt).toLocaleDateString("pt-BR")}`}
          </p>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" /> : <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" />}
      </div>

      {expanded && mission.documents.length > 0 && (
        <div className="px-5 pb-5 border-t border-border pt-4 space-y-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Entregáveis</p>
          {mission.documents.map((doc) => (
            <DocumentCard key={doc.id} doc={doc} />
          ))}
        </div>
      )}

      {expanded && mission.documents.length === 0 && (
        <div className="px-5 pb-5 border-t border-border pt-4 text-center text-muted-foreground text-sm">
          {isCompleted ? "Nenhum entregável nesta missão" : "Os entregáveis aparecem aqui quando a missão for concluída"}
        </div>
      )}
    </div>
  );
}

export default function PortalPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = use(params);
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/portal/${clientId}`)
      .then(async (r) => {
        const d = await r.json().catch(() => null);
        if (!r.ok || !d || d.error) setError(d?.error ?? "Erro ao carregar dados");
        else setData(d);
      })
      .catch(() => setError("Erro ao carregar dados"))
      .finally(() => setLoading(false));
  }, [clientId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground text-sm animate-pulse">Carregando portal...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground text-sm">{error ?? "Erro desconhecido"}</p>
        </div>
      </div>
    );
  }

  const { client, missions, stats } = data;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/30 to-primary/10 border border-primary/50 flex items-center justify-center">
              <Target className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-foreground">Portal do Cliente</h1>
              <p className="text-[11px] text-muted-foreground">LOTUS AI — Resultados exclusivos</p>
            </div>
          </div>
          {client.website && (
            <a
              href={client.website.startsWith("http") ? client.website : `https://${client.website}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Site
            </a>
          )}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        {/* Client info */}
        <div>
          <h2 className="text-3xl font-bold text-foreground">{client.name}</h2>
          {client.segment && <p className="text-muted-foreground mt-1">{client.segment}</p>}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-xl border border-border bg-card p-4 text-center">
            <div className="text-2xl font-bold text-foreground">{stats.totalMissions}</div>
            <div className="text-xs text-muted-foreground mt-1">Missões</div>
          </div>
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-center">
            <div className="text-2xl font-bold text-emerald-400">{stats.completedMissions}</div>
            <div className="text-xs text-muted-foreground mt-1">Concluídas</div>
          </div>
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-center">
            <div className="text-2xl font-bold text-primary">{stats.totalDocuments}</div>
            <div className="text-xs text-muted-foreground mt-1">Entregáveis</div>
          </div>
        </div>

        {/* Missions */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Missões e Entregáveis
          </h3>
          {missions.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Target className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Nenhuma missão ainda</p>
            </div>
          ) : (
            missions.map((mission) => (
              <MissionCard key={mission.id} mission={mission} />
            ))
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground pb-8">
          Powered by LOTUS AI — Sua agência inteligente
        </p>
      </div>
    </div>
  );
}
