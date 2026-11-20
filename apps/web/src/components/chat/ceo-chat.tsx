"use client";

import { RichText } from "@/components/ui/rich-text";
import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Send, Loader2, User, Square, Terminal, CheckCircle2, XCircle, ShieldAlert,
  ChevronRight, Monitor, MonitorOff, Trash2, ShieldCheck, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Tipos ─────────────────────────────────────────────────────────────────

type ToolStatus = "running" | "done" | "error" | "denied";

interface ToolSegment {
  type: "tool";
  id: string;
  name: string;
  title: string;
  detail?: string;
  status: ToolStatus;
  preview?: string;
  approval?: { id: string; risk: string; status: string };
}

interface TextSegment {
  type: "text";
  text: string;
}

type Segment = TextSegment | ToolSegment;

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  segments: Segment[];
  timestamp: Date;
  isStreaming?: boolean;
}

interface ProviderInfo {
  name: string;
  label: string;
  configured: boolean;
  model: string;
}

interface AIStatus {
  provider: string | null;
  model: string | null;
  available: ProviderInfo[];
  permissionMode: "ask" | "auto";
  desktop: boolean;
}

const textMessage = (role: Message["role"], text: string, id: string = crypto.randomUUID()): Message => ({
  id,
  role,
  segments: [{ type: "text", text }],
  timestamp: new Date(),
});

const HELP_TEXT = `**Comandos do chat**
- \`/help\` — mostra esta ajuda
- \`/status\` — provedor de IA, modelo, modo de permissão e conexão com o computador
- \`/provider drael|openai|anthropic\` — troca o provedor de IA
- \`/model <id>\` — troca o modelo do provedor atual
- \`/mode ask|auto\` — \`ask\` pede confirmação antes de alterar algo no PC; \`auto\` executa direto
- \`/clear\` — começa uma conversa nova

Fora isso, é só pedir: pesquisar empresas, criar missões, rodar comandos, editar arquivos, abrir o navegador ou alterar o próprio aplicativo.`;

// ─── Ícone do Root Master ──────────────────────────────────────────────────

function NeuralIcon({ size = 20, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <circle cx="12" cy="12" r="10.5" stroke="currentColor" strokeWidth="0.75" strokeDasharray="1.8 1.5" opacity="0.35" />
      <path d="M12 3.5L19.79 8V16L12 20.5L4.21 16V8L12 3.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" opacity="0.65" />
      <path d="M12 7.5L15.5 12L12 16.5L8.5 12Z" stroke="currentColor" strokeWidth="0.75" opacity="0.4" />
      <circle cx="12" cy="12" r="2.8" fill="currentColor" />
      <circle cx="12" cy="5.5" r="1.3" fill="currentColor" opacity="0.85" />
      <circle cx="18" cy="8.75" r="1.3" fill="currentColor" opacity="0.85" />
      <circle cx="18" cy="15.25" r="1.3" fill="currentColor" opacity="0.85" />
      <circle cx="12" cy="18.5" r="1.3" fill="currentColor" opacity="0.85" />
      <circle cx="6" cy="15.25" r="1.3" fill="currentColor" opacity="0.85" />
      <circle cx="6" cy="8.75" r="1.3" fill="currentColor" opacity="0.85" />
    </svg>
  );
}

// ─── Markdown simples (negrito, itálico, código, títulos, listas, blocos) ──

function renderInline(text: string, keyBase: string): React.ReactNode[] {
  const tokens = text.split(/(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`)/);
  return tokens.map((token, i) => {
    const key = `${keyBase}-${i}`;
    if (token.startsWith("**") && token.endsWith("**") && token.length > 4) {
      return <strong key={key} className="font-semibold text-foreground">{token.slice(2, -2)}</strong>;
    }
    if (token.startsWith("*") && token.endsWith("*") && !token.startsWith("**") && token.length > 2) {
      return <em key={key}>{token.slice(1, -1)}</em>;
    }
    if (token.startsWith("`") && token.endsWith("`") && token.length > 2) {
      return (
        <code key={key} className="bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded text-xs font-mono">
          {token.slice(1, -1)}
        </code>
      );
    }
    return token;
  });
}

export function MarkdownContent({ content, isStreaming }: { content: string; isStreaming?: boolean }) {
  const lines = content.replace(/^\n+/, "").split("\n");
  const elements: React.ReactNode[] = [];
  let listBuffer: string[] = [];
  let listType: "ul" | "ol" | null = null;
  let codeBuffer: string[] | null = null;

  const flushList = (keyIdx: number) => {
    if (!listBuffer.length) return;
    const items = listBuffer.map((item, i) => (
      <li key={i} className="text-sm leading-relaxed">{renderInline(item, `li-${keyIdx}-${i}`)}</li>
    ));
    elements.push(
      listType === "ol"
        ? <ol key={`list-${keyIdx}`} className="list-decimal list-inside space-y-0.5 my-1">{items}</ol>
        : <ul key={`list-${keyIdx}`} className="list-disc list-inside space-y-0.5 my-1">{items}</ul>
    );
    listBuffer = [];
    listType = null;
  };

  const flushCode = (keyIdx: number) => {
    if (codeBuffer === null) return;
    elements.push(
      <pre key={`code-${keyIdx}`} className="my-1.5 p-3 rounded-lg bg-black/50 border border-border/60 text-xs font-mono overflow-x-auto whitespace-pre text-foreground/90">
        {codeBuffer.join("\n")}
      </pre>
    );
    codeBuffer = null;
  };

  let tableBuffer: string[][] = [];
  const flushTable = (keyIdx: number) => {
    if (!tableBuffer.length) return;
    const [head, ...rows] = tableBuffer;
    elements.push(
      <div key={`table-${keyIdx}`} className="my-1.5 overflow-x-auto">
        <table className="text-xs border-collapse">
          <thead>
            <tr>
              {head.map((cell, i) => (
                <th key={i} className="border border-border/60 bg-muted/40 px-2 py-1 text-left font-semibold text-foreground">
                  {renderInline(cell, `th-${keyIdx}-${i}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r}>
                {row.map((cell, i) => (
                  <td key={i} className="border border-border/60 px-2 py-1 align-top">
                    {renderInline(cell, `td-${keyIdx}-${r}-${i}`)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
    tableBuffer = [];
  };

  lines.forEach((line, idx) => {
    const tableRow = codeBuffer === null && /^\s*\|.*\|\s*$/.test(line);
    if (tableRow) {
      flushList(idx);
      const cells = line.trim().slice(1, -1).split("|").map((c) => c.trim());
      // linha separadora (|---|---|) não vira linha da tabela
      if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) tableBuffer.push(cells);
      return;
    }
    flushTable(idx);

    if (line.trimStart().startsWith("```")) {
      if (codeBuffer === null) {
        flushList(idx);
        codeBuffer = [];
      } else {
        flushCode(idx);
      }
      return;
    }
    if (codeBuffer !== null) {
      codeBuffer.push(line);
      return;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)/);
    const ulMatch = line.match(/^\s*[-*]\s+(.+)/);
    const olMatch = line.match(/^\s*\d+\.\s+(.+)/);

    if (heading) {
      flushList(idx);
      const size = heading[1].length === 1 ? "text-base font-bold" : heading[1].length === 2 ? "text-sm font-bold" : "text-sm font-semibold";
      elements.push(<p key={idx} className={cn(size, "mt-2 mb-1 text-foreground")}>{renderInline(heading[2], `h-${idx}`)}</p>);
    } else if (ulMatch) {
      if (listType === "ol") flushList(idx);
      listType = "ul";
      listBuffer.push(ulMatch[1]);
    } else if (olMatch) {
      if (listType === "ul") flushList(idx);
      listType = "ol";
      listBuffer.push(olMatch[1]);
    } else if (/^---+$/.test(line)) {
      flushList(idx);
      elements.push(<hr key={idx} className="border-border my-2" />);
    } else if (line.trim() === "") {
      flushList(idx);
      elements.push(<div key={idx} className="h-1" />);
    } else {
      flushList(idx);
      elements.push(<p key={idx} className="text-sm leading-relaxed">{renderInline(line, `p-${idx}`)}</p>);
    }
  });
  flushList(lines.length);
  flushTable(lines.length);
  flushCode(lines.length + 1);

  return (
    <div className="space-y-0.5">
      {elements}
      {isStreaming && <span className="inline-block w-1 h-4 bg-primary ml-0.5 animate-pulse align-text-bottom" />}
    </div>
  );
}

// ─── Linha de ferramenta (estilo CLI) ──────────────────────────────────────

function ToolLine({
  tool,
  onDecide,
}: {
  tool: ToolSegment;
  onDecide: (approvalId: string, action: "APPROVED" | "REJECTED", always?: boolean) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [deciding, setDeciding] = useState(false);
  const waiting = tool.approval?.status === "PENDING";

  const icon =
    tool.status === "running" ? (
      waiting ? <ShieldAlert className="w-3.5 h-3.5 text-amber-400" /> : <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
    ) : tool.status === "done" ? (
      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
    ) : (
      <XCircle className={cn("w-3.5 h-3.5", tool.status === "denied" ? "text-amber-400" : "text-red-400")} />
    );

  const decide = async (action: "APPROVED" | "REJECTED", always = false) => {
    if (!tool.approval) return;
    setDeciding(true);
    try {
      await onDecide(tool.approval.id, action, always);
    } finally {
      setDeciding(false);
    }
  };

  return (
    <div className={cn("rounded-lg border font-mono text-xs", waiting ? "border-amber-400/40 bg-amber-400/5" : "border-border/60 bg-black/30")}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left hover:bg-white/5 rounded-lg transition-colors"
      >
        {icon}
        <span className="text-foreground/90 flex-shrink-0">{tool.title}</span>
        {tool.detail && <span className="text-muted-foreground truncate flex-1">{tool.detail.split("\n")[0]}</span>}
        <ChevronRight className={cn("w-3 h-3 text-muted-foreground ml-auto flex-shrink-0 transition-transform", open && "rotate-90")} />
      </button>

      {waiting && (
        <div className="px-2.5 pb-2.5 space-y-2">
          {tool.detail && (
            <pre className="p-2 rounded bg-black/50 border border-border/50 text-[11px] whitespace-pre-wrap break-all max-h-56 overflow-auto text-foreground/90">
              {tool.detail}
            </pre>
          )}
          <p className="text-[11px] text-amber-300 font-sans">
            {tool.approval?.risk === "destructive"
              ? "Ação potencialmente destrutiva — precisa da sua confirmação."
              : "O Root Master quer executar esta ação no seu computador."}
          </p>
          <div className="flex gap-2 font-sans">
            <button
              disabled={deciding}
              onClick={() => decide("APPROVED")}
              className="px-3 py-1.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-medium hover:bg-emerald-500/25 disabled:opacity-50"
            >
              Aprovar
            </button>
            {tool.approval?.risk !== "destructive" && (
              <button
                disabled={deciding}
                onClick={() => decide("APPROVED", true)}
                className="px-3 py-1.5 rounded-md bg-primary/15 border border-primary/30 text-primary text-xs font-medium hover:bg-primary/25 disabled:opacity-50"
              >
                Aprovar e não perguntar mais
              </button>
            )}
            <button
              disabled={deciding}
              onClick={() => decide("REJECTED")}
              className="px-3 py-1.5 rounded-md bg-red-500/15 border border-red-500/30 text-red-400 text-xs font-medium hover:bg-red-500/25 disabled:opacity-50"
            >
              Negar
            </button>
          </div>
        </div>
      )}

      {open && !waiting && (
        <div className="px-2.5 pb-2.5 space-y-1.5">
          {tool.detail && (
            <pre className="p-2 rounded bg-black/50 border border-border/50 text-[11px] whitespace-pre-wrap break-all max-h-40 overflow-auto text-muted-foreground">
              {tool.detail}
            </pre>
          )}
          {tool.preview && (
            <pre className="p-2 rounded bg-black/50 border border-border/50 text-[11px] whitespace-pre-wrap break-all max-h-72 overflow-auto text-foreground/80">
              {tool.preview}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-1">
      {[0, 1, 2].map((i) => (
        <span key={i} className="w-1.5 h-1.5 rounded-full bg-primary/60" style={{ animation: `pulse 1.4s ease-in-out ${i * 0.2}s infinite` }} />
      ))}
    </div>
  );
}

// ─── Chat ──────────────────────────────────────────────────────────────────

export function CeoChat({
  mini = false,
  initialClientId,
  initialClientName,
  initialPrompt,
}: {
  mini?: boolean;
  initialClientId?: string;
  initialClientName?: string;
  /** Texto já escrito na caixa (ex.: "Propor solução X para o cliente"); o dono revisa e envia */
  initialPrompt?: string;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState(initialPrompt ?? "");
  const [isLoading, setIsLoading] = useState(false);
  const [ai, setAi] = useState<AIStatus | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [clientContext, setClientContext] = useState<{ id: string; name?: string } | null>(
    initialClientId ? { id: initialClientId, name: initialClientName } : null
  );
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const welcome = useCallback(
    (status: AIStatus | null): Message =>
      textMessage(
        "assistant",
        `Sou o **Root Master** — CEO executor da LOTUS.\n\nPosso pesquisar empresas, abrir missões e delegar para a equipe de agentes${
          status?.desktop
            ? ", e também **agir no seu computador**: rodar comandos, editar arquivos, controlar o navegador e alterar o próprio aplicativo."
            : ". Para eu agir no seu computador, abra o aplicativo desktop (hoje estou sem acesso ao PC)."
        }\n\nDigite \`/help\` para ver os comandos.`,
        "welcome"
      ),
    []
  );

  const refreshStatus = useCallback(async (): Promise<AIStatus | null> => {
    try {
      const res = await fetch("/api/chat?limit=1");
      if (!res.ok) return null;
      const data = (await res.json()) as { ai: AIStatus };
      setAi(data.ai);
      return data.ai;
    } catch {
      return null;
    }
  }, []);

  // Carrega a conversa atual e o estado da IA
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/chat?limit=60");
        if (!res.ok) throw new Error();
        const data = (await res.json()) as {
          ai: AIStatus;
          messages: Array<{ id: string; role: string; content: string; createdAt: string; metadata?: { tools?: Array<{ name: string; title: string; status: string }> } }>;
        };
        setAi(data.ai);
        const loaded: Message[] = data.messages.map((m) => ({
          id: m.id,
          role: m.role === "USER" ? "user" : "assistant",
          timestamp: new Date(m.createdAt),
          segments: [
            ...(m.metadata?.tools ?? []).map((t, i): ToolSegment => ({
              type: "tool",
              id: `${m.id}-t${i}`,
              name: t.name,
              title: t.title,
              status: (t.status as ToolStatus) ?? "done",
            })),
            { type: "text", text: m.content },
          ],
        }));
        // Preserva o que o dono já enviou enquanto o histórico carregava
        setMessages((prev) => [welcome(data.ai), ...loaded, ...prev.filter((m) => m.id !== "welcome")]);
      } catch {
        setMessages((prev) => (prev.length ? prev : [welcome(null)]));
      } finally {
        setHistoryLoaded(true);
      }
    })();
  }, [welcome]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const pushSystem = (text: string) => setMessages((prev) => [...prev, textMessage("system", text)]);

  const updateSettings = async (payload: Record<string, unknown>): Promise<string | null> => {
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    await refreshStatus();
    if (!res.ok) return data.error ?? "Não foi possível salvar.";
    return data.warning ?? null;
  };

  // Comandos de barra, no estilo CLI. Retorna true se tratou a entrada.
  const runSlashCommand = async (raw: string): Promise<boolean> => {
    if (!raw.startsWith("/")) return false;
    const [command, ...rest] = raw.slice(1).trim().split(/\s+/);
    const arg = rest.join(" ").trim();
    setMessages((prev) => [...prev, textMessage("user", raw)]);

    switch (command.toLowerCase()) {
      case "help":
        pushSystem(HELP_TEXT);
        return true;
      case "status": {
        const status = (await refreshStatus()) ?? ai;
        pushSystem(
          status
            ? `**Provedor:** ${status.provider ?? "nenhum configurado"} · **Modelo:** ${status.model ?? "—"}\n**Permissões:** ${
                status.permissionMode === "auto" ? "autônomo (executa sem perguntar)" : "pede confirmação antes de alterar o PC"
              }\n**Computador:** ${status.desktop ? "conectado pelo aplicativo desktop" : "sem acesso (aplicativo desktop fechado)"}\n**Provedores com chave:** ${
                status.available.filter((p) => p.configured).map((p) => p.label).join(", ") || "nenhum"
              }`
            : "Não foi possível consultar o status."
        );
        return true;
      }
      case "clear":
        await fetch("/api/chat", { method: "DELETE" });
        setMessages([welcome(ai)]);
        return true;
      case "provider": {
        const name = arg.toLowerCase();
        if (!["drael", "openai", "anthropic"].includes(name)) {
          pushSystem("Use `/provider drael`, `/provider openai` ou `/provider anthropic`.");
          return true;
        }
        const warning = await updateSettings({ provider: name });
        pushSystem(warning ? `⚠️ ${warning} Configure a chave em Configurações.` : `Provedor de IA alterado para **${name}**.`);
        return true;
      }
      case "model": {
        if (!arg || !ai?.provider) {
          pushSystem("Use `/model <id-do-modelo>` (vale para o provedor atual).");
          return true;
        }
        const warning = await updateSettings({ models: { [ai.provider]: arg } });
        pushSystem(warning ? `⚠️ ${warning}` : `Modelo de **${ai.provider}** alterado para \`${arg}\`.`);
        return true;
      }
      case "mode": {
        if (arg !== "ask" && arg !== "auto") {
          pushSystem("Use `/mode ask` (pede confirmação) ou `/mode auto` (executa direto).");
          return true;
        }
        await updateSettings({ permissionMode: arg });
        pushSystem(arg === "auto" ? "Modo **autônomo**: ações no PC rodam sem perguntar (comandos destrutivos continuam pedindo confirmação)." : "Modo **confirmação**: vou pedir sua aprovação antes de alterar algo no PC.");
        return true;
      }
      default:
        pushSystem(`Comando desconhecido: \`/${command}\`. Digite \`/help\`.`);
        return true;
    }
  };

  const decideApproval = async (approvalId: string, action: "APPROVED" | "REJECTED", always = false) => {
    if (always) await updateSettings({ permissionMode: "auto" });
    await fetch(`/api/approvals/${approvalId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput("");

    if (await runSlashCommand(text)) return;

    const assistantId = crypto.randomUUID();
    setMessages((prev) => [
      ...prev,
      textMessage("user", text),
      { id: assistantId, role: "assistant", segments: [], timestamp: new Date(), isStreaming: true },
    ]);
    setIsLoading(true);

    const patch = (fn: (segments: Segment[]) => Segment[]) =>
      setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, segments: fn(m.segments) } : m)));

    const appendText = (delta: string) =>
      patch((segments) => {
        const last = segments[segments.length - 1];
        if (last?.type === "text") return [...segments.slice(0, -1), { ...last, text: last.text + delta }];
        return [...segments, { type: "text", text: delta }];
      });

    const handleEvent = (event: Record<string, unknown>) => {
      if (typeof event.delta === "string") appendText(event.delta);
      if (event.error) appendText(`\n\n⚠️ ${String(event.error)}`);
      if (event.meta) {
        const meta = event.meta as { provider: string; model: string };
        setAi((prev) => (prev ? { ...prev, provider: meta.provider, model: meta.model } : prev));
      }
      if (event.tool) {
        const tool = event.tool as Partial<ToolSegment> & { id: string };
        patch((segments) => {
          const exists = segments.some((s) => s.type === "tool" && s.id === tool.id);
          if (!exists) {
            return [...segments, { type: "tool", id: tool.id, name: tool.name ?? "", title: tool.title ?? tool.name ?? "", detail: tool.detail, status: "running" }];
          }
          return segments.map((s) => (s.type === "tool" && s.id === tool.id ? { ...s, status: tool.status ?? s.status, preview: tool.preview ?? s.preview } : s));
        });
      }
      if (event.approval) {
        const approval = event.approval as { id: string; toolId: string; risk: string };
        patch((segments) =>
          segments.map((s) => (s.type === "tool" && s.id === approval.toolId ? { ...s, approval: { id: approval.id, risk: approval.risk, status: "PENDING" } } : s))
        );
      }
      if (event.approvalResolved) {
        const resolved = event.approvalResolved as { id: string; status: string };
        patch((segments) =>
          segments.map((s) => (s.type === "tool" && s.approval?.id === resolved.id ? { ...s, approval: { ...s.approval, status: resolved.status } } : s))
        );
      }
    };

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, clientId: clientContext?.id }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (!data || data === "[DONE]") continue;
          try {
            handleEvent(JSON.parse(data));
          } catch {
            // linha parcial ou inválida
          }
        }
      }
    } catch (err) {
      if (controller.signal.aborted) {
        appendText("\n\n_(interrompido)_");
      } else {
        appendText(`⚠️ Não consegui falar com o Root Master: ${err instanceof Error ? err.message : String(err)}`);
      }
    } finally {
      abortRef.current = null;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                isStreaming: false,
                segments: m.segments.map((s) => (s.type === "tool" && s.status === "running" ? { ...s, status: "error" as const } : s)),
              }
            : m
        )
      );
      setIsLoading(false);
    }
  };

  const stop = () => abortRef.current?.abort();

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const configured = ai?.available.filter((p) => p.configured) ?? [];

  return (
    <div className="flex flex-col h-full">
      {/* Cabeçalho */}
      <div className={cn("border-b border-border flex items-center gap-3 flex-wrap", mini ? "px-4 py-3" : "px-6 py-3")}>
        <div className={cn("rounded-xl flex items-center justify-center bg-gradient-to-br from-primary/30 to-primary/10 border border-primary/50 shrink-0", mini ? "w-9 h-9" : "w-10 h-10")}>
          <NeuralIcon size={mini ? 18 : 20} className="text-primary" />
        </div>
        <div className="min-w-0">
          <h2 className={cn("font-semibold tracking-tight text-foreground", mini ? "text-sm" : "text-base")}>Root Master</h2>
          <p className="text-[11px] text-muted-foreground leading-tight">
            {ai?.provider ? `${ai.provider} · ${ai.model}` : ai ? "nenhum provedor de IA configurado" : "carregando…"}
          </p>
        </div>

        <div className="ml-auto flex items-center gap-2 flex-wrap justify-end">
          {!mini && configured.length > 0 && (
            <select
              value={ai?.provider ?? ""}
              onChange={async (e) => {
                const warning = await updateSettings({ provider: e.target.value });
                if (warning) pushSystem(`⚠️ ${warning}`);
              }}
              title="Provedor de IA"
              className="bg-muted/40 border border-border rounded-lg px-2 py-1 text-xs text-foreground focus:outline-none focus:border-primary/50"
            >
              {configured.map((p) => (
                <option key={p.name} value={p.name}>{p.label}</option>
              ))}
            </select>
          )}

          {!mini && ai && (
            <button
              onClick={() => updateSettings({ permissionMode: ai.permissionMode === "auto" ? "ask" : "auto" })}
              title={ai.permissionMode === "auto" ? "Modo autônomo: executa sem perguntar. Clique para voltar a pedir confirmação." : "Pede confirmação antes de alterar o PC. Clique para o modo autônomo."}
              className={cn(
                "flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[11px] font-medium transition-colors",
                ai.permissionMode === "auto" ? "bg-amber-400/10 border-amber-400/30 text-amber-400" : "bg-muted/40 border-border text-muted-foreground hover:text-foreground"
              )}
            >
              {ai.permissionMode === "auto" ? <Zap className="w-3 h-3" /> : <ShieldCheck className="w-3 h-3" />}
              {ai.permissionMode === "auto" ? "Autônomo" : "Confirmar ações"}
            </button>
          )}

          {ai && (
            <span
              title={ai.desktop ? "Aplicativo desktop aberto: o Root Master pode agir neste computador." : "Aplicativo desktop fechado: sem acesso ao computador."}
              className={cn(
                "flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[11px] font-medium",
                ai.desktop ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-muted/40 border-border text-muted-foreground"
              )}
            >
              {ai.desktop ? <Monitor className="w-3 h-3" /> : <MonitorOff className="w-3 h-3" />}
              {!mini && (ai.desktop ? "PC conectado" : "Sem acesso ao PC")}
            </span>
          )}

          {!mini && (
            <button
              onClick={() => runSlashCommand("/clear")}
              title="Nova conversa"
              className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {clientContext && (
        <div className="px-6 py-1.5 border-b border-border bg-primary/5 flex items-center gap-2 text-xs text-muted-foreground">
          Contexto: <span className="text-foreground font-medium">{clientContext.name ?? clientContext.id}</span>
          <button onClick={() => setClientContext(null)} className="ml-auto hover:text-foreground">remover</button>
        </div>
      )}

      {ai && !ai.provider && (
        <div className="px-6 py-2 border-b border-amber-400/20 bg-amber-400/5 text-xs text-amber-300">
          Nenhum provedor de IA com chave configurada. <Link href="/settings" className="underline">Abrir Configurações</Link>
        </div>
      )}

      {/* Mensagens */}
      <div className={cn("flex-1 overflow-y-auto flex flex-col", mini ? "p-3" : "p-5")}>
        <div className="flex-1" />
        <div className="space-y-3">
          {messages.map((message) => {
            if (message.role === "system") {
              return (
                <div key={message.id} className="mx-auto max-w-[85%] rounded-xl border border-border/60 bg-muted/20 px-4 py-2.5">
                  <RichText content={message.segments.map((s) => (s.type === "text" ? s.text : "")).join("")} />
                </div>
              );
            }
            const isUser = message.role === "user";
            const empty = message.segments.length === 0;
            return (
              <div key={message.id} className={cn("flex gap-3", isUser ? "flex-row-reverse" : "flex-row")}>
                <div className={cn("w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center border", isUser ? "bg-secondary border-border" : "bg-primary/20 border-primary/40")}>
                  {isUser ? <User className="w-4 h-4 text-muted-foreground" /> : <NeuralIcon size={16} className="text-primary" />}
                </div>
                <div className={cn("rounded-2xl px-4 py-3 min-w-0", isUser ? "max-w-[78%] bg-gradient-to-br from-primary/20 to-primary/10 border border-primary/30" : "max-w-[86%] bg-card/80 border border-border/60")}>
                  {empty && message.isStreaming ? (
                    <TypingDots />
                  ) : (
                    <div className="space-y-2">
                      {message.segments.map((segment, i) =>
                        segment.type === "tool" ? (
                          <ToolLine key={segment.id} tool={segment} onDecide={decideApproval} />
                        ) : segment.text.trim() ? (
                          <MarkdownContent
                            key={i}
                            content={segment.text}
                            isStreaming={message.isStreaming && i === message.segments.length - 1}
                          />
                        ) : null
                      )}
                      {message.isStreaming && message.segments[message.segments.length - 1]?.type === "tool" &&
                        (message.segments[message.segments.length - 1] as ToolSegment).status !== "running" && <TypingDots />}
                    </div>
                  )}
                  <div className="mt-1.5 text-[10px] text-muted-foreground/40 font-mono">
                    {message.timestamp.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Entrada */}
      <div className={cn("border-t border-border", mini ? "p-3" : "p-4")}>
        <div className="flex gap-2 items-end">
          <div className="flex-1 relative">
            {!mini && <Terminal className="absolute left-3.5 top-3.5 w-4 h-4 text-muted-foreground/50 pointer-events-none" />}
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={!historyLoaded}
              placeholder={!historyLoaded ? "Carregando conversa…" : mini ? "Enviar mensagem..." : "Peça algo ao Root Master ou digite /help"}
              rows={1}
              className={cn(
                "w-full bg-muted/40 border border-border/70 rounded-xl py-2.5 pr-4 text-sm text-foreground placeholder:text-muted-foreground/50",
                "resize-none focus:outline-none focus:ring-1 focus:ring-primary/60 focus:border-primary/60 leading-relaxed max-h-32 overflow-y-auto",
                mini ? "px-3 text-xs" : "pl-10"
              )}
              style={{ minHeight: mini ? "40px" : "46px" }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = "auto";
                target.style.height = Math.min(target.scrollHeight, 128) + "px";
              }}
            />
          </div>
          {isLoading ? (
            <button
              onClick={stop}
              title="Interromper"
              className={cn("rounded-xl flex items-center justify-center shrink-0 bg-red-500/15 border border-red-500/30 text-red-400 hover:bg-red-500/25", mini ? "w-9 h-9" : "w-10 h-10")}
            >
              <Square className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              onClick={sendMessage}
              disabled={!input.trim()}
              className={cn(
                "rounded-xl flex items-center justify-center transition-all shrink-0",
                mini ? "w-9 h-9" : "w-10 h-10",
                input.trim() ? "bg-primary hover:bg-primary/90 text-primary-foreground" : "bg-muted/50 text-muted-foreground/40 cursor-not-allowed"
              )}
            >
              <Send className={cn(mini ? "w-3.5 h-3.5" : "w-4 h-4")} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
