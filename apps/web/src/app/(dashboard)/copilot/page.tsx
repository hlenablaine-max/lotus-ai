"use client";

// Sales Copilot: ouve a call (o áudio que sai do PC = cliente; o microfone = você), transcreve aqui no PC,
// sugere a melhor resposta na hora e guarda a call com as sugestões e um resumo no final.
import { useState, useEffect, useRef, useCallback } from "react";
import { Mic, MicOff, Zap, ChevronRight, Volume2, AlertCircle, Loader2, Headphones, Play, Square, History } from "lucide-react";
import { cn } from "@/lib/utils";

interface TranscriptLine {
  id: number;
  text: string;
  speaker: "client" | "you";
  ts: string;
}
interface CopilotResponse {
  suggestion: string;
  tactic: string;
  confidence: number | null;
}
interface PastCall {
  id: string;
  title: string;
  status: string;
  startedAt: string | null;
  summary: string | null;
  keyInsights: { proximoPasso?: string; chanceDeFechar?: string; objecoes?: string[] } | null;
  suggestionsCount: number;
  client: { id: string; name: string };
}

const TACTICS_COLORS: Record<string, string> = {
  Rapport: "text-blue-400 bg-blue-400/10 border-blue-400/20",
  Objeção: "text-amber-400 bg-amber-400/10 border-amber-400/20",
  Fechamento: "text-green-400 bg-green-400/10 border-green-400/20",
  "Valor & ROI": "text-purple-400 bg-purple-400/10 border-purple-400/20",
  Descoberta: "text-cyan-400 bg-cyan-400/10 border-cyan-400/20",
  Urgência: "text-pink-400 bg-pink-400/10 border-pink-400/20",
};
const CHUNK_MS = 7000;

const getNow = () => new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

// Grava um fluxo de áudio em trechos de 7 s (cada trecho é um arquivo completo) e entrega cada um
function chunkRecorder(stream: MediaStream, onChunk: (b: Blob) => void): () => void {
  let stopped = false;
  let rec: MediaRecorder | null = null;
  const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
  const audioOnly = new MediaStream(stream.getAudioTracks());
  const cycle = () => {
    if (stopped) return;
    rec = new MediaRecorder(audioOnly, { mimeType: mime });
    const parts: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && parts.push(e.data);
    rec.onstop = () => {
      if (parts.length) onChunk(new Blob(parts, { type: mime }));
      cycle();
    };
    rec.start();
    setTimeout(() => rec?.state === "recording" && rec.stop(), CHUNK_MS);
  };
  cycle();
  return () => {
    stopped = true;
    if (rec?.state === "recording") rec.stop();
  };
}

export default function CopilotPage() {
  const [clients, setClients] = useState<Array<{ id: string; name: string; slug: string }>>([]);
  const [clientId, setClientId] = useState("");
  const [call, setCall] = useState<{ id: string; title: string } | null>(null);
  const [ending, setEnding] = useState(false);
  const [lastSummary, setLastSummary] = useState<PastCall | null>(null);
  const [pastCalls, setPastCalls] = useState<PastCall[]>([]);

  const [sources, setSources] = useState<{ call: boolean; mic: boolean }>({ call: false, mic: false });
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [hearing, setHearing] = useState(0); // trechos sendo transcritos agora
  const [copilotResp, setCopilotResp] = useState<CopilotResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [aiError, setAiError] = useState("");
  const [showTeleprompter, setShowTeleprompter] = useState(true);
  const [manualInput, setManualInput] = useState("");

  const lineCounterRef = useRef(0);
  const stopsRef = useRef<Array<() => void>>([]);
  const streamsRef = useRef<MediaStream[]>([]);
  const transcriptRef = useRef<TranscriptLine[]>([]);
  const callRef = useRef<{ id: string } | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  transcriptRef.current = transcript;
  callRef.current = call;

  const loadCalls = useCallback(async () => {
    const r = await fetch("/api/copilot/calls").catch(() => null);
    if (r?.ok) setPastCalls(((await r.json()) as { calls: PastCall[] }).calls);
  }, []);

  useEffect(() => {
    fetch("/api/clients")
      .then((r) => r.json())
      .then((d: { clients?: Array<{ id: string; name: string; slug: string; status: string }> }) => {
        const list = (d.clients ?? []).filter((c) => c.status !== "CHURNED");
        setClients(list);
        setClientId(list.find((c) => c.slug === "lotus-interno")?.id ?? list[0]?.id ?? "");
      })
      .catch(() => undefined);
    void loadCalls();
  }, [loadCalls]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  const transcriptText = () => transcriptRef.current.map((l) => `${l.speaker === "client" ? "Cliente" : "Você"}: ${l.text}`).join("\n");

  // Salva a transcrição na call alguns segundos depois de cada frase nova
  const scheduleSave = useCallback(() => {
    if (!callRef.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (!callRef.current) return;
      void fetch(`/api/copilot/calls/${callRef.current.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transcript: transcriptText() }) });
    }, 3000);
  }, []);

  const askCopilot = useCallback(async (clientSaid: string) => {
    if (clientSaid.trim().length < 3) return;
    setLoading(true);
    try {
      const context = transcriptRef.current
        .slice(-8)
        .map((l) => `${l.speaker === "client" ? "Cliente" : "Você"}: ${l.text}`)
        .join("\n");
      const res = await fetch("/api/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientSaid, context, callId: callRef.current?.id }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.suggestion) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setCopilotResp(data);
      setAiError("");
    } catch (err) {
      setAiError(`Sugestão não gerada — ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  const addLine = useCallback(
    (text: string, speaker: "client" | "you") => {
      const clean = text.trim();
      if (!clean) return;
      setTranscript((prev) => [...prev, { id: lineCounterRef.current++, text: clean, speaker, ts: getNow() }]);
      scheduleSave();
      if (speaker === "client") void askCopilot(clean);
    },
    [askCopilot, scheduleSave]
  );

  const transcribeChunk = useCallback(
    async (blob: Blob, speaker: "client" | "you") => {
      if (blob.size < 3000) return; // silêncio
      setHearing((n) => n + 1);
      try {
        const res = await fetch("/api/copilot/transcribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ base64: await blobToBase64(blob), ext: "webm" }) });
        const d = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
        if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
        if (d.text && d.text.length > 2) addLine(d.text, speaker);
        setError("");
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setHearing((n) => n - 1);
      }
    },
    [addLine]
  );

  const startSource = async (kind: "call" | "mic") => {
    try {
      const stream =
        kind === "mic"
          ? await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
          : await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      stream.getVideoTracks().forEach((t) => t.stop()); // só o som interessa
      if (!stream.getAudioTracks().length) throw new Error(kind === "call" ? "O Windows não liberou o som do PC." : "Nenhum microfone encontrado.");
      streamsRef.current.push(stream);
      stopsRef.current.push(chunkRecorder(stream, (b) => void transcribeChunk(b, kind === "call" ? "client" : "you")));
      setSources((s) => ({ ...s, [kind]: true }));
      setError("");
    } catch (err) {
      setError(kind === "call" ? `Não consegui ouvir o som do PC: ${err instanceof Error ? err.message : String(err)}` : `Microfone indisponível: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const stopAudio = () => {
    stopsRef.current.forEach((s) => s());
    stopsRef.current = [];
    streamsRef.current.forEach((st) => st.getTracks().forEach((t) => t.stop()));
    streamsRef.current = [];
    setSources({ call: false, mic: false });
  };
  useEffect(() => () => stopAudio(), []);

  const startCall = async () => {
    const r = await fetch("/api/copilot/calls", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId }) });
    const d = (await r.json().catch(() => ({}))) as { call?: { id: string; title: string }; error?: string };
    if (!r.ok || !d.call) return setError(d.error ?? "Não consegui começar a call.");
    setCall(d.call);
    setTranscript([]);
    setCopilotResp(null);
    setLastSummary(null);
    await startSource("call");
    await startSource("mic");
  };

  const endCall = async () => {
    if (!call) return;
    stopAudio();
    setEnding(true);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const r = await fetch(`/api/copilot/calls/${call.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transcript: transcriptText(), end: true }) });
    const d = (await r.json().catch(() => ({}))) as { call?: { id: string; summary: string | null; keyInsights: PastCall["keyInsights"] } };
    setEnding(false);
    setCall(null);
    if (d.call) setLastSummary({ id: d.call.id, title: call.title, status: "COMPLETED", startedAt: null, summary: d.call.summary, keyInsights: d.call.keyInsights, suggestionsCount: 0, client: { id: clientId, name: "" } });
    void loadCalls();
  };

  const tacticStyle = copilotResp ? (TACTICS_COLORS[copilotResp.tactic] ?? "text-white/60 bg-white/5 border-white/10") : "";
  const listening = sources.call || sources.mic;

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-[#07070f] overflow-hidden">
      {/* Esquerda — transcrição */}
      <div className="flex flex-col w-96 border-r border-white/8 flex-shrink-0">
        <div className="p-4 border-b border-white/8 space-y-3">
          <div>
            <h2 className="text-sm font-bold text-white">Transcrição ao vivo</h2>
            <p className="text-xs text-white/35 mt-0.5">Som do PC = cliente · microfone = você (transcrito aqui no PC)</p>
          </div>
          {!call ? (
            <div className="flex gap-2">
              <select value={clientId} onChange={(e) => setClientId(e.target.value)} className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-xs text-white">
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.slug === "lotus-interno" ? "LOTUS (prospecção)" : c.name.split("|")[0].trim()}</option>
                ))}
              </select>
              <button onClick={() => void startCall()} disabled={!clientId} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-pink-500/20 border border-pink-500/40 text-pink-300 text-xs font-semibold hover:bg-pink-500/30 disabled:opacity-40">
                <Play size={12} /> Começar call
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button onClick={() => (sources.call ? undefined : void startSource("call"))} className={cn("flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg border text-[11px]", sources.call ? "border-blue-500/40 bg-blue-500/10 text-blue-300" : "border-white/10 text-white/50 hover:text-white")}>
                <Headphones size={12} /> {sources.call ? "Ouvindo o cliente" : "Ouvir som do PC"}
              </button>
              <button onClick={() => (sources.mic ? undefined : void startSource("mic"))} className={cn("flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg border text-[11px]", sources.mic ? "border-green-500/40 bg-green-500/10 text-green-300" : "border-white/10 text-white/50 hover:text-white")}>
                {sources.mic ? <Mic size={12} /> : <MicOff size={12} />} {sources.mic ? "Ouvindo você" : "Ligar microfone"}
              </button>
              <button onClick={() => void endCall()} disabled={ending} className="flex items-center gap-1 px-2 py-1.5 rounded-lg border border-red-500/40 text-red-300 text-[11px] hover:bg-red-500/10 disabled:opacity-40">
                {ending ? <Loader2 size={12} className="animate-spin" /> : <Square size={12} />} Encerrar
              </button>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {transcript.length === 0 && (
            <div className="text-center py-12">
              <Mic className="w-8 h-8 text-white/15 mx-auto mb-3" />
              <p className="text-xs text-white/30">{call ? "Ouvindo… as frases aparecem a cada ~7 segundos" : "Escolha o cliente e clique em Começar call"}</p>
              <p className="text-xs text-white/45 mt-1">Deixe o Meet/Zoom tocando no som do PC normalmente</p>
            </div>
          )}
          {transcript.map((line) => (
            <div key={line.id} className={cn("px-3 py-2 rounded-lg text-sm leading-relaxed", line.speaker === "client" ? "bg-blue-500/8 border border-blue-500/15 text-white/80" : "bg-white/4 border border-white/8 text-white/50 ml-4")}>
              <div className="flex items-center justify-between mb-0.5">
                <span className={cn("text-[10px] font-semibold uppercase tracking-wider", line.speaker === "client" ? "text-blue-400/70" : "text-white/30")}>{line.speaker === "client" ? "Cliente" : "Você"}</span>
                <span className="text-[9px] text-white/45">{line.ts}</span>
              </div>
              {line.text}
            </div>
          ))}
          {hearing > 0 && (
            <div className="px-3 py-2 rounded-lg bg-blue-500/5 border border-blue-500/10 text-xs text-white/40 italic flex items-center gap-2">
              <Loader2 size={12} className="animate-spin" /> transcrevendo…
            </div>
          )}
          <div ref={transcriptEndRef} />
        </div>

        <div className="p-3 border-t border-white/8">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (manualInput.trim()) {
                addLine(manualInput.trim(), "client");
                setManualInput("");
              }
            }}
            className="flex gap-2"
          >
            <input value={manualInput} onChange={(e) => setManualInput(e.target.value)} placeholder="Ou digite o que o cliente disse..." className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder:text-white/25 focus:outline-none focus:border-pink-500/40" />
            <button type="submit" disabled={!manualInput.trim()} className="px-3 py-2 rounded-lg bg-pink-500/15 border border-pink-500/25 text-pink-400 text-xs font-semibold disabled:opacity-30 hover:bg-pink-500/25">Enviar</button>
          </form>
        </div>

        <div className="px-3 pb-3">
          {error ? (
            <div className="flex items-start gap-2 text-red-400 text-xs">
              <AlertCircle size={12} className="mt-0.5 flex-shrink-0" /> {error}
            </div>
          ) : (
            <div className={cn("flex items-center gap-2 text-xs", listening ? "text-green-400" : "text-white/30")}>
              <div className={cn("w-1.5 h-1.5 rounded-full", listening ? "bg-green-400 animate-pulse" : "bg-white/20")} />
              {listening ? "Gravando a call (salva automaticamente)" : call ? "Áudio pausado" : "Nenhuma call em andamento"}
            </div>
          )}
        </div>
      </div>

      {/* Direita — teleprompter */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="p-4 border-b border-white/8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-pink-500/15 border border-pink-500/25 flex items-center justify-center">
              <Zap className="w-4 h-4 text-pink-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Sales Copilot</h2>
              <p className="text-xs text-white/35">{call ? call.title : "Resposta em tempo real"}</p>
            </div>
          </div>
          <button onClick={() => setShowTeleprompter((p) => !p)} className="text-xs text-white/35 hover:text-white px-3 py-1.5 rounded-lg border border-white/8 hover:border-white/20">
            {showTeleprompter ? "Ocultar" : "Mostrar"} teleprompter
          </button>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center p-8 overflow-y-auto">
          {loading ? (
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="w-8 h-8 text-pink-400 animate-spin" />
              <p className="text-sm text-white/40">Gerando resposta...</p>
            </div>
          ) : aiError ? (
            <div className="w-full max-w-xl flex items-start gap-3 p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-red-300">
              <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold">A IA não respondeu</p>
                <p className="text-xs text-red-300/80 mt-1">{aiError}</p>
              </div>
            </div>
          ) : copilotResp && showTeleprompter ? (
            <div className="w-full max-w-2xl space-y-4">
              <div className="flex items-center gap-2 justify-center">
                <span className={cn("px-3 py-1 rounded-full text-xs font-semibold border", tacticStyle)}>{copilotResp.tactic}</span>
                {copilotResp.confidence !== null && <span className="text-xs text-white/45">{Math.round(copilotResp.confidence * 100)}% confiança</span>}
              </div>
              <div className="relative rounded-2xl border border-pink-500/20 bg-pink-500/5 p-8">
                <Volume2 className="absolute top-4 left-4 w-4 h-4 text-pink-400/40" />
                <p className="text-2xl font-semibold text-white leading-relaxed text-center tracking-wide">{copilotResp.suggestion}</p>
                <ChevronRight className="absolute bottom-4 right-4 w-4 h-4 text-pink-400/40" />
              </div>
              <p className="text-center text-xs text-white/45">Fale com as suas palavras; é uma sugestão</p>
            </div>
          ) : lastSummary ? (
            <div className="w-full max-w-2xl rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-6 space-y-3">
              <p className="text-xs uppercase tracking-wider text-emerald-300/80">Resumo da call</p>
              <p className="text-sm text-white/85 leading-relaxed">{lastSummary.summary ?? "Sem resumo."}</p>
              {lastSummary.keyInsights?.objecoes?.length ? <p className="text-xs text-amber-300/90">Objeções: {lastSummary.keyInsights.objecoes.join("; ")}</p> : null}
              {lastSummary.keyInsights?.proximoPasso && <p className="text-xs text-white/70">Próximo passo: {lastSummary.keyInsights.proximoPasso}</p>}
              {lastSummary.keyInsights?.chanceDeFechar && <p className="text-xs text-white/50">Chance de fechar: {lastSummary.keyInsights.chanceDeFechar}</p>}
            </div>
          ) : (
            <div className="text-center space-y-3">
              <div className="w-16 h-16 rounded-2xl bg-pink-500/10 border border-pink-500/20 flex items-center justify-center mx-auto">
                <Zap className="w-7 h-7 text-pink-400/50" />
              </div>
              <p className="text-white/30 text-sm">{call ? "Aguardando o cliente falar..." : "Comece uma call para receber sugestões"}</p>
              <p className="text-white/45 text-xs">A sugestão aparece automaticamente aqui</p>
            </div>
          )}
        </div>

        {!call && pastCalls.length > 0 && (
          <div className="p-4 border-t border-white/8 max-h-60 overflow-y-auto">
            <p className="text-xs text-white/45 mb-2 uppercase tracking-wider flex items-center gap-1.5"><History size={12} /> Calls anteriores</p>
            <div className="space-y-2">
              {pastCalls.slice(0, 8).map((c) => (
                <div key={c.id} className="rounded-lg border border-white/8 bg-white/3 px-3 py-2">
                  <div className="flex justify-between gap-2 text-xs">
                    <span className="text-white/80 truncate">{c.title}</span>
                    <span className="text-white/35 flex-shrink-0">{c.suggestionsCount} sugestões{c.keyInsights?.chanceDeFechar ? ` · chance ${c.keyInsights.chanceDeFechar}` : ""}</span>
                  </div>
                  {c.summary && <p className="text-[11px] text-white/45 mt-0.5 line-clamp-2">{c.summary}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {call && transcript.length > 0 && (
          <div className="p-4 border-t border-white/8">
            <p className="text-xs text-white/45 mb-2 uppercase tracking-wider">Pedir sugestão de novo para</p>
            <div className="flex flex-wrap gap-2">
              {transcript
                .filter((l) => l.speaker === "client")
                .slice(-3)
                .map((l) => (
                  <button key={l.id} onClick={() => void askCopilot(l.text)} className="px-2 py-1 rounded bg-white/5 border border-white/8 text-xs text-white/40 hover:text-white/70 hover:border-white/20 truncate max-w-xs">
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
