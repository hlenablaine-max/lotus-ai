"use client";

// Prospecção da LOTUS: acha clínicas com posicionamento fraco, mostra os gargalos e a primeira mensagem
// personalizada de cada uma. O Ícaro aprova e a mensagem sai pelo WhatsApp dele, no ritmo do escudo anti-ban.
// Quem responde conversa com a IA (SDR) até marcar a call, e o Ícaro recebe o aviso.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCheck, ExternalLink, Gift, Globe, Instagram, Loader2, MapPin, MessageCircle, Phone, Radar, Search, ShieldCheck, Star, Trash2, UserCheck, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, Kpi, Notice, btnGhost, btnPrimary, field, formatPhone } from "@/components/whatsapp/ui";

interface Prospect {
  id: string;
  campaign: string;
  name: string;
  phone: string | null;
  site: string | null;
  address: string | null;
  rating: number | null;
  reviews: number | null;
  category: string | null;
  score: number;
  gargalos: Array<{ tipo: string; texto: string; peso: number }> | null;
  message: string | null;
  status: string;
  notes: string | null;
  instagram: string | null;
  followers: number | null;
  lastPostDays: number | null;
  siteUrl: string | null;
  siteMissionId: string | null;
  ownerContact: string | null;
  sentAt: string | null;
  repliedAt: string | null;
}
interface Data {
  prospects: Prospect[];
  counts: Record<string, number>;
  search: { campaign: string; found: number; total: number; log: string[] } | null;
  lotus: { clientId: string; connected: boolean; phone: string | null; queue: number; shield: { newContactsToday: number; sentToday: number; limits: { newContactsPerDay: number; coldPerDay: number } } | null };
}

const TABS = [
  { id: "APROVAR", label: "Para aprovar" },
  { id: "andamento", label: "Enviadas" },
  { id: "ativos", label: "Responderam" },
  { id: "todas", label: "Todas" },
];
const STATUS: Record<string, { label: string; cls: string }> = {
  APROVAR: { label: "Esperando você aprovar", cls: "text-amber-300" },
  NA_FILA: { label: "Na fila do WhatsApp", cls: "text-sky-300" },
  ENVIADO: { label: "Enviada, aguardando resposta", cls: "text-blue-300" },
  RESPONDEU: { label: "Respondeu", cls: "text-emerald-300" },
  CONVERSANDO: { label: "Conversando com a IA", cls: "text-emerald-300" },
  CALL_MARCADA: { label: "Call marcada", cls: "text-violet-300" },
  SEM_INTERESSE: { label: "Sem interesse", cls: "text-muted-foreground" },
  DESCARTADO: { label: "Descartada", cls: "text-muted-foreground" },
  SEM_WHATSAPP: { label: "Sem WhatsApp (telefone fixo)", cls: "text-muted-foreground" },
};

export default function ProspeccaoPage() {
  const [tab, setTab] = useState("APROVAR");
  const [data, setData] = useState<Data | null>(null);
  const [form, setForm] = useState({ niche: "Odontologia", city: "", max: 8 });
  const [msg, setMsg] = useState<{ kind: "ok" | "error" | "warn"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const q = tab === "andamento" ? "" : tab === "todas" ? "" : `?status=${tab}`;
    const res = await fetch(`/api/prospects${q}`).catch(() => null);
    if (!res?.ok) return;
    const d = (await res.json()) as Data;
    if (tab === "andamento") d.prospects = d.prospects.filter((p) => ["NA_FILA", "ENVIADO"].includes(p.status));
    setData(d);
  }, [tab]);

  useEffect(() => {
    void load();
  }, [load]);
  // Enquanto a busca roda, atualiza a cada 4 s; senão, a cada 20 s
  useEffect(() => {
    const t = setInterval(() => document.visibilityState === "visible" && void load(), data?.search ? 4000 : 20_000);
    return () => clearInterval(t);
  }, [load, data?.search]);

  const search = async () => {
    if (!form.city.trim()) return setMsg({ kind: "error", text: "Diga a cidade." });
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/prospects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "buscar", ...form }) });
    const d = (await res.json().catch(() => ({}))) as { reason?: string; campaign?: string };
    setBusy(false);
    setMsg(res.ok ? { kind: "ok", text: `Buscando: ${d.campaign}. A LOTUS abre o Google Maps, olha cada clínica e escreve a mensagem. Leva uns minutos.` } : { kind: "error", text: d.reason ?? "Não foi possível buscar." });
    void load();
  };

  const approve = async (ids: string[]) => {
    if (!ids.length) return;
    if (ids.length > 1 && !window.confirm(`Aprovar ${ids.length} mensagens? Elas saem aos poucos pelo seu WhatsApp, no ritmo do escudo anti-ban (no máximo ${data?.lotus.shield?.limits.newContactsPerDay ?? 15} contatos novos por dia).`)) return;
    const res = await fetch("/api/prospects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "aprovar", ids }) });
    const d = (await res.json().catch(() => ({}))) as { queued?: number; reason?: string };
    setMsg(res.ok ? { kind: "ok", text: `${d.queued} mensagem(ns) na fila. Saem no horário permitido, uma de cada vez, com "digitando…".` } : { kind: "error", text: d.reason ?? "Não foi possível." });
    void load();
  };

  const freeSite = async (id: string) => {
    setMsg({ kind: "ok", text: "Montando o site grátis: a LOTUS pega logo, fotos e cores reais do Instagram, cria o site e a revisora confere. Leva uns 10 a 15 minutos; você recebe um aviso quando ficar pronto e a mensagem é reescrita para oferecer o site." });
    await fetch("/api/prospects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "site", id }) });
    setTimeout(() => void load(), 4000);
  };

  const patch = async (id: string, body: Record<string, unknown>) => {
    await fetch(`/api/prospects/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    void load();
  };

  const c = data?.counts ?? {};
  const toApprove = (data?.prospects ?? []).filter((p) => p.status === "APROVAR");

  return (
    <div className="p-6 h-full overflow-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Radar className="w-6 h-6 text-primary" /> Prospecção
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">A LOTUS acha clínicas com posicionamento fraco, mostra o gargalo de cada uma e escreve uma mensagem personalizada. Você aprova, ela manda pelo seu WhatsApp e a IA conversa até marcar a call. Você é avisado quando alguém responde.</p>
        </div>
        {data && (
          <div className={cn("rounded-xl border px-4 py-3 text-xs space-y-1 min-w-[260px]", data.lotus.connected ? "border-emerald-500/30 bg-emerald-500/[0.06]" : "border-amber-500/30 bg-amber-500/[0.06]")}>
            <div className="flex items-center gap-2 font-semibold text-foreground">
              <span className={cn("w-2 h-2 rounded-full", data.lotus.connected ? "bg-emerald-400 animate-pulse" : "bg-amber-400")} />
              {data.lotus.connected ? `Seu WhatsApp conectado ${formatPhone(data.lotus.phone)}` : "Seu WhatsApp não está conectado"}
            </div>
            {data.lotus.shield && (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" /> Escudo: {data.lotus.shield.newContactsToday}/{data.lotus.shield.limits.newContactsPerDay} contatos novos hoje · {data.lotus.queue} na fila
              </div>
            )}
            <Link href={`/clients/${data.lotus.clientId}?aba=atendimento`} className="inline-flex items-center gap-1 text-primary hover:underline">
              {data.lotus.connected ? "Ver conversas da LOTUS" : "Conectar meu WhatsApp"} <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
        )}
      </div>

      <Card title="Buscar clínicas" subtitle="A LOTUS abre o Google Maps, olha nota, avaliações e site de cada uma e escreve uma mensagem diferente para cada">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_140px_auto] gap-2">
          <input className={field} placeholder="Nicho (ex.: Odontologia, Estética)" value={form.niche} onChange={(e) => setForm({ ...form, niche: e.target.value })} />
          <input className={field} placeholder="Cidade (ex.: Feira de Santana)" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} onKeyDown={(e) => e.key === "Enter" && void search()} />
          <select className={field} value={form.max} onChange={(e) => setForm({ ...form, max: Number(e.target.value) })}>
            {[5, 8, 12, 20].map((n) => (
              <option key={n} value={n}>{n} clínicas</option>
            ))}
          </select>
          <button onClick={() => void search()} disabled={busy || !!data?.search} className={btnPrimary}>
            {busy || data?.search ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Buscar
          </button>
        </div>
        {data?.search && (
          <div className="mt-3 rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs space-y-1">
            <div className="font-semibold text-foreground flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> {data.search.campaign}: {data.search.found} de {data.search.total} prontas
            </div>
            {data.search.log.slice(-4).map((l, i) => (
              <div key={i} className="text-muted-foreground">{l}</div>
            ))}
          </div>
        )}
      </Card>

      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Kpi label="Para aprovar" value={String(c.APROVAR ?? 0)} tone={c.APROVAR ? "warn" : undefined} />
        <Kpi label="Na fila" value={String(c.NA_FILA ?? 0)} />
        <Kpi label="Enviadas" value={String((c.ENVIADO ?? 0) + (c.RESPONDEU ?? 0) + (c.CONVERSANDO ?? 0) + (c.CALL_MARCADA ?? 0) + (c.SEM_INTERESSE ?? 0))} />
        <Kpi label="Responderam" value={String((c.RESPONDEU ?? 0) + (c.CONVERSANDO ?? 0) + (c.CALL_MARCADA ?? 0))} tone={c.RESPONDEU || c.CONVERSANDO ? "good" : undefined} />
        <Kpi label="Calls marcadas" value={String(c.CALL_MARCADA ?? 0)} tone={c.CALL_MARCADA ? "good" : undefined} />
        <Kpi label="Sem interesse" value={String(c.SEM_INTERESSE ?? 0)} />
      </div>

      <div className="flex items-center gap-1 border-b border-border">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={cn("px-4 py-2.5 text-sm font-medium border-b-2 -mb-px", tab === t.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {t.label}
          </button>
        ))}
        {tab === "APROVAR" && toApprove.length > 1 && (
          <button onClick={() => void approve(toApprove.map((p) => p.id))} className={cn(btnGhost, "ml-auto mb-1 text-xs")}>
            <CheckCheck className="w-4 h-4" /> Aprovar todas ({toApprove.length})
          </button>
        )}
      </div>

      {!data && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
        </div>
      )}
      {data && data.prospects.length === 0 && (
        <Card className="text-center py-10">
          <Radar className="w-9 h-9 mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">{tab === "APROVAR" ? "Nenhuma mensagem esperando aprovação. Faça uma busca acima." : "Nada aqui ainda."}</p>
        </Card>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        {data?.prospects.map((p) => (
          <Card key={p.id} className="p-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-foreground truncate">{p.name}</div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground mt-0.5">
                  {p.rating !== null && (
                    <span className="flex items-center gap-1"><Star className="w-3 h-3 text-amber-300" /> {String(p.rating).replace(".", ",")} ({p.reviews ?? "?"})</span>
                  )}
                  {p.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {formatPhone(p.phone)}</span>}
                  {p.site && <a href={/^https?:/.test(p.site) ? p.site : `https://${p.site}`} target="_blank" rel="noreferrer" className="hover:text-primary truncate max-w-[180px]">{p.site}</a>}
                  {p.address && <span className="flex items-center gap-1 truncate max-w-[220px]"><MapPin className="w-3 h-3" /> {p.address}</span>}
                </div>
                {p.instagram && (
                  <a href={`https://instagram.com/${p.instagram}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[11px] text-pink-300 hover:underline mt-1">
                    <Instagram className="w-3 h-3" /> @{p.instagram}
                    {p.followers !== null && <span className="text-muted-foreground">· {p.followers.toLocaleString("pt-BR")} seguidores</span>}
                    {p.lastPostDays !== null && <span className="text-muted-foreground">· último post há {p.lastPostDays} d</span>}
                  </a>
                )}
              </div>
              <div className="text-right">
                <div className={cn("text-lg font-bold", p.score >= 50 ? "text-emerald-300" : p.score >= 25 ? "text-amber-300" : "text-muted-foreground")}>{p.score}</div>
                <div className="text-[10px] text-muted-foreground">precisa da LOTUS</div>
              </div>
            </div>
            {!!p.gargalos?.length && (
              <div className="flex flex-wrap gap-1.5">
                {p.gargalos.map((g) => (
                  <span key={g.tipo} className="text-[11px] px-2 py-0.5 rounded-md bg-red-500/10 border border-red-500/25 text-red-200">{g.texto}</span>
                ))}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              {p.siteUrl ? (
                <a href={p.siteUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-200 hover:bg-emerald-500/25">
                  <Globe className="w-3 h-3" /> Site grátis pronto: abrir
                </a>
              ) : p.siteMissionId ? (
                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-primary/10 border border-primary/30 text-primary">
                  <Loader2 className="w-3 h-3 animate-spin" /> Montando o site grátis (logo, fotos e cores reais)…
                </span>
              ) : p.instagram && ["APROVAR", "ENVIADO", "RESPONDEU", "CONVERSANDO"].includes(p.status) ? (
                <button onClick={() => void freeSite(p.id)} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-border text-foreground hover:border-primary/50" title="A LOTUS monta um site com a marca real da clínica para usar como motivo da call">
                  <Gift className="w-3 h-3 text-primary" /> Preparar site grátis
                </button>
              ) : null}
              {p.ownerContact && (
                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-violet-500/15 border border-violet-500/30 text-violet-200">
                  <UserCheck className="w-3 h-3" /> Responsável: {p.ownerContact}
                </span>
              )}
            </div>
            {p.status === "APROVAR" ? (
              <textarea className={cn(field, "text-xs resize-y")} rows={4} defaultValue={p.message ?? ""} key={`${p.id}-${p.message}`} onBlur={(e) => e.target.value !== (p.message ?? "") && void patch(p.id, { message: e.target.value })} />
            ) : (
              p.message && <p className="text-xs text-muted-foreground whitespace-pre-wrap border-l-2 border-border pl-3">{p.message}</p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn("text-[11px] font-medium", STATUS[p.status]?.cls)}>{STATUS[p.status]?.label ?? p.status}</span>
              <span className="text-[10px] text-muted-foreground">{p.campaign}</span>
              <div className="ml-auto flex gap-2">
                {p.status === "APROVAR" && (
                  <>
                    <button onClick={() => void patch(p.id, { status: "DESCARTADO" })} className={cn(btnGhost, "py-1.5 text-xs")}>
                      <Trash2 className="w-3.5 h-3.5" /> Descartar
                    </button>
                    <button onClick={() => void approve([p.id])} disabled={!data?.lotus.connected} title={data?.lotus.connected ? "" : "Conecte seu WhatsApp primeiro"} className={cn(btnPrimary, "py-1.5 text-xs")}>
                      <CheckCheck className="w-3.5 h-3.5" /> Aprovar e enviar
                    </button>
                  </>
                )}
                {["RESPONDEU", "CONVERSANDO", "CALL_MARCADA", "ENVIADO"].includes(p.status) && data && (
                  <Link href={`/clients/${data.lotus.clientId}?aba=atendimento`} className={cn(btnGhost, "py-1.5 text-xs")}>
                    <MessageCircle className="w-3.5 h-3.5" /> Ver conversa
                  </Link>
                )}
                {["RESPONDEU", "CONVERSANDO"].includes(p.status) && (
                  <button onClick={() => void patch(p.id, { status: "SEM_INTERESSE" })} className={cn(btnGhost, "py-1.5 text-xs")}>
                    <X className="w-3.5 h-3.5" /> Sem interesse
                  </button>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Card title="Como a LOTUS protege o seu número" className="text-xs text-muted-foreground">
        <ul className="list-disc pl-5 space-y-1">
          <li>Nada sai sem você aprovar. Cada mensagem é escrita para aquela clínica (nunca o mesmo texto para muita gente: o escudo barra).</li>
          <li>Uma mensagem por vez, com &quot;digitando…&quot; antes e intervalo de 45 a 90 s para quem nunca falou com você.</li>
          <li>No máximo {data?.lotus.shield?.limits.newContactsPerDay ?? 15} contatos novos por dia e só no horário permitido (Automações do cliente LOTUS).</li>
          <li>Telefone fixo fica de fora (sem WhatsApp). Quem pede para parar sai da lista e a IA para de responder.</li>
        </ul>
      </Card>
    </div>
  );
}
