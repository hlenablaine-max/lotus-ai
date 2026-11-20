"use client";

// Integrações: contas do navegador de pesquisa (WhatsApp com QR code, Google, Instagram) e as
// chaves/IDs de cada serviço, coladas aqui mesmo. Tudo fica salvo só neste computador.

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Database, Eye, EyeOff, Loader2, Plug, Save, ShieldCheck, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConnectedAccounts } from "@/components/settings/connected-accounts";

interface Field {
  key: string;
  label: string;
  secret: boolean;
  placeholder: string;
}

interface Integration {
  id: string;
  name: string;
  category: string;
  description: string;
  usedBy: string;
  whereToGet: string;
  fields: Field[];
  values: Record<string, string>;
  sources: Record<string, "app" | "env" | null>;
  configured: boolean;
}

const CATEGORY_LABELS: Record<string, string> = {
  ai: "Inteligência artificial",
  communication: "Comunicação",
  ads: "Anúncios",
  analytics: "Análise de dados",
  infrastructure: "Publicação e infraestrutura",
};

function IntegrationCard({ item, onSaved }: { item: Integration; onSaved: (list: Integration[]) => void }) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [show, setShow] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<"save" | "test" | null>(null);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const dirty = Object.values(draft).some((v) => v.trim());

  const call = async (action: "save" | "test") => {
    setBusy(action);
    setResult(null);
    try {
      const res = await fetch("/api/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, id: item.id, values: draft }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Não foi possível salvar.");
      if (action === "save") {
        setDraft({});
        onSaved(data.integrations);
        setResult({ ok: true, message: "Salvo neste computador." });
      } else setResult(data);
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-foreground">{item.name}</h3>
          {item.configured ? (
            <span className="flex items-center gap-1 text-xs text-emerald-400"><CheckCircle2 className="w-3.5 h-3.5" /> configurado</span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-muted-foreground"><XCircle className="w-3.5 h-3.5" /> não configurado</span>
          )}
        </div>
        <p className="text-sm text-muted-foreground mt-1">{item.description}</p>
        <p className="text-xs text-muted-foreground/70 mt-1">Usado por: {item.usedBy}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {item.fields.map((f) => (
          <label key={f.key} className="block">
            <span className="text-xs font-medium text-muted-foreground">
              {f.label}
              {item.sources[f.key] === "env" && <span className="ml-1 text-[10px] text-muted-foreground/60">(vem do arquivo .env)</span>}
            </span>
            <div className="mt-1 relative">
              <input
                type={f.secret && !show[f.key] ? "password" : "text"}
                value={draft[f.key] ?? ""}
                onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                placeholder={item.values[f.key] || f.placeholder}
                autoComplete="off"
                spellCheck={false}
                className="w-full rounded-lg border border-border bg-muted/30 px-3 py-2 pr-9 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary"
              />
              {f.secret && (
                <button type="button" onClick={() => setShow({ ...show, [f.key]: !show[f.key] })} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {show[f.key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              )}
            </div>
          </label>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => call("save")}
          disabled={!dirty || busy !== null}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-40"
        >
          {busy === "save" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Salvar
        </button>
        <button
          onClick={() => call("test")}
          disabled={busy !== null}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-40"
        >
          {busy === "test" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />} Testar
        </button>
        <span className="text-[11px] text-muted-foreground/70">Onde pegar: {item.whereToGet}</span>
      </div>
      {result && <p className={cn("text-sm", result.ok ? "text-emerald-400" : "text-red-400")}>{result.message}</p>}
    </div>
  );
}

export default function IntegrationsPage() {
  const [items, setItems] = useState<Integration[] | null>(null);
  const [database, setDatabase] = useState<{ ok: boolean; error: string | null } | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/integrations");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao carregar");
      setItems(data.integrations);
      setDatabase(data.database);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const categories = [...new Set((items ?? []).map((i) => i.category))];

  return (
    <div className="p-8 space-y-8 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold text-foreground flex items-center gap-3"><Plug className="w-7 h-7 text-primary" /> Integrações</h1>
        <p className="text-muted-foreground mt-1">
          Conecte as contas e cole as chaves que a LOTUS usa. Tudo fica salvo só neste computador (o do sócio tem as dele).
        </p>
      </div>

      <ConnectedAccounts />

      {database && (
        <div className={cn("rounded-xl border p-4 flex items-center gap-3", database.ok ? "border-emerald-400/30 bg-emerald-400/5" : "border-red-400/30 bg-red-400/5")}>
          <Database className={cn("w-5 h-5", database.ok ? "text-emerald-400" : "text-red-400")} />
          <div className="text-sm">
            <span className="font-medium text-foreground">Banco de dados compartilhado</span>{" "}
            <span className="text-muted-foreground">
              {database.ok ? "conectado (você e o sócio veem os mesmos clientes e missões)" : `sem conexão agora: ${database.error ?? "verifique a internet"}`}
            </span>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
      {!items && !error && <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />}

      {categories.map((category) => (
        <section key={category} className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{CATEGORY_LABELS[category] ?? category}</h2>
          {(items ?? [])
            .filter((i) => i.category === category)
            .map((item) => (
              <IntegrationCard key={item.id} item={item} onSaved={setItems} />
            ))}
        </section>
      ))}
    </div>
  );
}
