"use client";

// Caixa de entrada do WhatsApp da clínica dentro da LOTUS: conversas, mensagens, envio e a ficha do lead/paciente.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, Check, CheckCheck, Copy, Loader2, MessageSquarePlus, Search, Send, Sparkles, UserRound, Wand2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChannelBadge, ChannelFilter, SOURCE_META, STAGE_META, SourcePill, brl, btnGhost, btnSoft, field, fmtDate, fmtDayLabel, fmtTime, fmtWait, fmtWhen, formatPhone } from "./ui";

interface Row {
  id: string;
  name: string | null;
  phone: string | null;
  source: string;
  channel: string;
  sourceBy: string | null;
  campaign: string | null;
  lastPreview: string | null;
  lastMessageAt: string;
  unread: number;
  waiting: boolean;
  waitingSince: string | null;
  isPatient: boolean;
  fromHistory: boolean;
  lead: { id: string; stage: string; value: number | null; appointmentAt: string | null } | null;
}
interface Msg {
  id: string;
  direction: "IN" | "OUT";
  body: string;
  kind: string;
  sentBy: string | null;
  sentAt: string;
}
interface Lead {
  id: string;
  name: string;
  stage: string;
  value: number | null;
  quotedValue: number | null;
  appointmentAt: string | null;
  interest: string | null;
  lostReason: string | null;
  source: string;
  campaign: string | null;
  viaLotus: boolean;
  createdAt: string;
}
interface Patient {
  id: string;
  name: string;
  totalSpent: number;
  visits: number;
  lastVisitAt: string | null;
  firstVisitAt: string | null;
  lastProcedure: string | null;
  origin: string;
  optOut: boolean;
  referralCode: string | null;
  purchases: Array<{ id: string; date: string; value: number; procedure: string | null }>;
}
interface Detail {
  conversation: { id: string; name: string | null; phone: string | null; source: string; sourceBy: string | null; campaign: string | null; aiHint: string | null; firstResponseMin: number | null; fromHistory: boolean; leadId: string | null; aiDraft: string | null; aiPausedUntil: string | null; channel: string };
  messages: Msg[];
  lead: Lead | null;
  patient: Patient | null;
  pending: Array<{ id: string; kind: string; body: string; scheduledFor: string }>;
  history: Array<{ id: string; stage: string; value: number | null; createdAt: string; source: string }>;
}
interface Suggestion {
  temperatura?: string;
  interesse?: string;
  objecao?: string | null;
  resumo?: string;
  proximoPasso?: string;
  resposta?: string;
}

const FILTERS = [
  { id: "todas", label: "Todas" },
  { id: "aguardando", label: "Esperando resposta" },
  { id: "leads", label: "Leads abertos" },
  { id: "fechados", label: "Fecharam" },
  { id: "base", label: "Pacientes" },
];
const STAGE_ORDER = ["NOVO", "EM_CONTATO", "AGENDADO", "COMPARECEU", "FECHADO", "PERDIDO"];
const AVATAR_COLORS = ["bg-blue-500/25 text-blue-200", "bg-violet-500/25 text-violet-200", "bg-pink-500/25 text-pink-200", "bg-emerald-500/25 text-emerald-200", "bg-amber-500/25 text-amber-200", "bg-teal-500/25 text-teal-200"];

function initials(name: string | null, phone: string | null) {
  const n = (name ?? "").trim();
  if (n) return n.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
  return (phone ?? "?").slice(-2);
}
function colorFor(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const SENT_BY: Record<string, string> = { lotus: "pela LOTUS", automacao: "automação", clinica: "" };

export function Inbox({ clientId, connected, initialFilter = "todas" }: { clientId: string; connected: boolean; initialFilter?: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [filter, setFilter] = useState(initialFilter);
  const [channel, setChannel] = useState("");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const lastCount = useRef(0);

  const loadList = useCallback(async () => {
    const sp = new URLSearchParams({ filtro: filter });
    if (channel) sp.set("canal", channel);
    if (q.trim()) sp.set("q", q.trim());
    const res = await fetch(`/api/clients/${clientId}/whatsapp/conversations?${sp}`).catch(() => null);
    if (res?.ok) setRows(((await res.json()) as { conversations: Row[] }).conversations);
    setLoadingList(false);
  }, [clientId, filter, q, channel]);

  const loadDetail = useCallback(async (id: string) => {
    const res = await fetch(`/api/conversations/${id}`).catch(() => null);
    if (res?.ok) setDetail((await res.json()) as Detail);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void loadList(), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [loadList, q]);

  // Atualiza sozinho: lista a cada 5 s, conversa aberta a cada 3 s (só com a janela visível)
  useEffect(() => {
    const a = setInterval(() => document.visibilityState === "visible" && void loadList(), 5000);
    const b = setInterval(() => document.visibilityState === "visible" && selected && void loadDetail(selected), 3000);
    return () => {
      clearInterval(a);
      clearInterval(b);
    };
  }, [loadList, loadDetail, selected]);

  useEffect(() => {
    if (!selected) return;
    setDetail(null);
    setSuggestion(null);
    setText("");
    lastCount.current = 0;
    void loadDetail(selected);
  }, [selected, loadDetail]);

  useEffect(() => {
    const n = detail?.messages.length ?? 0;
    if (n !== lastCount.current) {
      endRef.current?.scrollIntoView({ block: "end" });
      lastCount.current = n;
    }
  }, [detail?.messages.length]);

  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2500);
  };

  const send = async () => {
    if (!selected || !text.trim() || sending) return;
    setSending(true);
    setError(null);
    const body = text.trim();
    const res = await fetch(`/api/conversations/${selected}/send`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: body }) });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setSending(false);
    if (!res.ok) return setError(data.error ?? "Não foi possível enviar.");
    setText("");
    setSuggestion(null);
    void loadDetail(selected);
    void loadList();
  };

  const suggest = async () => {
    if (!selected) return;
    setSuggesting(true);
    setError(null);
    const res = await fetch(`/api/conversations/${selected}/suggest`, { method: "POST" });
    const data = (await res.json().catch(() => ({}))) as { suggestion?: Suggestion; error?: string };
    setSuggesting(false);
    if (!res.ok || !data.suggestion) return setError(data.error ?? "A IA não respondeu.");
    setSuggestion(data.suggestion);
    void loadDetail(selected);
  };

  const patch = async (payload: Record<string, unknown>) => {
    if (!selected) return null;
    const res = await fetch(`/api/conversations/${selected}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = (await res.json().catch(() => ({}))) as { referralLink?: string | null; error?: string };
    if (!res.ok) setError(data.error ?? "Não foi possível salvar.");
    void loadDetail(selected);
    void loadList();
    return data;
  };

  const setStage = async (stage: string) => {
    let value: string | null | undefined;
    if (stage === "FECHADO") {
      value = window.prompt("Quanto fechou? (em R$)", detail?.lead?.value?.toString() ?? detail?.lead?.quotedValue?.toString() ?? "");
      if (value === null) return;
    }
    let lostReason: string | null | undefined;
    if (stage === "PERDIDO") {
      lostReason = window.prompt("Por que não fechou? (ex.: preço, distância, sumiu)", detail?.lead?.lostReason ?? "");
      if (lostReason === null) return;
    }
    await patch({ lead: { stage, ...(value !== undefined ? { value } : {}), ...(lostReason !== undefined ? { lostReason } : {}) } });
    flash(`Etapa: ${STAGE_META[stage]?.label}`);
  };

  const grouped = useMemo(() => {
    const out: Array<{ day: string; items: Msg[] }> = [];
    for (const m of detail?.messages ?? []) {
      const day = fmtDayLabel(m.sentAt);
      const last = out[out.length - 1];
      if (last && last.day === day) last.items.push(m);
      else out.push({ day, items: [m] });
    }
    return out;
  }, [detail?.messages]);

  const sel = rows.find((r) => r.id === selected) ?? null;
  const conv = detail?.conversation;

  return (
    <div className="relative rounded-xl border border-border bg-card overflow-hidden grid grid-cols-1 md:grid-cols-[320px_1fr] xl:grid-cols-[320px_1fr_300px]" style={{ height: "calc(100vh - 300px)", minHeight: 560 }}>
      {/* Lista */}
      <div className="border-r border-border flex flex-col min-h-0">
        <div className="p-3 space-y-2 border-b border-border">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input className={cn(field, "pl-9")} placeholder="Buscar nome, número ou mensagem" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <ChannelFilter value={channel} onChange={setChannel} />
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {FILTERS.map((f) => (
              <button key={f.id} onClick={() => setFilter(f.id)} className={cn("px-2.5 py-1 rounded-full text-[11px] whitespace-nowrap border", filter === f.id ? "bg-primary/20 border-primary/40 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loadingList && (
            <div className="p-6 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Carregando conversas…
            </div>
          )}
          {!loadingList && rows.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">
              {connected ? "Nenhuma conversa aqui ainda. Assim que alguém mandar mensagem, ela aparece na hora." : "Conecte o WhatsApp (acima) para as conversas aparecerem aqui."}
            </div>
          )}
          {rows.map((r) => (
            <button key={r.id} onClick={() => setSelected(r.id)} className={cn("w-full text-left px-3 py-3 flex gap-3 border-b border-border/50 hover:bg-muted/30 transition-colors", selected === r.id && "bg-primary/10")}>
              <div className={cn("w-10 h-10 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0", colorFor(r.id))}>{initials(r.name, r.phone)}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground truncate">{r.name || formatPhone(r.phone) || "Contato"}</span>
                  <span className={cn("ml-auto text-[10px] flex-shrink-0", r.unread ? "text-emerald-400 font-semibold" : "text-muted-foreground")}>{fmtWhen(r.lastMessageAt)}</span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-muted-foreground truncate flex-1">{r.lastPreview}</span>
                  {r.unread > 0 && <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-500 text-[10px] font-bold text-white flex items-center justify-center">{r.unread}</span>}
                </div>
                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                  <ChannelBadge channel={r.channel} />
                  {!r.fromHistory || r.lead ? <SourcePill source={r.source} campaign={r.campaign} /> : null}
                  {r.lead && <span className={cn("text-[10px] font-medium", STAGE_META[r.lead.stage]?.cls)}>{STAGE_META[r.lead.stage]?.label}</span>}
                  {r.isPatient && <span className="text-[10px] text-sky-300">paciente</span>}
                  {r.waiting && r.waitingSince && (
                    <span className={cn("text-[10px] font-medium ml-auto", Date.now() - new Date(r.waitingSince).getTime() > 3_600_000 ? "text-red-400" : "text-amber-400")}>esperando {fmtWait(r.waitingSince)}</span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Conversa */}
      <div className="flex flex-col min-h-0 bg-background/30">
        {!selected && (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-muted-foreground">
            <MessageSquarePlus className="w-10 h-10 mb-3 opacity-40" />
            <p className="text-sm">Escolha uma conversa para ver tudo o que foi falado e responder por aqui.</p>
          </div>
        )}
        {selected && (
          <>
            <div className="px-4 py-3 border-b border-border flex items-center gap-3">
              <div className={cn("w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold", colorFor(selected))}>{initials(sel?.name ?? conv?.name ?? null, sel?.phone ?? conv?.phone ?? null)}</div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-foreground truncate">{conv?.name || sel?.name || formatPhone(conv?.phone ?? sel?.phone) || "Contato"}</div>
                <div className="text-[11px] text-muted-foreground">{formatPhone(conv?.phone ?? sel?.phone)}</div>
              </div>
              {conv && (
                <div className="ml-auto flex items-center gap-2">
                  <SourcePill source={conv.source} campaign={conv.campaign} />
                  <button
                    onClick={() => void patch({ aiPauseHours: conv.aiPausedUntil && new Date(conv.aiPausedUntil) > new Date() ? 0 : 24 }).then(() => flash(conv.aiPausedUntil && new Date(conv.aiPausedUntil) > new Date() ? "IA retomada nesta conversa" : "IA pausada por 24 h nesta conversa"))}
                    className={cn("text-[10px] px-2 py-0.5 rounded-md border", conv.aiPausedUntil && new Date(conv.aiPausedUntil) > new Date() ? "border-amber-500/40 text-amber-300" : "border-violet-500/40 text-violet-300")}
                    title="A IA atendente só age se estiver ligada em Automações"
                  >
                    {conv.aiPausedUntil && new Date(conv.aiPausedUntil) > new Date() ? "IA pausada · retomar" : "IA ativa · pausar"}
                  </button>
                  {conv.sourceBy && <span className="hidden lg:inline text-[10px] text-muted-foreground">{conv.sourceBy === "saudacao" ? "pela saudação" : conv.sourceBy === "base" ? "está na base" : conv.sourceBy === "campanha" ? "respondeu campanha" : conv.sourceBy === "codigo" ? "código de indicação" : "marcado à mão"}</span>}
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              {!detail && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" /> Abrindo conversa…
                </div>
              )}
              {grouped.map((g) => (
                <div key={g.day} className="space-y-1.5">
                  <div className="flex justify-center">
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground bg-muted/40 border border-border rounded-full px-2.5 py-0.5">{g.day}</span>
                  </div>
                  {g.items.map((m) => (
                    <div key={m.id} className={cn("flex", m.direction === "OUT" ? "justify-end" : "justify-start")}>
                      <div className={cn("max-w-[78%] rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words shadow-sm", m.direction === "OUT" ? "bg-emerald-600/25 border border-emerald-500/25 text-foreground rounded-br-md" : "bg-muted/60 border border-border text-foreground rounded-bl-md")}>
                        {m.kind !== "texto" && <span className="text-[10px] uppercase text-muted-foreground mr-1">{m.kind}</span>}
                        {m.body}
                        <div className="flex items-center justify-end gap-1 mt-1 text-[10px] text-muted-foreground">
                          {m.sentBy && SENT_BY[m.sentBy] && <span className={m.sentBy === "automacao" ? "text-violet-300" : "text-primary"}>{SENT_BY[m.sentBy]}</span>}
                          <span>{fmtTime(m.sentAt)}</span>
                          {m.direction === "OUT" && <CheckCheck className="w-3 h-3" />}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
              <div ref={endRef} />
            </div>

            {conv?.aiDraft && (
              <div className="mx-4 mb-2 rounded-xl border border-violet-400/50 bg-violet-500/15 p-3 text-xs space-y-2">
                <div className="flex items-center gap-2 text-violet-200 font-semibold"><Sparkles className="w-3.5 h-3.5" /> A IA escreveu esta resposta. Envia?</div>
                <p className="text-foreground whitespace-pre-wrap">{conv.aiDraft}</p>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => void patch({ sendDraft: true }).then(() => flash("Resposta da IA enviada"))} className="px-3 py-1.5 rounded-lg bg-violet-600 text-white text-xs font-medium hover:bg-violet-500">Enviar</button>
                  <button onClick={() => { setText(conv.aiDraft ?? ""); void patch({ discardDraft: true }); }} className={cn(btnGhost, "py-1.5 text-xs")}>Editar antes</button>
                  <button onClick={() => void patch({ discardDraft: true })} className="px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-red-300">Descartar</button>
                </div>
              </div>
            )}
            {suggestion && (
              <div className="mx-4 mb-2 rounded-xl border border-violet-500/30 bg-violet-500/10 p-3 text-xs space-y-1.5">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-violet-300" />
                  <span className="font-semibold text-violet-200">Leitura da IA</span>
                  {suggestion.temperatura && (
                    <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase", suggestion.temperatura === "quente" ? "bg-red-500/20 text-red-300" : suggestion.temperatura === "morno" ? "bg-amber-500/20 text-amber-300" : "bg-sky-500/20 text-sky-300")}>{suggestion.temperatura}</span>
                  )}
                  <button onClick={() => setSuggestion(null)} className="ml-auto text-muted-foreground hover:text-foreground" aria-label="Fechar">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                {suggestion.resumo && <p className="text-muted-foreground">{suggestion.resumo}</p>}
                <p className="text-muted-foreground">
                  {suggestion.interesse && <>Quer: <span className="text-foreground">{suggestion.interesse}</span>. </>}
                  {suggestion.objecao && <>Objeção: <span className="text-foreground">{suggestion.objecao}</span>. </>}
                  {suggestion.proximoPasso && <>Próximo passo: <span className="text-foreground">{suggestion.proximoPasso}</span></>}
                </p>
                {suggestion.resposta && (
                  <button onClick={() => setText(suggestion.resposta ?? "")} className="w-full text-left rounded-lg bg-card/80 border border-border p-2 text-foreground hover:border-violet-400/50">
                    {suggestion.resposta}
                    <span className="block text-[10px] text-violet-300 mt-1">Clique para usar (você pode editar antes de enviar)</span>
                  </button>
                )}
              </div>
            )}
            {error && <div className="mx-4 mb-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</div>}
            <div className="p-3 border-t border-border flex items-end gap-2">
              <button onClick={() => void suggest()} disabled={suggesting || !detail?.messages.length} className={cn(btnGhost, "h-10")} title="A IA lê a conversa e sugere a melhor resposta para agendar">
                {suggesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4 text-violet-300" />}
                <span className="hidden lg:inline">Sugerir resposta</span>
              </button>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                rows={Math.min(5, Math.max(1, text.split("\n").length))}
                placeholder={connected || conv?.channel === "instagram" ? "Escreva uma mensagem (Enter envia, Shift+Enter pula linha)" : "Conecte o WhatsApp para enviar"}
                disabled={!connected && conv?.channel !== "instagram"}
                className={cn(field, "resize-none min-h-[40px]")}
              />
              <button onClick={() => void send()} disabled={(!connected && conv?.channel !== "instagram") || sending || !text.trim()} className="h-10 w-10 flex-shrink-0 rounded-full bg-emerald-600 text-white flex items-center justify-center hover:bg-emerald-500 disabled:opacity-40" aria-label="Enviar">
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Ficha do lead e do paciente */}
      <div className="hidden xl:flex flex-col border-l border-border min-h-0 overflow-y-auto">
        {!detail && <div className="p-5 text-xs text-muted-foreground">A ficha do contato aparece aqui.</div>}
        {detail && (
          <div className="p-4 space-y-4">
            {detail.lead ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Oportunidade</h4>
                  {detail.lead.viaLotus && <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary border border-primary/30">veio pela LOTUS</span>}
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {STAGE_ORDER.map((s) => (
                    <button key={s} onClick={() => void setStage(s)} className={cn("px-1.5 py-1.5 rounded-md text-[10px] font-medium border transition-colors", detail.lead!.stage === s ? "bg-primary/20 border-primary/40 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>
                      {STAGE_META[s].label}
                    </button>
                  ))}
                </div>
                <label className="block">
                  <span className="text-[11px] text-muted-foreground flex items-center gap-1"><CalendarClock className="w-3 h-3" /> Consulta marcada</span>
                  <input type="datetime-local" className={cn(field, "mt-1 text-xs")} defaultValue={toLocalInput(detail.lead.appointmentAt)} key={`ap-${detail.lead.id}-${detail.lead.appointmentAt}`} onBlur={(e) => e.target.value !== toLocalInput(detail.lead!.appointmentAt) && void patch({ lead: { appointmentAt: e.target.value ? new Date(e.target.value).toISOString() : null } }).then(() => flash("Consulta salva"))} />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="text-[11px] text-muted-foreground">Orçamento (R$)</span>
                    <input className={cn(field, "mt-1 text-xs")} defaultValue={detail.lead.quotedValue ?? ""} key={`q-${detail.lead.id}-${detail.lead.quotedValue}`} onBlur={(e) => e.target.value !== String(detail.lead!.quotedValue ?? "") && void patch({ lead: { quotedValue: e.target.value } }).then(() => flash("Orçamento salvo"))} />
                  </label>
                  <label className="block">
                    <span className="text-[11px] text-muted-foreground">Fechou (R$)</span>
                    <input className={cn(field, "mt-1 text-xs")} defaultValue={detail.lead.value ?? ""} key={`v-${detail.lead.id}-${detail.lead.value}`} onBlur={(e) => e.target.value !== String(detail.lead!.value ?? "") && void patch({ lead: { value: e.target.value } }).then(() => flash("Valor salvo"))} />
                  </label>
                </div>
                <label className="block">
                  <span className="text-[11px] text-muted-foreground">Interesse</span>
                  <input className={cn(field, "mt-1 text-xs")} placeholder="ex.: implante, botox" defaultValue={detail.lead.interest ?? ""} key={`i-${detail.lead.id}-${detail.lead.interest}`} onBlur={(e) => e.target.value !== (detail.lead!.interest ?? "") && void patch({ lead: { interest: e.target.value } })} />
                </label>
                <label className="block">
                  <span className="text-[11px] text-muted-foreground">Origem (corrigir se precisar)</span>
                  <select className={cn(field, "mt-1 text-xs")} value={detail.lead.source} onChange={(e) => void patch({ lead: { source: e.target.value } }).then(() => flash("Origem corrigida"))}>
                    {Object.entries(SOURCE_META).map(([id, m]) => (
                      <option key={id} value={id}>{m.label}</option>
                    ))}
                  </select>
                </label>
                <div className="text-[11px] text-muted-foreground space-y-0.5">
                  <div>Chegou em {fmtDate(detail.lead.createdAt)} às {fmtTime(detail.lead.createdAt)}</div>
                  {detail.conversation.firstResponseMin !== null && <div>Primeira resposta em {detail.conversation.firstResponseMin < 1 ? "menos de 1 min" : `${Math.round(detail.conversation.firstResponseMin)} min`}</div>}
                  {detail.lead.lostReason && <div className="text-red-300">Motivo da perda: {detail.lead.lostReason}</div>}
                  {detail.conversation.aiHint && <div className="text-violet-300">IA: {detail.conversation.aiHint}</div>}
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground space-y-2">
                <p>{detail.conversation.fromHistory ? "Conversa que já existia antes de conectar." : "Esta conversa não é um lead."}</p>
                <button onClick={() => void patch({ createLead: true }).then(() => flash("Lead criado"))} className={cn(btnSoft, "w-full text-xs")}>Transformar em lead</button>
              </div>
            )}

            <div className="border-t border-border pt-4 space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5"><UserRound className="w-3.5 h-3.5" /> Paciente</h4>
              {detail.patient ? (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg bg-muted/30 border border-border p-2">
                      <div className="text-sm font-bold text-emerald-400">{brl(detail.patient.totalSpent)}</div>
                      <div className="text-[10px] text-muted-foreground">já gastou (LTV)</div>
                    </div>
                    <div className="rounded-lg bg-muted/30 border border-border p-2">
                      <div className="text-sm font-bold text-foreground">{detail.patient.visits}x</div>
                      <div className="text-[10px] text-muted-foreground">{detail.patient.visits >= 2 ? "voltou e comprou de novo" : "compras"}</div>
                    </div>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {detail.patient.lastVisitAt ? `Última visita: ${fmtDate(detail.patient.lastVisitAt)}` : "Sem visita registrada"}
                    {detail.patient.lastProcedure ? ` · ${detail.patient.lastProcedure}` : ""}
                    <br />
                    {detail.patient.origin === "lotus" ? "Paciente que chegou pela LOTUS" : "Paciente da base da clínica"}
                  </div>
                  {detail.patient.purchases.length > 0 && (
                    <div className="space-y-1">
                      {detail.patient.purchases.map((p) => (
                        <div key={p.id} className="flex justify-between text-[11px]">
                          <span className="text-muted-foreground truncate">{fmtDate(p.date)} {p.procedure ?? ""}</span>
                          <span className="text-foreground">{brl(p.value)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={async () => {
                      const r = await patch({ referral: true });
                      if (r?.referralLink) {
                        await navigator.clipboard.writeText(r.referralLink).catch(() => undefined);
                        flash("Link de indicação copiado");
                      }
                    }}
                    className={cn(btnGhost, "w-full text-xs")}
                  >
                    <Copy className="w-3.5 h-3.5" /> Copiar link de indicação deste paciente
                  </button>
                  <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <input type="checkbox" checked={detail.patient.optOut} onChange={(e) => void patch({ optOut: e.target.checked })} /> Não mandar mensagens automáticas
                  </label>
                </>
              ) : (
                <p className="text-[11px] text-muted-foreground">Ainda não é paciente. Quando fechar, entra na base sozinho com o valor da compra.</p>
              )}
            </div>

            {detail.pending.length > 0 && (
              <div className="border-t border-border pt-4 space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Mensagens programadas</h4>
                {detail.pending.map((p) => (
                  <div key={p.id} className="rounded-lg border border-violet-500/20 bg-violet-500/5 p-2 text-[11px]">
                    <div className="text-violet-300">{fmtWhen(p.scheduledFor)} {fmtTime(p.scheduledFor)}</div>
                    <div className="text-muted-foreground line-clamp-3">{p.body}</div>
                  </div>
                ))}
              </div>
            )}

            {detail.history.length > 0 && (
              <div className="border-t border-border pt-4 space-y-1.5">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Vezes anteriores</h4>
                {detail.history.map((h) => (
                  <div key={h.id} className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground">{fmtDate(h.createdAt)}</span>
                    <span className={STAGE_META[h.stage]?.cls}>{STAGE_META[h.stage]?.label}{h.value ? ` ${brl(h.value)}` : ""}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {toast && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-emerald-600 text-white text-xs px-3 py-1.5 shadow-lg flex items-center gap-1.5">
          <Check className="w-3.5 h-3.5" /> {toast}
        </div>
      )}
    </div>
  );
}
