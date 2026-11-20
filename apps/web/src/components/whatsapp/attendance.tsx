"use client";

// Aba "Atendimento" do cliente: o WhatsApp da clínica dentro da LOTUS.
// Conversas (caixa de entrada), Painel (métricas do dia), Links de origem e Automações.
import { useCallback, useEffect, useRef, useState } from "react";
import { BarChart3, Link2, Loader2, LogOut, MessagesSquare, Power, Smartphone, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { Inbox } from "./inbox";
import { AttendancePanel } from "./panel";
import { TrackedLinks, type LinkItem } from "./links";
import { Automations } from "./automations";
import { Notice, btnGhost, btnPrimary, formatPhone } from "./ui";

interface State {
  runtimeOnline: boolean;
  status: { state: string; qrImage: string | null; phone: string | null; name: string | null; lastError: string | null; savedSession?: boolean };
  channel: { phone: string | null; displayName: string | null; connectedAt: string | null; lastEventAt: string | null } | null;
  links: LinkItem[];
  settings: Parameters<typeof Automations>[0]["initial"];
}

const SUBTABS = [
  { id: "conversas", label: "Conversas", icon: MessagesSquare },
  { id: "painel", label: "Painel", icon: BarChart3 },
  { id: "links", label: "Links de origem", icon: Link2 },
  { id: "automacoes", label: "Automações", icon: Zap },
] as const;
type Sub = (typeof SUBTABS)[number]["id"];

export function Attendance({ clientId, clientName }: { clientId: string; clientName: string }) {
  const [state, setState] = useState<State | null>(null);
  const [sub, setSub] = useState<Sub>("conversas");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inboxKey, setInboxKey] = useState(0);
  const [inboxFilter, setInboxFilter] = useState("todas");
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/clients/${clientId}/whatsapp`).catch(() => null);
    if (res?.ok) setState((await res.json()) as State);
  }, [clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Enquanto o QR code está na tela, pergunta a cada 2 s se o celular já leu
  const waiting = state?.status.state === "qr" || state?.status.state === "conectando";
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => void load(), waiting ? 2000 : 20_000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [waiting, load]);

  const action = async (a: "connect" | "disconnect" | "logout") => {
    if (a === "logout" && !window.confirm("Desligar o WhatsApp desta clínica da LOTUS? Para religar será preciso ler o QR code de novo. As conversas já salvas continuam aqui.")) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/clients/${clientId}/whatsapp`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: a }) });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) setError(data.error ?? "Não foi possível.");
    void load();
  };

  if (!state) {
    return (
      <div className="p-8 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Carregando o atendimento…
      </div>
    );
  }

  const st = state.status.state;
  const connected = st === "conectado";
  const phone = state.status.phone ?? state.channel?.phone ?? null;

  return (
    <div className="space-y-5">
      {/* Faixa de conexão */}
      <div className={cn("rounded-xl border p-4 flex flex-wrap items-center gap-4", connected ? "border-emerald-500/30 bg-emerald-500/[0.06]" : "border-border bg-card")}>
        <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center", connected ? "bg-emerald-500/20 text-emerald-300" : "bg-muted/60 text-muted-foreground")}>
          <Smartphone className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-[220px]">
          <div className="flex items-center gap-2">
            <span className={cn("w-2 h-2 rounded-full", connected ? "bg-emerald-400 animate-pulse" : st === "qr" || st === "conectando" ? "bg-amber-400 animate-pulse" : "bg-zinc-500")} />
            <span className="text-sm font-semibold text-foreground">
              {connected ? `WhatsApp de ${clientName} conectado` : st === "qr" ? "Leia o QR code com o celular da clínica" : st === "conectando" ? "Conectando…" : "WhatsApp da clínica não conectado"}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {connected
              ? `${formatPhone(phone)}${state.status.name ? ` · ${state.status.name}` : ""}. Tudo que chega e sai aparece aqui em tempo real. O celular continua funcionando normal.`
              : !state.runtimeOnline
                ? "Abra o aplicativo LOTUS neste computador para conectar."
                : "Conecte uma vez: a LOTUS vira um \"aparelho conectado\" do WhatsApp da clínica (igual WhatsApp Web) e passa a registrar cada lead, de onde veio e se fechou."}
          </p>
          {state.status.lastError && !connected && <p className="text-xs text-amber-300 mt-1">{state.status.lastError}</p>}
        </div>
        <div className="flex items-center gap-2">
          {!connected && st !== "qr" && (
            <button onClick={() => void action("connect")} disabled={busy || !state.runtimeOnline} className={btnPrimary}>
              {busy || st === "conectando" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Power className="w-4 h-4" />} Conectar WhatsApp
            </button>
          )}
          {(connected || st === "qr") && (
            <button onClick={() => void action("logout")} disabled={busy} className={btnGhost} title="Desliga o aparelho conectado">
              <LogOut className="w-4 h-4" /> Desconectar
            </button>
          )}
        </div>
        {st === "qr" && state.status.qrImage && (
          <div className="w-full flex flex-col md:flex-row items-center gap-6 pt-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={state.status.qrImage} alt="QR code do WhatsApp" className="w-56 h-56 rounded-xl bg-white p-2" />
            <ol className="text-sm text-muted-foreground space-y-2 list-decimal pl-5">
              <li>No celular da clínica, abra o <b className="text-foreground">WhatsApp</b> (ou WhatsApp Business).</li>
              <li>Toque em <b className="text-foreground">Mais opções</b> (⋮) ou <b className="text-foreground">Configurações</b>, depois em <b className="text-foreground">Dispositivos conectados</b>.</li>
              <li>Toque em <b className="text-foreground">Conectar um dispositivo</b> e aponte a câmera para este código.</li>
              <li className="text-xs">O código muda sozinho a cada poucos segundos. A conexão fica salva neste computador.</li>
            </ol>
          </div>
        )}
      </div>
      {error && <Notice kind="error">{error}</Notice>}

      {/* Subabas */}
      <div className="flex gap-1 border-b border-border">
        {SUBTABS.map((t) => (
          <button key={t.id} onClick={() => setSub(t.id)} className={cn("flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors", sub === t.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {sub === "conversas" && <Inbox key={inboxKey} clientId={clientId} connected={connected} initialFilter={inboxFilter} />}
      {sub === "painel" && (
        <AttendancePanel
          clientId={clientId}
          onOpenWaiting={() => {
            setInboxFilter("aguardando");
            setSub("conversas");
            setInboxKey((k) => k + 1);
          }}
        />
      )}
      {sub === "links" && <TrackedLinks clientId={clientId} links={state.links} phone={phone} onSaved={() => void load()} />}
      {sub === "automacoes" && <Automations clientId={clientId} initial={state.settings} connected={connected} />}
    </div>
  );
}
