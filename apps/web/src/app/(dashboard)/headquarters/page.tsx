"use client";

import { useState, useRef, useCallback } from "react";
import { LotusHQ3D } from "@/components/headquarters/lotus-hq-3d";

export default function HeadquartersPage() {
  const [command, setCommand] = useState("");
  const [sending, setSending] = useState(false);
  const [lastResult, setLastResult] = useState<{ ok: boolean; text: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const sendCommand = useCallback(async () => {
    const msg = command.trim();
    if (!msg || sending) return;
    setSending(true);
    setLastResult(null);
    try {
      const res = await fetch("/api/chat/inject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, source: "headquarters-command" }),
      });
      if (res.ok) {
        setLastResult({ ok: true, text: "Comando enviado ao CEO Chat ✓" });
        setCommand("");
      } else {
        setLastResult({ ok: false, text: "Falha ao enviar comando" });
      }
    } catch {
      setLastResult({ ok: false, text: "Erro de conexão" });
    } finally {
      setSending(false);
      setTimeout(() => setLastResult(null), 3000);
      inputRef.current?.focus();
    }
  }, [command, sending]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") sendCommand();
  };

  return (
    <div className="relative w-full h-full flex flex-col">
      {/* 3D HQ fills the space */}
      <div className="flex-1 min-h-0">
        <LotusHQ3D />
      </div>

      {/* Command bar pinned at the bottom */}
      <div
        className="shrink-0 px-4 py-3 border-t border-white/10 bg-black/60 backdrop-blur-md"
        style={{ zIndex: 20 }}
      >
        <div className="max-w-3xl mx-auto flex items-center gap-2">
          {/* Prompt symbol */}
          <span className="text-purple-400 font-mono text-sm select-none">▸</span>

          <input
            ref={inputRef}
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Enviar comando para os agentes... (Ex: Analise os clientes inativos)"
            className="flex-1 bg-transparent text-sm text-white placeholder-white/30 outline-none font-mono"
            autoComplete="off"
            spellCheck={false}
          />

          {lastResult && (
            <span
              className={`text-xs font-mono shrink-0 ${
                lastResult.ok ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {lastResult.text}
            </span>
          )}

          <button
            onClick={sendCommand}
            disabled={!command.trim() || sending}
            className="shrink-0 px-3 py-1.5 rounded-md text-xs font-semibold transition-all
              bg-purple-600 hover:bg-purple-500 disabled:opacity-30 disabled:cursor-not-allowed text-white"
          >
            {sending ? "…" : "Enviar"}
          </button>
        </div>
      </div>
    </div>
  );
}
