"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Search, Loader2, AlertCircle, TrendingUp, TrendingDown, Zap,
  Instagram, Globe, Megaphone, Target, ChevronDown, ChevronUp,
  MessageCircle, CheckCircle, Clock, Radio, Send, Users,
  Camera, Wand2, MessageSquare, Download, ExternalLink, Copy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DataView } from "@/components/ui/data-view";
import { dataToMarkdown } from "@/lib/data-labels";
import { Diagnosis360 } from "@/components/diagnosis/diagnosis-360";

// ─── Types ───────────────────────────────────────────────────────────────────

interface AgentActivity {
  agentId: string;
  name: string;
  task: string;
  status: "pending" | "working" | "done" | "waiting";
}

interface Finding {
  agentId: string;
  name: string;
  category: string;
  data: Record<string, unknown>;
}

interface InvestigationState {
  phase: "idle" | "investigating" | "done" | "error";
  agents: AgentActivity[];
  findings: Finding[];
  whatsapp: { number: string | null; tested: boolean; note: string } | null;
  report: Record<string, unknown> | null;
  error: string | null;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function ScoreRing({ score, label, color }: { score: number; label: string; color: string }) {
  const r = 28, c = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-16 h-16">
        <svg viewBox="0 0 72 72" className="w-16 h-16 -rotate-90">
          <circle cx="36" cy="36" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
          <circle cx="36" cy="36" r={r} fill="none" stroke={color} strokeWidth="6"
            strokeDasharray={`${(score / 100) * c} ${c}`} strokeLinecap="round" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-bold text-white">{score}</span>
        </div>
      </div>
      <span className="text-[10px] text-white/40 text-center">{label}</span>
    </div>
  );
}

function ImpactBadge({ impact }: { impact: string }) {
  return (
    <span className={cn("px-2 py-0.5 rounded text-[10px] font-semibold border",
      impact === "Alto" ? "text-green-400 bg-green-400/10 border-green-400/20" :
      impact === "Médio" ? "text-amber-400 bg-amber-400/10 border-amber-400/20" :
      "text-white/40 bg-white/5 border-white/10"
    )}>{impact}</span>
  );
}

function ExpandableSection({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-white/8 overflow-hidden">
      <button onClick={() => setOpen(p => !p)}
        className="w-full flex items-center justify-between p-4 hover:bg-white/3 transition-colors">
        <div className="flex items-center gap-2 text-sm font-semibold text-white/70">
          <Icon size={15} className="text-white/40" /> {title}
        </div>
        {open ? <ChevronUp size={14} className="text-white/30" /> : <ChevronDown size={14} className="text-white/30" />}
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

const AGENT_AVATAR: Record<string, string> = {
  "agent-mc": "JF",
  "agent-web": "PA",
  "agent-data": "AS",
  "agent-bi": "MA",
  "agent-perf": "LR",
  "agent-sales": "RC",
  "agent-strat": "FC",
};

const AGENT_COLOR: Record<string, string> = {
  "agent-mc": "#a78bfa",
  "agent-web": "#60a5fa",
  "agent-data": "#f472b6",
  "agent-bi": "#34d399",
  "agent-perf": "#fb923c",
  "agent-sales": "#4ade80",
  "agent-strat": "#fbbf24",
};

function AgentCard({ agent }: { agent: AgentActivity }) {
  const color = AGENT_COLOR[agent.agentId] ?? "#fff";
  const initials = AGENT_AVATAR[agent.agentId] ?? agent.name.slice(0, 2).toUpperCase();
  return (
    <div className={cn(
      "flex items-start gap-3 p-3 rounded-xl border transition-all duration-500",
      agent.status === "working" || agent.status === "waiting"
        ? "border-white/15 bg-white/4"
        : agent.status === "done"
        ? "border-green-500/15 bg-green-500/4"
        : "border-white/5 bg-white/1 opacity-50"
    )}>
      <div className="relative flex-shrink-0">
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-black"
          style={{ backgroundColor: color }}>
          {initials}
        </div>
        {(agent.status === "working" || agent.status === "waiting") && (
          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-400 border border-[#07070f] animate-pulse" />
        )}
        {agent.status === "done" && (
          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-400 border border-[#07070f] flex items-center justify-center">
            <CheckCircle size={8} className="text-black" />
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-white/80">{agent.name}</span>
        </div>
        <p className="text-[11px] text-white/40 mt-0.5 leading-relaxed">{agent.task}</p>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function DiagnosisPage() {
  const [url, setUrl] = useState("");
  const [state, setState] = useState<InvestigationState>({
    phase: "idle",
    agents: [],
    findings: [],
    whatsapp: null,
    report: null,
    error: null,
  });
  const [reportSent, setReportSent] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [waCopied, setWaCopied] = useState<"ok" | "erro" | null>(null);
  const [postActions, setPostActions] = useState<{
    photos: { status: "idle" | "loading" | "done" | "error"; images?: { url: string }[]; error?: string };
    site: { status: "idle" | "loading" | "done" | "error"; html?: string; companyName?: string; error?: string };
    whatsapp: { status: "idle" | "loading" | "done" | "error"; setup?: Record<string, unknown>; waNumber?: string | null; error?: string };
  }>({ photos: { status: "idle" }, site: { status: "idle" }, whatsapp: { status: "idle" } });
  const eventSourceRef = useRef<EventSource | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [state.agents, state.findings]);

  const startInvestigation = useCallback(() => {
    if (!url.trim() || state.phase === "investigating") return;
    if (eventSourceRef.current) eventSourceRef.current.close();

    setState({ phase: "investigating", agents: [], findings: [], whatsapp: null, report: null, error: null });
    setReportSent(false);
    setSendError(null);

    const encoded = encodeURIComponent(url.trim());
    const es = new EventSource(`/api/investigation?url=${encoded}`);
    eventSourceRef.current = es;

    es.onmessage = (e) => {
      const event = JSON.parse(e.data);

      setState(prev => {
        switch (event.type) {
          case "agent_start":
            return {
              ...prev,
              agents: [
                ...prev.agents.filter(a => a.agentId !== event.agentId),
                { agentId: event.agentId, name: event.name, task: event.task, status: "working" },
              ],
            };
          case "agent_update":
            return {
              ...prev,
              agents: prev.agents.map(a =>
                a.agentId === event.agentId ? { ...a, task: event.task, status: "working" } : a
              ),
            };
          case "finding":
            return {
              ...prev,
              agents: prev.agents.map(a =>
                a.agentId === event.agentId ? { ...a, status: "done" } : a
              ),
              findings: [...prev.findings, { agentId: event.agentId, name: event.name, category: event.category, data: event.data }],
              whatsapp: event.category === "whatsapp"
                ? { number: event.data?.number ?? null, tested: !!event.data?.tested, note: String(event.data?.note ?? "") }
                : prev.whatsapp,
            };
          case "synthesis_start":
            return {
              ...prev,
              agents: prev.agents.map(a =>
                a.agentId === "agent-strat" ? { ...a, status: "working", task: "Sintetizando todos os dados..." } : a
              ),
            };
          case "complete":
            es.close();
            return {
              ...prev,
              phase: "done",
              report: event.report,
              agents: prev.agents.map(a => ({ ...a, status: "done" as const })),
            };
          case "error":
            es.close();
            return { ...prev, phase: "error", error: event.message };
          default:
            return prev;
        }
      });
    };

    es.onerror = () => {
      es.close();
      setState(prev => prev.phase === "done" ? prev : { ...prev, phase: "error", error: "Conexão perdida." });
    };
  }, [url, state.phase]);

  const sendToCeoChat = async () => {
    if (!state.report) return;
    try {
      const r = state.report as Record<string, unknown>;
      const summary = `🔍 **Investigação completa: ${r.companyName ?? "empresa"}**\n\nScore geral: **${r.overallScore}/100** — ${r.urgency}\n\n**Pontos fortes:** ${(r.strengths as string[])?.slice(0, 2).join(", ")}\n\n**Gaps críticos:** ${(r.gaps as string[])?.slice(0, 2).join(", ")}\n\n**ROI estimado:** ${r.estimatedROI}\n\n**Próximo passo:** ${(r.suggestedSolutions as string[])?.[0] ?? "Contrate a LOTUS AI"}`;
      const res = await fetch("/api/chat/inject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: summary }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setReportSent(true);
      setSendError(null);
    } catch (err) {
      setSendError(`Não foi possível enviar ao CEO Chat (${err instanceof Error ? err.message : String(err)})`);
    }
  };

  const handleDownloadPhotos = async () => {
    if (!url.trim()) return;
    setPostActions(p => ({ ...p, photos: { status: "loading" } }));
    try {
      const res = await fetch("/api/post-diagnosis/photos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setPostActions(p => ({ ...p, photos: { status: "done", images: data.images } }));
    } catch (err) {
      setPostActions(p => ({ ...p, photos: { status: "error", error: err instanceof Error ? err.message : String(err) } }));
    }
  };

  const handleBuildSite = async () => {
    if (!state.report) return;
    setPostActions(p => ({ ...p, site: { status: "loading" } }));
    try {
      const res = await fetch("/api/post-diagnosis/site", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report: state.report, targetUrl: url.trim() }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setPostActions(p => ({ ...p, site: { status: "done", html: data.html, companyName: data.companyName } }));
    } catch (err) {
      setPostActions(p => ({ ...p, site: { status: "error", error: err instanceof Error ? err.message : String(err) } }));
    }
  };

  const handleWhatsApp = async () => {
    if (!state.report) return;
    const waNumber = state.whatsapp?.number ?? null;
    setPostActions(p => ({ ...p, whatsapp: { status: "loading" } }));
    try {
      const res = await fetch("/api/post-diagnosis/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report: state.report, waNumber }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setPostActions(p => ({ ...p, whatsapp: { status: "done", setup: data.setup, waNumber: data.waNumber } }));
    } catch (err) {
      setPostActions(p => ({ ...p, whatsapp: { status: "error", error: err instanceof Error ? err.message : String(err) } }));
    }
  };

  const downloadSiteHtml = () => {
    if (!postActions.site.html) return;
    const blob = new Blob([postActions.site.html], { type: "text/html" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${postActions.site.companyName ?? "site"}-lotus.html`;
    a.click();
  };

  const r = state.report as (Record<string, unknown> & { scores?: { instagram?: number; website?: number; ads?: number; positioning?: number } }) | null;
  const scoreColor = (s: number) => s >= 75 ? "#4ade80" : s >= 50 ? "#fb923c" : "#f87171";

  return (
    <div className="min-h-screen bg-[#07070f] p-8">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-white">Diagnóstico de Empresa</h1>
          <p className="text-white/40 mt-1">Do link do Instagram ao diagnóstico completo, com a equipe inteira trabalhando</p>
        </div>

        <Diagnosis360 />

        <div className="pt-4 border-t border-white/8">
          <h2 className="text-lg font-semibold text-white">Investigação rápida</h2>
          <p className="text-white/40 text-sm mt-1">Checagem de 1 minuto de um site ou perfil, sem acionar a equipe e sem salvar no cliente</p>
        </div>

        {/* Input */}
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25" />
            <input
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key === "Enter" && startInvestigation()}
              placeholder="instagram.com/empresa ou site da empresa..."
              className="w-full pl-11 pr-4 py-3.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-white/25 focus:outline-none focus:ring-1 focus:ring-pink-500 focus:border-pink-500 transition-all"
            />
          </div>
          <button
            onClick={startInvestigation}
            disabled={state.phase === "investigating" || !url.trim()}
            className="px-6 py-3.5 rounded-xl bg-pink-500 hover:bg-pink-400 disabled:opacity-40 text-white font-semibold text-sm flex items-center gap-2 transition-all"
          >
            {state.phase === "investigating" ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
            {state.phase === "investigating" ? "Investigando..." : "Investigar"}
          </button>
        </div>

        {state.error && (
          <div className="flex items-center gap-2 text-red-400 text-sm p-4 rounded-xl border border-red-400/20 bg-red-400/5">
            <AlertCircle size={16} /> {state.error}
          </div>
        )}

        {/* Investigation HQ Panel */}
        {(state.phase === "investigating" || state.phase === "done") && state.agents.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* Left: Agent Activity */}
            <div className="rounded-2xl border border-white/10 bg-white/2 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-white/8">
                <Radio size={13} className="text-pink-400 animate-pulse" />
                <span className="text-xs font-semibold text-white/60 uppercase tracking-wider">Agentes em Campo</span>
              </div>
              <div ref={scrollRef} className="p-3 space-y-2 max-h-96 overflow-y-auto">
                {state.agents.map(agent => (
                  <AgentCard key={agent.agentId} agent={agent} />
                ))}
              </div>
            </div>

            {/* Right: Live Findings + WhatsApp */}
            <div className="space-y-4">
              {/* WhatsApp status */}
              {state.whatsapp && (
                <div className="rounded-2xl border border-white/10 bg-white/3 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <MessageCircle size={15} className={state.whatsapp.number ? "text-green-400" : "text-white/40"} />
                    <span className="text-xs font-semibold text-white/70">WhatsApp</span>
                  </div>
                  <p className="text-xs text-white/50">
                    {state.whatsapp.number
                      ? `WhatsApp encontrado no site: +${state.whatsapp.number}`
                      : "WhatsApp não encontrado no site"}
                  </p>
                  <p className="text-[11px] text-white/30 mt-1">
                    {state.whatsapp.note || "Teste de automação não realizado (requer integração WhatsApp e aprovação)"}
                  </p>
                </div>
              )}

              {/* Live findings */}
              <div className="rounded-2xl border border-white/10 bg-white/2 overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-white/8">
                  <CheckCircle size={13} className="text-green-400" />
                  <span className="text-xs font-semibold text-white/60 uppercase tracking-wider">Descobertas em Tempo Real</span>
                </div>
                <div className="p-3 space-y-2 max-h-64 overflow-y-auto">
                  {state.findings.length === 0 && (
                    <p className="text-xs text-white/45 text-center py-4">Coletando dados...</p>
                  )}
                  {state.findings.map((f, i) => (
                    <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-white/3 border border-white/6">
                      <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-[8px] font-bold text-black mt-0.5"
                        style={{ backgroundColor: AGENT_COLOR[f.agentId] ?? "#fff" }}>
                        {AGENT_AVATAR[f.agentId] ?? "?"}
                      </div>
                      <div>
                        <span className="text-[10px] font-semibold text-white/50 uppercase">{({ site: "Site", instagram: "Instagram", traffic: "Tráfego do site", ads: "Anúncios", maps: "Google Maps", whatsapp: "WhatsApp" } as Record<string, string>)[f.category] ?? f.category}</span>
                        <p className="text-[11px] text-white/65 mt-0.5">
                          {f.category === "site" && `Site: ${f.data.accessible ? "✓ acessível" : "✗ inacessível"} · WhatsApp: ${f.data.hasWhatsApp ? `✓ +${f.data.waNumber}` : "✗ ausente"} · Pixel: ${f.data.hasPixel ? "✓" : "✗"}`}
                          {f.category === "instagram" && (f.data.found ? `@${(f.data as { username?: string }).username} · ${((f.data as { followers?: number }).followers ?? 0).toLocaleString()} seguidores · ${(f.data as { posts?: number }).posts ?? 0} posts` : "Instagram não encontrado/acessível")}
                          {f.category === "traffic" && (f.data.found ? `Tráfego mensal: ${((f.data as { visits?: number }).visits ?? 0).toLocaleString()} visitas · Rank global: #${(f.data as { rank?: number }).rank?.toLocaleString() ?? "N/A"}` : "Dados de tráfego não disponíveis")}
                          {f.category === "whatsapp" && (f.data.found ? `WhatsApp no site: +${f.data.number} · automação não testada` : "WhatsApp não encontrado no site")}
                          {f.category === "ads" && `Meta Ads: ${f.data.found ? `${(f.data as { count?: number }).count ?? 0} anúncio(s) detectado(s)` : "sem dados"}`}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Final Report */}
        {state.phase === "done" && r && (
          <div className="space-y-6">
            {/* Success banner + send to chat */}
            <div className="flex items-center justify-between p-4 rounded-2xl border border-green-500/25 bg-green-500/8">
              <div className="flex items-center gap-2">
                <CheckCircle size={16} className="text-green-400" />
                <span className="text-sm font-semibold text-green-300">Investigação concluída — {state.agents.filter(a => a.status === "done").length} agentes reportaram</span>
              </div>
              <button
                onClick={sendToCeoChat}
                disabled={reportSent}
                className={cn("flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all",
                  reportSent ? "bg-green-500/20 text-green-400 border border-green-500/30" : "bg-pink-500 hover:bg-pink-400 text-white"
                )}>
                {reportSent ? <><CheckCircle size={12} /> Enviado ao CEO Chat</> : <><Send size={12} /> Enviar ao CEO Chat</>}
              </button>
            </div>
            {sendError && (
              <div className="flex items-center gap-2 text-red-400 text-xs p-3 rounded-xl border border-red-400/20 bg-red-400/5">
                <AlertCircle size={14} /> {sendError}
              </div>
            )}

            {/* Score header */}
            <div className="rounded-2xl border border-white/10 bg-white/3 p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                <div>
                  <h2 className="text-2xl font-bold text-white">{r.companyName as string}</h2>
                  <p className="text-white/40 text-sm mt-0.5">{r.segment as string}</p>
                  <div className="mt-3 flex items-center gap-2">
                    <span className="text-xs text-white/30 uppercase tracking-wider">Urgência:</span>
                    <span className="text-xs font-semibold text-amber-400">{r.urgency as string}</span>
                  </div>
                  {/* WhatsApp insight */}
                  {!!(r as Record<string, unknown>).whatsappInsight && (
                    <div className="mt-2 flex items-center gap-2">
                      <MessageCircle size={12} className="text-green-400" />
                      <span className="text-xs text-white/50">{(r as Record<string, unknown>).whatsappInsight as string}</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-center">
                    <div className="text-5xl font-black" style={{ color: scoreColor(r.overallScore as number) }}>
                      {r.overallScore as number}
                    </div>
                    <div className="text-xs text-white/30 mt-1">Score geral /100</div>
                  </div>
                  <div className="flex gap-4">
                    <ScoreRing score={r.scores?.instagram ?? 0} label="Instagram" color={scoreColor(r.scores?.instagram ?? 0)} />
                    <ScoreRing score={r.scores?.website ?? 0} label="Site" color={scoreColor(r.scores?.website ?? 0)} />
                    <ScoreRing score={r.scores?.ads ?? 0} label="Ads" color={scoreColor(r.scores?.ads ?? 0)} />
                    <ScoreRing score={r.scores?.positioning ?? 0} label="Posição" color={scoreColor(r.scores?.positioning ?? 0)} />
                  </div>
                </div>
              </div>
            </div>

            {/* Strengths & Gaps */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl border border-green-500/15 bg-green-500/5 p-4 space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-green-400 mb-3">
                  <TrendingUp size={14} /> Pontos Fortes
                </div>
                {((r.strengths as string[]) ?? []).map((s, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm text-white/65">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-400 mt-1.5 flex-shrink-0" /> {s}
                  </div>
                ))}
              </div>
              <div className="rounded-xl border border-red-500/15 bg-red-500/5 p-4 space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-red-400 mb-3">
                  <TrendingDown size={14} /> Gaps Críticos
                </div>
                {((r.gaps as string[]) ?? []).map((g, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm text-white/65">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 flex-shrink-0" /> {g}
                  </div>
                ))}
              </div>
            </div>

            {/* Opportunities */}
            <div>
              <h3 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-3">Oportunidades Identificadas</h3>
              <div className="space-y-3">
                {((r.opportunities as Array<{ title: string; impact: string; effort: string; description: string }>) ?? []).map((op, i) => (
                  <div key={i} className="rounded-xl border border-white/8 bg-white/2 p-4">
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <h4 className="font-semibold text-white text-sm">{op.title}</h4>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <ImpactBadge impact={op.impact} />
                        <span className="text-[10px] text-white/45">Esforço {op.effort}</span>
                      </div>
                    </div>
                    <p className="text-xs text-white/45 leading-relaxed">{op.description}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Detail sections */}
            <div className="space-y-3">
              <ExpandableSection title="Análise do Instagram" icon={Instagram}>
                <DataView data={r.instagramFindings ?? {}} />
              </ExpandableSection>
              <ExpandableSection title="Análise do Site" icon={Globe}>
                <DataView data={r.websiteFindings ?? {}} />
              </ExpandableSection>
              <ExpandableSection title="Análise de Anúncios (Meta Ads)" icon={Megaphone}>
                <DataView data={r.adsFindings ?? {}} />
              </ExpandableSection>
            </div>

            {/* Solutions & ROI */}
            <div className="rounded-2xl border border-pink-500/20 bg-pink-500/5 p-6">
              <div className="flex items-center gap-2 mb-4">
                <Target size={16} className="text-pink-400" />
                <h3 className="font-bold text-white">Soluções LOTUS Recomendadas</h3>
              </div>
              <div className="flex flex-wrap gap-2 mb-4">
                {((r.suggestedSolutions as string[]) ?? []).map((s, i) => (
                  <span key={i} className="px-3 py-1 rounded-full bg-pink-500/15 border border-pink-500/25 text-pink-300 text-xs font-medium">{s}</span>
                ))}
              </div>
              <div className="flex items-center gap-2 text-sm text-green-400">
                <TrendingUp size={14} />
                <strong>ROI estimado:</strong>
                <span className="text-white/60">{r.estimatedROI as string}</span>
              </div>
            </div>

            {/* Agent summary footer */}
            <div className="rounded-xl border border-white/8 bg-white/2 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Users size={13} className="text-white/40" />
                <span className="text-xs font-semibold text-white/50 uppercase tracking-wider">Equipe que Investigou</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {state.agents.map(a => (
                  <div key={a.agentId} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-white/8 bg-white/3">
                    <div className="w-4 h-4 rounded-full flex items-center justify-center text-[7px] font-bold text-black"
                      style={{ backgroundColor: AGENT_COLOR[a.agentId] ?? "#fff" }}>
                      {AGENT_AVATAR[a.agentId] ?? "?"}
                    </div>
                    <span className="text-[11px] text-white/50">{a.name}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* ─── Post-Diagnosis Agent Actions ─────────────────────────────── */}
            <div className="rounded-2xl border border-purple-500/25 bg-purple-500/5 p-6 space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <Zap size={16} className="text-purple-400" />
                <h3 className="font-bold text-white">Agentes em Ação — Próximos Passos</h3>
                <span className="ml-auto text-[10px] text-purple-400/70 uppercase tracking-wider">Automático</span>
              </div>
              <p className="text-xs text-white/35">Com base no diagnóstico, os agentes podem agir agora. Clique para executar cada etapa.</p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">

                {/* Ver fotos do site */}
                <div className="rounded-xl border border-white/8 bg-white/3 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-blue-500/15 border border-blue-500/25 flex items-center justify-center">
                      <Camera size={14} className="text-blue-400" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-white">Ver fotos do site</div>
                      <div className="text-[10px] text-white/35">Pedro Alves</div>
                    </div>
                  </div>
                  <p className="text-[11px] text-white/40 leading-relaxed">Extrai todas as imagens do site para usar como referência no novo projeto.</p>
                  {postActions.photos.status === "idle" && (
                    <button onClick={handleDownloadPhotos}
                      className="w-full py-2 rounded-lg bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/20 text-blue-400 text-xs font-semibold transition-all flex items-center justify-center gap-1.5">
                      <Camera size={12} /> Buscar fotos
                    </button>
                  )}
                  {postActions.photos.status === "loading" && (
                    <div className="w-full py-2 rounded-lg bg-blue-500/10 border border-blue-500/15 text-blue-400/70 text-xs font-semibold flex items-center justify-center gap-1.5">
                      <Loader2 size={12} className="animate-spin" /> Buscando...
                    </div>
                  )}
                  {postActions.photos.status === "done" && postActions.photos.images && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-1 text-[11px] text-green-400">
                        <CheckCircle size={11} /> {postActions.photos.images.length} imagens encontradas
                      </div>
                      <div className="grid grid-cols-3 gap-1 max-h-32 overflow-y-auto">
                        {postActions.photos.images.map((img, i) => (
                          <a key={i} href={img.url} target="_blank" rel="noopener noreferrer"
                            className="aspect-square rounded bg-white/5 border border-white/8 overflow-hidden flex items-center justify-center hover:border-blue-500/40 transition-colors">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={img.url} alt="" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                  {postActions.photos.status === "error" && (
                    <div className="text-[11px] text-red-400 flex items-center gap-1">
                      <AlertCircle size={11} /> {postActions.photos.error ?? "Erro ao baixar"}
                    </div>
                  )}
                </div>

                {/* Gerar Novo Site */}
                <div className="rounded-xl border border-white/8 bg-white/3 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-pink-500/15 border border-pink-500/25 flex items-center justify-center">
                      <Wand2 size={14} className="text-pink-400" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-white">Gerar Novo Site</div>
                      <div className="text-[10px] text-white/35">Felipe Costa</div>
                    </div>
                  </div>
                  <p className="text-[11px] text-white/40 leading-relaxed">Cria uma landing page de alta conversão personalizada para esta empresa.</p>
                  {postActions.site.status === "idle" && (
                    <button onClick={handleBuildSite}
                      className="w-full py-2 rounded-lg bg-pink-500/15 hover:bg-pink-500/25 border border-pink-500/20 text-pink-400 text-xs font-semibold transition-all flex items-center justify-center gap-1.5">
                      <Wand2 size={12} /> Gerar
                    </button>
                  )}
                  {postActions.site.status === "loading" && (
                    <div className="w-full py-2 rounded-lg bg-pink-500/10 border border-pink-500/15 text-pink-400/70 text-xs font-semibold flex items-center justify-center gap-1.5">
                      <Loader2 size={12} className="animate-spin" /> Criando site...
                    </div>
                  )}
                  {postActions.site.status === "done" && postActions.site.html && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-1 text-[11px] text-green-400">
                        <CheckCircle size={11} /> Landing page gerada!
                      </div>
                      <button onClick={downloadSiteHtml}
                        className="w-full py-2 rounded-lg bg-pink-500/15 hover:bg-pink-500/25 border border-pink-500/20 text-pink-400 text-xs font-semibold transition-all flex items-center justify-center gap-1.5">
                        <Download size={12} /> Baixar HTML
                      </button>
                      <button onClick={() => { const w = window.open(); if (w) { w.document.write(postActions.site.html!); w.document.close(); } }}
                        className="w-full py-2 rounded-lg bg-white/5 hover:bg-white/8 border border-white/10 text-white/60 text-xs font-semibold transition-all flex items-center justify-center gap-1.5">
                        <ExternalLink size={12} /> Visualizar
                      </button>
                    </div>
                  )}
                  {postActions.site.status === "error" && (
                    <div className="text-[11px] text-red-400 flex items-center gap-1">
                      <AlertCircle size={11} /> {postActions.site.error ?? "Erro ao gerar"}
                    </div>
                  )}
                </div>

                {/* WhatsApp Automação */}
                <div className="rounded-xl border border-white/8 bg-white/3 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-green-500/15 border border-green-500/25 flex items-center justify-center">
                      <MessageSquare size={14} className="text-green-400" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-white">Montar WhatsApp</div>
                      <div className="text-[10px] text-white/35">Rodrigo Castro</div>
                    </div>
                  </div>
                  <p className="text-[11px] text-white/40 leading-relaxed">Gera scripts de atendimento, bot de qualificação e plano de automação completo.</p>
                  {postActions.whatsapp.status === "idle" && (
                    <button onClick={handleWhatsApp}
                      className="w-full py-2 rounded-lg bg-green-500/15 hover:bg-green-500/25 border border-green-500/20 text-green-400 text-xs font-semibold transition-all flex items-center justify-center gap-1.5">
                      <MessageSquare size={12} /> Configurar
                    </button>
                  )}
                  {postActions.whatsapp.status === "loading" && (
                    <div className="w-full py-2 rounded-lg bg-green-500/10 border border-green-500/15 text-green-400/70 text-xs font-semibold flex items-center justify-center gap-1.5">
                      <Loader2 size={12} className="animate-spin" /> Montando bot...
                    </div>
                  )}
                  {postActions.whatsapp.status === "done" && postActions.whatsapp.setup && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-1 text-[11px] text-green-400">
                        <CheckCircle size={11} /> Setup gerado!
                        {postActions.whatsapp.waNumber && <span className="text-white/30 ml-1">+{postActions.whatsapp.waNumber}</span>}
                      </div>
                      {/* Welcome message preview */}
                      {!!(postActions.whatsapp.setup as Record<string, unknown>).welcomeMessage && (
                        <div className="rounded-lg bg-green-500/8 border border-green-500/15 p-2.5">
                          <div className="text-[10px] text-green-400/60 mb-1 uppercase tracking-wider">Boas-vindas</div>
                          <p className="text-[11px] text-white/60 leading-relaxed line-clamp-3">
                            {(postActions.whatsapp.setup as Record<string, string>).welcomeMessage}
                          </p>
                        </div>
                      )}
                      {/* Platforms */}
                      {Array.isArray((postActions.whatsapp.setup as Record<string, unknown>).platforms) && (
                        <div className="flex flex-wrap gap-1">
                          {((postActions.whatsapp.setup as { platforms: { name: string }[] }).platforms ?? []).slice(0, 3).map((p, i) => (
                            <span key={i} className="px-2 py-0.5 rounded bg-white/5 border border-white/8 text-[10px] text-white/50">{p.name}</span>
                          ))}
                        </div>
                      )}
                      <button onClick={() => {
                        const text = dataToMarkdown(postActions.whatsapp.setup);
                        navigator.clipboard.writeText(text)
                          .then(() => { setWaCopied("ok"); setTimeout(() => setWaCopied(null), 2500); })
                          .catch(() => setWaCopied("erro"));
                      }}
                        className="w-full py-2 rounded-lg bg-green-500/15 hover:bg-green-500/25 border border-green-500/20 text-green-400 text-xs font-semibold transition-all flex items-center justify-center gap-1.5">
                        <Copy size={12} /> {waCopied === "ok" ? "Copiado!" : waCopied === "erro" ? "Não deu para copiar" : "Copiar roteiros e configuração"}
                      </button>
                    </div>
                  )}
                  {postActions.whatsapp.status === "error" && (
                    <div className="text-[11px] text-red-400 flex items-center gap-1">
                      <AlertCircle size={11} /> {postActions.whatsapp.error ?? "Erro ao gerar"}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
