// Prospecção da LOTUS: acha clínicas no Google Maps, descobre os gargalos de cada uma, escreve uma primeira
// mensagem personalizada (nunca igual para todas) e, depois que o Ícaro aprova, manda pelo WhatsApp da LOTUS
// passando pelo escudo anti-ban. Quem responde conversa com a IA (SDR) até marcar uma call.
import { registry } from "@lotus/ai-engine";
import { prisma } from "@/lib/prisma";
import { createRuntimeClient } from "@/lib/runtime-client";
import { notify } from "@/lib/notify";
import { ensureLotusClient, normalizePhone, phoneKey } from "@/lib/whatsapp";

export interface Gargalo {
  tipo: string;
  texto: string; // frase curta e verificável, ex.: "nota 4,1 no Google com só 23 avaliações"
  peso: number;
}

const state = globalThis as unknown as { __lotusProspecting?: { campaign: string; startedAt: number; found: number; total: number; log: string[] } | null };

export function searchStatus() {
  return state.__lotusProspecting ?? null;
}

function parseRating(s: unknown): { rating: number | null; reviews: number | null } {
  const text = String(s ?? "");
  const rating = parseFloat((text.match(/\b([1-5][.,]\d)\b/)?.[1] ?? "").replace(",", ".")) || null;
  const reviews = Number((text.match(/\(([\d.\s]+)\)/)?.[1] ?? "").replace(/\D/g, "")) || null;
  return { rating, reviews };
}

// Olha o site rapidamente: está no ar? tem HTTPS? tem botão de WhatsApp? demora?
async function checkSite(url: string): Promise<Gargalo[]> {
  const out: Gargalo[] = [];
  const full = /^https?:\/\//.test(url) ? url : `https://${url}`;
  const t = Date.now();
  try {
    const res = await fetch(full, { redirect: "follow", signal: AbortSignal.timeout(15_000), headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131 Safari/537.36" } });
    const ms = Date.now() - t;
    const html = (await res.text()).slice(0, 400_000);
    if (!res.ok) out.push({ tipo: "site_fora", texto: `o site (${new URL(full).hostname}) não abre direito (erro ${res.status})`, peso: 25 });
    if (!res.url.startsWith("https://")) out.push({ tipo: "sem_https", texto: "o site aparece como 'não seguro' no navegador (sem HTTPS)", peso: 10 });
    if (!/wa\.me|api\.whatsapp\.com|whatsapp/i.test(html)) out.push({ tipo: "sem_whatsapp_site", texto: "o site não tem botão de WhatsApp para o paciente agendar", peso: 15 });
    if (ms > 6000) out.push({ tipo: "site_lento", texto: `o site demora ${Math.round(ms / 1000)} s para abrir no celular`, peso: 10 });
  } catch {
    out.push({ tipo: "site_fora", texto: "o site informado no Google não abre", peso: 25 });
  }
  return out;
}

function gargalosFromPlace(p: { rating: number | null; reviews: number | null; site: string | null }): Gargalo[] {
  const g: Gargalo[] = [];
  if (p.reviews !== null && p.reviews < 40) g.push({ tipo: "poucas_avaliacoes", texto: `só ${p.reviews} avaliações no Google`, peso: 20 });
  if (p.rating !== null && p.rating < 4.5) g.push({ tipo: "nota_baixa", texto: `nota ${String(p.rating).replace(".", ",")} no Google`, peso: 20 });
  if (!p.site) g.push({ tipo: "sem_site", texto: "não tem site no Google, só o perfil", peso: 25 });
  return g;
}

async function writeOpener(p: { name: string; city: string; niche: string; gargalos: Gargalo[]; rating: number | null; reviews: number | null }): Promise<string> {
  const res = await registry.getDefault().complete({
    messages: [
      {
        role: "system",
        content: `Você escreve a PRIMEIRA mensagem de WhatsApp do Ícaro (fundador da LOTUS, agência de marketing para clínicas) para o dono/recepção de uma clínica. Regras:
- Soe como uma pessoa real, educada, direta. 2 a 4 frases curtas. Sem emoji ou no máximo 1. Sem link. Sem "promoção", sem preço, sem textão de vendas.
- Cite UM gargalo concreto da lista (do jeito que está, sem exagerar) e diga em meia frase por que ele faz a clínica perder paciente.
- Termine com UMA pergunta simples que dê vontade de responder (ex.: se faz sentido eu te mostrar o que encontrei).
- Comece com "Oi, tudo bem?" ou variação natural, e se apresente: "Aqui é o Ícaro, da LOTUS".
- Escreva de um jeito diferente a cada vez (varie abertura e pergunta). Responda só com a mensagem.`,
      },
      { role: "user", content: `Clínica: ${p.name} (${p.niche} em ${p.city}). Google: ${p.rating ?? "sem nota"} (${p.reviews ?? "?"} avaliações).\nGargalos encontrados:\n${p.gargalos.map((g) => `- ${g.texto}`).join("\n") || "- nenhum gargalo forte: elogie algo e pergunte como estão captando pacientes novos"}` },
    ],
    maxTokens: 300,
    temperature: 0.9,
  });
  return res.content.trim().replace(/^["']|["']$/g, "").slice(0, 700);
}

// Busca em segundo plano (uma por vez, para não pesar o computador)
export async function startSearch(input: { niche: string; city: string; max: number }): Promise<{ started: boolean; campaign: string; reason?: string }> {
  const campaign = `${input.niche} em ${input.city} — ${new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date())}`;
  if (state.__lotusProspecting) return { started: false, campaign, reason: "Já tem uma busca rodando. Espere ela terminar." };
  const rt = createRuntimeClient();
  if (!(await rt.available())) return { started: false, campaign, reason: "Abra o aplicativo LOTUS neste computador para buscar clínicas." };
  state.__lotusProspecting = { campaign, startedAt: Date.now(), found: 0, total: input.max, log: [] };
  void runSearch(input, campaign).finally(() => {
    state.__lotusProspecting = null;
  });
  return { started: true, campaign };
}

async function runSearch(input: { niche: string; city: string; max: number }, campaign: string) {
  const rt = createRuntimeClient();
  const st = state.__lotusProspecting!;
  const log = (m: string) => st.log.push(m);
  // Várias buscas parecidas para achar mais clínicas (o Maps mostra poucas por vez)
  const variants = [`${input.niche} em ${input.city}`, `${input.niche} ${input.city} avaliação`, `clínica ${input.niche} ${input.city}`, `${input.niche} centro ${input.city}`];
  const names = new Map<string, number | null>();
  for (const q of variants) {
    if (names.size >= input.max * 2) break;
    try {
      const r = (await rt.call("/runtime/research/maps", { query: q }, 120_000)) as { results?: Array<{ name: string; rating: number | null }> };
      for (const x of r.results ?? []) if (x.name && !names.has(x.name)) names.set(x.name, x.rating);
      log(`Busca "${q}": ${r.results?.length ?? 0} resultados`);
    } catch (err) {
      log(`Busca "${q}" falhou: ${err instanceof Error ? err.message : err}`);
    }
  }
  const known = await prisma.prospect.findMany({ select: { name: true, phone: true } });
  const knownNames = new Set(known.map((k) => k.name.toLowerCase()));
  const knownPhones = new Set(known.map((k) => phoneKey(k.phone)).filter(Boolean));
  const clients = await prisma.client.findMany({ select: { name: true } });
  const clientNames = clients.map((c) => c.name.toLowerCase());
  for (const [name] of names) {
    if (st.found >= input.max) break;
    if (knownNames.has(name.toLowerCase()) || clientNames.some((c) => c.includes(name.toLowerCase()) || name.toLowerCase().includes(c.split("|")[0].trim()))) continue;
    try {
      const p = (await rt.call("/runtime/research/place", { query: `${name} ${input.city}`, name }, 150_000)) as Record<string, unknown>;
      if (p.encontrado === false) continue;
      const phone = normalizePhone(String(p.telefone ?? ""));
      if (!phone || knownPhones.has(phoneKey(phone))) {
        log(`${name}: sem telefone ou já prospectada`);
        continue;
      }
      // Celular quase sempre tem WhatsApp; fixo às vezes (WhatsApp Business): confere no envio
      const isMobile = phone.length === 13 && phone[4] === "9";
      const parsed = parseRating(p.notaETotal);
      const rating = parsed.rating;
      // O total de avaliações vem no resumo da ficha ("4,4 (123)" ou "123 avaliações")
      const resumo = String(p.resumo ?? "");
      const reviews = parsed.reviews ?? (Number((resumo.match(/\(([\d.]+)\)/)?.[1] ?? resumo.match(/([\d.]+)\s*(?:avalia|coment|reviews)/i)?.[1] ?? "").replace(/\D/g, "")) || null);
      const site = String(p.site ?? "").trim() || null;
      const gargalos = [...gargalosFromPlace({ rating, reviews, site }), ...(site ? await checkSite(site) : [])];
      const score = Math.max(0, Math.min(100, gargalos.reduce((a, g) => a + g.peso, 0) + (isMobile ? 0 : -5)));
      const message = await writeOpener({ name, city: input.city, niche: input.niche, gargalos, rating, reviews }).catch(() => null);
      await prisma.prospect.create({
        data: { campaign, name, phone, site, address: String(p.endereco ?? "") || null, rating, reviews, category: String(p.categoria ?? "") || null, score, gargalos: gargalos as unknown as object, message, status: "APROVAR", notes: isMobile ? null : "Telefone fixo: muita clínica usa WhatsApp Business no fixo. A LOTUS confere na hora de enviar; se não tiver, marca Sem WhatsApp." },
      });
      knownPhones.add(phoneKey(phone));
      st.found += 1;
      log(`${name}: nota ${rating ?? "?"} (${reviews ?? "?"}), ${gargalos.length} gargalo(s)`);
    } catch (err) {
      log(`${name}: falhou (${err instanceof Error ? err.message : err})`);
    }
  }
  await notify({ kind: "prospect", title: `Prospecção pronta: ${st.found} clínica(s)`, body: `${campaign}. As mensagens estão esperando sua aprovação.`, href: "/prospeccao" });
}

// Aprovar: entra na fila do WhatsApp da LOTUS (sai no horário e no ritmo do escudo)
export async function approveProspects(ids: string[]): Promise<{ queued: number; reason?: string }> {
  const lotus = await ensureLotusClient();
  const ch = await prisma.whatsappChannel.findUnique({ where: { clientId: lotus.id }, select: { status: true } });
  if (ch?.status !== "conectado") return { queued: 0, reason: "Conecte o WhatsApp da LOTUS (o seu) antes de aprovar: Prospecção > Conectar meu WhatsApp." };
  let queued = 0;
  for (const id of ids) {
    const p = await prisma.prospect.findUnique({ where: { id } });
    if (!p || p.status !== "APROVAR" || !p.phone || !p.message?.trim()) continue;
    try {
      await prisma.outboundMessage.create({ data: { clientId: lotus.id, kind: "prospeccao", refId: p.id, phone: p.phone, body: p.message.trim(), scheduledFor: new Date(Date.now() + queued * 60_000) } });
      await prisma.prospect.update({ where: { id }, data: { status: "NA_FILA" } });
      queued += 1;
    } catch {
      // já estava na fila
    }
  }
  return { queued };
}

// Chamado quando a mensagem de prospecção sai (ou falha)
export async function prospectSent(prospectId: string, ok: boolean, error?: string) {
  if (ok) {
    const p = await prisma.prospect.update({ where: { id: prospectId }, data: { status: "ENVIADO", sentAt: new Date() } });
    const conv = p.phone ? await prisma.conversation.findFirst({ where: { phone: p.phone }, orderBy: { lastMessageAt: "desc" } }) : null;
    if (conv) {
      await prisma.conversation.update({ where: { id: conv.id }, data: { prospectId } });
      await prisma.prospect.update({ where: { id: prospectId }, data: { conversationId: conv.id } });
    }
  } else {
    await prisma.prospect.update({ where: { id: prospectId }, data: { status: /não tem WhatsApp/i.test(error ?? "") ? "SEM_WHATSAPP" : "APROVAR", notes: error?.slice(0, 300) ?? null } });
  }
}
