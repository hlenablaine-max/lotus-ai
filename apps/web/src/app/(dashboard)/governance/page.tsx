"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  CheckCircle2, AlertTriangle, Clock, XCircle, Minus, Shield,
  ChevronDown, ChevronRight, Info,
} from "lucide-react";

// ============================================================
// TIPOS
// ============================================================
type AuditLevel = "A" | "B" | "C" | "D";
type AuditTag = "VERIFIED" | "IMPLEMENTED" | "PARTIAL" | "SIMULATED" | "MISSING" | "BLOCKED";

interface AuditItem {
  id: string;
  name: string;
  description: string;
  tag: AuditTag;
  level: AuditLevel;
  evidence?: string;
  impact: "critical" | "high" | "medium" | "low";
}

interface AuditDomain {
  id: string;
  name: string;
  description: string;
  items: AuditItem[];
}

// ============================================================
// DADOS DE AUDITORIA
// ============================================================
const AUDIT_DOMAINS: AuditDomain[] = [
  {
    id: "hq",
    name: "HQ 3D Office",
    description: "Escritório virtual com agentes ao vivo",
    items: [
      { id: "hq-1", name: "Renderização 3D WebGL", description: "Three.js + React Three Fiber carregando escritório", tag: "VERIFIED", level: "A", evidence: "Renderiza em /headquarters com agentes animados", impact: "high" },
      { id: "hq-2", name: "Animações de agentes", description: "Walking, sitting, thinking, idle animations via useFrame", tag: "VERIFIED", level: "A", evidence: "Character3D usa lerp + leg/arm cycle confirmado", impact: "high" },
      { id: "hq-3", name: "Simulation loop ao vivo", description: "setInterval 3s muda status dos agentes automaticamente", tag: "VERIFIED", level: "A", evidence: "22% chance/agente/tick, STATUS_TRANSITIONS ponderado", impact: "critical" },
      { id: "hq-4", name: "Feed de atividade em tempo real", description: "Eventos aparecem no painel direito conforme simulação", tag: "VERIFIED", level: "A", evidence: "feedEvents state populado pela simulation loop", impact: "medium" },
      { id: "hq-5", name: "Chat com CEO (Luna)", description: "Interface de chat com Root Master integrada", tag: "IMPLEMENTED", level: "B", evidence: "CeoChat component em /headquarters", impact: "high" },
      { id: "hq-6", name: "DB polling de agentes reais", description: "useEffect busca agentes do banco a cada 15s, merge por departamento", tag: "IMPLEMENTED", level: "B", evidence: "API /api/hq/agents (Prisma) retorna statuses reais, merge confirmado no código", impact: "medium" },
    ],
  },
  {
    id: "engines",
    name: "8 Motores Operacionais",
    description: "Pipeline da análise à receita atribuída — todos com API real",
    items: [
      { id: "eng-1", name: "Engine 1: Intelligence", description: "Coleta e análise de mercado, concorrentes, oportunidades", tag: "IMPLEMENTED", level: "B", evidence: "/api/engines/intelligence → IA real, retorna market/competitors/trends/opportunities JSON", impact: "high" },
      { id: "eng-2", name: "Engine 2: Investigation", description: "Auditoria digital 360° com SSE streaming", tag: "VERIFIED", level: "A", evidence: "SSE real + 8 probes (meta/instagram/gmb/website/ads/seo/whatsapp/competitors)", impact: "high" },
      { id: "eng-3", name: "Engine 3: Diagnóstico", description: "Diagnóstico 8 dimensões com score e ROI", tag: "VERIFIED", level: "A", evidence: "/diagnosis funcional, IA integrada, 8 dimensões com score 0-100", impact: "critical" },
      { id: "eng-4", name: "Engine 4: Strategy", description: "Plano de crescimento 90 dias com OKRs e canais", tag: "IMPLEMENTED", level: "B", evidence: "/api/engines/strategy → plano completo: público, posicionamento, canais, OKRs, quick wins", impact: "critical" },
      { id: "eng-5", name: "Engine 5: Solution Architecture", description: "Stack de soluções recomendada por cliente", tag: "IMPLEMENTED", level: "B", evidence: "/api/engines/solution-arch → componentes, tech stack, fases, automações, ROI esperado", impact: "high" },
      { id: "eng-6", name: "Engine 6: Build", description: "Geração real: landing page HTML, copy, automação WhatsApp", tag: "IMPLEMENTED", level: "B", evidence: "/api/engines/build: 4 tipos (landing_page|copy|whatsapp_automation|content_calendar)", impact: "critical" },
      { id: "eng-7", name: "Engine 7: Implementation", description: "Plano de implementação passo-a-passo, guias de setup", tag: "IMPLEMENTED", level: "B", evidence: "/api/engines/implementation → setup guides (Meta/GA/WhatsApp), cronograma semana a semana", impact: "critical" },
      { id: "eng-8", name: "Engine 8: Revenue Intelligence", description: "Projeções de receita, ROI, oportunidades, precificação", tag: "IMPLEMENTED", level: "B", evidence: "/api/engines/revenue → 3 cenários de projeção, benchmarks de mercado, KPIs, oportunidades", impact: "critical" },
    ],
  },
  {
    id: "ai",
    name: "Inteligência Artificial",
    description: "Integração de modelos de IA na plataforma",
    items: [
      { id: "ai-1", name: "Drael v1 — API integrada", description: "Modelo principal para diagnóstico e chat", tag: "VERIFIED", level: "A", evidence: "drael-v1 via OpenAI-compatible endpoint, testado", impact: "critical" },
      { id: "ai-2", name: "Claude Haiku — Sales Copilot", description: "Sugestões em tempo real para vendas", tag: "IMPLEMENTED", level: "B", evidence: "/copilot usa Anthropic SDK diretamente", impact: "high" },
      { id: "ai-3", name: "Luna — Root Master operacional", description: "CEO de operações, usa missões reais do Prisma", tag: "IMPLEMENTED", level: "B", evidence: "Root Master lê /api/missions (Prisma), system prompt dinâmico com dados reais, polling 30s", impact: "critical" },
      { id: "ai-4", name: "Página /motors — execução real", description: "8 engines executando IA real via UI", tag: "IMPLEMENTED", level: "B", evidence: "Client selector (Prisma), formulários por engine, fetch real para /api/engines/*", impact: "critical" },
      { id: "ai-5", name: "Local Runtime (desktop app)", description: "Acesso a filesystem, terminal, browser", tag: "MISSING", level: "D", evidence: "Requer Electron/Tauri — não iniciado", impact: "critical" },
    ],
  },
  {
    id: "data",
    name: "Dados e Clientes",
    description: "CRM, histórico e pipeline de clientes",
    items: [
      { id: "data-1", name: "Banco de dados (Prisma + DB)", description: "Schema e ORM configurados", tag: "IMPLEMENTED", level: "B", evidence: "Prisma schema com Agent, Mission, Client, Task models", impact: "high" },
      { id: "data-2", name: "Autenticação de usuários", description: "Login e sessão da equipe LOTUS", tag: "IMPLEMENTED", level: "B", evidence: "Auth configurado no layout", impact: "high" },
      { id: "data-3", name: "CRM de clientes", description: "CRUD completo de empresas atendidas", tag: "IMPLEMENTED", level: "B", evidence: "/api/clients (Prisma) — /clients page com fetch real", impact: "high" },
      { id: "data-4", name: "Pipeline de missões", description: "Tracking de tarefas por cliente e agente", tag: "IMPLEMENTED", level: "B", evidence: "/api/missions (Prisma) com CRUD, status transitions, Root Master cria missões reais", impact: "medium" },
      { id: "data-5", name: "Histórico de diagnósticos", description: "Resultado de cada diagnóstico salvo por cliente", tag: "MISSING", level: "D", evidence: "Engines geram outputs mas não persistem resultados no banco por cliente", impact: "high" },
    ],
  },
  {
    id: "ui",
    name: "Interface e Navegação",
    description: "UX da plataforma operacional",
    items: [
      { id: "ui-1", name: "Dashboard principal", description: "Overview de operações, métricas, agentes", tag: "IMPLEMENTED", level: "B", evidence: "Dashboard em / funcional", impact: "medium" },
      { id: "ui-2", name: "Sidebar de navegação", description: "Links para todos os módulos", tag: "VERIFIED", level: "A", evidence: "12 itens, todos os módulos incluídos", impact: "medium" },
      { id: "ui-3", name: "Página /motors", description: "8 Engines com execução real de IA", tag: "IMPLEMENTED", level: "B", evidence: "Reconstruída com client selector (Prisma), formulários, fetch real, output viewer, Run All", impact: "high" },
      { id: "ui-4", name: "Advisor estratégico", description: "Chat com IA focado em estratégia LOTUS", tag: "IMPLEMENTED", level: "B", evidence: "/advisor funcional", impact: "medium" },
      { id: "ui-5", name: "Workforce — agentes/departamentos", description: "Visualização da força de trabalho IA", tag: "IMPLEMENTED", level: "B", evidence: "/workforce com 8 departamentos", impact: "medium" },
      { id: "ui-6", name: "Design system dark mode", description: "Tema escuro consistente em toda a plataforma", tag: "VERIFIED", level: "A", evidence: "CSS variables + dark mode padrão", impact: "low" },
    ],
  },
];

// ============================================================
// CONFIGS
// ============================================================
const TAG_CONFIG: Record<AuditTag, { label: string; color: string; bg: string; icon: React.ElementType; score: number }> = {
  VERIFIED:    { label: "Verificado",   color: "text-emerald-400", bg: "bg-emerald-400/10 border-emerald-400/30", icon: CheckCircle2, score: 100 },
  IMPLEMENTED: { label: "Implementado", color: "text-blue-400",    bg: "bg-blue-400/10 border-blue-400/30",    icon: CheckCircle2, score: 80 },
  PARTIAL:     { label: "Parcial",      color: "text-amber-400",   bg: "bg-amber-400/10 border-amber-400/30",  icon: AlertTriangle, score: 50 },
  SIMULATED:   { label: "Simulado",     color: "text-violet-400",  bg: "bg-violet-400/10 border-violet-400/30", icon: Clock, score: 25 },
  MISSING:     { label: "Faltando",     color: "text-red-400",     bg: "bg-red-400/10 border-red-400/30",      icon: XCircle, score: 0 },
  BLOCKED:     { label: "Bloqueado",    color: "text-zinc-400",    bg: "bg-zinc-400/10 border-zinc-400/30",    icon: Minus, score: 0 },
};

const LEVEL_CONFIG: Record<AuditLevel, { label: string; color: string; desc: string }> = {
  A: { label: "A", color: "text-emerald-400 bg-emerald-400/15 border-emerald-400/30", desc: "Produção — testado e validado" },
  B: { label: "B", color: "text-blue-400 bg-blue-400/15 border-blue-400/30",    desc: "Implementado — funcional mas não auditado" },
  C: { label: "C", color: "text-amber-400 bg-amber-400/15 border-amber-400/30", desc: "Parcial — incompleto ou simulado" },
  D: { label: "D", color: "text-red-400 bg-red-400/15 border-red-400/30",       desc: "Inexistente — não implementado" },
};

const IMPACT_COLOR: Record<AuditItem["impact"], string> = {
  critical: "text-red-400",
  high: "text-orange-400",
  medium: "text-amber-400",
  low: "text-zinc-400",
};

function domainScore(domain: AuditDomain): number {
  const total = domain.items.reduce((sum, item) => sum + TAG_CONFIG[item.tag].score, 0);
  return Math.round(total / domain.items.length);
}

function overallScore(domains: AuditDomain[]): number {
  const scores = domains.map(domainScore);
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

export default function GovernancePage() {
  const [expandedDomain, setExpandedDomain] = useState<string | null>("engines");
  const [selectedTag, setSelectedTag] = useState<AuditTag | null>(null);

  const overall = overallScore(AUDIT_DOMAINS);
  const allItems = AUDIT_DOMAINS.flatMap(d => d.items);
  const tagCounts = (Object.keys(TAG_CONFIG) as AuditTag[]).reduce((acc, tag) => {
    acc[tag] = allItems.filter(i => i.tag === tag).length;
    return acc;
  }, {} as Record<AuditTag, number>);

  const scoreColor = overall >= 70 ? "#22c55e" : overall >= 50 ? "#f59e0b" : "#ef4444";

  return (
    <div className="p-6 h-full overflow-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Shield size={22} className="text-primary" />
              Governança & Auditoria
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Transparência total sobre o que é real, implementado, parcial ou simulado no sistema LOTUS.
            </p>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Score geral</div>
            <div className="text-3xl font-bold" style={{ color: scoreColor }}>{overall}%</div>
            <div className="text-xs text-muted-foreground">maturidade operacional</div>
          </div>
        </div>
      </div>

      {/* Tag summary */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-6">
        {(Object.entries(TAG_CONFIG) as Array<[AuditTag, typeof TAG_CONFIG[AuditTag]]>).map(([tag, cfg]) => {
          const TagIcon = cfg.icon;
          return (
            <button
              key={tag}
              onClick={() => setSelectedTag(s => s === tag ? null : tag)}
              className={cn(
                "flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all text-center",
                selectedTag === tag ? cfg.bg + " scale-105" : "border-white/10 bg-white/3 hover:bg-white/6"
              )}
            >
              <TagIcon size={16} className={cfg.color} />
              <div className={cn("text-lg font-bold", cfg.color)}>{tagCounts[tag]}</div>
              <div className="text-[10px] text-muted-foreground">{cfg.label}</div>
            </button>
          );
        })}
      </div>

      {/* Governance levels legend */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {(Object.entries(LEVEL_CONFIG) as Array<[AuditLevel, typeof LEVEL_CONFIG[AuditLevel]]>).map(([level, cfg]) => (
          <div key={level} className={cn("flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs", cfg.color)}>
            <span className="font-bold">Nível {level}</span>
            <span className="text-muted-foreground">{cfg.desc}</span>
          </div>
        ))}
      </div>

      {/* Domain cards */}
      <div className="space-y-3">
        {AUDIT_DOMAINS.map(domain => {
          const score = domainScore(domain);
          const isExpanded = expandedDomain === domain.id;
          const scoreCol = score >= 70 ? "#22c55e" : score >= 40 ? "#f59e0b" : "#ef4444";
          const visibleItems = selectedTag
            ? domain.items.filter(i => i.tag === selectedTag)
            : domain.items;

          if (selectedTag && visibleItems.length === 0) return null;

          return (
            <div key={domain.id} className="rounded-xl border border-white/10 overflow-hidden bg-white/3">
              <button
                onClick={() => setExpandedDomain(isExpanded ? null : domain.id)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/4 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  {isExpanded ? <ChevronDown size={16} className="text-muted-foreground" /> : <ChevronRight size={16} className="text-muted-foreground" />}
                  <div>
                    <div className="text-sm font-semibold text-foreground">{domain.name}</div>
                    <div className="text-xs text-muted-foreground">{domain.description}</div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {/* Mini tag breakdown */}
                  <div className="hidden md:flex gap-1.5">
                    {domain.items.map(item => {
                      const c = TAG_CONFIG[item.tag];
                      return (
                        <div
                          key={item.id}
                          className={cn("w-2 h-2 rounded-full", item.tag === "VERIFIED" ? "bg-emerald-400" : item.tag === "IMPLEMENTED" ? "bg-blue-400" : item.tag === "PARTIAL" ? "bg-amber-400" : item.tag === "SIMULATED" ? "bg-violet-400" : "bg-red-400")}
                          title={item.name}
                        />
                      );
                    })}
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold" style={{ color: scoreCol }}>{score}%</div>
                    <div className="text-[10px] text-muted-foreground">{domain.items.length} itens</div>
                  </div>
                </div>
              </button>

              {isExpanded && (
                <div className="border-t border-white/5 divide-y divide-white/5">
                  {visibleItems.map(item => {
                    const cfg = TAG_CONFIG[item.tag];
                    const lvlCfg = LEVEL_CONFIG[item.level];
                    const TagIcon = cfg.icon;
                    return (
                      <div key={item.id} className="flex items-start gap-4 px-5 py-3 hover:bg-white/3 transition-colors">
                        <TagIcon size={16} className={cn("flex-shrink-0 mt-0.5", cfg.color)} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-foreground">{item.name}</span>
                            <span className={cn("text-[10px] px-1.5 py-0.5 rounded border font-bold", lvlCfg.color)}>
                              {item.level}
                            </span>
                            <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full border", cfg.bg, cfg.color)}>
                              {cfg.label}
                            </span>
                            <span className={cn("text-[10px] font-medium", IMPACT_COLOR[item.impact])}>
                              {item.impact.toUpperCase()}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                          {item.evidence && (
                            <div className="flex items-start gap-1.5 mt-1.5">
                              <Info size={10} className="text-muted-foreground/50 flex-shrink-0 mt-0.5" />
                              <span className="text-[10px] text-muted-foreground/60 italic">{item.evidence}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer note */}
      <div className="mt-6 p-4 rounded-xl border border-amber-400/20 bg-amber-400/5">
        <div className="flex items-start gap-2">
          <AlertTriangle size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground">
            <span className="text-amber-400 font-semibold">Princípio de Governança LOTUS:</span>{" "}
            Nenhum resultado apresentado ao cliente deve ter origem em dado simulado ou não verificado sem identificação explícita.
            Itens com tag SIMULATED ou MISSING devem ser sinalizados antes de qualquer apresentação comercial.
          </p>
        </div>
      </div>
    </div>
  );
}
