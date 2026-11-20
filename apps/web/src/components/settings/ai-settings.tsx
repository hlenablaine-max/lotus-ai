"use client";

import { useCallback, useEffect, useState } from "react";
import { Brain, CheckCircle2, Loader2, Monitor, MonitorOff, ShieldCheck, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProviderState {
  name: string;
  label: string;
  configured: boolean;
  keySource: "app" | "env" | "assinatura" | null;
  keyHint: string | null;
  model: string;
  defaultModel: string;
  baseUrl: string;
}

interface SettingsState {
  ai: { provider: string | null; chosen: string | null; creationProvider: string; providers: ProviderState[] };
  agent: { permissionMode: "ask" | "auto" };
  desktop: boolean;
}

export function AISettings() {
  const [settings, setSettings] = useState<SettingsState | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [models, setModels] = useState<Record<string, string>>({});
  const [modelLists, setModelLists] = useState<Record<string, string[]>>({});

  const load = useCallback(async () => {
    setMessage(null);
    const res = await fetch("/api/settings").catch(() => null);
    if (!res || !res.ok) {
      setMessage({ kind: "error", text: `Não foi possível carregar as configurações${res ? ` (erro ${res.status})` : ""}.` });
      return;
    }
    const data = (await res.json()) as SettingsState;
    setSettings(data);
    setModels(Object.fromEntries(data.ai.providers.map((p) => [p.name, p.model])));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (tag: string, payload: Record<string, unknown>, okText: string) => {
    setSaving(tag);
    setMessage(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao salvar");
      setSettings(data);
      setMessage(data.warning ? { kind: "error", text: data.warning } : { kind: "ok", text: okText });
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setSaving(null);
    }
  };

  const testProvider = async (name: string) => {
    setSaving(`test-${name}`);
    setMessage(null);
    try {
      const res = await fetch(`/api/settings/models?provider=${name}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao consultar o provedor");
      setModelLists((prev) => ({ ...prev, [name]: data.models }));
      setMessage({ kind: "ok", text: `Chave válida: ${data.models.length} modelo(s) disponíveis em ${name}.` });
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setSaving(null);
    }
  };

  if (!settings) {
    if (message?.kind === "error") {
      return (
        <section className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 flex items-center justify-between gap-3 text-sm text-red-300">
          <span>{message.text}</span>
          <button onClick={() => load()} className="text-xs underline flex-shrink-0">Tentar de novo</button>
        </section>
      );
    }
    return (
      <section className="rounded-xl border border-border bg-card p-6 flex items-center gap-3 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Carregando configurações de IA…
      </section>
    );
  }

  const input = "w-full px-3 py-2 text-sm rounded-lg bg-muted/30 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50";

  return (
    <section className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center gap-3">
        <Brain className="w-4 h-4 text-primary" />
        <h2 className="font-semibold text-foreground">Inteligência Artificial</h2>
        <span
          className={cn(
            "ml-auto flex items-center gap-1.5 text-xs font-medium",
            settings.desktop ? "text-emerald-400" : "text-muted-foreground"
          )}
        >
          {settings.desktop ? <Monitor className="w-3.5 h-3.5" /> : <MonitorOff className="w-3.5 h-3.5" />}
          {settings.desktop ? "Aplicativo desktop conectado" : "Aplicativo desktop fechado"}
        </span>
      </div>

      <div className="p-6 space-y-5">
        <p className="text-xs text-muted-foreground leading-relaxed">
          Escolha qual IA comanda o Root Master, o Advisor, os motores e os agentes. As chaves ficam salvas apenas neste
          computador (<code className="font-mono">~/LOTUS_Workspace/settings.json</code>) e nunca são exibidas de volta.
        </p>

        {settings.ai.providers.map((provider) => {
          const active = settings.ai.provider === provider.name;
          const list = modelLists[provider.name];
          return (
            <div key={provider.name} className={cn("rounded-lg border p-4 space-y-3", active ? "border-primary/40 bg-primary/5" : "border-border bg-muted/10")}>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm font-semibold text-foreground">{provider.label}</span>
                {provider.configured ? (
                  <span className="text-[11px] text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    {provider.keySource === "assinatura"
                      ? "usa a sua assinatura do Claude (Claude Code logado neste PC), sem custo extra"
                      : `chave ${provider.keyHint} (${provider.keySource === "env" ? "variável de ambiente" : "salva no app"})`}
                  </span>
                ) : (
                  <span className="text-[11px] text-muted-foreground">{provider.name === "claude-code" ? "Claude Code não instalado ou não logado neste PC" : "sem chave"}</span>
                )}
                <div className="ml-auto flex gap-2">
                  {provider.configured && (
                    <button
                      onClick={() => testProvider(provider.name)}
                      disabled={saving !== null}
                      className="px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 disabled:opacity-50"
                    >
                      {saving === `test-${provider.name}` ? "Testando…" : "Testar e listar modelos"}
                    </button>
                  )}
                  <button
                    onClick={() => save(`use-${provider.name}`, { provider: provider.name }, `${provider.label} agora é a IA ativa.`)}
                    disabled={active || !provider.configured || saving !== null}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs font-medium border disabled:opacity-60",
                      active ? "bg-primary/20 border-primary/40 text-primary" : "bg-muted/40 border-border text-foreground hover:bg-muted"
                    )}
                  >
                    {active ? "Em uso" : "Usar este"}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {provider.name !== "claude-code" && (
                <div>
                  <label className="block text-[11px] text-muted-foreground mb-1">Chave de API</label>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      autoComplete="off"
                      value={keys[provider.name] ?? ""}
                      onChange={(e) => setKeys((prev) => ({ ...prev, [provider.name]: e.target.value }))}
                      placeholder={provider.configured ? "Colar nova chave para substituir" : "Colar a chave aqui"}
                      className={input}
                    />
                    <button
                      onClick={async () => {
                        await save(`key-${provider.name}`, { keys: { [provider.name]: keys[provider.name] } }, "Chave salva.");
                        setKeys((prev) => ({ ...prev, [provider.name]: "" }));
                      }}
                      disabled={!keys[provider.name]?.trim() || saving !== null}
                      className="px-3 rounded-lg bg-primary/15 border border-primary/30 text-primary text-xs font-medium hover:bg-primary/25 disabled:opacity-40"
                    >
                      Salvar
                    </button>
                  </div>
                </div>
                )}
                <div>
                  <label className="block text-[11px] text-muted-foreground mb-1">Modelo (padrão: {provider.defaultModel})</label>
                  <div className="flex gap-2">
                    {list && list.length > 0 ? (
                      <select
                        value={models[provider.name] ?? provider.model}
                        onChange={(e) => setModels((prev) => ({ ...prev, [provider.name]: e.target.value }))}
                        className={input}
                      >
                        {!list.includes(models[provider.name] ?? provider.model) && (
                          <option value={models[provider.name] ?? provider.model}>{models[provider.name] ?? provider.model}</option>
                        )}
                        {list.map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        value={models[provider.name] ?? ""}
                        onChange={(e) => setModels((prev) => ({ ...prev, [provider.name]: e.target.value }))}
                        placeholder={provider.defaultModel}
                        className={cn(input, "font-mono")}
                      />
                    )}
                    <button
                      onClick={() => save(`model-${provider.name}`, { models: { [provider.name]: models[provider.name] ?? "" } }, "Modelo salvo.")}
                      disabled={(models[provider.name] ?? "") === provider.model || saving !== null}
                      className="px-3 rounded-lg bg-primary/15 border border-primary/30 text-primary text-xs font-medium hover:bg-primary/25 disabled:opacity-40"
                    >
                      Salvar
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        <div className="rounded-lg border border-border bg-muted/10 p-4 space-y-3">
          <div className="text-sm font-semibold text-foreground">Quem cria sites e ferramentas</div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            As tarefas de criação (o site de cada cliente e ferramentas) usam esta IA. Texto e análise (diagnóstico, Playbook, copies) continuam com a IA ativa acima.
          </p>
          <div className="flex flex-wrap gap-2">
            {settings.ai.providers.map((p) => {
              const selected = settings.ai.creationProvider === p.name;
              return (
                <button
                  key={p.name}
                  onClick={() => save(`creation-${p.name}`, { creationProvider: p.name }, `${p.label} agora cria os sites e ferramentas.`)}
                  disabled={!p.configured || saving !== null}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-medium border disabled:opacity-40",
                    selected ? "bg-primary/20 border-primary/40 text-primary" : "bg-muted/40 border-border text-foreground hover:bg-muted"
                  )}
                >
                  {p.label}
                  {selected ? " (em uso)" : ""}
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-muted/10 p-4 space-y-3">
          <div className="text-sm font-semibold text-foreground">Permissões do Root Master no computador</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(
              [
                { mode: "ask", icon: ShieldCheck, title: "Confirmar ações", text: "Lê e pesquisa livremente, mas pede sua aprovação antes de rodar comandos, gravar arquivos ou clicar no navegador." },
                { mode: "auto", icon: Zap, title: "Autônomo", text: "Executa direto, sem perguntar. Comandos destrutivos (apagar em massa, reset, deploy) continuam pedindo confirmação." },
              ] as const
            ).map((option) => {
              const selected = settings.agent.permissionMode === option.mode;
              return (
                <button
                  key={option.mode}
                  onClick={() => save(`mode-${option.mode}`, { permissionMode: option.mode }, `Modo "${option.title}" ativado.`)}
                  disabled={saving !== null}
                  className={cn(
                    "text-left rounded-lg border p-3 transition-colors",
                    selected ? "border-primary/40 bg-primary/10" : "border-border hover:bg-muted/40"
                  )}
                >
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <option.icon className={cn("w-4 h-4", selected ? "text-primary" : "text-muted-foreground")} />
                    {option.title}
                    {selected && <span className="ml-auto text-[10px] text-primary">ativo</span>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{option.text}</p>
                </button>
              );
            })}
          </div>
        </div>

        {message && (
          <p className={cn("text-xs rounded-lg px-3 py-2 border", message.kind === "ok" ? "text-emerald-400 bg-emerald-400/10 border-emerald-400/20" : "text-amber-300 bg-amber-400/10 border-amber-400/20")}>
            {message.text}
          </p>
        )}
      </div>
    </section>
  );
}
