"use client";

// Contas que a LOTUS usa no trabalho dos agentes: WhatsApp (teste de atendimento), Google
// (avaliações), Instagram (leitura completa dos perfis) e Vercel (publicação dos sites).
// O login é feito numa janela do navegador de pesquisa do app e fica salvo neste computador.

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Globe, Instagram, Loader2, MessageCircle, MonitorOff, Search, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Accounts {
  desktop: boolean;
  instagram?: boolean;
  google?: boolean;
  whatsapp?: boolean;
  vercel?: string | null;
  visible?: boolean;
  error?: string;
}

type Service = "whatsapp" | "google" | "instagram";

const CARDS: Array<{ service: Service; title: string; icon: React.ReactNode; why: string; how: string }> = [
  {
    service: "whatsapp",
    title: "WhatsApp",
    icon: <MessageCircle className="w-5 h-5 text-emerald-400" />,
    why: "Os agentes mandam uma mensagem de paciente interessado para a clínica e medem se e quando ela responde.",
    how: "Clique em Gerar QR code e, no celular: WhatsApp > Configurações > Aparelhos conectados > Conectar aparelho.",
  },
  {
    service: "google",
    title: "Google",
    icon: <Search className="w-5 h-5 text-sky-400" />,
    why: "Sem login, o Google Maps esconde o texto das avaliações. Com login, os agentes leem o que os pacientes elogiam e reclamam.",
    how: "Entre com qualquer conta Gmail.",
  },
  {
    service: "instagram",
    title: "Instagram",
    icon: <Instagram className="w-5 h-5 text-pink-400" />,
    why: "Opcional. Com login, a leitura de perfis e Reels fica mais completa e o Instagram bloqueia menos.",
    how: "Prefira uma conta secundária, não a principal da agência.",
  },
];

export function ConnectedAccounts() {
  const [accounts, setAccounts] = useState<Accounts | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [qr, setQr] = useState<{ open: boolean; image: string | null; state: string; error: string }>({ open: false, image: null, state: "", error: "" });
  const qrTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/research/accounts");
      if (res.ok) setAccounts(await res.json());
    } catch {
      setAccounts(null);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (action: "connect" | "close", service?: Service) => {
    setBusy(service ?? "close");
    setMessage("");
    try {
      const res = await fetch("/api/research/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, service }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Não foi possível abrir a janela.");
      setMessage(
        action === "connect"
          ? 'Uma janela do navegador da LOTUS abriu. Faça o login nela e depois clique em "Já entrei, salvar".'
          : "Sessão salva neste computador."
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
      load();
    }
  };

  // QR code do WhatsApp dentro da própria tela: pergunta a cada 3 s até o celular ler
  const pollQr = useCallback(async () => {
    try {
      const res = await fetch("/api/research/whatsapp-qr");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Não foi possível gerar o QR code.");
      if (data.state === "connected") {
        setQr({ open: false, image: null, state: "connected", error: "" });
        setMessage("WhatsApp conectado neste computador.");
        load();
        return;
      }
      setQr((q) => (q.open ? { ...q, image: data.image ?? q.image, state: data.state, error: "" } : q));
    } catch (err) {
      setQr((q) => ({ ...q, error: err instanceof Error ? err.message : String(err) }));
    }
    qrTimer.current = setTimeout(pollQr, 3000);
  }, [load]);

  const openQr = () => {
    setMessage("");
    setQr({ open: true, image: null, state: "loading", error: "" });
    if (qrTimer.current) clearTimeout(qrTimer.current);
    pollQr();
  };

  const closeQr = () => {
    if (qrTimer.current) clearTimeout(qrTimer.current);
    setQr({ open: false, image: null, state: "", error: "" });
    fetch("/api/research/whatsapp-qr", { method: "DELETE" }).catch(() => {});
  };

  useEffect(() => () => {
    if (qrTimer.current) clearTimeout(qrTimer.current);
  }, []);

  const connected = (service: Service) => !!accounts?.[service];

  return (
    <section className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-foreground">Contas conectadas</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Usadas pelos agentes no diagnóstico e na produção. Ficam salvas só neste computador.</p>
        </div>
        {accounts?.visible && (
          <button
            onClick={() => act("close")}
            disabled={busy !== null}
            className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50"
          >
            Já entrei, salvar
          </button>
        )}
      </div>

      {accounts && !accounts.desktop && (
        <div className="mx-6 mt-4 flex items-center gap-2 text-amber-300 text-sm p-3 rounded-lg border border-amber-400/20 bg-amber-400/5">
          <MonitorOff size={16} /> Abra o aplicativo LOTUS neste computador para conectar contas.
        </div>
      )}

      <div className="p-6 grid gap-3">
        {CARDS.map((card) => (
          <div key={card.service} className="rounded-lg border border-border bg-muted/20 p-4 flex gap-4 items-start">
            <div className="mt-0.5">{card.icon}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-foreground">{card.title}</span>
                {accounts === null ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                ) : connected(card.service) ? (
                  <span className="flex items-center gap-1 text-xs text-emerald-400"><CheckCircle2 className="w-3.5 h-3.5" /> conectado</span>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground"><XCircle className="w-3.5 h-3.5" /> não conectado</span>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-1">{card.why}</p>
              <p className="text-xs text-muted-foreground/70 mt-1">{card.how}</p>
            </div>
            <button
              onClick={() => (card.service === "whatsapp" ? openQr() : act("connect", card.service))}
              disabled={busy !== null || accounts?.desktop === false}
              className={cn(
                "px-3 py-2 rounded-lg border text-xs font-medium whitespace-nowrap disabled:opacity-40",
                connected(card.service) ? "border-border text-muted-foreground hover:text-foreground" : "border-primary/40 bg-primary/10 text-primary hover:bg-primary/20"
              )}
            >
              {busy === card.service ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : card.service === "whatsapp" ? (
                connected(card.service) ? "Gerar novo QR code" : "Gerar QR code"
              ) : connected(card.service) ? (
                "Reconectar"
              ) : (
                "Conectar"
              )}
            </button>
          </div>
        ))}

        {qr.open && (
          <div className="rounded-lg border border-emerald-400/30 bg-emerald-400/5 p-5 flex flex-col sm:flex-row gap-5 items-center">
            <div className="w-[220px] h-[220px] rounded-xl bg-white p-3 flex items-center justify-center flex-shrink-0">
              {qr.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qr.image} alt="QR code do WhatsApp" className="w-full h-full object-contain" />
              ) : (
                <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
              )}
            </div>
            <div className="space-y-2 text-sm">
              <div className="font-medium text-foreground">Conecte o WhatsApp da agência</div>
              <ol className="list-decimal pl-5 text-muted-foreground space-y-1">
                <li>Abra o WhatsApp no celular.</li>
                <li>Toque em Configurações (ou nos três pontinhos) e depois em Aparelhos conectados.</li>
                <li>Toque em Conectar aparelho e aponte a câmera para este QR code.</li>
              </ol>
              <p className="text-xs text-muted-foreground/70">O código muda sozinho a cada poucos segundos. Quando o celular ler, esta área fecha e o WhatsApp aparece como conectado.</p>
              {qr.error && <p className="text-xs text-red-400">{qr.error}</p>}
              <button onClick={closeQr} className="text-xs text-muted-foreground underline hover:text-foreground">Cancelar</button>
            </div>
          </div>
        )}

        <div className="rounded-lg border border-border bg-muted/20 p-4 flex gap-4 items-start">
          <Globe className="w-5 h-5 text-violet-400 mt-0.5" />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-foreground">Vercel (publicação dos sites)</span>
              {accounts?.vercel ? (
                <span className="flex items-center gap-1 text-xs text-emerald-400"><CheckCircle2 className="w-3.5 h-3.5" /> conta {accounts.vercel}</span>
              ) : (
                <span className="flex items-center gap-1 text-xs text-muted-foreground"><XCircle className="w-3.5 h-3.5" /> não conectada</span>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-1">É onde a LOTUS publica o site novo de cada clínica para você mandar o link ao dono.</p>
            {!accounts?.vercel && (
              <p className="text-xs text-muted-foreground/70 mt-1">Para conectar: abra o PowerShell e rode <code className="px-1 rounded bg-white/10">vercel login</code>.</p>
            )}
          </div>
        </div>
      </div>

      {message && <p className="px-6 pb-5 -mt-2 text-sm text-primary">{message}</p>}
    </section>
  );
}
