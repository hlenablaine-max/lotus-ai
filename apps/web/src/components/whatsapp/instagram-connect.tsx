"use client";

// Conectar o Instagram da clínica pelo ManyChat: cola a chave da API, a LOTUS confere e mostra o que configurar no ManyChat.
import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Instagram, Loader2, Plug } from "lucide-react";
import { cn } from "@/lib/utils";
import { Notice, btnGhost, btnPrimary, field } from "./ui";

interface State {
  connected: boolean;
  pageName?: string | null;
  igUsername?: string | null;
  lastEventAt?: string | null;
  inboundUrl?: string | null;
  localUrl?: string;
}

const TEMPLATE = `{
  "contact": {
    "id": "{{user_id}}",
    "name": "{{full_name}}",
    "ig_username": "{{ig_username}}"
  },
  "text": "{{last_input_text}}"
}`;

export function InstagramConnect({ clientId }: { clientId: string }) {
  const [st, setSt] = useState<State | null>(null);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/clients/${clientId}/instagram`).then((x) => x.json()).catch(() => null);
    if (r) setSt(r as State);
  }, [clientId]);
  useEffect(() => {
    void load();
  }, [load]);

  const connect = async () => {
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/clients/${clientId}/instagram`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ apiKey: key }) });
    const d = (await res.json().catch(() => ({}))) as { error?: string; igUsername?: string; pageName?: string };
    setBusy(false);
    if (!res.ok) return setMsg({ kind: "error", text: d.error ?? "Não foi possível conectar." });
    setKey("");
    setMsg({ kind: "ok", text: `Conectado${d.igUsername ? ` ao @${d.igUsername}` : d.pageName ? ` a ${d.pageName}` : ""}. Agora falta a regra no ManyChat (abaixo).` });
    setOpen(true);
    void load();
  };
  const copy = async (label: string, text: string) => {
    await navigator.clipboard.writeText(text).catch(() => undefined);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  };

  if (!st) return null;
  return (
    <div className={cn("rounded-xl border p-4 space-y-3", st.connected ? "border-pink-500/30 bg-pink-500/[0.05]" : "border-border bg-card")}>
      <div className="flex flex-wrap items-center gap-3">
        <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center", st.connected ? "bg-gradient-to-br from-pink-500/30 to-amber-500/30 text-pink-200" : "bg-muted/60 text-muted-foreground")}>
          <Instagram className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-[220px]">
          <div className="text-sm font-semibold text-foreground">{st.connected ? `Instagram conectado${st.igUsername ? `: @${st.igUsername}` : st.pageName ? `: ${st.pageName}` : ""}` : "Instagram da clínica (pelo ManyChat)"}</div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {st.connected
              ? st.lastEventAt
                ? `Última DM recebida: ${new Date(st.lastEventAt).toLocaleString("pt-BR")}. As DMs entram aqui separadas do WhatsApp.`
                : "Conectado. Assim que a regra do ManyChat estiver ativa, as DMs aparecem aqui com a etiqueta IG."
              : "DMs, comentários com palavra-chave e respostas de story entram no Atendimento, separados do WhatsApp. Oficial (parceiro da Meta), sem risco para a conta."}
          </p>
        </div>
        {st.connected && (
          <button onClick={() => setOpen((v) => !v)} className={cn(btnGhost, "text-xs")}>
            {open ? "Fechar instruções" : "Configurar no ManyChat"}
          </button>
        )}
      </div>

      {!st.connected && (
        <div className="flex flex-wrap gap-2">
          <input className={cn(field, "flex-1 min-w-[240px]")} placeholder="Chave da API do ManyChat (ManyChat > Configurações > API)" value={key} onChange={(e) => setKey(e.target.value)} type="password" autoComplete="off" />
          <button onClick={() => void connect()} disabled={busy || key.trim().length < 20} className={btnPrimary}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plug className="w-4 h-4" />} Conectar Instagram
          </button>
        </div>
      )}
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}

      {st.connected && open && (
        <div className="rounded-lg border border-border bg-muted/20 p-3 text-xs space-y-2">
          <p className="font-semibold text-foreground">No ManyChat (uma vez só):</p>
          <ol className="list-decimal pl-5 space-y-1 text-muted-foreground">
            <li>Automação &gt; &quot;Resposta padrão&quot; (Default Reply) do Instagram: adicione a ação <b className="text-foreground">External Request</b> (Requisição externa).</li>
            <li>Método <b className="text-foreground">POST</b>, endereço abaixo, corpo em JSON com o modelo abaixo.</li>
            <li>Faça o mesmo nas automações de &quot;comentário com palavra-chave&quot; e &quot;resposta de story&quot; que quiser acompanhar.</li>
          </ol>
          {st.inboundUrl ? (
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate bg-card border border-border rounded px-2 py-1.5">{st.inboundUrl}</code>
              <button onClick={() => void copy("url", st.inboundUrl!)} className={cn(btnGhost, "py-1 text-xs")}>{copied === "url" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} Copiar</button>
            </div>
          ) : (
            <Notice kind="info">
              Falta o <b>endereço público da LOTUS</b> (o &quot;recebedor&quot; na internet), para o ManyChat conseguir entregar as DMs mesmo com o seu PC desligado. Está na lista de próximos passos.
            </Notice>
          )}
          <div className="relative">
            <pre className="bg-card border border-border rounded p-2 text-[11px] text-foreground overflow-x-auto">{TEMPLATE}</pre>
            <button onClick={() => void copy("json", TEMPLATE)} className={cn(btnGhost, "absolute top-1 right-1 py-1 text-[11px]")}>{copied === "json" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}</button>
          </div>
        </div>
      )}
    </div>
  );
}

// Na página da LOTUS (interno): o Instagram é o da própria LOTUS, já conectado em Integrações (navegador de pesquisa)
export function LotusInstagram() {
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    fetch("/api/research/accounts")
      .then((r) => r.json())
      .then((d: { instagram?: boolean }) => setOn(!!d.instagram))
      .catch(() => setOn(false));
  }, []);
  return (
    <div className={cn("rounded-xl border p-4 flex flex-wrap items-center gap-3", on ? "border-pink-500/30 bg-pink-500/[0.05]" : "border-border bg-card")}>
      <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center", on ? "bg-gradient-to-br from-pink-500/30 to-amber-500/30 text-pink-200" : "bg-muted/60 text-muted-foreground")}>
        <Instagram className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-[220px]">
        <div className="text-sm font-semibold text-foreground">{on === null ? "Instagram da LOTUS…" : on ? "Instagram da LOTUS conectado" : "Instagram da LOTUS não conectado"}</div>
        <p className="text-xs text-muted-foreground mt-0.5">
          É o Instagram de Integrações. A LOTUS usa para achar o @ das clínicas na prospecção e ler os perfis no diagnóstico (só lê: não curte, não segue, não manda DM). O ManyChat é só para o Instagram de cada clínica, depois de fechar.
        </p>
      </div>
      {!on && on !== null && (
        <a href="/integrations" className={cn(btnGhost, "text-xs")}>
          Conectar em Integrações
        </a>
      )}
    </div>
  );
}
