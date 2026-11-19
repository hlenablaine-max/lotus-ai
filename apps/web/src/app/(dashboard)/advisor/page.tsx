"use client";

import { useState, useEffect, useRef } from "react";
import { RichText } from "@/components/ui/rich-text";
import { Brain, Bell, AlertTriangle, Info, Zap, Loader2, Send, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface Notification {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  body: string;
  action: string;
  href: string;
  ts: number;
  read?: boolean;
}

interface Message {
  id: number;
  role: "user" | "assistant";
  content: string;
}

const SEVERITY = {
  critical: { icon: AlertTriangle, color: "text-red-400", bg: "bg-red-500/10 border-red-500/20", dot: "bg-red-400" },
  warning: { icon: AlertTriangle, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20", dot: "bg-amber-400" },
  info: { icon: Info, color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20", dot: "bg-blue-400" },
};

function timeAgo(ts: number) {
  const diff = Date.now() - ts;
  if (diff < 60000) return "agora";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}min atrás`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h atrás`;
  return `${Math.floor(diff / 86400000)}d atrás`;
}

export default function AdvisorPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [selected, setSelected] = useState<Notification | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(true);
  const msgCounter = useRef(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load notifications and poll every 30s
  useEffect(() => {
    const fetchNotifs = async () => {
      try {
        const res = await fetch("/api/advisor/notifications");
        const data = await res.json();
        setNotifications((prev) => {
          const prevIds = new Set(prev.map((n) => n.id));
          const incoming = data.notifications as Notification[];
          // Mark existing reads
          return incoming.map((n) => ({ ...n, read: prevIds.has(n.id) ? (prev.find((p) => p.id === n.id)?.read ?? false) : false }));
        });
      } catch { /* ignore */ }
    };
    fetchNotifs();
    const timer = setInterval(fetchNotifs, 30000);
    return () => clearInterval(timer);
  }, []);

  // Vindo do sino de notificações: abre o alerta indicado na URL
  const openedFromUrl = useRef(false);
  useEffect(() => {
    if (openedFromUrl.current || notifications.length === 0) return;
    const id = new URLSearchParams(window.location.search).get("notificationId");
    if (!id) return;
    openedFromUrl.current = true;
    const target = notifications.find((n) => n.id === id);
    if (target) openNotification(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifications]);

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const openNotification = (n: Notification) => {
    setSelected(n);
    setNotifications((prev) => prev.map((p) => p.id === n.id ? { ...p, read: true } : p));
    // Seed the chat with context from this notification
    const seed: Message = {
      id: msgCounter.current++,
      role: "assistant",
      content: `Identifiquei um alerta: **${n.title}**\n\n${n.body}\n\nO que você quer fazer a respeito?`,
    };
    setMessages([seed]);
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg: Message = { id: msgCounter.current++, role: "user", content: input };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const contextPrefix = selected ? `[Contexto do alerta: ${selected.title} — ${selected.body}]\n\n` : "";
      const history = messages.slice(-8).map((m) => ({ role: m.role, content: m.content }));

      const res = await fetch("/api/advisor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: contextPrefix + input, history }),
      });

      if (!res.ok) throw new Error("API error");
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No stream");

      const assistantMsg: Message = { id: msgCounter.current++, role: "assistant", content: "" };
      setMessages((prev) => [...prev, assistantMsg]);

      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n");
        buffer = parts.pop() ?? "";
        const lines = parts.filter((l) => l.startsWith("data: "));
        for (const line of lines) {
          try {
            const raw = line.slice(6);
            if (raw === "[DONE]") break;
            const data = JSON.parse(raw);
            const text = typeof data.delta === "string" ? data.delta : data.delta?.text ?? "";
            if (text) {
              setMessages((prev) =>
                prev.map((m) => m.id === assistantMsg.id ? { ...m, content: m.content + text } : m)
              );
            }
          } catch { /* ignore parse errors */ }
        }
      }
    } catch {
      setMessages((prev) => [...prev, { id: msgCounter.current++, role: "assistant", content: "Erro ao conectar com o advisor. Tente novamente." }]);
    } finally {
      setLoading(false);
    }
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-[#07070f] overflow-hidden">
      {/* Left — Notifications */}
      <div className="flex flex-col w-96 border-r border-white/8 flex-shrink-0">
        {/* Header */}
        <div className="p-4 border-b border-white/8 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell size={16} className="text-white/50" />
            <h2 className="text-sm font-bold text-white">Alertas Proativos</h2>
            {unreadCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-pink-500 text-white text-[10px] font-bold leading-none">
                {unreadCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-white/25">
            <div className={cn("w-1.5 h-1.5 rounded-full", polling ? "bg-green-400 animate-pulse" : "bg-white/20")} />
            {polling ? "Monitorando" : "Pausado"}
          </div>
        </div>

        {/* Notification list */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {notifications.length === 0 && (
            <div className="text-center py-12">
              <Bell className="w-8 h-8 text-white/10 mx-auto mb-3" />
              <p className="text-xs text-white/25">Nenhum alerta no momento</p>
            </div>
          )}
          {notifications.map((n) => {
            const cfg = SEVERITY[n.severity];
            const Icon = cfg.icon;
            const isActive = selected?.id === n.id;
            return (
              <button
                key={n.id}
                onClick={() => openNotification(n)}
                className={cn(
                  "w-full text-left rounded-xl border p-3.5 transition-all",
                  isActive ? "border-pink-500/40 bg-pink-500/8" : n.read ? "border-white/6 bg-white/2 opacity-60" : cn(cfg.bg),
                  "hover:opacity-100"
                )}
              >
                <div className="flex items-start gap-2.5">
                  <div className={cn("w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0", n.read ? "bg-white/15" : cfg.dot)} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className={cn("text-xs font-semibold", n.read ? "text-white/50" : "text-white/85")}>
                        {n.title}
                      </span>
                      <span className="text-[9px] text-white/20 flex-shrink-0 mt-0.5">{timeAgo(n.ts)}</span>
                    </div>
                    <p className="text-[11px] text-white/35 leading-snug line-clamp-2">{n.body}</p>
                    <div className="flex items-center gap-1 mt-2 text-[10px] text-pink-400">
                      {n.action} <ChevronRight size={10} />
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-white/8">
          <p className="text-[10px] text-white/20 text-center">
            Aurora monitora continuamente todos os clientes e métricas
          </p>
        </div>
      </div>

      {/* Right — Chat with Advisor */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-white/8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-purple-500/15 border border-purple-500/25 flex items-center justify-center">
              <Brain className="w-4 h-4 text-purple-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Aurora — Advisor</h2>
              <p className="text-xs text-white/35">
                {selected ? `Contexto: ${selected.title}` : "LOTUS AI CEO — estratégia, pipeline e precificação"}
              </p>
            </div>
          </div>
          {selected && (
            <button
              onClick={() => { setSelected(null); setMessages([]); }}
              className="text-white/25 hover:text-white p-1.5 rounded-lg hover:bg-white/5 transition-all"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-16 space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mx-auto">
                <Brain className="w-6 h-6 text-purple-400/50" />
              </div>
              <p className="text-white/30 text-sm">Clique em um alerta para abrir o contexto</p>
              <p className="text-white/15 text-xs">ou pergunte: &quot;qual cliente tem mais risco de churn?&quot;, &quot;faça o assessment de preço do cliente X&quot;</p>
            </div>
          )}
          {messages.map((m) => (
            <div
              key={m.id}
              className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}
            >
              <div
                className={cn(
                  "max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
                  m.role === "user"
                    ? "bg-pink-500/20 border border-pink-500/25 text-white"
                    : "bg-white/5 border border-white/8 text-white/80"
                )}
              >
                {m.role === "assistant" && m.content ? <RichText content={m.content} /> : <div className="whitespace-pre-wrap">{m.content || (m.role === "assistant" && loading ? "▌" : "")}</div>}
              </div>
            </div>
          ))}
          {loading && messages[messages.length - 1]?.role === "user" && (
            <div className="flex justify-start">
              <div className="bg-white/5 border border-white/8 rounded-2xl px-4 py-3">
                <Loader2 size={14} className="text-white/30 animate-spin" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t border-white/8">
          <div className="flex gap-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              placeholder="Pergunte algo ao Advisor..."
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/25 focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500 transition-all"
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || loading}
              className="w-11 h-11 rounded-xl bg-purple-500 hover:bg-purple-400 disabled:opacity-40 flex items-center justify-center transition-all"
            >
              <Send size={15} className="text-white" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
