"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Loader2, User } from "lucide-react";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
}

const WELCOME_MESSAGE: Message = {
  id: "welcome",
  role: "assistant",
  content: `Bom dia. Sou o **Root Master** — CEO de IA da LOTUS AI Enterprise.

Estou pronto para coordenar operações, iniciar missões, gerenciar nossa equipe de agentes e executar trabalho para nossos clientes.

Como posso ajudar você hoje? Pode me enviar o link de uma empresa para investigar, solicitar desenvolvimento de uma estratégia, ou iniciar qualquer missão que precisar.`,
  timestamp: new Date(),
};

// Root Master icon — AI neural core with orbital ring and connected nodes
function NeuralIcon({ size = 20, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Outer dashed orbital ring */}
      <circle cx="12" cy="12" r="10.5" stroke="currentColor" strokeWidth="0.75" strokeDasharray="1.8 1.5" opacity="0.35" />
      {/* Hexagon frame */}
      <path
        d="M12 3.5L19.79 8V16L12 20.5L4.21 16V8L12 3.5Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
        opacity="0.65"
      />
      {/* Inner diamond */}
      <path d="M12 7.5L15.5 12L12 16.5L8.5 12Z" stroke="currentColor" strokeWidth="0.75" opacity="0.4" />
      {/* Center bright core */}
      <circle cx="12" cy="12" r="2.8" fill="currentColor" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" opacity="0.5" />
      {/* Six orbital nodes at hex vertices */}
      <circle cx="12" cy="5.5" r="1.3" fill="currentColor" opacity="0.85" />
      <circle cx="18" cy="8.75" r="1.3" fill="currentColor" opacity="0.85" />
      <circle cx="18" cy="15.25" r="1.3" fill="currentColor" opacity="0.85" />
      <circle cx="12" cy="18.5" r="1.3" fill="currentColor" opacity="0.85" />
      <circle cx="6" cy="15.25" r="1.3" fill="currentColor" opacity="0.85" />
      <circle cx="6" cy="8.75" r="1.3" fill="currentColor" opacity="0.85" />
      {/* Spokes from center */}
      <line x1="12" y1="9.2" x2="12" y2="6.7" stroke="currentColor" strokeWidth="0.9" opacity="0.55" />
      <line x1="14.4" y1="10.6" x2="16.8" y2="9.2" stroke="currentColor" strokeWidth="0.9" opacity="0.55" />
      <line x1="14.4" y1="13.4" x2="16.8" y2="14.8" stroke="currentColor" strokeWidth="0.9" opacity="0.55" />
      <line x1="12" y1="14.8" x2="12" y2="17.3" stroke="currentColor" strokeWidth="0.9" opacity="0.55" />
      <line x1="9.6" y1="13.4" x2="7.2" y2="14.8" stroke="currentColor" strokeWidth="0.9" opacity="0.55" />
      <line x1="9.6" y1="10.6" x2="7.2" y2="9.2" stroke="currentColor" strokeWidth="0.9" opacity="0.55" />
    </svg>
  );
}

// Inline markdown renderer — handles **bold**, *italic*, `code`, ## headings, - bullets
function renderInline(text: string, keyBase: string): React.ReactNode[] {
  const tokens = text.split(/(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`)/);
  return tokens.map((token, i) => {
    const key = `${keyBase}-${i}`;
    if (token.startsWith("**") && token.endsWith("**") && token.length > 4) {
      return (
        <strong key={key} className="font-semibold text-foreground">
          {token.slice(2, -2)}
        </strong>
      );
    }
    if (token.startsWith("*") && token.endsWith("*") && !token.startsWith("**") && token.length > 2) {
      return <em key={key}>{token.slice(1, -1)}</em>;
    }
    if (token.startsWith("`") && token.endsWith("`") && token.length > 2) {
      return (
        <code
          key={key}
          className="bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded text-xs font-mono"
        >
          {token.slice(1, -1)}
        </code>
      );
    }
    return token;
  });
}

function MarkdownContent({
  content,
  isStreaming,
}: {
  content: string;
  isStreaming?: boolean;
}) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let listBuffer: string[] = [];
  let listType: "ul" | "ol" | null = null;

  const flushList = (keyIdx: number) => {
    if (!listBuffer.length) return;
    if (listType === "ul") {
      elements.push(
        <ul key={`list-${keyIdx}`} className="list-disc list-inside space-y-0.5 my-1">
          {listBuffer.map((item, i) => (
            <li key={i} className="text-sm leading-relaxed">
              {renderInline(item, `li-${keyIdx}-${i}`)}
            </li>
          ))}
        </ul>
      );
    } else {
      elements.push(
        <ol key={`list-${keyIdx}`} className="list-decimal list-inside space-y-0.5 my-1">
          {listBuffer.map((item, i) => (
            <li key={i} className="text-sm leading-relaxed">
              {renderInline(item, `li-${keyIdx}-${i}`)}
            </li>
          ))}
        </ol>
      );
    }
    listBuffer = [];
    listType = null;
  };

  lines.forEach((line, idx) => {
    // Headings
    const h3 = line.match(/^###\s+(.+)/);
    const h2 = line.match(/^##\s+(.+)/);
    const h1 = line.match(/^#\s+(.+)/);
    // Bullet list
    const ulMatch = line.match(/^[-*]\s+(.+)/);
    // Numbered list
    const olMatch = line.match(/^\d+\.\s+(.+)/);
    // Horizontal rule
    const hrMatch = line.match(/^---+$/);

    if (h1 || h2 || h3) {
      flushList(idx);
      const text = (h1?.[1] ?? h2?.[1] ?? h3?.[1]) ?? "";
      const sizeClass = h1 ? "text-base font-bold" : h2 ? "text-sm font-bold" : "text-sm font-semibold";
      elements.push(
        <p key={idx} className={cn(sizeClass, "mt-2 mb-1 text-foreground")}>
          {renderInline(text, `h-${idx}`)}
        </p>
      );
    } else if (ulMatch) {
      if (listType === "ol") flushList(idx);
      listType = "ul";
      listBuffer.push(ulMatch[1]);
    } else if (olMatch) {
      if (listType === "ul") flushList(idx);
      listType = "ol";
      listBuffer.push(olMatch[1]);
    } else if (hrMatch) {
      flushList(idx);
      elements.push(<hr key={idx} className="border-border my-2" />);
    } else if (line.trim() === "") {
      flushList(idx);
      elements.push(<div key={idx} className="h-1" />);
    } else {
      flushList(idx);
      elements.push(
        <p key={idx} className="text-sm leading-relaxed">
          {renderInline(line, `p-${idx}`)}
        </p>
      );
    }
  });

  flushList(lines.length);

  return (
    <div className="space-y-0.5">
      {elements}
      {isStreaming && (
        <span className="inline-block w-1 h-4 bg-primary ml-0.5 animate-pulse align-text-bottom" />
      )}
    </div>
  );
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-primary/60"
          style={{
            animation: `pulse 1.4s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

export function CeoChat({ mini = false }: { mini?: boolean }) {
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [currentClientId, setCurrentClientId] = useState<string | undefined>();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load persisted conversation history from DB on mount
  useEffect(() => {
    const loadHistory = async () => {
      try {
        const res = await fetch("/api/chat?limit=50");
        if (!res.ok) return;
        const data = await res.json() as {
          messages: Array<{
            id: string;
            role: string;
            content: string;
            createdAt: string;
            clientId?: string;
          }>;
        };
        if (!data.messages?.length) return;

        const loaded: Message[] = data.messages.map((m) => ({
          id: m.id,
          role: m.role.toLowerCase() as "user" | "assistant",
          content: m.content,
          timestamp: new Date(m.createdAt),
        }));

        const lastWithClient = [...data.messages].reverse().find((m) => m.clientId);
        if (lastWithClient?.clientId) setCurrentClientId(lastWithClient.clientId);

        setMessages([WELCOME_MESSAGE, ...loaded]);
      } catch {
        // Keep welcome message on error
      } finally {
        setHistoryLoaded(true);
      }
    };
    loadHistory();
  }, []);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    // Add streaming placeholder (empty = shows typing dots until first token)
    const assistantId = crypto.randomUUID();
    setMessages((prev) => [
      ...prev,
      {
        id: assistantId,
        role: "assistant",
        content: "",
        timestamp: new Date(),
        isStreaming: true,
      },
    ]);

    try {
      const history = messages
        .filter((m) => m.id !== "welcome")
        .map((m) => ({ role: m.role, content: m.content }));

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage.content,
          history,
          clientId: currentClientId,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);
              if (data === "[DONE]") break;
              try {
                const parsed = JSON.parse(data);
                if (parsed.delta) {
                  accumulated += parsed.delta;
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantId
                        ? { ...m, content: accumulated, isStreaming: true }
                        : m
                    )
                  );
                }
              } catch {
                // ignore parse errors from SSE
              }
            }
          }
        }
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, isStreaming: false } : m
        )
      );
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content:
                  "Erro ao conectar com o Root Master. Verifique a configuração da API.",
                isStreaming: false,
              }
            : m
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className={cn(
        "border-b border-border flex items-center gap-3",
        mini ? "px-4 py-3" : "px-6 py-4"
      )}>
        <div className="relative shrink-0">
          <div className={cn(
            "rounded-xl flex items-center justify-center",
            "bg-gradient-to-br from-primary/30 to-primary/10 border border-primary/50",
            "shadow-[0_0_12px_rgba(var(--primary)_/_0.3)]",
            mini ? "w-9 h-9" : "w-10 h-10"
          )}>
            <NeuralIcon size={mini ? 18 : 20} className="text-primary drop-shadow-sm" />
          </div>
          <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-background shadow-sm" />
        </div>
        <div className="min-w-0">
          <h2 className={cn("font-semibold tracking-tight text-foreground", mini ? "text-sm" : "text-base")}>Root Master</h2>
          <p className="text-[11px] text-muted-foreground leading-tight">CEO &amp; Chief Orchestrator · Online</p>
        </div>
        <div className="ml-auto shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[10px] text-emerald-400 font-medium">IA ATIVA</span>
        </div>
      </div>

      {/* Messages */}
      <div className={cn("flex-1 overflow-y-auto space-y-3", mini ? "p-3" : "p-5")}>
        <AnimatePresence initial={false}>
          {messages.map((message) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className={cn(
                "flex gap-3",
                message.role === "user" ? "flex-row-reverse" : "flex-row"
              )}
            >
              {/* Avatar */}
              <div
                className={cn(
                  "w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center border",
                  message.role === "assistant"
                    ? "bg-primary/20 border-primary/40"
                    : "bg-secondary border-border"
                )}
              >
                {message.role === "assistant" ? (
                  <NeuralIcon size={16} className="text-primary" />
                ) : (
                  <User className="w-4 h-4 text-muted-foreground" />
                )}
              </div>

              {/* Bubble */}
              <div
                className={cn(
                  "max-w-[78%] rounded-2xl px-4 py-3",
                  message.role === "assistant"
                    ? "bg-card/80 border border-border/60 backdrop-blur-sm"
                    : "bg-gradient-to-br from-primary/20 to-primary/10 border border-primary/30"
                )}
              >
                {message.isStreaming && message.content === "" ? (
                  <TypingDots />
                ) : (
                  <MarkdownContent
                    content={message.content}
                    isStreaming={message.isStreaming && message.content !== ""}
                  />
                )}
                <div className="mt-1.5 text-[10px] text-muted-foreground/40 font-mono">
                  {message.timestamp.toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className={cn("border-t border-border", mini ? "p-3" : "p-4")}>
        <div className="flex gap-2 items-end">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={mini ? "Enviar mensagem..." : "Envie uma solicitação ao Root Master... (Enter para enviar)"}
              rows={1}
              className={cn(
                "w-full bg-muted/40 border border-border/70 rounded-xl py-2.5 pr-4",
                "text-sm text-foreground placeholder:text-muted-foreground/50",
                "resize-none focus:outline-none focus:ring-1 focus:ring-primary/60 focus:border-primary/60",
                "transition-all duration-150 leading-relaxed",
                "max-h-32 overflow-y-auto",
                mini ? "px-3 text-xs" : "px-4"
              )}
              style={{ minHeight: mini ? "40px" : "46px" }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = "auto";
                target.style.height = Math.min(target.scrollHeight, 128) + "px";
              }}
            />
          </div>
          <button
            onClick={sendMessage}
            disabled={!input.trim() || isLoading}
            className={cn(
              "rounded-xl flex items-center justify-center transition-all duration-150 shrink-0",
              mini ? "w-9 h-9" : "w-10 h-10",
              input.trim() && !isLoading
                ? "bg-primary hover:bg-primary/90 text-primary-foreground shadow-[0_0_10px_rgba(var(--primary)_/_0.4)]"
                : "bg-muted/50 text-muted-foreground/40 cursor-not-allowed"
            )}
          >
            {isLoading ? (
              <Loader2 className={cn("animate-spin", mini ? "w-3.5 h-3.5" : "w-4 h-4")} />
            ) : (
              <Send className={cn(mini ? "w-3.5 h-3.5" : "w-4 h-4")} />
            )}
          </button>
        </div>
        {!mini && (
          <div className="mt-1.5 flex items-center gap-2 px-1">
            <span className="text-[10px] text-muted-foreground/40 font-mono">
              Root Master · Drael · Enter para enviar
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
