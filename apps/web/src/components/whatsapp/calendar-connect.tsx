"use client";

// Cartão "Agenda da clínica": conecta a Google Agenda (link para a clínica autorizar) ou o link secreto iCal,
// mostra os próximos horários ocupados que a IA está enxergando e permite desconectar.
import { useCallback, useEffect, useState } from "react";
import { CalendarDays, Copy, Link2, Loader2, Unplug } from "lucide-react";
import { Card, Notice, btnGhost, btnPrimary, field, fmtDate, fmtTime } from "./ui";

interface Status {
  kind: "ics" | "google" | null;
  status: string;
  googleEmail: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  canWrite: boolean;
  googleReady: boolean;
  busy: Array<{ start: string; end: string }>;
}

export function CalendarConnect({ clientId, clientName }: { clientId: string; clientName: string }) {
  const [st, setSt] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [ics, setIcs] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "error" | "info"; text: string } | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/clients/${clientId}/calendar`, { cache: "no-store" }).catch(() => null);
    if (r?.ok) setSt((await r.json()) as Status);
  }, [clientId]);
  useEffect(() => {
    void load();
  }, [load]);

  const post = async (body: Record<string, unknown>) => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch(`/api/clients/${clientId}/calendar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = (await r.json().catch(() => ({}))) as { error?: string; link?: string; events?: number };
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
      return d;
    } catch (err) {
      setMsg({ kind: "error", text: err instanceof Error ? err.message : String(err) });
      return null;
    } finally {
      setBusy(false);
      void load();
    }
  };

  const name = clientName.split("|")[0].trim();
  const message = link
    ? `Oi! Para a nossa IA marcar as consultas direto na agenda de vocês, sem chocar horário, é só abrir este link com a conta Google da agenda da clínica e clicar em "Permitir" (leva 30 segundos):\n${link}`
    : "";

  return (
    <Card title="Agenda da clínica" subtitle="Para a IA só oferecer horário livre de verdade e marcar a consulta na agenda">
      <div className="space-y-3">
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        {st?.status === "conectado" ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <CalendarDays className="w-4 h-4 text-emerald-300" />
              <span className="text-foreground">
                {st.kind === "google" ? `Google Agenda conectada${st.googleEmail ? ` (${st.googleEmail})` : ""}` : "Agenda conectada pelo link iCal (só leitura)"}
              </span>
              <span className="text-xs text-muted-foreground">{st.canWrite ? "· a IA vê os ocupados e marca as consultas" : "· a IA vê os ocupados; a consulta fica marcada só na LOTUS"}</span>
            </div>
            <div className="text-xs text-muted-foreground">
              {st.busy.length
                ? `Próximos horários ocupados que a IA está vendo: ${st.busy.slice(0, 6).map((b) => `${fmtDate(b.start)} ${fmtTime(b.start)}–${fmtTime(b.end)}`).join(" · ")}`
                : "Nenhum horário ocupado nos próximos 7 dias."}
            </div>
            <button disabled={busy} onClick={() => void post({ action: "desconectar" })} className={btnGhost}>
              <Unplug className="w-4 h-4" /> Desconectar
            </button>
          </div>
        ) : (
          <>
            {st?.status === "erro" && st.lastError && <Notice kind="error">Problema na agenda: {st.lastError}</Notice>}
            <div className="grid md:grid-cols-2 gap-4">
              <div className="rounded-lg border border-border p-3 space-y-2">
                <div className="text-sm font-medium text-foreground">1. Google Agenda (completo)</div>
                <p className="text-xs text-muted-foreground">Você manda um link para {name}; a clínica entra com a conta Google da agenda e clica em &quot;Permitir&quot;. A IA vê os ocupados e marca as consultas na agenda.</p>
                {st && !st.googleReady ? (
                  <p className="text-xs text-amber-300">Antes, configure a &quot;Google Agenda das clínicas&quot; em Integrações (uma vez só para todas as clínicas).</p>
                ) : link ? (
                  <div className="space-y-2">
                    <textarea readOnly value={message} className={`${field} h-28 text-xs`} />
                    <button onClick={() => void navigator.clipboard.writeText(message).then(() => setMsg({ kind: "ok", text: "Mensagem copiada. Mande para a clínica pelo WhatsApp; quando ela autorizar, aparece aqui sozinho (link vale 7 dias)." }))} className={btnPrimary}>
                      <Copy className="w-4 h-4" /> Copiar mensagem com o link
                    </button>
                  </div>
                ) : (
                  <button disabled={busy || !st} onClick={() => void post({ action: "google-link" }).then((d) => d?.link && setLink(d.link))} className={btnPrimary}>
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />} Gerar link para a clínica
                  </button>
                )}
              </div>
              <div className="rounded-lg border border-border p-3 space-y-2">
                <div className="text-sm font-medium text-foreground">2. Link secreto iCal (só leitura)</div>
                <p className="text-xs text-muted-foreground">
                  Na Google Agenda da clínica: Configurações → clique na agenda → &quot;Integrar agenda&quot; → copie o &quot;Endereço secreto no formato iCal&quot; e cole aqui. Também funciona com Outlook e outros sistemas que dão link .ics.
                </p>
                <input className={field} placeholder="https://calendar.google.com/calendar/ical/.../basic.ics" value={ics} onChange={(e) => setIcs(e.target.value)} />
                <button
                  disabled={busy || ics.trim().length < 12}
                  onClick={() => void post({ action: "ics", url: ics }).then((d) => d && (setIcs(""), setMsg({ kind: "ok", text: `Agenda conectada: ${d.events ?? 0} compromisso(s) nos próximos 30 dias.` })))}
                  className={btnGhost}
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarDays className="w-4 h-4" />} Conectar pelo link
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
