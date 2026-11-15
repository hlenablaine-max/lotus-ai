"use client";

import { useState } from "react";
import { Search, Loader2, AlertCircle, TrendingUp, TrendingDown, Zap, Instagram, Globe, Megaphone, Target, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface DiagnosisResult {
  companyName: string;
  segment: string;
  overallScore: number;
  scores: { instagram: number; website: number; ads: number; positioning: number };
  strengths: string[];
  gaps: string[];
  opportunities: { title: string; impact: string; effort: string; description: string }[];
  instagramFindings: Record<string, string>;
  websiteFindings: Record<string, string>;
  adsFindings: { active: boolean; estimatedBudget: string; creativeTypes: string; topPerformers: string };
  suggestedSolutions: string[];
  estimatedROI: string;
  urgency: string;
}

function ScoreRing({ score, label, color }: { score: number; label: string; color: string }) {
  const r = 28;
  const c = 2 * Math.PI * r;
  const pct = score / 100;
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-16 h-16">
        <svg viewBox="0 0 72 72" className="w-16 h-16 -rotate-90">
          <circle cx="36" cy="36" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
          <circle
            cx="36" cy="36" r={r} fill="none"
            stroke={color} strokeWidth="6"
            strokeDasharray={`${pct * c} ${c}`}
            strokeLinecap="round"
          />
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
  const style = impact === "Alto"
    ? "text-green-400 bg-green-400/10 border-green-400/20"
    : impact === "Médio"
    ? "text-amber-400 bg-amber-400/10 border-amber-400/20"
    : "text-white/40 bg-white/5 border-white/10";
  return <span className={cn("px-2 py-0.5 rounded text-[10px] font-semibold border", style)}>{impact}</span>;
}

function ExpandableSection({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-white/8 overflow-hidden">
      <button
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center justify-between p-4 hover:bg-white/3 transition-colors"
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-white/70">
          <Icon size={15} className="text-white/40" /> {title}
        </div>
        {open ? <ChevronUp size={14} className="text-white/30" /> : <ChevronDown size={14} className="text-white/30" />}
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

export default function DiagnosisPage() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DiagnosisResult | null>(null);
  const [error, setError] = useState("");

  const runDiagnosis = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/diagnosis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResult(data.diagnosis);
    } catch (e) {
      setError("Falha ao gerar diagnóstico. Tente novamente.");
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const scoreColor = (s: number) => s >= 75 ? "#4ade80" : s >= 50 ? "#fb923c" : "#f87171";

  return (
    <div className="min-h-screen bg-[#07070f] p-8">
      {/* Header */}
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-white">Diagnóstico de Empresa</h1>
          <p className="text-white/40 mt-1">Cole o link do Instagram, site ou nome da empresa para uma análise completa</p>
        </div>

        {/* Input */}
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25" />
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runDiagnosis()}
              placeholder="instagram.com/empresa ou site da empresa..."
              className="w-full pl-11 pr-4 py-3.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-white/25 focus:outline-none focus:ring-1 focus:ring-pink-500 focus:border-pink-500 transition-all"
            />
          </div>
          <button
            onClick={runDiagnosis}
            disabled={loading || !url.trim()}
            className="px-6 py-3.5 rounded-xl bg-pink-500 hover:bg-pink-400 disabled:opacity-40 text-white font-semibold text-sm flex items-center gap-2 transition-all"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
            {loading ? "Analisando..." : "Diagnosticar"}
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-red-400 text-sm p-4 rounded-xl border border-red-400/20 bg-red-400/5">
            <AlertCircle size={16} /> {error}
          </div>
        )}

        {loading && (
          <div className="text-center py-16 space-y-4">
            <div className="flex justify-center gap-6 text-white/25 text-xs">
              {["Analisando Instagram...", "Verificando site...", "Checando anúncios...", "Mapeando oportunidades..."].map((s, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <Loader2 size={10} className="animate-spin" /> {s}
                </div>
              ))}
            </div>
          </div>
        )}

        {result && (
          <div className="space-y-6">
            {/* Score header */}
            <div className="rounded-2xl border border-white/10 bg-white/3 p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                <div>
                  <h2 className="text-2xl font-bold text-white">{result.companyName}</h2>
                  <p className="text-white/40 text-sm mt-0.5">{result.segment}</p>
                  <div className="mt-3 flex items-center gap-2">
                    <span className="text-xs text-white/30 uppercase tracking-wider">Urgência:</span>
                    <span className="text-xs font-semibold text-amber-400">{result.urgency}</span>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-center">
                    <div className="text-5xl font-black" style={{ color: scoreColor(result.overallScore) }}>
                      {result.overallScore}
                    </div>
                    <div className="text-xs text-white/30 mt-1">Score geral /100</div>
                  </div>
                  <div className="flex gap-4">
                    <ScoreRing score={result.scores.instagram} label="Instagram" color={scoreColor(result.scores.instagram)} />
                    <ScoreRing score={result.scores.website} label="Site" color={scoreColor(result.scores.website)} />
                    <ScoreRing score={result.scores.ads} label="Ads" color={scoreColor(result.scores.ads)} />
                    <ScoreRing score={result.scores.positioning} label="Posição" color={scoreColor(result.scores.positioning)} />
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
                {result.strengths.map((s, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm text-white/65">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-400 mt-1.5 flex-shrink-0" /> {s}
                  </div>
                ))}
              </div>
              <div className="rounded-xl border border-red-500/15 bg-red-500/5 p-4 space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-red-400 mb-3">
                  <TrendingDown size={14} /> Gaps Críticos
                </div>
                {result.gaps.map((g, i) => (
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
                {result.opportunities.map((op, i) => (
                  <div key={i} className="rounded-xl border border-white/8 bg-white/2 p-4">
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <h4 className="font-semibold text-white text-sm">{op.title}</h4>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <ImpactBadge impact={op.impact} />
                        <span className="text-[10px] text-white/25">Esforço {op.effort}</span>
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
                <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                  {Object.entries(result.instagramFindings).map(([k, v]) => (
                    <div key={k} className="flex justify-between text-xs border-b border-white/4 py-1.5">
                      <span className="text-white/35 capitalize">{k.replace(/([A-Z])/g, ' $1')}</span>
                      <span className="text-white/65 text-right max-w-[55%]">{v}</span>
                    </div>
                  ))}
                </div>
              </ExpandableSection>

              <ExpandableSection title="Análise do Site" icon={Globe}>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                  {Object.entries(result.websiteFindings).map(([k, v]) => (
                    <div key={k} className="flex justify-between text-xs border-b border-white/4 py-1.5">
                      <span className="text-white/35 capitalize">{k.replace(/([A-Z])/g, ' $1')}</span>
                      <span className="text-white/65 text-right max-w-[55%]">{v}</span>
                    </div>
                  ))}
                </div>
              </ExpandableSection>

              <ExpandableSection title="Análise de Anúncios (Ads Library)" icon={Megaphone}>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className={cn("w-2 h-2 rounded-full", result.adsFindings.active ? "bg-green-400" : "bg-red-400")} />
                    <span className="text-sm text-white/65">{result.adsFindings.active ? "Anúncios ativos" : "Sem anúncios ativos"}</span>
                  </div>
                  {[
                    ["Budget estimado", result.adsFindings.estimatedBudget],
                    ["Tipos de criativos", result.adsFindings.creativeTypes],
                    ["Top performers", result.adsFindings.topPerformers],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between text-xs border-b border-white/4 py-1.5">
                      <span className="text-white/35">{k}</span>
                      <span className="text-white/65">{v}</span>
                    </div>
                  ))}
                </div>
              </ExpandableSection>
            </div>

            {/* Solutions & ROI */}
            <div className="rounded-2xl border border-pink-500/20 bg-pink-500/5 p-6">
              <div className="flex items-center gap-2 mb-4">
                <Target size={16} className="text-pink-400" />
                <h3 className="font-bold text-white">Soluções LOTUS Recomendadas</h3>
              </div>
              <div className="flex flex-wrap gap-2 mb-4">
                {result.suggestedSolutions.map((s, i) => (
                  <span key={i} className="px-3 py-1 rounded-full bg-pink-500/15 border border-pink-500/25 text-pink-300 text-xs font-medium">
                    {s}
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-2 text-sm text-green-400">
                <TrendingUp size={14} />
                <strong>ROI estimado:</strong>
                <span className="text-white/60">{result.estimatedROI}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
