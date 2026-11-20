"use client";

// Chat com um agente direto do escritório virtual. Ele responde no papel dele e pode começar uma tarefa
// ou ir até a mesa de um colega passar o recado (o boneco anda até lá no 3D).
import { useEffect, useRef, useState } from "react";
import { Loader2, Send } from "lucide-react";

interface Msg {
  role: "user" | "assistant";
  content: string;
  actions?: Array<{ kind: "self" | "delegate"; title: string; agentName: string; clientName: string }>;
}

const storageKey = (agentId: string) => `lotus-office-chat-${agentId}`;

export function AgentChat({ agentId, agentName, color }: { agentId: string; agentName: string; color: string }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const first = agentName.split(" ")[0];

  // Conversa guardada neste computador, por agente
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey(agentId));
      setMessages(saved ? (JSON.parse(saved) as Msg[]) : []);
    } catch {
      setMessages([]);
    }
  }, [agentId]);
  useEffect(() => {
    try {
      localStorage.setItem(storageKey(agentId), JSON.stringify(messages.slice(-30)));
    } catch {
      /* sem armazenamento: a conversa vale só enquanto o painel está aberto */
    }
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, agentId]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    const history = messages.map(({ role, content }) => ({ role, content }));
    setMessages((m) => [...m, { role: "user", content: text }]);
    setInput("");
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/hq/agents/${encodeURIComponent(agentId)}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history }),
      });
      const data = (await res.json().catch(() => ({}))) as { reply?: string; actions?: Msg["actions"]; error?: string };
      if (!res.ok) throw new Error(data.error ?? `erro ${res.status}`);
      setMessages((m) => [...m, { role: "assistant", content: data.reply ?? "", actions: data.actions ?? [] }]);
    } catch (err) {
      setError(`Não deu para falar com ${first}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] text-white/45">
        Converse com {first}. Peça um trabalho da área dele(a), ou peça para falar com um colega: {first} vai até a mesa da pessoa passar o recado.
      </p>
      <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div
              className={
                m.role === "user"
                  ? "max-w-[85%] rounded-xl rounded-br-sm px-3 py-2 text-xs text-white"
                  : "max-w-[90%] rounded-xl rounded-bl-sm px-3 py-2 text-xs text-white/85 bg-white/8 border border-white/10"
              }
              style={m.role === "user" ? { background: `${color}55` } : undefined}
            >
              <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
              {(m.actions ?? []).map((a, j) => (
                <p key={j} className="mt-1.5 text-[10.5px] text-emerald-300">
                  {a.kind === "delegate" ? `Foi até ${a.agentName}: "${a.title}"` : `Começou: "${a.title}"`} · {a.clientName}
                </p>
              ))}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex items-center gap-2 text-[11px] text-white/45">
            <Loader2 size={12} className="animate-spin" /> {first} está pensando…
          </div>
        )}
        <div ref={endRef} />
      </div>
      {error && <p className="text-[11px] text-red-400">{error}</p>}
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void send();
          }}
          placeholder={`Fale com ${first}…`}
          className="flex-1 min-w-0 rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-xs text-white placeholder:text-white/35 focus:outline-none focus:border-white/30"
        />
        <button
          onClick={() => void send()}
          disabled={!input.trim() || sending}
          className="rounded-lg px-3 text-white disabled:opacity-40"
          style={{ background: color }}
          aria-label="Enviar"
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}
