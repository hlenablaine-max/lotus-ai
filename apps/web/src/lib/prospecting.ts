// Prospecção da LOTUS: acha clínicas no Google Maps, olha Google + site + Instagram de cada uma (uma versão rápida
// do diagnóstico), escreve uma primeira mensagem personalizada e, se o Ícaro quiser, prepara um SITE GRÁTIS com a
// marca real da clínica para usar como motivo da call. Depois que o Ícaro aprova, a mensagem sai pelo WhatsApp da
// LOTUS (escudo anti-ban) e quem responde conversa com a IA (SDR) até marcar a call com quem decide.
import { registry } from "@lotus/ai-engine";
import { prisma } from "@/lib/prisma";
import { createRuntimeClient } from "@/lib/runtime-client";
import { notify } from "@/lib/notify";
import { asJob } from "@/lib/background-jobs";
import { ensureLotusClient, normalizePhone, phoneKey } from "@/lib/whatsapp";

export interface Gargalo {
  tipo: string;
  texto: string; // frase curta e verificável, ex.: "só 23 avaliações no Google"
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

const IG_RE = /instagram\.com\/(?!p\/|reel\/|explore\/|accounts\/|stories\/)([A-Za-z0-9_.]{3,30})/i;

// Olha o site rapidamente: está no ar? tem HTTPS? tem botão de WhatsApp? demora? E pega o @ do Instagram
async function checkSite(url: string): Promise<{ gargalos: Gargalo[]; instagram: string | null }> {
  const out: Gargalo[] = [];
  const clean = url.trim().replace(/\s+/g, "");
  const full = /^https?:\/\//.test(clean) ? clean : `https://${clean}`;
  const t = Date.now();
  const get = (u: string) => fetch(u, { redirect: "follow", signal: AbortSignal.timeout(15_000), headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131 Safari/537.36" } });
  try {
    // Tenta com e sem HTTPS antes de dizer que o site não abre (gargalo falso queima a abordagem)
    const res = await get(full).catch(() => get(full.replace(/^https:/, "http:")));
    const ms = Date.now() - t;
    const html = (await res.text()).slice(0, 400_000);
    if (!res.ok) out.push({ tipo: "site_fora", texto: `o site (${new URL(full).hostname}) não abre direito (erro ${res.status})`, peso: 25 });
    if (!res.url.startsWith("https://")) out.push({ tipo: "sem_https", texto: "o site aparece como 'não seguro' no navegador", peso: 10 });
    if (!/wa\.me|api\.whatsapp\.com|whatsapp/i.test(html)) out.push({ tipo: "sem_whatsapp_site", texto: "o site não tem botão de WhatsApp para o paciente agendar", peso: 15 });
    if (ms > 6000) out.push({ tipo: "site_lento", texto: `o site demora ${Math.round(ms / 1000)} s para abrir`, peso: 10 });
    const ig = html.match(IG_RE)?.[1]?.replace(/\.$/, "") ?? null;
    return { gargalos: out, instagram: ig && !/^(share|sharer|intent)$/i.test(ig) ? ig : null };
  } catch {
    out.push({ tipo: "site_fora", texto: "o site informado no Google não abre", peso: 25 });
    return { gargalos: out, instagram: null };
  }
}

function gargalosFromPlace(p: { rating: number | null; reviews: number | null; site: string | null }): Gargalo[] {
  const g: Gargalo[] = [];
  if (p.reviews !== null && p.reviews < 40) g.push({ tipo: "poucas_avaliacoes", texto: `só ${p.reviews} avaliações no Google`, peso: 20 });
  if (p.rating !== null && p.rating < 4.5) g.push({ tipo: "nota_baixa", texto: `nota ${String(p.rating).replace(".", ",")} no Google`, peso: 20 });
  if (!p.site) g.push({ tipo: "sem_site", texto: "não tem site no Google, só o perfil", peso: 25 });
  return g;
}

interface IgProfile {
  found: boolean;
  isPrivate: boolean;
  followers: number | null;
  bio: string;
  externalLinks: string[];
  posts: Array<{ type: string; publishedAt: string | null; likes: number | null }>;
}

// Versão rápida da análise de Instagram do diagnóstico
function gargalosFromInstagram(handle: string, p: IgProfile): { gargalos: Gargalo[]; followers: number | null; lastPostDays: number | null } {
  const g: Gargalo[] = [];
  if (!p.found) return { gargalos: g, followers: null, lastPostDays: null };
  const dates = p.posts.map((x) => (x.publishedAt ? new Date(x.publishedAt).getTime() : 0)).filter(Boolean).sort((a, b) => b - a);
  const lastPostDays = dates.length ? Math.floor((Date.now() - dates[0]) / 86_400_000) : null;
  if (p.followers !== null && p.followers < 1500) g.push({ tipo: "ig_poucos_seguidores", texto: `@${handle} tem só ${p.followers.toLocaleString("pt-BR")} seguidores`, peso: 10 });
  if (lastPostDays !== null && lastPostDays > 20) g.push({ tipo: "ig_parado", texto: `o último post do @${handle} foi há ${lastPostDays} dias`, peso: 15 });
  if (dates.length >= 6 && Math.round((dates[0] - dates[Math.min(5, dates.length - 1)]) / 86_400_000) > 45) g.push({ tipo: "ig_pouco_frequente", texto: `o Instagram posta pouco (6 posts em mais de 45 dias)`, peso: 10 });
  if (p.posts.length && !p.posts.some((x) => x.type === "reel")) g.push({ tipo: "ig_sem_reels", texto: "o Instagram não usa Reels, que é o formato que mais alcança gente nova", peso: 10 });
  const bio = `${p.bio} ${p.externalLinks.join(" ")}`;
  if (!/wa\.me|whatsapp|linktr|link\.|agend/i.test(bio)) g.push({ tipo: "ig_bio_sem_link", texto: "a bio do Instagram não tem link de WhatsApp para agendar", peso: 15 });
  return { gargalos: g, followers: p.followers, lastPostDays };
}

// Primeira mensagem: pensada para quem atende (muitas vezes a recepção), sem cara de venda, com valor real
// Acha o Instagram da clínica pela busca do Instagram e só aceita se o nome bater (evita pegar a conta de outra clínica)
const STOP = new Set(["clinica", "odontologia", "odonto", "odontologica", "dentista", "estetica", "consultorio", "centro", "saude", "dr", "dra", "de", "da", "do", "das", "dos", "e", "the"]);
const words = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w.length > 2);
export async function findInstagram(name: string, city: string): Promise<string | null> {
  const rt = createRuntimeClient();
  const clean = name.replace(/\(.*?\)/g, "").trim();
  const r = (await rt.call("/runtime/research/instagram-search", { query: clean }, 90_000)) as { ok: boolean; users: Array<{ username: string; fullName: string }> };
  if (!r.ok || !r.users.length) return null;
  const nameWords = words(clean);
  const strong = nameWords.filter((w) => !STOP.has(w));
  const cityWords = words(city);
  let best: { username: string; score: number } | null = null;
  for (const u of r.users) {
    const hay = new Set([...words(u.fullName), ...words(u.username.replace(/[._]/g, " ")), u.username.toLowerCase().replace(/[._]/g, "")]);
    const joined = [...hay].join(" ");
    const strongHits = strong.filter((w) => joined.includes(w)).length;
    const allHits = nameWords.filter((w) => joined.includes(w)).length;
    const cityHit = cityWords.some((w) => joined.includes(w));
    // Precisa bater uma palavra que identifica a clínica (não só "odonto"), ou o nome todo + a cidade
    const score = strong.length ? strongHits / strong.length + (cityHit ? 0.3 : 0) : allHits / Math.max(1, nameWords.length) + (cityHit ? 0.5 : 0) - 0.4;
    if (!best || score > best.score) best = { username: u.username, score };
  }
  return best && best.score >= 0.75 ? best.username : null;
}

export async function writeOpener(p: { name: string; city: string; niche: string; gargalos: Gargalo[]; rating: number | null; reviews: number | null; siteUrl?: string | null; analisados?: string[] }): Promise<string> {
  const analisados = p.analisados?.length ? p.analisados.join(", ").replace(/, ([^,]*)$/, " e $1") : "o perfil no Google";
  const res = await registry.getDefault().complete({
    messages: [
      {
        role: "system",
        content: `Você escreve a PRIMEIRA mensagem de WhatsApp do Ícaro (fundador da LOTUS, que ajuda clínicas a ter mais pacientes) para o WhatsApp de uma clínica. Quem lê quase sempre é a RECEPÇÃO, não o dono. O objetivo é: (1) despertar curiosidade com algo concreto e verdadeiro, (2) fazer a recepção levar ao dono/responsável (pedir o contato dele ou o melhor horário), (3) conseguir uma conversa rápida de 15 minutos.
Técnica (persuasão honesta, sem mentir):
- 3 a 5 frases curtas, tom de gente, educado e direto. No máximo 1 emoji. Sem link. Sem preço. Sem "promoção", "oportunidade única", "parceria", "agência de marketing".
- Abra com um "oi" natural + "aqui é o Ícaro, da LOTUS". Logo depois, UMA observação específica e verdadeira da lista de gargalos (a mais forte), e em meia frase o que ela custa (paciente que procura e vai para outra clínica).
${p.siteUrl ? "- DIGA que você JÁ preparou um site novo para a clínica, de presente, sem custo e sem compromisso, e que quer mostrar para o(a) responsável em uma conversa rápida. Isso é verdade: o site existe." : `- Ofereça mostrar, sem custo, o que você encontrou numa análise rápida de ${analisados} da clínica para o(a) responsável. Cite SÓ esses canais: o que não está nessa lista você não olhou.`}
- Peça à recepção, com naturalidade, o nome e o melhor contato do(a) responsável/dono(a), OU que repasse a mensagem. Dê uma saída fácil ("se for você mesmo(a) que cuida disso, melhor ainda").
- Nunca invente número, cliente, resultado ou prazo. Varie a abertura e a pergunta a cada mensagem. O Ícaro é homem: "obrigado", nunca "obrigada". Responda só com a mensagem.`,
      },
      { role: "user", content: `Clínica: ${p.name} (${p.niche} em ${p.city}). Google: ${p.rating ?? "sem nota"} (${p.reviews ?? "?"} avaliações).\nGargalos encontrados (do mais forte para o mais fraco):\n${[...p.gargalos].sort((a, b) => b.peso - a.peso).map((g) => `- ${g.texto}`).join("\n") || "- nenhum gargalo forte: elogie algo real e pergunte como estão trazendo pacientes novos"}` },
    ],
    maxTokens: 350,
    temperature: 0.9,
  });
  return res.content.trim().replace(/^["']|["']$/g, "").slice(0, 800);
}

// Busca em segundo plano (uma por vez, para não pesar o computador)
export async function startSearch(input: { niche: string; city: string; max: number }): Promise<{ started: boolean; campaign: string; reason?: string }> {
  const campaign = `${input.niche} em ${input.city} — ${new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date())}`;
  if (state.__lotusProspecting) return { started: false, campaign, reason: "Já tem uma busca rodando. Espere ela terminar." };
  const rt = createRuntimeClient();
  if (!(await rt.available())) return { started: false, campaign, reason: "Abra o aplicativo LOTUS neste computador para buscar clínicas." };
  state.__lotusProspecting = { campaign, startedAt: Date.now(), found: 0, total: input.max, log: [] };
  void asJob("busca-clinicas", () => runSearch(input, campaign)).finally(() => {
    state.__lotusProspecting = null;
  });
  return { started: true, campaign };
}

async function runSearch(input: { niche: string; city: string; max: number }, campaign: string) {
  const rt = createRuntimeClient();
  const st = state.__lotusProspecting!;
  const log = (m: string) => st.log.push(m);
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
  const clients = await prisma.client.findMany({ where: { status: { not: "PROSPECT" } }, select: { name: true } });
  const clientNames = clients.map((c) => c.name.toLowerCase().split("|")[0].trim());
  for (const [rawName] of names) {
    if (st.found >= input.max) break;
    // Tira o que o Google gruda no nome ("·Link acessado", "(Dentista)")
    const name = rawName.split("·")[0].replace(/\((?:dentista|cl[ií]nica[^)]*|odont[^)]*)\)/gi, "").replace(/\s{2,}/g, " ").trim() || rawName;
    const low = name.toLowerCase();
    if (knownNames.has(low) || clientNames.some((c) => c && (c.includes(low) || low.includes(c)))) continue;
    try {
      const p = (await rt.call("/runtime/research/place", { query: `${name} ${input.city}`, name }, 150_000)) as Record<string, unknown>;
      if (p.encontrado === false) continue;
      const phone = normalizePhone(String(p.telefone ?? ""));
      if (!phone || knownPhones.has(phoneKey(phone))) {
        log(`${name}: sem telefone ou já prospectada`);
        continue;
      }
      const isMobile = phone.length === 13 && phone[4] === "9";
      const parsed = parseRating(p.notaETotal);
      const resumo = String(p.resumo ?? "");
      const rating = parsed.rating;
      // Total de avaliações: só o número logo depois da nota ("4,9 (75)") ou "75 avaliações" (nunca o DDD do telefone)
      const reviews = parsed.reviews ?? (Number((resumo.match(/\b[1-5][.,]\d\s*\(([\d.]+)\)/)?.[1] ?? resumo.match(/([\d.]+)\s*(?:avalia|coment|reviews)/i)?.[1] ?? "").replace(/\D/g, "")) || null);
      const site = String(p.site ?? "").trim() || null;
      const siteCheck = site ? await checkSite(site) : { gargalos: [], instagram: null };
      // Instagram: pelo link do site, pela ficha do Google ou pela busca do próprio Instagram (conferindo se é a mesma clínica)
      let instagram = siteCheck.instagram ?? resumo.match(IG_RE)?.[1] ?? null;
      if (!instagram) instagram = await findInstagram(name, input.city).catch(() => null);
      let ig = { gargalos: [] as Gargalo[], followers: null as number | null, lastPostDays: null as number | null };
      let igRead = false;
      if (instagram) {
        try {
          const prof = (await rt.call("/runtime/research/instagram", { handle: instagram, maxPosts: 9 }, 150_000)) as IgProfile;
          ig = gargalosFromInstagram(instagram, prof);
          igRead = prof.found;
        } catch (err) {
          log(`${name}: Instagram não lido (${err instanceof Error ? err.message.slice(0, 60) : err})`);
        }
      } else {
        ig.gargalos.push({ tipo: "sem_instagram", texto: "não encontramos um Instagram da clínica", peso: 10 });
      }
      const gargalos = [...gargalosFromPlace({ rating, reviews, site }), ...siteCheck.gargalos, ...ig.gargalos];
      const score = Math.max(0, Math.min(100, gargalos.reduce((a, g) => a + g.peso, 0) + (isMobile ? 0 : -5)));
      const analisados = ["o perfil no Google", ...(site ? ["o site"] : []), ...(igRead ? ["o Instagram"] : [])];
      const message = await writeOpener({ name, city: input.city, niche: input.niche, gargalos, rating, reviews, analisados }).catch(() => null);
      await prisma.prospect.create({
        data: {
          campaign, name, phone, site, instagram, followers: ig.followers, lastPostDays: ig.lastPostDays,
          address: String(p.endereco ?? "") || null, rating, reviews, category: String(p.categoria ?? "") || null,
          score, gargalos: gargalos as unknown as object, message, status: "APROVAR",
          notes: isMobile ? null : "Telefone fixo: muita clínica usa WhatsApp Business no fixo. A LOTUS confere na hora de enviar.",
        },
      });
      knownPhones.add(phoneKey(phone));
      st.found += 1;
      log(`${name}: nota ${rating ?? "?"} (${reviews ?? "?"})${instagram ? `, @${instagram}` : ""}, ${gargalos.length} gargalo(s)`);
    } catch (err) {
      log(`${name}: falhou (${err instanceof Error ? err.message : err})`);
    }
  }
  await notify({ kind: "prospect", title: `Prospecção pronta: ${st.found} clínica(s)`, body: `${campaign}. As mensagens estão esperando sua aprovação.`, href: "/prospeccao" });
}

// ===== Site grátis para a clínica prospectada =====

// Monta o site com a marca real (logo, fotos e cores do Instagram), passando pela mesma revisão de qualidade dos clientes
export async function prepareFreeSite(prospectId: string): Promise<{ started: boolean; reason?: string }> {
  const p = await prisma.prospect.findUnique({ where: { id: prospectId } });
  if (!p) return { started: false, reason: "Clínica não encontrada" };
  if (p.siteMissionId && !p.siteUrl) return { started: false, reason: "O site já está sendo montado." };
  if (!p.instagram) return { started: false, reason: "Sem Instagram da clínica: a LOTUS precisa das fotos e do logo reais para montar o site." };
  const rt = createRuntimeClient();
  if (!(await rt.available())) return { started: false, reason: "Abra o aplicativo LOTUS neste computador." };
  const handle = p.instagram.replace(/^@/, "");
  // Marca já como "preparando" para um segundo clique não montar outro site
  await prisma.prospect.update({ where: { id: p.id }, data: { siteMissionId: "preparando" } });
  try {
    return await asJob("site-gratis", () => buildFreeSite(p, handle));
  } catch (err) {
    await prisma.prospect.update({ where: { id: p.id }, data: { siteMissionId: null } });
    throw err;
  }
}

async function buildFreeSite(p: NonNullable<Awaited<ReturnType<typeof prisma.prospect.findUnique>>>, handle: string): Promise<{ started: boolean; reason?: string }> {
  const rt = createRuntimeClient();
  // Kit de marca (logo, fotos, cores): o mesmo do diagnóstico
  const brand = (await rt.call("/runtime/research/brand", { handle, site: p.site }, 300_000)) as Record<string, unknown>;
  const profile = (await rt.call("/runtime/research/instagram", { handle, maxPosts: 9 }, 150_000).catch(() => null)) as (IgProfile & { fullTitle?: string }) | null;
  const client = await prisma.client.create({
    data: { name: `${p.name} (prospecção)`, slug: `prospect-${handle.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now().toString(36)}`, segment: p.category ?? null, instagram: `@${handle}`, website: p.site, status: "PROSPECT", description: `Clínica prospectada pela LOTUS. Endereço: ${p.address ?? "não informado"}.` },
  });
  const mission = await prisma.mission.create({
    data: { clientId: client.id, title: `Site grátis — ${p.name}`, description: "Site de presente para a clínica prospectada (motivo da call).", objective: "Mostrar ao dono da clínica, numa call de 15 minutos, um site novo com a marca real dele.", status: "IN_PROGRESS", context: { prospectId: p.id, handle } as object },
  });
  const brief = {
    perfil: { nome: p.name, categoria: p.category, endereco: p.address, google: { nota: p.rating, avaliacoes: p.reviews }, instagram: profile ? { titulo: profile.fullTitle, bio: profile.bio, seguidores: profile.followers } : null },
    whatsappEncontrado: p.phone ? [p.phone] : [],
    negocioDeSaude: true,
    observacao: "Site de PRÉVIA para apresentar ao dono numa call. Use só dados reais coletados; o que faltar vira marcador curto.",
  };
  const { createSiteChain } = await import("@/lib/site-builder");
  const chain = await createSiteChain({ missionId: mission.id, businessName: p.name, handle, brief, brand, dependsOn: [] });
  if (!chain) {
    await prisma.prospect.update({ where: { id: p.id }, data: { siteMissionId: null } });
    return { started: false, reason: "Faltam os agentes de web ou de qualidade." };
  }
  await prisma.prospect.update({ where: { id: p.id }, data: { siteMissionId: mission.id } });
  const { runTask } = await import("@/lib/task-runner");
  runTask(chain.buildId);
  return { started: true };
}

// Confere se algum site grátis ficou pronto: guarda o link e reescreve a mensagem (agora pode falar do site)
export async function syncFreeSites(): Promise<void> {
  // Site grátis que morreu no meio (PC desligado, servidor reiniciado): libera o botão de novo depois de 30 min
  await prisma.prospect.updateMany({ where: { siteMissionId: "preparando", updatedAt: { lt: new Date(Date.now() - 30 * 60_000) } }, data: { siteMissionId: null } });
  const pending = await prisma.prospect.findMany({ where: { siteMissionId: { not: null }, NOT: { siteMissionId: "preparando" }, siteUrl: null } });
  for (const p of pending) {
    const decision = await prisma.task.findFirst({ where: { missionId: p.siteMissionId!, title: { startsWith: "Decisão sobre o site" }, status: "COMPLETED" }, orderBy: { completedAt: "desc" }, select: { output: true } });
    const out = (decision?.output ?? null) as { url?: string; aprovado?: boolean } | null;
    if (!out?.url || !out.aprovado) continue;
    const update: Record<string, unknown> = { siteUrl: out.url };
    if (p.status === "APROVAR") {
      const city = p.campaign.split(" em ")[1]?.split(" — ")[0] ?? "";
      const niche = p.campaign.split(" em ")[0] ?? "clínica";
      update.message = await writeOpener({ name: p.name, city, niche, gargalos: (p.gargalos ?? []) as unknown as Gargalo[], rating: p.rating, reviews: p.reviews, siteUrl: out.url, analisados: ["o perfil no Google", ...(p.site ? ["o site"] : []), ...(p.instagram ? ["o Instagram"] : [])] }).catch(() => p.message);
    }
    await prisma.prospect.update({ where: { id: p.id }, data: update });
    await notify({ kind: "prospect", title: `Site grátis da ${p.name} pronto`, body: `${out.url}${p.status === "APROVAR" ? " · a mensagem foi reescrita para oferecer o site" : ""}`, href: "/prospeccao" });
  }
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


// ===== SDR: chamar o dono direto com o contato que a recepção passou =====

// Primeira mensagem para o dono: indicado pela recepção, gargalos em linguagem de dinheiro (estimativa honesta),
// site grátis (só se existir) e convite para 15 minutos
export async function writeOwnerOpener(p: { name: string; ownerName: string | null; referredBy: string | null; gargalos: Gargalo[]; siteUrl: string | null }): Promise<string> {
  const res = await registry.getDefault().complete({
    messages: [
      {
        role: "system",
        content: `Você escreve a mensagem de WhatsApp do Ícaro (fundador da LOTUS, que ajuda clínicas a ter mais pacientes) para o DONO/RESPONSÁVEL de uma clínica, cujo contato a recepção passou. Objetivo: o dono aceitar uma conversa de 15 minutos.
Como escrever (persuasão forte e HONESTA):
- 4 a 6 frases curtas, tom de gente, educado, confiante, sem textão e sem cara de vendedor. No máximo 1 emoji. Sem link. Sem preço.
- Abra pelo nome dele(a) se souber, diga quem é e que ${p.referredBy ? `${p.referredBy}, da recepção,` : "a recepção"} passou o contato.
- Diga que analisou a clínica e encontrou gargalos concretos (cite 1 ou 2 da lista, os mais fortes) e explique em linguagem de dinheiro: paciente que procura e fecha com o concorrente.
- Use ESTIMATIVA, nunca número como fato: algo como "pelo que vi, dá para estimar que vocês estão deixando pacientes (e dinheiro) na mesa toda semana — te mostro a conta". Nunca diga um número exato de pacientes ou reais.
${p.siteUrl ? "- Conte que, para mostrar na prática, você JÁ fez um site profissional novo para a clínica, de presente e sem compromisso (isso é verdade: o site existe), e que quer entregar e mostrar numa conversa rápida." : "- Ofereça mostrar o diagnóstico completo, sem custo, numa conversa rápida."}
- Termine pedindo 15 minutos e oferecendo escolher o melhor dia (hoje/amanhã), de forma leve.
- Nunca invente cliente, resultado, prazo ou número. O Ícaro é homem: "obrigado". Responda só com a mensagem.`,
      },
      { role: "user", content: `Clínica: ${p.name}\nNome do responsável: ${p.ownerName ?? "não sabemos"}\nGargalos:\n${[...p.gargalos].sort((a, b) => b.peso - a.peso).map((g) => `- ${g.texto}`).join("\n") || "- presença digital fraca (pouca visibilidade para quem pesquisa)"}` },
    ],
    maxTokens: 400,
    temperature: 0.8,
    signal: AbortSignal.timeout(60_000),
  });
  return res.content.trim().replace(/^["']|["']$/g, "").slice(0, 900);
}

// Guarda o telefone do dono e agenda a mensagem para ele (sai alguns minutos depois, pelo escudo anti-ban)
export async function followUpOwner(prospectId: string, contato: string, referredBy: string | null): Promise<boolean> {
  const digitsOnly = contato.replace(/\D/g, "");
  const m = digitsOnly.match(/(55)?(\d{2})(9?\d{8})$/);
  const phone = m ? normalizePhone(`${m[2]}${m[3]}`) : null;
  if (!phone) return false;
  const p = await prisma.prospect.findUnique({ where: { id: prospectId } });
  if (!p || p.ownerPhone === phone) return false;
  if (phoneKey(phone) === phoneKey(p.phone)) return false; // é o mesmo número da clínica
  const ownerName = contato.replace(/[+\d()\-\s]{8,}.*/, "").replace(/[-–:|,]+\s*$/, "").trim() || null;
  const message = await writeOwnerOpener({ name: p.name.replace(/\s*\(TESTE\)\s*/i, ""), ownerName: ownerName && ownerName.length > 2 ? ownerName : null, referredBy: referredBy && !/^\+?\d/.test(referredBy) ? referredBy.split(" ")[0] : null, gargalos: (p.gargalos ?? []) as unknown as Gargalo[], siteUrl: p.siteUrl });
  const lotus = await ensureLotusClient();
  await prisma.prospect.update({ where: { id: p.id }, data: { ownerPhone: phone } });
  await prisma.outboundMessage.create({ data: { clientId: lotus.id, kind: "prospeccao_dono", refId: p.id, phone, body: message, scheduledFor: new Date(Date.now() + 2 * 60_000) } }).catch(() => undefined);
  await notify({ kind: "prospect", title: `IA vai chamar o responsável da ${p.name}`, body: `Em ~2 min, no ${phone.replace(/^55/, "")}: "${message.slice(0, 160)}…"`, href: "/prospeccao" });
  return true;
}

// Mensagem para o dono saiu: liga a conversa nova ao prospect (para a IA saber que é o dono)
export async function ownerMessageSent(prospectId: string) {
  const p = await prisma.prospect.findUnique({ where: { id: prospectId } });
  if (!p?.ownerPhone) return;
  const key = phoneKey(p.ownerPhone);
  const convs = await prisma.conversation.findMany({ where: { phone: { endsWith: key?.slice(-8) ?? "x" } }, orderBy: { lastMessageAt: "desc" }, take: 3 });
  const conv = convs.find((c) => phoneKey(c.phone) === key);
  if (conv) await prisma.conversation.update({ where: { id: conv.id }, data: { prospectId, aiPausedUntil: null } });
}
