"use client";

// Blocos de configuração da IA atendente e do relatório semanal (aba Atendimento > Automações).
import { useState } from "react";
import { Bot, Eye, FileBarChart, Loader2, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { Notice, Toggle, btnGhost, field } from "./ui";

type Ai = { on: boolean; modo: "automatico" | "rascunho"; conhecimento: string; agenda: { dias: number[]; inicio: string; fim: string; duracaoMin: number; almoco: string }; pausaHumanoHoras: number };
type Report = { on: boolean; telefone: string; dia: number; hora: number };

const DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function AiBlock({ value, onChange }: { value: Ai; onChange: (v: Ai) => void }) {
  const set = (patch: Partial<Ai>) => onChange({ ...value, ...patch });
  const setAg = (patch: Partial<Ai["agenda"]>) => onChange({ ...value, agenda: { ...value.agenda, ...patch } });
  return (
    <div className={cn("rounded-xl border p-5 transition-colors", value.on ? "border-violet-500/40 bg-violet-500/[0.06]" : "border-border bg-card")}>
      <div className="flex items-start gap-3">
        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0", value.on ? "bg-violet-500/20 text-violet-300" : "bg-muted/50 text-muted-foreground")}>
          <Bot className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0 space-y-4">
          <div className="flex items-center gap-3">
            <div>
              <h4 className="text-sm font-semibold text-foreground">Atendente com IA (responde e agenda sozinha)</h4>
              <p className="text-xs text-muted-foreground mt-0.5">Responde cada lead em segundos, tira dúvidas com o que você ensinar, oferece horários livres e marca a consulta. Passa para a equipe quando precisa.</p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className={cn("text-[11px]", value.on ? "text-violet-300" : "text-muted-foreground")}>{value.on ? "Ligada" : "Desligada"}</span>
              <Toggle on={value.on} onChange={(on) => set({ on })} label="Atendente com IA" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {(
              [
                ["rascunho", "Eu aprovo cada resposta", "A IA escreve, aparece na conversa e você envia com 1 clique. Comece por aqui."],
                ["automatico", "Responde sozinha", "A IA manda direto (sempre com o escudo anti-ban). Use quando confiar nas respostas."],
              ] as const
            ).map(([id, label, desc]) => (
              <button key={id} type="button" onClick={() => set({ modo: id })} className={cn("text-left rounded-lg border p-3 transition-colors", value.modo === id ? "border-violet-400/60 bg-violet-500/10" : "border-border hover:border-violet-400/30")}>
                <div className="text-sm font-medium text-foreground">{label}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">{desc}</div>
              </button>
            ))}
          </div>

          <label className="block">
            <span className="text-xs font-medium text-foreground">O que a IA pode dizer</span>
            <span className="block text-[11px] text-muted-foreground mb-1">Serviços, valores que podem ser ditos, formas de pagamento, convênios, endereço, estacionamento, diferenciais. O que não estiver aqui, ela não inventa.</span>
            <textarea className={cn(field, "text-xs resize-y")} rows={5} value={value.conhecimento} placeholder={"Ex.: Avaliação gratuita, 30 min.\nImplante a partir de R$ 2.500 (falar só se perguntarem).\nAceitamos cartão em até 12x. Não atendemos convênio.\nRua X, 123, Centro. Estacionamento na frente."} onChange={(e) => set({ conhecimento: e.target.value })} />
          </label>

          <div>
            <span className="text-xs font-medium text-foreground">Agenda para a IA oferecer horários</span>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {DAYS.map((d, i) => (
                <button key={d} type="button" onClick={() => setAg({ dias: value.agenda.dias.includes(i) ? value.agenda.dias.filter((x) => x !== i) : [...value.agenda.dias, i].sort() })} className={cn("w-11 py-1 rounded-md text-[11px] border", value.agenda.dias.includes(i) ? "bg-violet-500/20 border-violet-400/50 text-violet-200" : "border-border text-muted-foreground")}>
                  {d}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-muted-foreground">
              <label className="flex items-center gap-1.5">das <input type="time" value={value.agenda.inicio} onChange={(e) => setAg({ inicio: e.target.value })} className={cn(field, "w-28 py-1 text-xs")} /></label>
              <label className="flex items-center gap-1.5">às <input type="time" value={value.agenda.fim} onChange={(e) => setAg({ fim: e.target.value })} className={cn(field, "w-28 py-1 text-xs")} /></label>
              <label className="flex items-center gap-1.5">consulta de <input type="number" min={15} max={240} step={15} value={value.agenda.duracaoMin} onChange={(e) => setAg({ duracaoMin: Number(e.target.value) || 60 })} className={cn(field, "w-20 py-1 text-xs")} /> min</label>
              <label className="flex items-center gap-1.5">almoço <input value={value.agenda.almoco} onChange={(e) => setAg({ almoco: e.target.value })} className={cn(field, "w-28 py-1 text-xs")} placeholder="12:00-13:00" /></label>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1.5">A IA só oferece horários livres (consultas já marcadas na LOTUS ficam de fora).</p>
          </div>

          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Quando alguém da clínica responder pelo celular, a IA fica quieta naquela conversa por
            <input type="number" min={1} max={72} value={value.pausaHumanoHoras} onChange={(e) => set({ pausaHumanoHoras: Number(e.target.value) || 12 })} className={cn(field, "w-16 py-1 text-xs")} /> horas
          </label>
        </div>
      </div>
    </div>
  );
}

export function ReportBlock({ clientId, value, onChange }: { clientId: string; value: Report; onChange: (v: Report) => void }) {
  const set = (patch: Partial<Report>) => onChange({ ...value, ...patch });
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const showPreview = async () => {
    setBusy(true);
    const r = await fetch(`/api/clients/${clientId}/whatsapp/report`).then((x) => x.json()).catch(() => null);
    setBusy(false);
    setPreview(r?.text ?? "Não foi possível gerar.");
  };
  const sendNow = async () => {
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/clients/${clientId}/whatsapp/report`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ telefone: value.telefone }) });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    setMsg(res.ok ? { kind: "ok", text: "Relatório na fila: sai pelo WhatsApp da LOTUS em instantes." } : { kind: "error", text: data.error ?? "Não foi possível." });
  };
  return (
    <div className={cn("rounded-xl border p-5 transition-colors", value.on ? "border-emerald-500/30 bg-emerald-500/[0.04]" : "border-border bg-card")}>
      <div className="flex items-start gap-3">
        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0", value.on ? "bg-emerald-500/15 text-emerald-300" : "bg-muted/50 text-muted-foreground")}>
          <FileBarChart className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0 space-y-3">
          <div className="flex items-center gap-3">
            <div>
              <h4 className="text-sm font-semibold text-foreground">Relatório semanal no WhatsApp do dono</h4>
              <p className="text-xs text-muted-foreground mt-0.5">Toda semana o dono recebe, pelo WhatsApp da LOTUS, quantos contatos chegaram, quantos fecharam e quanto faturou. É o que faz ele renovar.</p>
            </div>
            <div className="ml-auto">
              <Toggle on={value.on} onChange={(on) => set({ on })} label="Relatório semanal" />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <input className={cn(field, "w-48 py-1.5 text-xs")} placeholder="WhatsApp do dono (com DDD)" value={value.telefone} onChange={(e) => set({ telefone: e.target.value })} />
            <label className="flex items-center gap-1.5">
              toda
              <select className={cn(field, "w-24 py-1.5 text-xs")} value={value.dia} onChange={(e) => set({ dia: Number(e.target.value) })}>
                {DAYS.map((d, i) => (
                  <option key={d} value={i}>{d}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5">às <input type="number" min={6} max={21} value={value.hora} onChange={(e) => set({ hora: Number(e.target.value) || 9 })} className={cn(field, "w-16 py-1.5 text-xs")} /> h</label>
            <button type="button" onClick={() => void showPreview()} disabled={busy} className={cn(btnGhost, "py-1.5 text-xs")}>
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />} Ver prévia
            </button>
            <button type="button" onClick={() => void sendNow()} disabled={busy || !value.telefone.trim()} className={cn(btnGhost, "py-1.5 text-xs")}>
              <Send className="w-3.5 h-3.5" /> Mandar agora
            </button>
          </div>
          {preview && <pre className="whitespace-pre-wrap text-xs text-foreground bg-muted/30 border border-border rounded-lg p-3 font-sans">{preview}</pre>}
          {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        </div>
      </div>
    </div>
  );
}
