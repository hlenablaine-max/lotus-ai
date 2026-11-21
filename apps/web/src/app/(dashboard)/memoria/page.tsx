"use client";

// Memória da empresa: o que todos os agentes leem antes de trabalhar.
import { useCallback, useEffect, useState } from "react";
import { Brain, Plus, Trash2 } from "lucide-react";

interface Mem {
  id: string;
  content: string;
  updatedAt: string;
  department?: string;
  agent?: { name: string } | null;
}
const input = "w-full rounded-lg bg-muted/40 border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50";

export default function MemoryPage() {
  const [data, setData] = useState<{ global: Mem[]; department: Mem[]; agent: Mem[]; departments: string[] } | null>(null);
  const [rule, setRule] = useState("");
  const [deptRule, setDeptRule] = useState({ department: "", content: "" });
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const r = await fetch("/api/memory").catch(() => null);
    if (r?.ok) setData(await r.json());
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const add = async (body: Record<string, unknown>) => {
    setError("");
    const r = await fetch("/api/memory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) setError(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "Não salvou");
    void load();
    return r.ok;
  };
  const del = async (id: string) => {
    if (!window.confirm("Apagar esta memória? Os agentes deixam de ler isso.")) return;
    await fetch(`/api/memory?id=${id}`, { method: "DELETE" });
    void load();
  };

  const Item = ({ m, extra }: { m: Mem; extra?: string }) => (
    <div className="flex items-start gap-2 py-2 border-t border-border/50 first:border-t-0">
      <div className="flex-1 text-sm text-foreground">
        {extra && <span className="text-[10px] uppercase tracking-wide text-primary mr-2">{extra}</span>}
        {m.content}
        <div className="text-[10px] text-muted-foreground">{new Date(m.updatedAt).toLocaleString("pt-BR")}</div>
      </div>
      <button onClick={() => void del(m.id)} className="p-1 text-muted-foreground hover:text-red-300" title="Apagar"><Trash2 className="w-3.5 h-3.5" /></button>
    </div>
  );

  return (
    <div className="p-6 max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Brain className="w-6 h-6 text-primary" /> Memória da empresa</h1>
        <p className="text-sm text-muted-foreground mt-1">Tudo aqui entra no contexto dos agentes antes de cada trabalho. A memória de cada cliente fica na página do cliente.</p>
      </div>
      {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}

      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Regras e aprendizados da LOTUS</h3>
        <p className="text-xs text-muted-foreground">Vale para todos os agentes. Recusas de aprovação com motivo entram aqui sozinhas.</p>
        <div className="flex gap-2">
          <input className={input} placeholder='Ex.: "Nunca prometer resultado clínico" ou "Sempre oferecer 2 horários"' value={rule} onChange={(e) => setRule(e.target.value)} />
          <button onClick={() => void add({ scope: "GLOBAL", content: rule }).then((ok) => ok && setRule(""))} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm"><Plus className="w-4 h-4" /> Salvar</button>
        </div>
        <div>{data?.global.length ? data.global.map((m) => <Item key={m.id} m={m} />) : <p className="text-xs text-muted-foreground">Nada ainda.</p>}</div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Orientações por departamento</h3>
        <div className="grid md:grid-cols-[180px_1fr_auto] gap-2">
          <select className={input} value={deptRule.department} onChange={(e) => setDeptRule({ ...deptRule, department: e.target.value })}>
            <option value="">Departamento…</option>
            {data?.departments.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <input className={input} placeholder='Ex.: "Copy sempre com prova social local"' value={deptRule.content} onChange={(e) => setDeptRule({ ...deptRule, content: e.target.value })} />
          <button onClick={() => void add({ scope: "DEPARTMENT", ...deptRule }).then((ok) => ok && setDeptRule({ department: deptRule.department, content: "" }))} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm"><Plus className="w-4 h-4" /> Salvar</button>
        </div>
        <div>{data?.department.length ? data.department.map((m) => <Item key={m.id} m={m} extra={m.department} />) : <p className="text-xs text-muted-foreground">Nada ainda.</p>}</div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 space-y-2">
        <h3 className="text-sm font-semibold text-foreground">Últimas entregas de cada agente</h3>
        <p className="text-xs text-muted-foreground">Gravado sozinho a cada tarefa concluída; o agente relê as próprias entregas para manter a qualidade e não repetir trabalho.</p>
        <div>{data?.agent.length ? data.agent.map((m) => <Item key={m.id} m={m} extra={m.agent?.name} />) : <p className="text-xs text-muted-foreground">Aparece depois da próxima tarefa concluída.</p>}</div>
      </div>
    </div>
  );
}
