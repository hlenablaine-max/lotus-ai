"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Activity, AlertTriangle, ArrowRight, CheckCircle2, RefreshCw, XCircle } from "lucide-react";

interface LiveCheck {
  id: string;
  area: string;
  label: string;
  status: "ok" | "warn" | "fail";
  detail: string;
  fix?: { label: string; href: string };
}

interface LiveData {
  checkedAt: string;
  checks: LiveCheck[];
  summary: { ok: number; warn: number; fail: number };
  ops: { activeMissions: number; pendingApprovals: number; failedTasks: number; stuckTasks: number; demoRuns: number };
  output: { sites: number; deliveries: number };
}

const LIVE_STYLE = {
  ok: { icon: CheckCircle2, color: "text-emerald-400", dot: "bg-emerald-400", label: "OK" },
  warn: { icon: AlertTriangle, color: "text-amber-400", dot: "bg-amber-400", label: "Atenção" },
  fail: { icon: XCircle, color: "text-red-400", dot: "bg-red-400", label: "Problema" },
} as const;

// Verificação ao vivo da Governança: o que está funcionando agora e o que falta resolver, com o atalho para resolver.
export function LiveChecks() {
  const [data, setData] = useState<LiveData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/governance", { cache: "no-store" });
      if (!res.ok) throw new Error(`erro ${res.status}`);
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rank = { fail: 0, warn: 1, ok: 2 } as const;
  const pending = data ? data.checks.filter((c) => c.status !== "ok").sort((a, b) => rank[a.status] - rank[b.status]) : [];
  const areas = data ? Array.from(new Set(data.checks.map((c) => c.area))) : [];

  return (
    <section className="mb-8 rounded-xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Activity size={15} className="text-primary" /> Verificação ao vivo
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Conferido agora no banco, neste computador e nas contas conectadas.
            {data && ` Última checagem às ${new Date(data.checkedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.`}
          </p>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-xs text-foreground disabled:opacity-50"
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Verificar de novo
        </button>
      </div>

      {error && <p className="text-xs text-red-400 mb-3">Não foi possível verificar ({error}).</p>}
      {!data && !error && <p className="text-xs text-muted-foreground">Verificando…</p>}

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-5">
            {[
              { label: "Missões em andamento", value: data.ops.activeMissions, alert: false },
              { label: "Aprovações esperando", value: data.ops.pendingApprovals, alert: data.ops.pendingApprovals > 0 },
              { label: "Tarefas com falha", value: data.ops.failedTasks, alert: data.ops.failedTasks > 0 },
              { label: "Sites criados", value: data.output.sites, alert: false },
              { label: "Pacotes entregues", value: data.output.deliveries, alert: false },
            ].map((m) => (
              <div key={m.label} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2.5">
                <div className={cn("text-xl font-bold", m.alert ? "text-amber-400" : "text-foreground")}>{m.value}</div>
                <div className="text-[11px] text-muted-foreground">{m.label}</div>
              </div>
            ))}
          </div>

          <div className="mb-5">
            <h3 className="text-xs font-semibold text-foreground mb-2">
              {pending.length === 0 ? "Nada faltando agora" : `O que falta resolver (${pending.length})`}
            </h3>
            {pending.length === 0 ? (
              <p className="text-xs text-emerald-400">Tudo certo em todas as verificações.</p>
            ) : (
              <div className="space-y-2">
                {pending.map((c) => {
                  const st = LIVE_STYLE[c.status];
                  const Icon = st.icon;
                  return (
                    <div key={c.id} className="flex items-start gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2.5">
                      <Icon size={15} className={cn("flex-shrink-0 mt-0.5", st.color)} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-foreground">{c.label}</div>
                        <p className="text-xs text-muted-foreground mt-0.5">{c.detail}</p>
                      </div>
                      {c.fix && (
                        <Link href={c.fix.href} className="flex-shrink-0 flex items-center gap-1 text-xs text-primary hover:underline mt-0.5">
                          {c.fix.label} <ArrowRight size={11} />
                        </Link>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="grid md:grid-cols-3 gap-3">
            {areas.map((area) => (
              <div key={area} className="rounded-lg border border-white/10 bg-black/20 p-3">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">{area}</div>
                <ul className="space-y-1.5">
                  {data.checks
                    .filter((c) => c.area === area)
                    .map((c) => (
                      <li key={c.id} className="flex items-center gap-2 text-xs" title={c.detail}>
                        <span className={cn("w-2 h-2 rounded-full flex-shrink-0", LIVE_STYLE[c.status].dot)} />
                        <span className="text-foreground/90 flex-1">{c.label}</span>
                        <span className={cn("text-[10px]", LIVE_STYLE[c.status].color)}>{LIVE_STYLE[c.status].label}</span>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
