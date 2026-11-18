"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  Search, Microscope, Stethoscope, Lightbulb, Layers, Hammer,
  Rocket, TrendingUp, Play, Loader2, ChevronDown, ChevronUp,
  CheckCircle2, AlertCircle, ArrowRight, Zap, User, Download,
  Copy, RefreshCw,
} from "lucide-react";

// ============================================================
// TYPES
// ============================================================
interface Client {
  id: string;
  name: string;
  niche?: string;
  city?: string;
  instagram?: string;
  whatsapp?: string;
  website?: string;
}

interface EngineResult {
  success: boolean;
  engine: string;
  clientName: string;
  [key: string]: unknown;
}

interface EngineState {
  status: "idle" | "running" | "done" | "error";
  result: EngineResult | null;
  error: string | null;
  startedAt: number | null;
  duration: number | null;
}

type EngineId = "intelligence" | "investigation" | "diagnosis" | "strategy" | "solution-arch" | "build" | "implementation" | "revenue";

// ============================================================
// ENGINE DEFINITIONS
// ============================================================
const ENGINES = [
  {
    id: "intelligence" as EngineId,
    num: 1,
    name: "Intelligence Engine",
    subtitle: "Inteligência de Mercado",
    description: "Analisa mercado, concorrentes e tendências do setor de saúde em tempo real via IA.",
    icon: Search,
    color: "#6366f1",
    route: "/api/engines/intelligence",
    buildPayload: (client: Client, _form: Record<string, string>) => ({
      clientName: client.name,
      niche: client.niche || "Odontologia",
      city: client.city || "Brasil",
      instagram: client.instagram,
      website: client.website,
    }),
    resultKey: "analysis",
    summaryPath: ["market", "summary"],
  },
  {
    id: "investigation" as EngineId,
    num: 2,
    name: "Investigation Engine",
    subtitle: "Investigação Profunda",
    description: "Auditoria digital 360° do cliente: site, redes sociais, anúncios e funil atual.",
    icon: Microscope,
    color: "#8b5cf6",
    route: "/api/engines/investigation",
    buildPayload: (client: Client, _form: Record<string, string>) => ({
      clientName: client.name,
      niche: client.niche || "Odontologia",
      city: client.city || "Brasil",
      instagram: client.instagram,
      website: client.website,
      whatsapp: client.whatsapp,
    }),
    resultKey: "investigation",
    summaryPath: ["summary"],
  },
  {
    id: "diagnosis" as EngineId,
    num: 3,
    name: "Diagnosis Engine",
    subtitle: "Diagnóstico Estratégico",
    description: "Score de oportunidade, pontos críticos e ROI estimado em 60 segundos.",
    icon: Stethoscope,
    color: "#ec4899",
    route: "/api/engines/diagnosis",
    buildPayload: (client: Client, _form: Record<string, string>) => ({
      clientName: client.name,
      niche: client.niche || "Odontologia",
      city: client.city || "Brasil",
      instagram: client.instagram,
    }),
    resultKey: "diagnosis",
    summaryPath: ["summary"],
  },
  {
    id: "strategy" as EngineId,
    num: 4,
    name: "Strategy Engine",
    subtitle: "Arquitetura Estratégica",
    description: "Plano de crescimento com OKRs, metas trimestrais e roadmap acionável.",
    icon: Lightbulb,
    color: "#f59e0b",
    route: "/api/engines/strategy",
    buildPayload: (client: Client, form: Record<string, string>) => ({
      clientName: client.name,
      niche: client.niche || "Odontologia",
      city: client.city || "Brasil",
      goals: form.goals || "",
      currentRevenue: form.currentRevenue || "",
    }),
    resultKey: "strategy",
    summaryPath: ["executive_summary"],
  },
  {
    id: "solution-arch" as EngineId,
    num: 5,
    name: "Solution Architecture",
    subtitle: "Arquitetura de Solução",
    description: "Stack completo de ferramentas e automações com sequenciamento e orçamento.",
    icon: Layers,
    color: "#10b981",
    route: "/api/engines/solution-arch",
    buildPayload: (client: Client, form: Record<string, string>) => ({
      clientName: client.name,
      niche: client.niche || "Odontologia",
      city: client.city || "Brasil",
      budget: form.budget || "",
      needs: form.needs || "",
    }),
    resultKey: "architecture",
    summaryPath: ["overview"],
  },
  {
    id: "build" as EngineId,
    num: 6,
    name: "Build Engine",
    subtitle: "Motor de Produção",
    description: "Gera entregáveis reais: landing pages HTML, copy, automações WhatsApp e criativos.",
    icon: Hammer,
    color: "#f97316",
    route: "/api/engines/build",
    buildPayload: (client: Client, form: Record<string, string>) => ({
      type: form.buildType || "landing_page",
      clientName: client.name,
      niche: client.niche || "Odontologia",
      city: client.city || "Brasil",
      whatsapp: client.whatsapp,
      instagram: client.instagram,
      services: form.services || "",
    }),
    resultKey: "deliverable",
    summaryPath: ["type"],
  },
  {
    id: "implementation" as EngineId,
    num: 7,
    name: "Implementation Engine",
    subtitle: "Motor de Execução",
    description: "Plano de implementação week-by-week com guias passo-a-passo para cada ferramenta.",
    icon: Rocket,
    color: "#06b6d4",
    route: "/api/engines/implementation",
    buildPayload: (client: Client, form: Record<string, string>) => ({
      clientName: client.name,
      niche: client.niche || "Odontologia",
      timeline: form.timeline || "4 semanas",
      selectedComponents: form.components ? form.components.split(",") : [],
    }),
    resultKey: "implementation",
    summaryPath: ["implementation_plan", "overview"],
  },
  {
    id: "revenue" as EngineId,
    num: 8,
    name: "Revenue Intelligence",
    subtitle: "Inteligência de Receita",
    description: "Projeções financeiras com 3 cenários, oportunidades de receita e KPIs.",
    icon: TrendingUp,
    color: "#22c55e",
    route: "/api/engines/revenue",
    buildPayload: (client: Client, form: Record<string, string>) => ({
      clientName: client.name,
      niche: client.niche || "Odontologia",
      city: client.city || "Brasil",
      currentRevenue: form.currentRevenue || "",
      averageTicket: form.averageTicket || "",
      currentClients: form.currentClients || "",
      goals: form.goals || "",
    }),
    resultKey: "revenueAnalysis",
    summaryPath: ["summary"],
  },
];

// ============================================================
// HELPERS
// ============================================================
function getNestedValue(obj: unknown, path: string[]): string {
  let cur: unknown = obj;
  for (const key of path) {
    if (cur && typeof cur === "object" && key in (cur as object)) {
      cur = (cur as Record<string, unknown>)[key];
    } else {
      return "";
    }
  }
  return typeof cur === "string" ? cur : JSON.stringify(cur);
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ============================================================
// ENGINE EXECUTION PANEL
// ============================================================
function EnginePanel({
  engine,
  client,
  state,
  onRun,
  onCopy,
}: {
  engine: (typeof ENGINES)[0];
  client: Client | null;
  state: EngineState;
  onRun: (engineId: EngineId, form: Record<string, string>) => void;
  onCopy: (text: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  const Icon = engine.icon;
  const isRunning = state.status === "running";
  const isDone = state.status === "done";
  const isError = state.status === "error";

  const resultData = isDone && state.result ? state.result[engine.resultKey] as Record<string, unknown> : null;
  const summary = resultData ? getNestedValue(resultData, engine.summaryPath) : "";

  // special: build engine html output
  const isLandingPage = engine.id === "build" && resultData && (resultData as Record<string, unknown>).type === "landing_page";
  const htmlContent = isLandingPage ? (resultData as Record<string, unknown>).html as string : null;

  return (
    <div
      className={cn(
        "rounded-xl border transition-all duration-200 overflow-hidden",
        isDone ? "border-white/20 bg-white/5" : isError ? "border-red-500/30 bg-red-500/5" : "border-white/10 bg-white/3"
      )}
      style={isDone ? { borderLeftColor: engine.color, borderLeftWidth: 3 } : {}}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 p-4 cursor-pointer"
        onClick={() => setExpanded(e => !e)}
      >
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: `${engine.color}20`, border: `1px solid ${engine.color}30` }}
        >
          <Icon size={18} style={{ color: engine.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground/50">Engine {engine.num}</span>
            {isDone && state.duration && (
              <span className="text-[10px] text-emerald-400">✓ {formatDuration(state.duration)}</span>
            )}
          </div>
          <div className="font-medium text-sm text-foreground truncate">{engine.name}</div>
          {summary && (
            <div className="text-[11px] text-muted-foreground truncate mt-0.5">{summary}</div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {isRunning && <Loader2 size={14} className="animate-spin text-blue-400" />}
          {isDone && !isRunning && <CheckCircle2 size={14} className="text-emerald-400" />}
          {isError && <AlertCircle size={14} className="text-red-400" />}
          {expanded ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
        </div>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="border-t border-white/5 p-4 space-y-4">
          <p className="text-xs text-muted-foreground">{engine.description}</p>

          {/* Per-engine form fields */}
          {engine.id === "strategy" || engine.id === "revenue" ? (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Objetivo</label>
                <input
                  type="text"
                  placeholder="Ex: 20 novos pacientes/mês"
                  value={form.goals || ""}
                  onChange={e => setForm(f => ({ ...f, goals: e.target.value }))}
                  className="mt-1 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-white/30"
                />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Faturamento Atual</label>
                <input
                  type="text"
                  placeholder="Ex: 15000"
                  value={form.currentRevenue || ""}
                  onChange={e => setForm(f => ({ ...f, currentRevenue: e.target.value }))}
                  className="mt-1 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-white/30"
                />
              </div>
            </div>
          ) : engine.id === "solution-arch" ? (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Orçamento Mensal (R$)</label>
                <input
                  type="text"
                  placeholder="Ex: 3000"
                  value={form.budget || ""}
                  onChange={e => setForm(f => ({ ...f, budget: e.target.value }))}
                  className="mt-1 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-white/30"
                />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Necessidades</label>
                <input
                  type="text"
                  placeholder="Ex: mais pacientes, site, ads"
                  value={form.needs || ""}
                  onChange={e => setForm(f => ({ ...f, needs: e.target.value }))}
                  className="mt-1 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-white/30"
                />
              </div>
            </div>
          ) : engine.id === "build" ? (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Tipo de Entregável</label>
                <select
                  value={form.buildType || "landing_page"}
                  onChange={e => setForm(f => ({ ...f, buildType: e.target.value }))}
                  className="mt-1 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-white/30"
                >
                  <option value="landing_page">Landing Page HTML</option>
                  <option value="copy">Copy de Anúncio</option>
                  <option value="whatsapp_automation">Automação WhatsApp</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Serviços Principais</label>
                <input
                  type="text"
                  placeholder="Ex: implantes, clareamento"
                  value={form.services || ""}
                  onChange={e => setForm(f => ({ ...f, services: e.target.value }))}
                  className="mt-1 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-white/30"
                />
              </div>
            </div>
          ) : engine.id === "implementation" ? (
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Prazo</label>
              <select
                value={form.timeline || "4 semanas"}
                onChange={e => setForm(f => ({ ...f, timeline: e.target.value }))}
                className="mt-1 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-white/30"
              >
                <option value="2 semanas">2 semanas</option>
                <option value="4 semanas">4 semanas</option>
                <option value="8 semanas">8 semanas</option>
                <option value="12 semanas">12 semanas</option>
              </select>
            </div>
          ) : engine.id === "revenue" ? (
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Ticket Médio (R$)</label>
                <input
                  type="text"
                  placeholder="Ex: 2500"
                  value={form.averageTicket || ""}
                  onChange={e => setForm(f => ({ ...f, averageTicket: e.target.value }))}
                  className="mt-1 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-white/30"
                />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Clientes Ativos</label>
                <input
                  type="text"
                  placeholder="Ex: 50"
                  value={form.currentClients || ""}
                  onChange={e => setForm(f => ({ ...f, currentClients: e.target.value }))}
                  className="mt-1 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-white/30"
                />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Objetivo</label>
                <input
                  type="text"
                  placeholder="Ex: dobrar receita"
                  value={form.goals || ""}
                  onChange={e => setForm(f => ({ ...f, goals: e.target.value }))}
                  className="mt-1 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-white/30"
                />
              </div>
            </div>
          ) : null}

          {/* Run button */}
          <button
            disabled={!client || isRunning}
            onClick={() => client && onRun(engine.id, form)}
            className={cn(
              "w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
              !client
                ? "bg-white/5 text-muted-foreground/40 cursor-not-allowed border border-white/5"
                : isRunning
                ? "cursor-not-allowed opacity-70"
                : "hover:opacity-90"
            )}
            style={client && !isRunning ? { background: `${engine.color}25`, color: engine.color, border: `1px solid ${engine.color}40` } : {}}
          >
            {isRunning ? (
              <><Loader2 size={14} className="animate-spin" /> Executando...</>
            ) : isDone ? (
              <><RefreshCw size={14} /> Re-executar</>
            ) : (
              <><Play size={14} /> Executar Engine {engine.num}</>
            )}
          </button>

          {/* Error */}
          {isError && state.error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400">
              {state.error}
            </div>
          )}

          {/* Result */}
          {isDone && resultData && (
            <div className="space-y-2">
              {/* Landing page preview */}
              {isLandingPage && htmlContent ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-emerald-400 uppercase tracking-wider">Landing Page Gerada</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => onCopy(htmlContent)}
                        className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 px-2 py-1 rounded border border-white/10"
                      >
                        <Copy size={10} /> Copiar HTML
                      </button>
                      <button
                        onClick={() => {
                          const blob = new Blob([htmlContent], { type: "text/html" });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = `landing-${state.result?.clientName || "cliente"}.html`;
                          a.click();
                          URL.revokeObjectURL(url);
                        }}
                        className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 px-2 py-1 rounded border border-white/10"
                      >
                        <Download size={10} /> Download
                      </button>
                    </div>
                  </div>
                  <iframe
                    srcDoc={htmlContent}
                    className="w-full h-64 rounded-lg border border-white/10 bg-white"
                    sandbox="allow-scripts"
                    title="Landing Page Preview"
                  />
                </div>
              ) : (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] text-emerald-400 uppercase tracking-wider">Resultado</span>
                    <button
                      onClick={() => onCopy(JSON.stringify(resultData, null, 2))}
                      className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 px-2 py-1 rounded border border-white/10"
                    >
                      <Copy size={10} /> Copiar JSON
                    </button>
                  </div>
                  <pre className="text-[10px] text-muted-foreground bg-black/30 rounded-lg p-3 overflow-auto max-h-64 leading-relaxed whitespace-pre-wrap border border-white/5">
                    {JSON.stringify(resultData, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// MAIN PAGE
// ============================================================
export default function MotoresPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [loadingClients, setLoadingClients] = useState(true);
  const [engineStates, setEngineStates] = useState<Record<EngineId, EngineState>>(() => {
    const init: Partial<Record<EngineId, EngineState>> = {};
    for (const e of ENGINES) {
      init[e.id] = { status: "idle", result: null, error: null, startedAt: null, duration: null };
    }
    return init as Record<EngineId, EngineState>;
  });
  const [copied, setCopied] = useState(false);
  const [runAll, setRunAll] = useState(false);

  // Load clients
  useEffect(() => {
    fetch("/api/clients")
      .then(r => r.json())
      .then(data => {
        const list = Array.isArray(data) ? data : data.clients || [];
        setClients(list);
        // Auto-select Odonto Marco if present
        const marco = list.find((c: Client) => c.name?.toLowerCase().includes("odonto") || c.name?.toLowerCase().includes("marco"));
        if (marco) setSelectedClient(marco);
      })
      .catch(() => setClients([]))
      .finally(() => setLoadingClients(false));
  }, []);

  const handleCopy = useCallback((text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  const runEngine = useCallback(async (engineId: EngineId, form: Record<string, string>) => {
    if (!selectedClient) return;
    const engine = ENGINES.find(e => e.id === engineId);
    if (!engine) return;

    const startedAt = Date.now();
    setEngineStates(prev => ({
      ...prev,
      [engineId]: { status: "running", result: null, error: null, startedAt, duration: null },
    }));

    try {
      const payload = engine.buildPayload(selectedClient, form);
      const res = await fetch(engine.route, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      const duration = Date.now() - startedAt;

      if (!res.ok) {
        setEngineStates(prev => ({
          ...prev,
          [engineId]: { status: "error", result: null, error: data.error || "Erro desconhecido", startedAt, duration },
        }));
      } else {
        setEngineStates(prev => ({
          ...prev,
          [engineId]: { status: "done", result: data, error: null, startedAt, duration },
        }));
      }
    } catch (err) {
      const duration = Date.now() - startedAt;
      setEngineStates(prev => ({
        ...prev,
        [engineId]: { status: "error", result: null, error: String(err), startedAt, duration },
      }));
    }
  }, [selectedClient]);

  // Run all engines sequentially
  const handleRunAll = useCallback(async () => {
    if (!selectedClient || runAll) return;
    setRunAll(true);
    for (const engine of ENGINES) {
      await runEngine(engine.id, {});
      // Small pause between engines
      await new Promise(r => setTimeout(r, 500));
    }
    setRunAll(false);
  }, [selectedClient, runAll, runEngine]);

  const doneCount = Object.values(engineStates).filter(s => s.status === "done").length;
  const runningCount = Object.values(engineStates).filter(s => s.status === "running").length;

  return (
    <div className="p-6 h-full overflow-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              Motores Operacionais
              <span className="text-xs font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                8 Engines Reais
              </span>
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Pipeline completo com IA real. Selecione um cliente e execute.
            </p>
          </div>
          {doneCount > 0 && (
            <div className="text-right">
              <div className="text-xs text-muted-foreground">Engines executados</div>
              <div className="text-xl font-bold text-emerald-400">{doneCount}/8</div>
            </div>
          )}
        </div>

        {/* Client selector + Run All */}
        <div className="mt-4 flex items-center gap-3">
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <User size={14} className="text-muted-foreground flex-shrink-0" />
            {loadingClients ? (
              <div className="flex-1 h-9 bg-white/5 rounded-lg animate-pulse" />
            ) : clients.length === 0 ? (
              <div className="flex-1 text-xs text-muted-foreground px-3 py-2 bg-white/5 rounded-lg border border-white/10">
                Nenhum cliente cadastrado — crie um em <a href="/clients" className="text-blue-400 hover:underline">Clientes</a>
              </div>
            ) : (
              <select
                value={selectedClient?.id || ""}
                onChange={e => {
                  const c = clients.find(c => c.id === e.target.value);
                  setSelectedClient(c || null);
                }}
                className="flex-1 bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-white/40"
              >
                <option value="">Selecionar cliente...</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>{c.name} {c.city ? `— ${c.city}` : ""}</option>
                ))}
              </select>
            )}
          </div>

          {selectedClient && (
            <div className="text-xs text-muted-foreground bg-white/5 px-3 py-2 rounded-lg border border-white/10">
              {selectedClient.niche || "Saúde"} · {selectedClient.city || "Brasil"}
              {selectedClient.whatsapp && ` · ${selectedClient.whatsapp}`}
            </div>
          )}

          <button
            disabled={!selectedClient || runAll}
            onClick={handleRunAll}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
              !selectedClient || runAll
                ? "bg-white/5 text-muted-foreground/40 cursor-not-allowed border border-white/5"
                : "bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white"
            )}
          >
            {runAll ? (
              <><Loader2 size={14} className="animate-spin" /> Executando...</>
            ) : (
              <><Zap size={14} /> Executar Todos</>
            )}
          </button>
        </div>

        {/* Progress when running all */}
        {(runAll || (doneCount > 0 && doneCount < 8)) && (
          <div className="mt-3 flex items-center gap-2">
            <div className="flex-1 bg-white/5 rounded-full h-1.5 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-violet-500 to-emerald-500 transition-all duration-500"
                style={{ width: `${(doneCount / 8) * 100}%` }}
              />
            </div>
            <span className="text-[10px] text-muted-foreground">{doneCount}/8</span>
            {runningCount > 0 && <Loader2 size={10} className="animate-spin text-blue-400" />}
          </div>
        )}
      </div>

      {/* Pipeline flow */}
      <div className="mb-6 flex items-center gap-1 overflow-x-auto pb-2">
        {ENGINES.map((eng, i) => {
          const state = engineStates[eng.id];
          return (
            <div key={eng.id} className="flex items-center gap-1 flex-shrink-0">
              <div
                className={cn(
                  "flex flex-col items-center gap-1 px-3 py-2 rounded-lg border text-center transition-all",
                  state.status === "done" ? "border-white/30 bg-white/8" :
                  state.status === "running" ? "border-blue-400/40 bg-blue-400/5" :
                  state.status === "error" ? "border-red-400/30 bg-red-400/5" :
                  "border-white/10 bg-white/3"
                )}
              >
                <eng.icon size={16} style={{ color: state.status === "done" ? eng.color : state.status === "running" ? "#60a5fa" : "#666" }} />
                <span className="text-[10px] text-muted-foreground leading-tight w-14 text-center">
                  {eng.name.replace(" Engine", "").replace(" Architecture", " Arch").replace("Revenue ", "Rev ")}
                </span>
                <span className={cn(
                  "text-[9px] px-1 py-0.5 rounded-full",
                  state.status === "done" ? "text-emerald-400 bg-emerald-400/10" :
                  state.status === "running" ? "text-blue-400 bg-blue-400/10" :
                  state.status === "error" ? "text-red-400 bg-red-400/10" :
                  "text-muted-foreground/40 bg-white/5"
                )}>
                  {state.status === "done" ? "✓ pronto" : state.status === "running" ? "• rodando" : state.status === "error" ? "✗ erro" : "— idle"}
                </span>
              </div>
              {i < ENGINES.length - 1 && (
                <ArrowRight size={10} className={cn("flex-shrink-0", engineStates[ENGINES[i + 1]!.id]?.status !== "idle" ? "text-white/40" : "text-muted-foreground/20")} />
              )}
            </div>
          );
        })}
      </div>

      {/* Engine panels */}
      <div className="space-y-3">
        {ENGINES.map(engine => (
          <EnginePanel
            key={engine.id}
            engine={engine}
            client={selectedClient}
            state={engineStates[engine.id]}
            onRun={runEngine}
            onCopy={handleCopy}
          />
        ))}
      </div>

      {copied && (
        <div className="fixed bottom-4 right-4 bg-emerald-500/90 text-white text-xs px-3 py-2 rounded-lg shadow-lg animate-in slide-in-from-bottom-2">
          Copiado!
        </div>
      )}
    </div>
  );
}
