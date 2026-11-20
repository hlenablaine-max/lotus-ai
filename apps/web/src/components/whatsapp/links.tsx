"use client";

// Links rastreados: cada canal (e cada campanha ou criativo) tem um link de WhatsApp com uma saudação diferente.
// Quem clica já chega com o texto escrito; a LOTUS lê a primeira mensagem e sabe de onde a pessoa veio.
import { useEffect, useState } from "react";
import { Copy, Loader2, Plus, QrCode, Save, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, Notice, SOURCE_META, btnGhost, btnPrimary, field } from "./ui";

export interface LinkItem {
  id: string;
  label: string;
  source: string;
  campaign?: string | null;
  text: string;
  code?: string | null;
  keyword?: string | null;
  url?: string | null;
}

const WHERE: Record<string, string> = {
  META_ADS: "Use como destino do anúncio (botão 'Enviar mensagem' ou link do site do anúncio).",
  GOOGLE_ADS: "Use no anúncio do Google (extensão de link ou página de destino).",
  INSTAGRAM: "Coloque na bio, nos stories (figurinha de link) e na resposta automática do direct.",
  SITE: "O botão de WhatsApp do site usa este link.",
  GOOGLE_MAPS: "Cadastre como site ou link de agendamento no Perfil da Empresa no Google.",
  INDICACAO: "Cada paciente também tem o próprio link com código (na conversa dele).",
};

export function TrackedLinks({ clientId, links, phone, onSaved }: { clientId: string; links: LinkItem[]; phone: string | null; onSaved: () => void }) {
  const [items, setItems] = useState<LinkItem[]>(links);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [qr, setQr] = useState<{ label: string; image: string; url: string } | null>(null);
  const [qrLoading, setQrLoading] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => setItems(links), [links]);

  const urlFor = (l: LinkItem) => (phone ? `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(l.text)}` : null);
  const update = (id: string, patch: Partial<LinkItem>) => setItems((all) => all.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  const save = async (list: LinkItem[] = items, okText = "Links salvos. A partir de agora, quem chegar por eles é identificado sozinho.") => {
    setSaving(true);
    setMsg(null);
    const res = await fetch(`/api/clients/${clientId}/whatsapp`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ links: list }) });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setSaving(false);
    if (!res.ok) {
      setMsg({ kind: "error", text: data.error ?? "Não foi possível salvar." });
      return false;
    }
    setMsg({ kind: "ok", text: okText });
    onSaved();
    return true;
  };

  // Conteúdo orgânico: cada vídeo/post ganha um link com código próprio (V1, V2...) e, se quiser, uma palavra-chave
  const [content, setContent] = useState({ name: "", keyword: "" });
  const createContentLink = async () => {
    const name = content.name.trim();
    if (!name) return;
    const used = items.map((l) => Number(/^V(\d+)$/.exec(l.code ?? "")?.[1] ?? 0));
    const code = `V${Math.max(0, ...used) + 1}`;
    const item: LinkItem = {
      id: `conteudo${Date.now().toString(36)}`,
      label: `Conteúdo: ${name}`,
      source: "INSTAGRAM",
      campaign: `Conteúdo: ${name}`,
      text: `Oi! Vi o vídeo "${name}" e quero saber mais (cód. ${code})`,
      code,
      keyword: content.keyword.trim() || null,
    };
    const next = [item, ...items];
    if (await save(next, `Link do conteúdo "${name}" criado (código ${code}). Copie e coloque na legenda, no story ou na bio enquanto o vídeo estiver rodando.`)) {
      setItems(next);
      setContent({ name: "", keyword: "" });
    }
  };

  const copy = async (l: LinkItem) => {
    const url = urlFor(l);
    if (!url) return;
    await navigator.clipboard.writeText(url).catch(() => undefined);
    setCopied(l.id);
    setTimeout(() => setCopied(null), 1800);
  };

  const showQr = async (l: LinkItem) => {
    const url = urlFor(l);
    if (!url) return;
    setQrLoading(l.id);
    const res = await fetch(`/api/clients/${clientId}/whatsapp/qr`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) });
    const data = (await res.json().catch(() => ({}))) as { image?: string; error?: string };
    setQrLoading(null);
    if (data.image) setQr({ label: l.label, image: data.image, url });
    else setMsg({ kind: "error", text: data.error ?? "Não foi possível gerar o QR code." });
  };

  return (
    <div className="space-y-4">
      <Notice kind="info">
        <b>Como funciona:</b> cada link abre o WhatsApp da clínica com uma mensagem diferente já escrita. A LOTUS lê o primeiro &quot;oi&quot; e marca a origem sozinha (anúncio, Instagram, site...). No painel você vê quantos vieram de cada lugar e quantos fecharam. Para saber qual <b>anúncio</b> vende mais, crie um link por campanha ou criativo.
      </Notice>
      {!phone && <Notice kind="warn">Conecte o WhatsApp da clínica para os links ficarem prontos (eles usam o número conectado).</Notice>}
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}

      <Card title="Conteúdo orgânico: saber qual vídeo vende" subtitle="Cada vídeo ou post que a LOTUS criar ganha um link próprio. No Painel aparece quantos leads e quanto faturou cada conteúdo.">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_220px_auto] gap-2">
          <input className={field} placeholder='Nome do vídeo ou post (ex.: "Lente em 1 dia")' value={content.name} onChange={(e) => setContent({ ...content, name: e.target.value })} onKeyDown={(e) => e.key === "Enter" && void createContentLink()} />
          <input className={field} placeholder="Palavra-chave falada (opcional)" value={content.keyword} onChange={(e) => setContent({ ...content, keyword: e.target.value })} />
          <button onClick={() => void createContentLink()} disabled={saving || !content.name.trim()} className={btnPrimary}>
            <Plus className="w-4 h-4" /> Criar link do conteúdo
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground mt-2">
          Coloque o link na legenda, no story (figurinha de link) ou na bio enquanto o vídeo roda. A mensagem já vai com um código (ex.: cód. V3), então mesmo se a pessoa mexer no texto, a LOTUS sabe de qual vídeo veio. Se o vídeo disser &quot;manda SORRISO no WhatsApp&quot;, ponha SORRISO como palavra-chave: quem digitar também é contado.
        </p>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        {items.map((l) => {
          const meta = SOURCE_META[l.source] ?? SOURCE_META.OUTRO;
          const url = urlFor(l);
          return (
            <Card key={l.id} className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className={cn("w-2.5 h-2.5 rounded-full", meta.dot)} />
                <input className="bg-transparent text-sm font-semibold text-foreground flex-1 focus:outline-none" value={l.label} onChange={(e) => update(l.id, { label: e.target.value })} />
                <button onClick={() => setItems((all) => all.filter((x) => x.id !== l.id))} className="text-muted-foreground hover:text-red-400" aria-label="Remover link">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <select className={cn(field, "text-xs")} value={l.source} onChange={(e) => update(l.id, { source: e.target.value })}>
                  {Object.entries(SOURCE_META)
                    .filter(([id]) => !["WHATSAPP", "PACIENTE_BASE", "OUTRO"].includes(id))
                    .map(([id, m]) => (
                      <option key={id} value={id}>{m.label}</option>
                    ))}
                </select>
                <input className={cn(field, "text-xs")} placeholder="Campanha ou criativo (opcional)" value={l.campaign ?? ""} onChange={(e) => update(l.id, { campaign: e.target.value })} />
              </div>
              <textarea className={cn(field, "text-xs resize-none")} rows={2} value={l.text} onChange={(e) => update(l.id, { text: e.target.value })} />
              {(l.code || l.keyword) && (
                <p className="text-[11px] text-primary mt-1">
                  {l.code && <>Código {l.code}</>}
                  {l.code && l.keyword && " · "}
                  {l.keyword && <>Palavra-chave &quot;{l.keyword}&quot;</>}
                </p>
              )}
              <p className="text-[11px] text-muted-foreground mt-2">{WHERE[l.source] ?? ""}</p>
              <div className="flex items-center gap-2 mt-3">
                <code className="flex-1 truncate text-[11px] text-muted-foreground bg-muted/30 border border-border rounded-md px-2 py-1.5">{url ?? "conecte o WhatsApp"}</code>
                <button onClick={() => void copy(l)} disabled={!url} className={cn(btnGhost, "px-2.5 py-1.5 text-xs")}>
                  <Copy className="w-3.5 h-3.5" /> {copied === l.id ? "Copiado" : "Copiar"}
                </button>
                <button onClick={() => void showQr(l)} disabled={!url} className={cn(btnGhost, "px-2.5 py-1.5 text-xs")}>
                  {qrLoading === l.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <QrCode className="w-3.5 h-3.5" />} QR
                </button>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setItems((all) => [...all, { id: `link${Date.now().toString(36)}`, label: "Nova campanha", source: "META_ADS", campaign: "", text: "" }])}
          className={btnGhost}
        >
          <Plus className="w-4 h-4" /> Novo link (campanha ou criativo)
        </button>
        <button onClick={() => void save()} disabled={saving} className={btnPrimary}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salvar links
        </button>
      </div>
      <p className="text-[11px] text-muted-foreground">Dica: cada texto precisa ser bem diferente dos outros (a LOTUS compara as palavras). Se a pessoa apagar a mensagem e escrever outra coisa, o lead entra como &quot;WhatsApp direto&quot; e você pode corrigir a origem na conversa.</p>

      {qr && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setQr(null)}>
          <div className="rounded-2xl bg-card border border-border p-6 text-center max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-foreground">{qr.label}</h3>
              <button onClick={() => setQr(null)} className="text-muted-foreground hover:text-foreground" aria-label="Fechar">
                <X className="w-4 h-4" />
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr.image} alt="QR code do link" className="mx-auto rounded-lg bg-white p-2 w-64 h-64" />
            <p className="text-[11px] text-muted-foreground mt-3">Para a recepção, cartão, panfleto ou story. Quem escanear já chega identificado.</p>
            <a href={qr.image} download={`qr-${qr.label.replace(/\s+/g, "-").toLowerCase()}.png`} className={cn(btnPrimary, "mt-3 w-full")}>Baixar imagem</a>
          </div>
        </div>
      )}
    </div>
  );
}
