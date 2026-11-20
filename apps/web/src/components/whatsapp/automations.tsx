"use client";

// Automações do WhatsApp da clínica: o que a LOTUS manda sozinha, com o texto de cada uma e o que já saiu.
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Ban, CalendarCheck, Cake, Gift, Hand, Loader2, RotateCcw, Save, ShieldCheck, Star, Wallet } from "lucide-react";
import { AiBlock, ReportBlock } from "./ai-settings";
import { cn } from "@/lib/utils";
import { Card, Notice, Toggle, btnGhost, btnPrimary, field, fmtDate, fmtTime } from "./ui";

type Settings = {
  janela: { inicio: number; fim: number };
  porHora: number;
  boasVindas: { on: boolean; texto: string };
  lembrete: { on: boolean; texto1d: string; texto2h: string };
  avaliacao: { on: boolean; link: string; texto: string; horasDepois: number };
  orcamento: { on: boolean; texto: string; diasSemResposta: number };
  retorno: { on: boolean; meses: number; texto: string; porDia: number };
  aniversario: { on: boolean; texto: string };
  indicacao: { on: boolean; texto: string; diasDepois: number };
  ia: { on: boolean; modo: "automatico" | "rascunho"; conhecimento: string; agenda: { dias: number[]; inicio: string; fim: string; duracaoMin: number; almoco: string }; pausaHumanoHoras: number };
  relatorio: { on: boolean; telefone: string; dia: number; hora: number };
};
interface Outbox {
  items: Array<{ id: string; label: string; status: string; body: string; phone: string | null; scheduledFor: string; sentAt: string | null; error: string | null; campaignId: string | null }>;
  summary: Record<string, { label: string; sent: number; pending: number; failed: number }>;
}

const STATUS: Record<string, { label: string; cls: string }> = {
  PENDENTE: { label: "na fila", cls: "text-amber-300" },
  ENVIANDO: { label: "enviando", cls: "text-amber-300" },
  ENVIADO: { label: "enviada", cls: "text-emerald-300" },
  FALHOU: { label: "falhou", cls: "text-red-300" },
  CANCELADO: { label: "cancelada", cls: "text-muted-foreground" },
};

function Block({ icon, title, why, on, onToggle, children }: { icon: ReactNode; title: string; why: string; on: boolean; onToggle: (v: boolean) => void; children: ReactNode }) {
  return (
    <div className={cn("rounded-xl border p-4 transition-colors", on ? "border-emerald-500/30 bg-emerald-500/[0.04]" : "border-border bg-card")}>
      <div className="flex items-start gap-3">
        <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0", on ? "bg-emerald-500/15 text-emerald-300" : "bg-muted/50 text-muted-foreground")}>{icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <h4 className="text-sm font-semibold text-foreground">{title}</h4>
            <div className="ml-auto flex items-center gap-2">
              <span className={cn("text-[11px]", on ? "text-emerald-300" : "text-muted-foreground")}>{on ? "Ligada" : "Desligada"}</span>
              <Toggle on={on} onChange={onToggle} label={title} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{why}</p>
          <div className="mt-3 space-y-2">{children}</div>
        </div>
      </div>
    </div>
  );
}

const Num = ({ value, onChange, suffix, min = 1, max = 99 }: { value: number; onChange: (n: number) => void; suffix: string; min?: number; max?: number }) => (
  <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
    <input type="number" min={min} max={max} value={value} onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value) || min)))} className={cn(field, "w-20 text-xs py-1.5")} />
    {suffix}
  </label>
);

export function Automations({ clientId, initial, connected, isLotus = false }: { clientId: string; initial: Settings; connected: boolean; isLotus?: boolean }) {
  const [s, setS] = useState<Settings>(initial);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [outbox, setOutbox] = useState<Outbox | null>(null);

  useEffect(() => setS(initial), [initial]);
  const set = <K extends keyof Settings>(k: K, patch: Partial<Settings[K]>) => setS((cur) => ({ ...cur, [k]: { ...(cur[k] as object), ...patch } }) as Settings);

  const loadOutbox = useCallback(async () => {
    const res = await fetch(`/api/clients/${clientId}/whatsapp/outbox`).catch(() => null);
    if (res?.ok) setOutbox((await res.json()) as Outbox);
  }, [clientId]);
  useEffect(() => {
    void loadOutbox();
    const t = setInterval(() => document.visibilityState === "visible" && void loadOutbox(), 20_000);
    return () => clearInterval(t);
  }, [loadOutbox]);

  const save = async () => {
    setSaving(true);
    setMsg(null);
    const res = await fetch(`/api/clients/${clientId}/whatsapp`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ settings: s }) });
    setSaving(false);
    setMsg(res.ok ? { kind: "ok", text: "Automações salvas. A LOTUS confere a cada minuto o que precisa sair." } : { kind: "error", text: "Não foi possível salvar." });
  };

  const cancelPending = async (query: string) => {
    await fetch(`/api/clients/${clientId}/whatsapp/outbox?${query}`, { method: "DELETE" });
    void loadOutbox();
  };

  const vars = <p className="text-[10px] text-muted-foreground">Palavras trocadas na hora: {"{primeiro_nome}"} {"{nome}"} {"{clinica}"}</p>;
  const pendingTotal = outbox ? Object.values(outbox.summary).reduce((a, r) => a + r.pending, 0) : 0;

  return (
    <div className="grid grid-cols-1 2xl:grid-cols-[1fr_380px] gap-5">
      <div className="space-y-3">
        {!connected && <Notice kind="warn">As automações só enviam com o WhatsApp da clínica conectado e o aplicativo LOTUS aberto neste computador.</Notice>}
        <Card className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <ShieldCheck className="w-5 h-5 text-emerald-300" />
            <div className="flex-1 min-w-[200px]">
              <div className="text-sm font-semibold text-foreground">Proteção do número</div>
              <p className="text-xs text-muted-foreground">Mensagens automáticas saem uma de cada vez, com intervalo, só no horário abaixo. Boas-vindas saem a qualquer hora.</p>
            </div>
            <label className="text-xs text-muted-foreground flex items-center gap-2">
              Das <input type="number" min={0} max={23} value={s.janela.inicio} onChange={(e) => setS({ ...s, janela: { ...s.janela, inicio: Number(e.target.value) } })} className={cn(field, "w-16 py-1.5 text-xs")} />
              às <input type="number" min={1} max={24} value={s.janela.fim} onChange={(e) => setS({ ...s, janela: { ...s.janela, fim: Number(e.target.value) } })} className={cn(field, "w-16 py-1.5 text-xs")} /> h
            </label>
            <Num value={s.porHora} onChange={(n) => setS({ ...s, porHora: n })} suffix="por hora, no máximo" max={60} />
          </div>
        </Card>

        <AiBlock value={s.ia} onChange={(ia) => setS({ ...s, ia })} lotus={isLotus} />
        {!isLotus && (<>
        <ReportBlock clientId={clientId} value={s.relatorio} onChange={(relatorio) => setS({ ...s, relatorio })} />

        <Block icon={<Hand className="w-4 h-4" />} title="Boas-vindas na hora" why="Responde em segundos quando um lead novo chama (inclusive de madrugada). Quem responde primeiro agenda mais." on={s.boasVindas.on} onToggle={(v) => set("boasVindas", { on: v })}>
          <textarea className={cn(field, "text-xs resize-none")} rows={2} value={s.boasVindas.texto} onChange={(e) => set("boasVindas", { texto: e.target.value })} />
          {vars}
        </Block>

        <Block icon={<CalendarCheck className="w-4 h-4" />} title="Lembrete da consulta" why="1 dia antes e 2 horas antes de toda consulta marcada na conversa. Menos faltas = mais faturamento na mesma agenda." on={s.lembrete.on} onToggle={(v) => set("lembrete", { on: v })}>
          <textarea className={cn(field, "text-xs resize-none")} rows={2} value={s.lembrete.texto1d} onChange={(e) => set("lembrete", { texto1d: e.target.value })} />
          <textarea className={cn(field, "text-xs resize-none")} rows={2} value={s.lembrete.texto2h} onChange={(e) => set("lembrete", { texto2h: e.target.value })} />
          <p className="text-[10px] text-muted-foreground">Também: {"{data}"} {"{hora}"}. Marque a data da consulta na ficha da conversa.</p>
        </Block>

        <Block icon={<Star className="w-4 h-4" />} title="Avaliação no Google" why="Depois que o paciente vem, pede uma avaliação. Mais estrelas no Google = mais pacientes pelo Maps, de graça." on={s.avaliacao.on} onToggle={(v) => set("avaliacao", { on: v })}>
          <input className={cn(field, "text-xs")} placeholder="Link de avaliação do Google (Perfil da Empresa > Pedir avaliações)" value={s.avaliacao.link} onChange={(e) => set("avaliacao", { link: e.target.value })} />
          <textarea className={cn(field, "text-xs resize-none")} rows={2} value={s.avaliacao.texto} onChange={(e) => set("avaliacao", { texto: e.target.value })} />
          <Num value={s.avaliacao.horasDepois} onChange={(n) => set("avaliacao", { horasDepois: n })} suffix="horas depois de comparecer" max={72} />
          {s.avaliacao.on && !s.avaliacao.link.trim() && <p className="text-[11px] text-amber-300">Sem o link de avaliação, esta automação não envia.</p>}
        </Block>

        <Block icon={<Wallet className="w-4 h-4" />} title="Orçamento parado" why="Quem recebeu orçamento e sumiu ganha uma mensagem de retomada. É dinheiro que já estava quase no caixa." on={s.orcamento.on} onToggle={(v) => set("orcamento", { on: v })}>
          <textarea className={cn(field, "text-xs resize-none")} rows={2} value={s.orcamento.texto} onChange={(e) => set("orcamento", { texto: e.target.value })} />
          <Num value={s.orcamento.diasSemResposta} onChange={(n) => set("orcamento", { diasSemResposta: n })} suffix="dias sem conversa" max={30} />
        </Block>

        <Block icon={<RotateCcw className="w-4 h-4" />} title="Retorno de quem sumiu" why="Pacientes da base sem visita há meses recebem um convite de retorno, aos poucos por dia, começando por quem mais gastou." on={s.retorno.on} onToggle={(v) => set("retorno", { on: v })}>
          <textarea className={cn(field, "text-xs resize-none")} rows={2} value={s.retorno.texto} onChange={(e) => set("retorno", { texto: e.target.value })} />
          <div className="flex flex-wrap gap-4">
            <Num value={s.retorno.meses} onChange={(n) => set("retorno", { meses: n })} suffix="meses sem visita" max={36} />
            <Num value={s.retorno.porDia} onChange={(n) => set("retorno", { porDia: n })} suffix="por dia" max={100} />
          </div>
        </Block>

        <Block icon={<Cake className="w-4 h-4" />} title="Aniversário" why="Mensagem no dia do aniversário (precisa da data de nascimento na base de pacientes)." on={s.aniversario.on} onToggle={(v) => set("aniversario", { on: v })}>
          <textarea className={cn(field, "text-xs resize-none")} rows={2} value={s.aniversario.texto} onChange={(e) => set("aniversario", { texto: e.target.value })} />
        </Block>

        <Block icon={<Gift className="w-4 h-4" />} title="Indicação com código" why="Dias depois de fechar, o paciente recebe um link pessoal. Quem chega por ele entra como indicação dele: você vê quem mais indica." on={s.indicacao.on} onToggle={(v) => set("indicacao", { on: v })}>
          <textarea className={cn(field, "text-xs resize-none")} rows={2} value={s.indicacao.texto} onChange={(e) => set("indicacao", { texto: e.target.value })} />
          <Num value={s.indicacao.diasDepois} onChange={(n) => set("indicacao", { diasDepois: n })} suffix="dias depois de fechar" max={60} />
          <p className="text-[10px] text-muted-foreground">Também: {"{link_indicacao}"} (link com o código do paciente).</p>
        </Block>

        </>)}
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        <button onClick={() => void save()} disabled={saving} className={btnPrimary}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salvar automações
        </button>
      </div>

      <div className="space-y-3">
        <Card title="Últimos 30 dias" subtitle="O que as automações mandaram" action={pendingTotal > 0 ? <button onClick={() => void cancelPending("")} className={cn(btnGhost, "text-xs px-2 py-1")}><Ban className="w-3.5 h-3.5" /> Cancelar fila</button> : null}>
          {!outbox || Object.keys(outbox.summary).length === 0 ? (
            <p className="text-xs text-muted-foreground">Nada enviado ainda.</p>
          ) : (
            <div className="space-y-1.5">
              {Object.entries(outbox.summary).map(([k, r]) => (
                <div key={k} className="flex items-center justify-between text-xs">
                  <span className="text-foreground">{r.label}</span>
                  <span className="text-muted-foreground">
                    <span className="text-emerald-300">{r.sent} enviadas</span>
                    {r.pending ? <span className="text-amber-300"> · {r.pending} na fila</span> : null}
                    {r.failed ? <span className="text-red-300"> · {r.failed} falharam</span> : null}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card title="Histórico de envios">
          <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
            {(outbox?.items ?? []).length === 0 && <p className="text-xs text-muted-foreground">Vazio.</p>}
            {(outbox?.items ?? []).map((i) => (
              <div key={i.id} className="rounded-lg border border-border bg-muted/20 p-2.5 text-[11px]">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">{i.label}</span>
                  <span className={cn("ml-auto", STATUS[i.status]?.cls)}>{STATUS[i.status]?.label ?? i.status}</span>
                </div>
                <div className="text-muted-foreground">{i.sentAt ? `${fmtDate(i.sentAt)} ${fmtTime(i.sentAt)}` : `programada ${fmtDate(i.scheduledFor)} ${fmtTime(i.scheduledFor)}`}</div>
                <div className="text-muted-foreground/80 line-clamp-2 mt-0.5">{i.body}</div>
                {i.error && i.status !== "ENVIADO" && <div className="text-red-300/80 mt-0.5">{i.error}</div>}
                {i.status === "PENDENTE" && (
                  <button onClick={() => void cancelPending(`item=${i.id}`)} className="text-[10px] text-muted-foreground hover:text-red-300 mt-1">cancelar</button>
                )}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
