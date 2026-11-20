"use client";

import { useState, useEffect } from "react";
import { Plug, CheckCircle2, XCircle, AlertCircle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConnectedAccounts } from "@/components/settings/connected-accounts";

interface Integration {
  id: string;
  name: string;
  type: string;
  category: string;
  status: 'connected' | 'disconnected' | 'error';
  description: string;
  envKey?: string;
  checked?: 'live' | 'env';
  errorMessage?: string;
}

interface Summary {
  total: number;
  connected: number;
  disconnected: number;
}

const CATEGORY_LABELS: Record<string, string> = {
  ai:             'Inteligência Artificial',
  infrastructure: 'Infraestrutura',
  ads:            'Mídia Paga',
  analytics:      'Analytics',
  communication:  'Comunicação',
};

const CATEGORY_ICONS: Record<string, string> = {
  ai:             '🤖',
  infrastructure: '🏗️',
  ads:            '📢',
  analytics:      '📊',
  communication:  '💬',
};

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [summary, setSummary] = useState<Summary>({ total: 0, connected: 0, disconnected: 0 });
  const [loading, setLoading] = useState(true);

  const fetchIntegrations = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/integrations');
      const data = await res.json();
      setIntegrations(data.integrations ?? []);
      setSummary(data.summary ?? { total: 0, connected: 0, disconnected: 0 });
    } catch {
      setIntegrations([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchIntegrations(); }, []);

  const categories = Array.from(new Set(integrations.map((i) => i.category)));

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Integrações</h1>
          <p className="text-muted-foreground mt-1">APIs e serviços do LOTUS</p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Só o banco de dados é testado de verdade. Nos demais, &quot;Chave configurada&quot; indica apenas que a variável de ambiente existe.
          </p>
        </div>
        <button
          onClick={fetchIntegrations}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-muted/50 hover:bg-muted border border-border text-sm text-muted-foreground hover:text-foreground transition-all"
        >
          <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
          Verificar
        </button>
      </div>

      <div className="max-w-3xl">
        <ConnectedAccounts />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-muted-foreground">Total</span>
            <Plug className="w-5 h-5 text-muted-foreground" />
          </div>
          <div className="text-3xl font-bold text-foreground">{summary.total}</div>
        </div>
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-muted-foreground">Configuradas</span>
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          </div>
          <div className="text-3xl font-bold text-emerald-400">{summary.connected}</div>
        </div>
        <div className="rounded-xl border border-zinc-500/20 bg-zinc-500/5 p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-muted-foreground">Não configuradas</span>
            <XCircle className="w-5 h-5 text-zinc-500" />
          </div>
          <div className="text-3xl font-bold text-zinc-500">{summary.disconnected}</div>
        </div>
      </div>

      {/* Integrations by category */}
      {loading ? (
        <div className="space-y-6">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="space-y-3">
              <div className="h-5 bg-muted rounded w-40 animate-pulse" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {Array.from({ length: 3 }).map((_, j) => (
                  <div key={j} className="rounded-xl border border-border bg-card p-5 animate-pulse">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-lg bg-muted" />
                      <div className="space-y-2 flex-1">
                        <div className="h-4 bg-muted rounded w-24" />
                        <div className="h-3 bg-muted rounded w-16" />
                      </div>
                    </div>
                    <div className="h-3 bg-muted rounded w-48" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-8">
          {categories.map((category) => {
            const catIntegrations = integrations.filter((i) => i.category === category);
            return (
              <div key={category}>
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
                  <span>{CATEGORY_ICONS[category] ?? '🔌'}</span>
                  {CATEGORY_LABELS[category] ?? category}
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {catIntegrations.map((integration) => {
                    const isConnected = integration.status === 'connected';
                    return (
                      <div
                        key={integration.id}
                        className={cn(
                          "rounded-xl border bg-card p-5 transition-all",
                          isConnected
                            ? "border-emerald-500/20 hover:border-emerald-500/40"
                            : "border-border hover:border-border/80 opacity-70"
                        )}
                      >
                        <div className="flex items-start gap-4">
                          {/* Status icon */}
                          <div className={cn(
                            "w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0",
                            isConnected
                              ? "bg-emerald-400/10 border border-emerald-400/20"
                              : "bg-muted/50 border border-border"
                          )}>
                            {isConnected
                              ? <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                              : <XCircle className="w-5 h-5 text-zinc-500" />
                            }
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <h3 className="font-semibold text-foreground text-sm">{integration.name}</h3>
                              <span className={cn(
                                "text-[10px] font-medium px-1.5 py-0.5 rounded border",
                                isConnected
                                  ? "text-emerald-400 bg-emerald-400/10 border-emerald-400/20"
                                  : "text-zinc-500 bg-zinc-500/10 border-zinc-500/20"
                              )}>
                                {integration.status === 'error'
                                  ? 'Erro'
                                  : isConnected
                                  ? (integration.checked === 'live' ? 'Conectada' : 'Chave configurada')
                                  : 'Não configurada'}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground leading-relaxed">{integration.description}</p>
                          </div>
                        </div>

                        {integration.status === 'error' && integration.errorMessage && (
                          <div className="mt-3 pt-3 border-t border-border flex items-center gap-2">
                            <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                            <p className="text-xs text-red-400 break-all">{integration.errorMessage}</p>
                          </div>
                        )}
                        {integration.status === 'disconnected' && integration.envKey && (
                          <div className="mt-3 pt-3 border-t border-border flex items-center gap-2">
                            <AlertCircle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                            <p className="text-xs text-muted-foreground">
                              Configure <code className="text-amber-400 font-mono">{integration.envKey}</code> no <code className="text-muted-foreground font-mono">.env.local</code>
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
