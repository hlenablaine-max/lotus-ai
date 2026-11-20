"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Package, Search, Zap, TrendingUp, Clock, DollarSign, ChevronRight, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

// Escolhe o cliente e abre o chat da LOTUS com o pedido de proposta já escrito (o dono revisa e envia)
function ProposeToClient({ solution }: { solution: { name: string; problemSolved: string } }) {
  const router = useRouter();
  const [clients, setClients] = useState<Array<{ id: string; name: string }>>([]);
  const [clientId, setClientId] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/clients")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? `erro ${r.status}`);
        setClients(d.clients ?? []);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  const propose = () => {
    const client = clients.find((c) => c.id === clientId);
    if (!client) return;
    const prompt = `Monte uma proposta da solução "${solution.name}" para o cliente ${client.name}: explique como ela resolve "${solution.problemSolved}" no caso dele, com escopo, prazo, investimento e próximos passos. Use os dados e diagnósticos que já temos desse cliente.`;
    const params = new URLSearchParams({ clientId: client.id, clientName: client.name, prompt });
    router.push(`/ceo?${params.toString()}`);
  };

  return (
    <div className="space-y-2">
      <select
        value={clientId}
        onChange={(e) => setClientId(e.target.value)}
        className="w-full px-3 py-2.5 rounded-lg bg-muted/50 border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
      >
        <option value="">{clients.length ? "Escolha o cliente…" : "Nenhum cliente cadastrado"}</option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      {error && <p className="text-xs text-red-400">Não foi possível carregar os clientes ({error}).</p>}
      <button
        onClick={propose}
        disabled={!clientId}
        className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-all disabled:opacity-40"
      >
        Propor para este cliente
      </button>
    </div>
  );
}

interface Solution {
  id: string;
  name: string;
  slug: string;
  description: string;
  problemSolved: string;
  category: string;
  complexity: string;
  implementationModel: string;
  components: string[];
  features: string[];
  deliveryWeeks: number;
  baseSetupPrice: number;
  baseMonthlyPrice: number;
  createdAt: string;
}

const COMPLEXITY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  LOW:        { label: "Ganho rápido", color: "text-emerald-400", bg: "bg-emerald-400/10 border-emerald-400/20" },
  MEDIUM:     { label: "Padrão",       color: "text-blue-400",    bg: "bg-blue-400/10 border-blue-400/20" },
  HIGH:       { label: "Complexo",     color: "text-amber-400",   bg: "bg-amber-400/10 border-amber-400/20" },
  ENTERPRISE: { label: "Grande porte", color: "text-violet-400",  bg: "bg-violet-400/10 border-violet-400/20" },
};

const MODEL_CONFIG: Record<string, { label: string; icon: React.ElementType }> = {
  TURNKEY:          { label: "Entregue pronto", icon: Zap },
  CO_IMPLEMENTATION:{ label: "Feito junto",     icon: TrendingUp },
  MAINTENANCE:      { label: "Manutenção",      icon: Sparkles },
};

const CATEGORY_COLORS: Record<string, string> = {
  "Estratégia & Inteligência": "text-violet-400",
  "Marketing & Growth": "text-pink-400",
  "Tecnologia & Automação": "text-blue-400",
  "Saúde & Clínicas": "text-emerald-400",
  "Transformação Digital": "text-amber-400",
};

function formatPrice(value: number) {
  if (!value) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value);
}

export default function SolutionsPage() {
  const [solutions, setSolutions] = useState<Solution[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterComplexity, setFilterComplexity] = useState("all");
  const [selected, setSelected] = useState<Solution | null>(null);

  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/solutions")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? `erro ${r.status}`);
        setSolutions(d.solutions ?? []);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, []);

  const categories = Array.from(new Set(solutions.map((s) => s.category)));
  const complexities = Array.from(new Set(solutions.map((s) => s.complexity)));

  const filtered = solutions.filter((s) => {
    const matchSearch =
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.description.toLowerCase().includes(search.toLowerCase()) ||
      s.category.toLowerCase().includes(search.toLowerCase());
    const matchComplexity = filterComplexity === "all" || s.complexity === filterComplexity;
    return matchSearch && matchComplexity;
  });

  const grouped = categories.reduce<Record<string, Solution[]>>((acc, cat) => {
    const items = filtered.filter((s) => s.category === cat);
    if (items.length > 0) acc[cat] = items;
    return acc;
  }, {});

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Catálogo de Soluções</h1>
          <p className="text-muted-foreground mt-1">{solutions.length} soluções implementáveis</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20">
          <Package className="w-4 h-4 text-primary" />
          <span className="text-sm text-primary font-medium">{solutions.length} soluções</span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar soluções..."
            className="w-full pl-10 pr-4 py-2.5 bg-muted/50 border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setFilterComplexity("all")}
            className={cn("px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
              filterComplexity === "all"
                ? "bg-primary/15 text-primary border-primary/30"
                : "bg-muted/30 text-muted-foreground border-border hover:text-foreground"
            )}
          >Todos</button>
          {complexities.map((c) => {
            const cfg = COMPLEXITY_CONFIG[c];
            return (
              <button
                key={c}
                onClick={() => setFilterComplexity(c)}
                className={cn("px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
                  filterComplexity === c ? cn(cfg?.color, cfg?.bg) : "bg-muted/30 text-muted-foreground border-border hover:text-foreground"
                )}
              >{cfg?.label ?? c}</button>
            );
          })}
        </div>
      </div>

      {/* Grid by category */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-5 animate-pulse h-48" />
          ))}
        </div>
      ) : solutions.length === 0 ? (
        <div className="text-center py-16">
          <Package className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-muted-foreground">{loadError ? "Não foi possível carregar o catálogo de soluções." : "Nenhuma solução cadastrada ainda."}</p>
          <p className="text-xs text-muted-foreground/70 mt-1">{loadError ? loadError : "O catálogo é preenchido pelo seed do banco (pnpm db:seed)."}</p>
        </div>
      ) : (
        Object.entries(grouped).map(([cat, items]) => (
          <div key={cat}>
            <h2 className={cn("text-xs font-semibold uppercase tracking-widest mb-4", CATEGORY_COLORS[cat] ?? "text-muted-foreground")}>
              {cat}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-8">
              {items.map((sol) => {
                const cxCfg = COMPLEXITY_CONFIG[sol.complexity];
                const ModelIcon = MODEL_CONFIG[sol.implementationModel]?.icon ?? Zap;
                return (
                  <button
                    key={sol.id}
                    onClick={() => setSelected(sol)}
                    className="flex flex-col gap-3 p-5 rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-primary/5 transition-all text-left group"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-foreground leading-snug group-hover:text-primary transition-colors">{sol.name}</h3>
                      <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0 mt-0.5" />
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{sol.description}</p>
                    <div className="flex items-center gap-2 flex-wrap mt-auto">
                      <span className={cn("inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border", cxCfg?.bg, cxCfg?.color)}>
                        {cxCfg?.label}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="w-3 h-3" /> {sol.deliveryWeeks}sem
                      </span>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground ml-auto">
                        <ModelIcon className="w-3 h-3" />
                        {MODEL_CONFIG[sol.implementationModel]?.label}
                      </span>
                    </div>
                    {(sol.baseSetupPrice > 0 || sol.baseMonthlyPrice > 0) && (
                      <div className="pt-2 border-t border-border flex items-center gap-3">
                        {sol.baseSetupPrice > 0 && (
                          <span className="flex items-center gap-1 text-sm font-semibold text-primary">
                            <DollarSign className="w-3.5 h-3.5" /> Setup {formatPrice(sol.baseSetupPrice)}
                          </span>
                        )}
                        {sol.baseMonthlyPrice > 0 && (
                          <span className="text-xs text-muted-foreground">
                            + {formatPrice(sol.baseMonthlyPrice)}/mês
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))
      )}

      {/* Detail Modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setSelected(null)}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div
            className="relative z-10 w-full max-w-xl rounded-2xl bg-card border border-border shadow-2xl p-6 max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <span className={cn("inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border mb-2",
                  COMPLEXITY_CONFIG[selected.complexity]?.bg, COMPLEXITY_CONFIG[selected.complexity]?.color
                )}>
                  {COMPLEXITY_CONFIG[selected.complexity]?.label}
                </span>
                <h2 className="text-xl font-bold text-foreground">{selected.name}</h2>
                <p className="text-sm text-muted-foreground mt-1">{selected.category}</p>
              </div>
              <div className="text-right flex-shrink-0">
                {selected.baseSetupPrice > 0 && (
                  <p className="text-lg font-bold text-primary">{formatPrice(selected.baseSetupPrice)}</p>
                )}
                {selected.baseMonthlyPrice > 0 && (
                  <p className="text-xs text-muted-foreground">{formatPrice(selected.baseMonthlyPrice)}/mês</p>
                )}
              </div>
            </div>

            <p className="text-sm text-muted-foreground leading-relaxed mb-4">{selected.description}</p>

            {selected.problemSolved && (
              <div className="p-3 rounded-lg bg-muted/30 border border-border mb-4">
                <p className="text-xs font-medium text-muted-foreground mb-1">PROBLEMA QUE RESOLVE</p>
                <p className="text-sm text-foreground">{selected.problemSolved}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 mb-5">
              <div className="p-3 rounded-lg bg-muted/30 border border-border">
                <p className="text-xs text-muted-foreground mb-1">Prazo estimado</p>
                <p className="text-sm font-semibold text-foreground">{selected.deliveryWeeks} semanas</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/30 border border-border">
                <p className="text-xs text-muted-foreground mb-1">Modelo</p>
                <p className="text-sm font-semibold text-foreground">{MODEL_CONFIG[selected.implementationModel]?.label}</p>
              </div>
            </div>

            {Array.isArray(selected.components) && selected.components.length > 0 && (
              <div className="mb-5">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Componentes</h3>
                <ul className="space-y-1">
                  {selected.components.map((d: string, i: number) => (
                    <li key={i} className="flex items-center gap-2 text-sm text-foreground">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                      {d}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {Array.isArray(selected.features) && selected.features.length > 0 && (
              <div className="mb-5">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Recursos inclusos</h3>
                <div className="flex flex-wrap gap-2">
                  {selected.features.map((f: string, i: number) => (
                    <span key={i} className="text-xs px-2 py-1 rounded-md bg-muted/50 border border-border text-muted-foreground">{f}</span>
                  ))}
                </div>
              </div>
            )}

            <ProposeToClient solution={selected} />
          </div>
        </div>
      )}
    </div>
  );
}
