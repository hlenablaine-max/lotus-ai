"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Mic, MicOff, Zap, ChevronRight, Volume2, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// Extend Window to include SpeechRecognition (browser API, not globally typed in TS)
declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    SpeechRecognition: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    webkitSpeechRecognition: any;
  }
}

interface TranscriptLine {
  id: number;
  text: string;
  speaker: "client" | "you";
  ts: string;
}

interface CopilotResponse {
  suggestion: string;
  tactic: string;
  confidence: number;
}

const TACTICS_COLORS: Record<string, string> = {
  Rapport: "text-blue-400 bg-blue-400/10 border-blue-400/20",
  Objeção: "text-amber-400 bg-amber-400/10 border-amber-400/20",
  Fechamento: "text-green-400 bg-green-400/10 border-green-400/20",
  "Valor & ROI": "text-purple-400 bg-purple-400/10 border-purple-400/20",
  Descoberta: "text-cyan-400 bg-cyan-400/10 border-cyan-400/20",
  Urgência: "text-pink-400 bg-pink-400/10 border-pink-400/20",
};

function getNow() {
  return new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function CopilotPage() {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [currentLine, setCurrentLine] = useState("");
  const [copilotResp, setCopilotResp] = useState<CopilotResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [supported, setSupported] = useState(true);
  const [showTeleprompter, setShowTeleprompter] = useState(true);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const lineCounterRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  // Check browser support
  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) setSupported(false);
  }, []);

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  const askCopilot = useCallback(async (clientSaid: string) => {
    if (!clientSaid.trim() || clientSaid.length < 10) return;
    setLoading(true);
    try {
      const context = transcript
        .slice(-6)
        .map((l) => `${l.speaker === "client" ? "Cliente" : "Você"}: ${l.text}`)
        .join("\n");

      const res = await fetch("/api/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientSaid, context }),
      });
      if (!res.ok) throw new Error("API error");
      const data = await res.json();
      setCopilotResp(data);
    } catch {
      setError("Erro ao gerar sugestão. Verifique a conexão.");
    } finally {
      setLoading(false);
    }
  }, [transcript]);

  const startListening = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;

    const recognition = new SR();
    recognition.lang = "pt-BR";
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.maxAlternatives = 1;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += t;
        } else {
          interim += t;
        }
      }

      if (interim) setCurrentLine(interim);

      if (final.trim()) {
        const line: TranscriptLine = {
          id: lineCounterRef.current++,
          text: final.trim(),
          speaker: "client",
          ts: getNow(),
        };
        setTranscript((prev) => [...prev, line]);
        setCurrentLine("");

        // Debounce the AI call slightly to batch fast sentences
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => askCopilot(final.trim()), 400);
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onerror = (e: any) => {
      if (e.error !== "no-speech") setError(`Erro de reconhecimento: ${e.error}`);
    };

    recognition.onend = () => {
      // Auto-restart if still listening
      if (recognitionRef.current) {
        try { recognition.start(); } catch { /* ignore */ }
      }
    };

    recognition.start();
    recognitionRef.current = recognition;
    setListening(true);
    setError("");
  }, [askCopilot]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setListening(false);
    setCurrentLine("");
  }, []);

  const toggleMic = () => {
    if (listening) stopListening();
    else startListening();
  };

  const addManual = (text: string, speaker: "client" | "you") => {
    if (!text.trim()) return;
    setTranscript((prev) => [
      ...prev,
      { id: lineCounterRef.current++, text: text.trim(), speaker, ts: getNow() },
    ]);
    if (speaker === "client") askCopilot(text.trim());
  };

  const tacticStyle = copilotResp ? (TACTICS_COLORS[copilotResp.tactic] ?? "text-white/60 bg-white/5 border-white/10") : "";

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-[#07070f] overflow-hidden">
      {/* Left — Transcript */}
      <div className="flex flex-col w-96 border-r border-white/8 flex-shrink-0">
        {/* Header */}
        <div className="p-4 border-b border-white/8 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-white">Transcrição ao Vivo</h2>
            <p className="text-xs text-white/35 mt-0.5">O que o cliente está dizendo</p>
          </div>
          <button
            onClick={toggleMic}
            disabled={!supported}
            className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center transition-all",
              listening
                ? "bg-red-500/20 border border-red-500/50 text-red-400 shadow-lg shadow-red-500/20"
                : "bg-white/5 border border-white/15 text-white/50 hover:text-white hover:border-white/30"
            )}
          >
            {listening ? <Mic size={16} className="animate-pulse" /> : <MicOff size={16} />}
          </button>
        </div>

        {/* Transcript list */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {transcript.length === 0 && !listening && (
            <div className="text-center py-12">
              <Mic className="w-8 h-8 text-white/15 mx-auto mb-3" />
              <p className="text-xs text-white/30">Clique no microfone para começar</p>
              <p className="text-xs text-white/20 mt-1">ou entre numa reunião com o cliente</p>
            </div>
          )}
          {transcript.map((line) => (
            <div
              key={line.id}
              className={cn(
                "px-3 py-2 rounded-lg text-sm leading-relaxed",
                line.speaker === "client"
                  ? "bg-blue-500/8 border border-blue-500/15 text-white/80"
                  : "bg-white/4 border border-white/8 text-white/50 ml-4"
              )}
            >
              <div className="flex items-center justify-between mb-0.5">
                <span className={cn("text-[10px] font-semibold uppercase tracking-wider",
                  line.speaker === "client" ? "text-blue-400/70" : "text-white/30"
                )}>
                  {line.speaker === "client" ? "Cliente" : "Você"}
                </span>
                <span className="text-[9px] text-white/20">{line.ts}</span>
              </div>
              {line.text}
            </div>
          ))}
          {/* Live partial transcript */}
          {currentLine && (
            <div className="px-3 py-2 rounded-lg bg-blue-500/5 border border-blue-500/10 text-sm text-white/50 italic">
              <span className="text-[10px] font-semibold uppercase text-blue-400/50 tracking-wider block mb-0.5">Ouvindo...</span>
              {currentLine}
            </div>
          )}
          <div ref={transcriptEndRef} />
        </div>

        {/* Status bar */}
        <div className="p-3 border-t border-white/8">
          {!supported ? (
            <div className="flex items-center gap-2 text-amber-400 text-xs">
              <AlertCircle size={12} />
              Navegador não suporta reconhecimento de voz. Use Chrome.
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 text-red-400 text-xs">
              <AlertCircle size={12} /> {error}
            </div>
          ) : (
            <div className={cn("flex items-center gap-2 text-xs",
              listening ? "text-green-400" : "text-white/30"
            )}>
              <div className={cn("w-1.5 h-1.5 rounded-full", listening ? "bg-green-400 animate-pulse" : "bg-white/20")} />
              {listening ? "Microfone ativo — ouvindo cliente" : "Microfone inativo"}
            </div>
          )}
        </div>
      </div>

      {/* Right — Teleprompter / Copilot */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-white/8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-pink-500/15 border border-pink-500/25 flex items-center justify-center">
              <Zap className="w-4 h-4 text-pink-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Sales Copilot</h2>
              <p className="text-xs text-white/35">Resposta em tempo real</p>
            </div>
          </div>
          <button
            onClick={() => setShowTeleprompter((p) => !p)}
            className="text-xs text-white/35 hover:text-white px-3 py-1.5 rounded-lg border border-white/8 hover:border-white/20 transition-all"
          >
            {showTeleprompter ? "Ocultar" : "Mostrar"} teleprompter
          </button>
        </div>

        {/* Teleprompter */}
        <div className="flex-1 flex flex-col items-center justify-center p-8">
          {loading ? (
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="w-8 h-8 text-pink-400 animate-spin" />
              <p className="text-sm text-white/40">Gerando resposta...</p>
            </div>
          ) : copilotResp && showTeleprompter ? (
            <div className="w-full max-w-2xl space-y-4">
              {/* Tactic badge */}
              <div className="flex items-center gap-2 justify-center">
                <span className={cn("px-3 py-1 rounded-full text-xs font-semibold border", tacticStyle)}>
                  {copilotResp.tactic}
                </span>
                <span className="text-xs text-white/25">
                  {Math.round(copilotResp.confidence * 100)}% confiança
                </span>
              </div>

              {/* Main suggestion — teleprompter style */}
              <div className="relative rounded-2xl border border-pink-500/20 bg-pink-500/5 p-8">
                <Volume2 className="absolute top-4 left-4 w-4 h-4 text-pink-400/40" />
                <p className="text-2xl font-semibold text-white leading-relaxed text-center tracking-wide">
                  {copilotResp.suggestion}
                </p>
                <ChevronRight className="absolute bottom-4 right-4 w-4 h-4 text-pink-400/40" />
              </div>

              <p className="text-center text-xs text-white/25">
                Leia isso em voz alta para o cliente
              </p>
            </div>
          ) : !copilotResp ? (
            <div className="text-center space-y-3">
              <div className="w-16 h-16 rounded-2xl bg-pink-500/10 border border-pink-500/20 flex items-center justify-center mx-auto">
                <Zap className="w-7 h-7 text-pink-400/50" />
              </div>
              <p className="text-white/30 text-sm">Aguardando o cliente falar...</p>
              <p className="text-white/15 text-xs">A sugestão aparece automaticamente aqui</p>
            </div>
          ) : null}
        </div>

        {/* Recent suggestions history */}
        {transcript.length > 0 && (
          <div className="p-4 border-t border-white/8">
            <p className="text-xs text-white/25 mb-2 uppercase tracking-wider">Últimas frases capturadas</p>
            <div className="flex flex-wrap gap-2">
              {transcript
                .filter((l) => l.speaker === "client")
                .slice(-3)
                .map((l) => (
                  <button
                    key={l.id}
                    onClick={() => askCopilot(l.text)}
                    className="px-2 py-1 rounded bg-white/5 border border-white/8 text-xs text-white/40 hover:text-white/70 hover:border-white/20 transition-all truncate max-w-xs"
                  >
                    {l.text}
                  </button>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
