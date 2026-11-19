// Diagnóstico 360: a partir do link do Instagram de um lead, o app coleta os dados públicos do
// negócio (perfil, posts, vídeos, link da bio, anúncios, Google) e a equipe de agentes analisa
// cada frente, fecha um diagnóstico consolidado e prepara a reunião de apresentação.

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { createRuntimeClient, type RuntimeClient } from "@/lib/runtime-client";
import { markRunning, runTask, unmarkRunning } from "@/lib/task-runner";

export interface DiagnosisInput {
  instagram: string;
  website?: string;
  city?: string;
  // O dono marcou, ao pedir o diagnóstico, que quer o teste de atendimento no WhatsApp
  testWhatsApp?: boolean;
  // Depois do diagnóstico, a equipe já produz as soluções (padrão: sim)
  produce?: boolean;
}

interface InstagramPost {
  url: string;
  type: "reel" | "post";
  likes: number | null;
  comments: number | null;
  publishedAt: string | null;
  caption: string;
  thumbnailAlt: string;
}

interface InstagramProfile {
  handle: string;
  url: string;
  found: boolean;
  isPrivate: boolean;
  loginWall: boolean;
  loggedIn: boolean;
  fullTitle: string;
  followers: number | null;
  following: number | null;
  postsCount: number | null;
  bio: string;
  headerText: string;
  externalLinks: string[];
  highlights: string[];
  posts: InstagramPost[];
  screenshot: string | null;
}

type Json = Record<string, unknown>;

export const WHATSAPP_PROBE_MESSAGE = "Olá! Vi o perfil de vocês no Instagram e gostaria de saber como funciona para agendar uma avaliação. Podem me passar mais informações?";

export function normalizeHandle(input: string): string {
  return input
    .trim()
    .replace(/^@/, "")
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .split(/[/?#]/)[0]
    .toLowerCase();
}

const SOCIAL_OR_CHAT = /instagram\.com|facebook\.com|tiktok\.com|youtube\.com|wa\.me|whatsapp\.com|linkedin\.com|google\.com\/maps|goo\.gl|maps\.app/i;

// "Central do Sorriso | Clínica Odontológica | Feira de Santana (@x) • Instagram" → "Central do Sorriso"
function businessNameFromTitle(title: string, handle: string): string {
  const full = title.split("(@")[0].replace(/•.*$/, "").trim();
  const short = full.split(/\s[|•·–—-]\s/)[0].trim();
  const name = short.length >= 3 ? short : full;
  return name && !/^instagram$/i.test(name) ? name : `@${handle}`;
}

// Indicadores calculados direto dos dados (sem IA), para os agentes partirem de números reais.
function computeMetrics(profile: InstagramProfile) {
  const posts = profile.posts;
  const withLikes = posts.filter((p) => p.likes !== null);
  const followers = profile.followers ?? 0;
  const engagement = (p: InstagramPost) => (followers > 0 && p.likes !== null ? ((p.likes + (p.comments ?? 0)) / followers) * 100 : null);
  const rates = withLikes.map(engagement).filter((r): r is number => r !== null);
  const dates = posts.map((p) => (p.publishedAt ? new Date(p.publishedAt).getTime() : null)).filter((d): d is number => d !== null).sort((a, b) => b - a);
  const spanDays = dates.length > 1 ? (dates[0] - dates[dates.length - 1]) / 86_400_000 : null;
  const ctaRegex = /agend|link na bio|whats|chame|clique|direct|\bdm\b|marque|garanta|saiba mais|fale conosco|ligue/i;
  return {
    seguidores: profile.followers,
    seguindo: profile.following,
    totalDePosts: profile.postsCount,
    postsAnalisados: posts.length,
    reelsEntreOsAnalisados: posts.filter((p) => p.type === "reel").length,
    taxaDeEngajamentoMediaPct: rates.length ? Number((rates.reduce((a, b) => a + b, 0) / rates.length).toFixed(2)) : null,
    mediaDeCurtidas: withLikes.length ? Math.round(withLikes.reduce((a, p) => a + (p.likes ?? 0), 0) / withLikes.length) : null,
    mediaDeComentarios: withLikes.length ? Math.round(withLikes.reduce((a, p) => a + (p.comments ?? 0), 0) / withLikes.length) : null,
    diasDesdeOUltimoPost: dates.length ? Math.floor((Date.now() - dates[0]) / 86_400_000) : null,
    postsPorSemana: spanDays && spanDays > 0 ? Number(((dates.length - 1) / (spanDays / 7)).toFixed(1)) : null,
    legendasComChamadaParaAcao: posts.filter((p) => ctaRegex.test(p.caption)).length,
    tamanhoMedioDaLegenda: posts.length ? Math.round(posts.reduce((a, p) => a + p.caption.length, 0) / posts.length) : 0,
    quantidadeDeDestaques: profile.highlights.length,
    temLinkNaBio: profile.externalLinks.length > 0,
    observacao: "Curtidas ocultas pelo perfil aparecem como nulas. A taxa de engajamento usa (curtidas + comentários) ÷ seguidores dos posts analisados.",
  };
}

async function resolveAgent(preferredId: string, department: string): Promise<string | null> {
  const byId = await prisma.agent.findFirst({ where: { id: preferredId, isActive: true }, select: { id: true } });
  if (byId) return byId.id;
  const byDept = await prisma.agent.findFirst({ where: { department, isActive: true }, select: { id: true } });
  return byDept?.id ?? null;
}

async function safeCollect<T>(label: string, fn: () => Promise<T>): Promise<T | { erro: string }> {
  try {
    return await fn();
  } catch (err) {
    return { erro: `${label}: ${err instanceof Error ? err.message : String(err)}` };
  }
}

const hasError = (value: unknown): value is { erro: string } => !!value && typeof value === "object" && "erro" in (value as Json);

export async function startDiagnosis(input: DiagnosisInput): Promise<{ missionId: string; clientId: string; clientName: string; handle: string }> {
  const handle = normalizeHandle(input.instagram);
  if (!handle) throw new Error("Informe o link ou @ do Instagram do lead.");

  const runtime = createRuntimeClient();
  if (!(await runtime.available())) {
    throw new Error("O diagnóstico usa o navegador do aplicativo desktop para ler o Instagram, o site e os anúncios. Abra o aplicativo LOTUS neste computador e tente de novo.");
  }

  // Mesmo lead = mesmo cliente (procura pelo @, com ou sem arroba)
  const existing = await prisma.client.findFirst({
    where: { OR: [{ instagram: { equals: handle, mode: "insensitive" } }, { instagram: { equals: `@${handle}`, mode: "insensitive" } }] },
  });
  const client =
    existing ??
    (await prisma.client.create({
      data: {
        name: `@${handle}`,
        slug: `${handle.replace(/[^a-z0-9]+/g, "-")}-${Date.now().toString(36)}`,
        instagram: handle,
        website: input.website || null,
        status: "PROSPECT",
        description: "Lead recebido para diagnóstico.",
      },
    }));

  const mission = await prisma.mission.create({
    data: {
      clientId: client.id,
      title: `Diagnóstico 360 — ${client.name}`,
      description: `Diagnóstico completo do negócio a partir do Instagram @${handle}: presença digital, conteúdo, vídeos, anúncios, site, reputação, atendimento e funil.`,
      objective: "Identificar os gargalos que impedem o negócio de atrair e converter mais clientes e definir o plano de ação da LOTUS.",
      type: "INTELLIGENCE",
      priority: "HIGH",
      status: "IN_PROGRESS",
      startedAt: new Date(),
      context: { diagnosis360: true, handle, city: input.city ?? null, website: input.website ?? null, testWhatsApp: !!input.testWhatsApp, produce: input.produce !== false, host: os.hostname() },
    },
  });

  const collectorId = await resolveAgent("agent-bi", "bi");
  const collectTask = await prisma.task.create({
    data: {
      missionId: mission.id,
      agentId: collectorId,
      title: "Coleta de dados públicos (Instagram, vídeos, site, anúncios, Google)",
      description: "O navegador do aplicativo lê o perfil, os posts e vídeos recentes, o link da bio, a biblioteca de anúncios da Meta e o Google Maps.",
      instructions: "Etapa automática do sistema: nenhum dado é estimado, só o que foi lido das páginas.",
      // Marca a etapa como do sistema: se o app fechar no meio, ela é retomada sozinha ao reabrir
      input: { systemStep: "diagnosis_collect" },
      output: { host: os.hostname() },
      status: "IN_PROGRESS",
      startedAt: new Date(),
    },
  });
  await prisma.activityLog.create({
    data: { clientId: client.id, missionId: mission.id, taskId: collectTask.id, agentId: collectorId, action: "DIAGNOSIS_STARTED", details: { handle }, level: "INFO" },
  });

  launchCollection({ input, handle, clientId: client.id, missionId: mission.id, collectTaskId: collectTask.id, runtime });

  return { missionId: mission.id, clientId: client.id, clientName: client.name, handle };
}

type CollectionContext = Parameters<typeof collectAndAnalyze>[0];

// Roda a coleta em segundo plano e registra a falha na missão se algo der errado.
function launchCollection(ctx: CollectionContext): void {
  markRunning(ctx.collectTaskId);
  const job = collectAndAnalyze(ctx)
    .catch(async (err) => {
      console.error("[diagnosis-360]", err);
      const message = err instanceof Error ? err.message : String(err);
      await prisma.task.update({ where: { id: ctx.collectTaskId }, data: { status: "FAILED", output: { error: message } } }).catch(() => {});
      await prisma.mission.update({ where: { id: ctx.missionId }, data: { status: "FAILED" } }).catch(() => {});
      await prisma.activityLog.create({ data: { missionId: ctx.missionId, clientId: ctx.clientId, action: "DIAGNOSIS_FAILED", details: { error: message }, level: "ERROR" } }).catch(() => {});
    })
    .finally(() => unmarkRunning(ctx.collectTaskId));
  try {
    after(job);
  } catch {
    // fora de um contexto de requisição: segue em segundo plano
  }
}

async function collectAndAnalyze(ctx: {
  input: DiagnosisInput;
  handle: string;
  clientId: string;
  missionId: string;
  collectTaskId: string;
  runtime: RuntimeClient;
}): Promise<void> {
  const { input, handle, clientId, missionId, collectTaskId, runtime } = ctx;

  // 1) Instagram
  const profile = (await runtime.call("/runtime/research/instagram", { handle, maxPosts: 9 }, 240_000)) as InstagramProfile;
  if (!profile.found) {
    const reason = profile.loginWall
      ? "O Instagram pediu login para mostrar este perfil. Conecte uma conta em Diagnóstico > Contas conectadas e rode de novo."
      : profile.isPrivate
        ? "O perfil é privado: não há dados públicos para analisar."
        : `Perfil @${handle} não encontrado. Confira se o link está certo.`;
    throw new Error(reason);
  }

  const businessName = businessNameFromTitle(profile.fullTitle, handle);

  // 2) Link da bio / site
  const candidateSite = input.website || profile.externalLinks.find((l) => !SOCIAL_OR_CHAT.test(l)) || null;
  let site: Json | { erro: string } | null = null;
  let mainSite: Json | { erro: string } | null = null;
  if (candidateSite) {
    site = await safeCollect("Site", () => runtime.call("/runtime/research/site", { url: candidateSite, name: handle }, 120_000) as Promise<Json>);
    // Se o link da bio é um agregador (Linktree etc.), analisa também o site de verdade listado nele
    if (!hasError(site) && site.isLinkAggregator) {
      const real = ((site.outboundLinks as string[] | undefined) ?? []).find((l) => !SOCIAL_OR_CHAT.test(l) && !/linktr\.ee|bio\.link|beacons\.ai/i.test(l));
      if (real) mainSite = await safeCollect("Site principal", () => runtime.call("/runtime/research/site", { url: real, name: handle }, 120_000) as Promise<Json>);
    }
    // Link da bio é uma página interna (ex.: /instagram): analisa também a página inicial do site
    if (!mainSite) {
      try {
        const parsed = new URL(/^https?:\/\//i.test(candidateSite) ? candidateSite : `https://${candidateSite}`);
        if (parsed.pathname.replace(/\/+$/, "") !== "") {
          mainSite = await safeCollect("Site principal", () => runtime.call("/runtime/research/site", { url: parsed.origin, name: handle }, 120_000) as Promise<Json>);
        }
      } catch {
        // link inválido: segue só com o que já foi coletado
      }
    }
  }

  // 3) Biblioteca de anúncios da Meta
  const ads = await safeCollect("Anúncios", () => runtime.call("/runtime/research/ads", { query: businessName.startsWith("@") ? handle : businessName }, 120_000) as Promise<Json>);
  let matchingAds: Json[] = [];
  if (!hasError(ads)) {
    const tokens = businessName.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9]+/).filter((t) => t.length >= 4);
    matchingAds = ((ads.ads as Json[] | undefined) ?? []).filter((ad) => {
      const advertiser = String(ad.advertiser ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
      return tokens.length > 0 && tokens.filter((t) => advertiser.includes(t)).length >= Math.min(2, tokens.length);
    });
  }

  // 4) Google Maps
  const mapsQuery = [businessName.startsWith("@") ? handle : businessName, input.city].filter(Boolean).join(" ");
  const maps = await safeCollect("Google Maps", () => runtime.call("/runtime/research/maps", { query: mapsQuery }, 90_000) as Promise<Json>);

  // 5) Vídeos: transcrição da fala e quadros dos 3 reels mais recentes
  const reels = profile.posts.filter((p) => p.type === "reel").slice(0, 3);
  // Primeiro baixa tudo com o navegador, depois fecha o navegador e só então transcreve:
  // navegador + transcrição ao mesmo tempo estouram a memória em computadores com 8 GB.
  const downloads: Array<{ reel: (typeof reels)[number]; files: string[]; erro?: string }> = [];
  for (const reel of reels) {
    const dl = await safeCollect("Vídeo", () => runtime.call("/runtime/research/reel-download", { url: reel.url, name: handle }, 180_000) as Promise<Json>);
    downloads.push(hasError(dl) ? { reel, files: [], erro: dl.erro } : { reel, files: (dl.files as string[] | undefined) ?? [] });
  }
  await runtime.call("/runtime/research/release", {}, 30_000).catch(() => {});
  const videos: Json[] = [];
  for (const dl of downloads) {
    if (dl.erro) {
      videos.push({ ...dl.reel, analise: dl.erro });
      continue;
    }
    const media = await safeCollect("Vídeo", () => runtime.call("/runtime/research/reel-analyze", { url: dl.reel.url, name: handle, files: dl.files }, 660_000) as Promise<Json>);
    videos.push({ ...dl.reel, ...(hasError(media) ? { analise: media.erro } : media) });
  }

  // WhatsApp encontrado na bio ou no site
  const whatsappNumbers = [
    ...profile.externalLinks.map((l) => decodeURIComponent(l).match(/(?:phone=|wa\.me\/)\+?(\d{10,15})/)?.[1]),
    ...(!hasError(site) && site ? ((site.whatsappNumbers as string[] | undefined) ?? []) : []),
    ...(!hasError(mainSite) && mainSite ? ((mainSite.whatsappNumbers as string[] | undefined) ?? []) : []),
  ].filter((n): n is string => !!n);
  const whatsapp = [...new Set(whatsappNumbers)];

  const metrics = computeMetrics(profile);

  // Atualiza o cadastro do lead com o que foi descoberto
  const current = await prisma.client.findUnique({ where: { id: clientId }, select: { name: true, website: true } });
  // Só vale como "site do negócio" uma página de verdade (não agregador de links nem redirecionamento para WhatsApp)
  const pageUrl = (s: Json | { erro: string } | null): string => {
    if (!s || hasError(s)) return "";
    const page = s as Json;
    return !page.isLinkAggregator && !page.redirectsToWhatsApp && page.finalUrl ? String(page.finalUrl) : "";
  };
  const siteUrl = pageUrl(mainSite) || pageUrl(site);
  await prisma.client.update({
    where: { id: clientId },
    data: {
      name: current?.name.startsWith("@") ? businessName : undefined,
      website: current?.website || siteUrl || undefined,
      description: profile.bio ? `Bio do Instagram: ${profile.bio}`.slice(0, 500) : undefined,
    },
  });
  await prisma.mission.update({ where: { id: missionId }, data: { title: `Diagnóstico 360 — ${businessName}` } });

  const collected = {
    negocio: businessName,
    instagram: { ...profile, posts: profile.posts },
    indicadores: metrics,
    videos,
    linkDaBio: candidateSite,
    site,
    sitePrincipal: mainSite,
    anuncios: hasError(ads) ? ads : { totalDaBuscaPorPalavraChave: ads.totalText, anunciosDoProprioNegocio: matchingAds, outrosAnunciosDaBusca: ((ads.ads as Json[] | undefined) ?? []).filter((a) => !matchingAds.includes(a)).slice(0, 5), urlDaBiblioteca: ads.url },
    googleMaps: maps,
    whatsappEncontrado: whatsapp,
    coletadoEm: new Date().toISOString(),
  };

  const summaryLines = [
    `# Dados coletados — ${businessName} (@${handle})`,
    ``,
    `- Seguidores: ${metrics.seguidores ?? "não visível"} · Posts: ${metrics.totalDePosts ?? "?"} · Destaques: ${metrics.quantidadeDeDestaques}`,
    `- Engajamento médio: ${metrics.taxaDeEngajamentoMediaPct ?? "n/d"}% · Posts por semana: ${metrics.postsPorSemana ?? "n/d"} · Último post há ${metrics.diasDesdeOUltimoPost ?? "?"} dia(s)`,
    `- Link na bio: ${candidateSite ?? "nenhum"}`,
    `- Anúncios ativos do próprio negócio na Meta: ${hasError(ads) ? "não foi possível verificar" : matchingAds.length}`,
    `- WhatsApp encontrado: ${whatsapp.join(", ") || "nenhum"}`,
    `- Vídeos analisados: ${videos.length}`,
    ``,
    "```json",
    JSON.stringify(collected, null, 1).slice(0, 60_000),
    "```",
  ];
  await prisma.document.create({
    data: { clientId, missionId, taskId: collectTaskId, title: `Dados coletados — ${businessName}`, type: "RESEARCH_REPORT", content: summaryLines.join("\n"), status: "APPROVED" },
  });
  await prisma.task.update({
    where: { id: collectTaskId },
    data: { status: "COMPLETED", completedAt: new Date(), output: { text: summaryLines.slice(2, 8).join("\n"), documents: [{ title: `Dados coletados — ${businessName}`, type: "report" }] } },
  });
  await prisma.activityLog.create({
    data: { clientId, missionId, taskId: collectTaskId, action: "DIAGNOSIS_DATA_COLLECTED", details: { handle, posts: profile.posts.length, videos: videos.length, ads: matchingAds.length, whatsapp: whatsapp.length }, level: "INFO" },
  });

  await createAnalysisTasks({ missionId, businessName, handle, profile, metrics, videos, site, mainSite, candidateSite, ads: collected.anuncios as Json, maps, whatsapp, produce: input.produce !== false });

  // Teste de atendimento no WhatsApp
  if (whatsapp.length > 0) {
    const payload = { action: "whatsapp_probe", phone: whatsapp[0], message: WHATSAPP_PROBE_MESSAGE, clientId, agentId: await resolveAgent("agent-sales", "sales") };
    const approval = await prisma.approval.create({
      data: {
        missionId,
        requestedBy: payload.agentId ?? "agent-sales",
        type: "SEND_EXTERNAL_MESSAGE",
        title: `Teste de atendimento no WhatsApp — ${businessName}`,
        description: `Enviar uma mensagem de cliente interessado para ${whatsapp[0]} e medir se e em quanto tempo a empresa responde (inclusive resposta automática).\n\nMensagem: "${WHATSAPP_PROBE_MESSAGE}"`,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        payload: payload as any,
        status: "PENDING",
      },
    });
    if (input.testWhatsApp) {
      // O dono já autorizou este teste ao pedir o diagnóstico
      const { decideApprovalBySystem } = await import("@/lib/approval-actions");
      await decideApprovalBySystem(approval.id, "Autorizado pelo dono ao iniciar o diagnóstico");
    }
  }
}

interface AnalysisContext {
  missionId: string;
  businessName: string;
  handle: string;
  profile: InstagramProfile;
  metrics: ReturnType<typeof computeMetrics>;
  videos: Json[];
  site: Json | { erro: string } | null;
  mainSite: Json | { erro: string } | null;
  candidateSite: string | null;
  ads: Json;
  maps: Json | { erro: string };
  whatsapp: string[];
  produce: boolean;
}

const RULES = [
  "REGRAS DO DIAGNÓSTICO:",
  "- Baseie cada afirmação nos dados do contexto e cite o dado (ex.: \"3 de 9 legendas têm chamada para ação\").",
  "- O que não estiver nos dados é HIPÓTESE: marque como hipótese e diga como confirmar. Nunca invente números.",
  "- Se um dado veio com erro ou vazio, diga que não foi possível verificar — isso não é um problema do cliente.",
  "- Entregue: nota de 0 a 10 da sua frente, o que está bom, os gargalos em ordem de impacto, ganhos rápidos (até 7 dias) e melhorias estruturais.",
  "- Para cada gargalo, explique em uma frase POR QUE ele faz a clínica perder pacientes ou dinheiro, em linguagem simples (o dono da agência está aprendendo).",
  "- Todos os dados já foram coletados e estão no contexto. Não use exec_local nem run_browser; se precisar conferir uma página, use fetch_url.",
  "- Seja direto. Salve o resultado com save_document.",
].join("\n");

async function createAnalysisTasks(c: AnalysisContext): Promise<void> {
  const profileSlim = {
    handle: c.profile.handle,
    seguidores: c.profile.followers,
    bio: c.profile.bio,
    textoDoCabecalho: c.profile.headerText,
    linksNaBio: c.profile.externalLinks,
    destaques: c.profile.highlights,
  };
  const postsSlim = c.profile.posts.map((p) => ({ tipo: p.type, data: p.publishedAt, curtidas: p.likes, comentarios: p.comments, legenda: p.caption, descricaoDaImagem: p.thumbnailAlt, url: p.url }));
  const siteShots = [c.mainSite, c.site].flatMap((s) => (s && !hasError(s) ? ((s.screenshots as string[] | undefined) ?? []) : []));
  const videoFrames = c.videos.flatMap((v) => ((v.frames as string[] | undefined) ?? []).slice(0, 2));
  const stripShots = (s: Json | { erro: string } | null) => {
    if (!s || hasError(s)) return s;
    const { screenshots: _screenshots, outboundLinks: _outbound, ...rest } = s;
    return rest;
  };

  const definitions: Array<{ key: string; agentId: string; department: string; title: string; description: string; instructions: string; input: Json }> = [
    {
      key: "perfil",
      agentId: "agent-social",
      department: "creative",
      title: "Perfil e conteúdo do Instagram",
      description: "Avaliar se o perfil passa autoridade e se o conteúdo atrai e converte pacientes.",
      instructions: [
        "Analise o perfil como um paciente que acabou de chegar por um anúncio ou indicação:",
        "1. Primeira impressão em 5 segundos: foto, nome, bio (diz o que faz, para quem, onde e o próximo passo?), link.",
        "2. Destaques: existem os essenciais (depoimentos, antes e depois/resultados, procedimentos, como agendar, localização, equipe)? Os títulos ajudam?",
        "3. Conteúdo: frequência, mistura de formatos, temas (educativo, prova social, bastidores, oferta), quais posts performaram melhor e pior e por quê.",
        "4. Engajamento: compare a taxa média com a referência de 1% a 3% para perfis locais deste porte e diga o que ela indica.",
        "5. Autoridade: há prova social, rosto do profissional, credenciais, resultados?",
        "As imagens anexadas são o print do perfil. Descreva o que você vê nelas (identidade visual, organização, qualidade).",
        RULES,
      ].join("\n"),
      input: { perfil: profileSlim, indicadores: c.metrics, posts: postsSlim, imagePaths: c.profile.screenshot ? [c.profile.screenshot] : [] },
    },
    {
      key: "copy",
      agentId: "agent-copy1",
      department: "copywriting",
      title: "Copy: bio, legendas e chamadas para ação",
      description: "Avaliar o poder de conversão dos textos e reescrever os pontos fracos.",
      instructions: [
        "Avalie os textos do perfil:",
        "1. Bio: clareza da promessa, público, diferencial, prova e chamada para ação. Reescreva a bio em 2 versões (até 150 caracteres cada).",
        "2. Legendas: o gancho da primeira linha prende? Há benefício claro, prova e chamada para ação? Aponte a melhor e a pior legenda e explique.",
        "3. Reescreva a pior legenda e crie 5 ganchos de abertura para os próximos posts, no tom da marca.",
        "4. Oferta: fica claro o que o paciente deve fazer e o que ganha ao chamar? Se não, proponha uma oferta de entrada (ex.: avaliação) sem prometer resultado.",
        RULES,
      ].join("\n"),
      input: { perfil: profileSlim, indicadores: c.metrics, legendas: postsSlim.map((p) => ({ tipo: p.tipo, legenda: p.legenda, curtidas: p.curtidas, comentarios: p.comentarios })) },
    },
    {
      key: "videos",
      agentId: "agent-copy2",
      department: "copywriting",
      title: "Vídeos e Reels",
      description: "Avaliar roteiro, gancho, retenção e chamada para ação dos vídeos.",
      instructions: [
        "Você recebeu a transcrição da fala e quadros (imagens anexadas) dos Reels mais recentes, além de curtidas e comentários.",
        "Para cada vídeo: o gancho dos 3 primeiros segundos, a mensagem, se tem legenda/texto na tela, qualidade visual do que aparece nos quadros, e a chamada para ação.",
        "Depois: padrão geral (o que repetir, o que parar), 3 roteiros curtos (gancho, desenvolvimento, chamada) de vídeos que esta clínica deveria gravar.",
        "Se um vídeo não tem fala (só música) ou a transcrição falhou, diga isso e avalie só pelo que existe. Contagem de visualizações não é pública: não estime.",
        RULES,
      ].join("\n"),
      input: { videos: c.videos.map((v) => ({ url: v.url, data: v.publishedAt, curtidas: v.likes, comentarios: v.comments, legenda: v.caption, duracaoSegundos: v.durationSec ?? null, transcricao: v.transcript ?? "", observacao: v.note ?? v.analise ?? "" })), indicadores: c.metrics, imagePaths: videoFrames.slice(0, 4) },
    },
    {
      key: "anuncios",
      agentId: "agent-perf",
      department: "performance",
      title: "Tráfego pago: anúncios na Meta",
      description: "Verificar se o negócio anuncia, como anuncia e o que está deixando na mesa.",
      instructions: [
        "Use os dados da Biblioteca de Anúncios da Meta:",
        "1. O negócio tem anúncios ativos? Quantos, desde quando (anúncio rodando há meses costuma ser o que funciona), que mensagens e ofertas usa?",
        "2. Se não anuncia: o que isso significa para a geração de pacientes e qual seria a primeira campanha (objetivo, público, oferta, verba inicial sugerida como faixa).",
        "3. O que os outros anunciantes da mesma busca estão fazendo que este negócio não faz.",
        "4. Rastreamento: com base nos rastreadores encontrados no site (Pixel, GA4, GTM), a clínica consegue medir de onde vêm os pacientes?",
        "A busca é por palavra-chave: confirme pelo nome do anunciante antes de atribuir um anúncio ao negócio. Orçamento gasto não é público: não estime valores gastos.",
        RULES,
      ].join("\n"),
      input: { negocio: c.businessName, anuncios: c.ads, rastreadoresNoSite: [c.mainSite, c.site].flatMap((s) => (s && !hasError(s) ? ((s.trackers as string[] | undefined) ?? []) : [])) },
    },
    {
      key: "site",
      agentId: "agent-web",
      department: "web-dev",
      title: "Link da bio e site",
      description: "Avaliar se o destino do tráfego converte visitante em agendamento.",
      instructions: [
        "Analise o destino do link da bio (e o site principal, se houver). As imagens anexadas são prints em computador e em celular.",
        "1. Existe site? Se o link é só WhatsApp ou um agregador de links, explique o que se perde com isso.",
        "2. Acima da dobra: fica claro o que a clínica faz, para quem e como agendar? Há botão de WhatsApp/agendamento visível no celular?",
        "3. Confiança: depoimentos, antes e depois, equipe, endereço, registros profissionais.",
        "4. Técnica: tempo de carregamento medido, HTTPS, versão mobile, rastreadores instalados, formulários.",
        "5. Recomendação: manter e ajustar, ou construir uma página nova? Liste as seções que a página ideal teria.",
        RULES,
      ].join("\n"),
      input: { linkDaBio: c.candidateSite, destinoDoLink: stripShots(c.site), sitePrincipal: stripShots(c.mainSite), imagePaths: siteShots.slice(0, 4) },
    },
    {
      key: "reputacao",
      agentId: "agent-bi",
      department: "bi",
      title: "Reputação, presença local e concorrência",
      description: "Avaliar Google Maps, avaliações e como o negócio se compara aos concorrentes próximos.",
      instructions: [
        "1. Identifique nos resultados do Google Maps qual é a ficha deste negócio (nome parecido). Nota, se está aberta, se tem site e telefone. Se não aparecer, isso é um achado: paciente que procura no Google não encontra.",
        "2. Compare com os outros resultados da mesma busca (são concorrentes locais): notas e como se apresentam.",
        "3. Use search_web para procurar o negócio no Google (nome + cidade), Reclame Aqui e Doctoralia, e fetch_url para abrir o que achar relevante. Relate só o que encontrar.",
        "4. Conclusão: como está a reputação visível e o que fazer (rotina de pedir avaliações, responder avaliações, completar a ficha).",
        RULES,
      ].join("\n"),
      input: { negocio: c.businessName, instagram: `@${c.handle}`, googleMaps: c.maps, seguidores: c.metrics.seguidores },
    },
    {
      key: "funil",
      agentId: "agent-sales",
      department: "sales",
      title: "Funil comercial e atendimento",
      description: "Mapear o caminho do paciente do primeiro contato até o agendamento e achar onde ele se perde.",
      instructions: [
        "Monte o funil visível deste negócio: descoberta (anúncio, Instagram, Google) → interesse (perfil, site) → contato (WhatsApp, direct, telefone) → agendamento → comparecimento → retorno/indicação.",
        "Para cada etapa: o que existe hoje segundo os dados, onde o paciente provavelmente desiste e por quê.",
        "Canais de contato: quais estão disponíveis e quão fáceis de achar (WhatsApp encontrado, link direto, botão no site).",
        "O teste de tempo de resposta no WhatsApp é feito à parte e só entra se já estiver nos documentos anteriores; não afirme nada sobre tempo de resposta sem esse dado.",
        "Liste as perguntas que o Ícaro deve fazer ao dono da clínica na reunião para confirmar as hipóteses (ex.: leads por mês, taxa de agendamento, comparecimento, ticket médio, quem atende o WhatsApp e em que horário).",
        RULES,
      ].join("\n"),
      input: { negocio: c.businessName, perfil: profileSlim, indicadores: c.metrics, whatsappEncontrado: c.whatsapp, linkDaBio: c.candidateSite, site: stripShots(c.mainSite ?? c.site), anunciosProprios: (c.ads.anunciosDoProprioNegocio as unknown[] | undefined)?.length ?? null },
    },
    {
      key: "operacao",
      agentId: "agent-bto-head",
      department: "bto",
      title: "Operação e automação (o que implementar)",
      description: "Identificar gargalos operacionais e as soluções do catálogo da LOTUS que os resolvem.",
      instructions: [
        "Com base nos sinais públicos (canais de contato, site, rastreamento, frequência de conteúdo, anúncios), avalie a maturidade operacional provável: atendimento, agendamento, CRM, follow-up, reativação de pacientes.",
        "Diga o que dá para afirmar pelos dados e o que precisa ser confirmado com o dono da clínica.",
        "Escolha no catálogo de soluções da LOTUS (no contexto) as 2 a 4 que mais atacam os gargalos, explique o problema que cada uma resolve neste caso e a ordem de implementação.",
        "Não invente soluções fora do catálogo; se faltar algo, diga o que falta.",
        RULES,
      ].join("\n"),
      input: { negocio: c.businessName, indicadores: c.metrics, whatsappEncontrado: c.whatsapp, site: stripShots(c.mainSite ?? c.site), catalogoDeSolucoes: await catalog() },
    },
    {
      key: "compliance",
      agentId: "agent-healthcare",
      department: "strategy",
      title: "Regras de publicidade em saúde",
      description: "Apontar riscos de CFM/CFO/ANVISA na comunicação atual e como comunicar com segurança.",
      instructions: [
        "Revise bio, legendas, transcrições de vídeos e anúncios procurando riscos frente às regras de publicidade do conselho da categoria (CFM para medicina, CFO para odontologia) e da ANVISA: promessa de resultado, antes e depois fora das regras, sensacionalismo, preços e promoções, ausência do nome e registro do responsável técnico.",
        "Identifique a categoria profissional pelo conteúdo. Se não der para saber, diga.",
        "Para cada risco: o trecho, por que é risco, e como dizer a mesma coisa de forma permitida. Cite a norma só se tiver certeza do número; se não, descreva a regra sem inventar referência.",
        "Feche com um guia curto do que a LOTUS pode e não pode fazer nas campanhas deste cliente.",
        RULES,
      ].join("\n"),
      input: { negocio: c.businessName, bio: c.profile.bio, legendas: postsSlim.map((p) => p.legenda).filter(Boolean), transcricoes: c.videos.map((v) => v.transcript).filter(Boolean), anunciosProprios: c.ads.anunciosDoProprioNegocio ?? [] },
    },
  ];

  const analysisIds: string[] = [];
  for (const def of definitions) {
    const agentId = await resolveAgent(def.agentId, def.department);
    if (!agentId) continue;
    const task = await prisma.task.create({
      data: {
        missionId: c.missionId,
        agentId,
        title: def.title,
        description: def.description,
        instructions: def.instructions,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        input: def.input as any,
        status: "QUEUED",
      },
    });
    analysisIds.push(task.id);
  }

  const strategistId = await resolveAgent("agent-strat", "strategy");
  const synthesis = strategistId
    ? await prisma.task.create({
        data: {
          missionId: c.missionId,
          agentId: strategistId,
          title: `Diagnóstico consolidado — ${c.businessName}`,
          description: "Juntar as análises da equipe em um diagnóstico único, priorizado, com plano de ação.",
          instructions: [
            "Você recebeu, nos entregáveis anteriores, a análise de cada especialista. Produza o DIAGNÓSTICO 360 final, em português claro, para ser apresentado ao dono da clínica:",
            "1. Resumo executivo (5 linhas): situação atual e a maior oportunidade.",
            "2. Placar por frente (0 a 10): perfil e conteúdo, copy, vídeos, tráfego pago, site, reputação local, funil e atendimento, operação, conformidade. Nota geral.",
            "3. Os 5 maiores gargalos, em ordem de impacto no faturamento: evidência, por que custa pacientes, e a correção.",
            "4. Plano de ação: primeiros 7 dias, 30 dias, 60 dias e 90 dias, com responsável (frente da LOTUS) e o resultado esperado de cada etapa.",
            "5. O que a LOTUS implementa: soluções do catálogo recomendadas e a ordem.",
            "6. O que ainda precisa ser confirmado com o cliente (dados que só ele tem).",
            "7. Para o Ícaro aprender: 5 conceitos que apareceram neste diagnóstico explicados em 2 linhas cada.",
            "Não estime faturamento nem retorno em reais sem os números do cliente; se der uma faixa, declare as premissas.",
            "Não repita as análises inteiras: sintetize e priorize. Salve com save_document usando type \"strategy\" e o título \"Diagnóstico 360 — " + c.businessName + "\".",
          ].join("\n"),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          input: { negocio: c.businessName, instagram: `@${c.handle}`, indicadores: c.metrics, catalogoDeSolucoes: await catalog() } as any,
          dependsOn: analysisIds,
          status: "QUEUED",
        },
      })
    : null;

  const closerId = await resolveAgent("agent-closer", "sales");
  if (closerId && synthesis) {
    await prisma.task.create({
      data: {
        missionId: c.missionId,
        agentId: closerId,
        title: "Roteiro da reunião de apresentação do diagnóstico",
        description: "Preparar o Ícaro para apresentar o diagnóstico ao lead e conduzir para a proposta.",
        instructions: [
          "Com base no Diagnóstico 360 (entregável anterior), escreva o roteiro da reunião de 30 minutos com o dono da clínica:",
          "abertura, as perguntas de descoberta que confirmam as hipóteses, como apresentar os 3 principais gargalos usando os dados reais do perfil dele, a transição para a solução, as objeções prováveis com respostas, e o fechamento com próximo passo.",
          "Inclua a mensagem de WhatsApp para enviar o diagnóstico ao lead e marcar a reunião (o envio em si depende de aprovação do dono).",
          "Não invente preços: indique onde entra a proposta e deixe o valor para o assessment do Advisor.",
          "Salve com save_document usando type \"script\".",
        ].join("\n"),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        input: { negocio: c.businessName, instagram: `@${c.handle}` } as any,
        dependsOn: [synthesis.id],
        status: "QUEUED",
      },
    });
  }

  // Resumo dos dados reais do negócio: é o ponto de partida de toda a produção
  const brief: Json = {
    perfil: profileSlim,
    indicadores: c.metrics,
    whatsappEncontrado: c.whatsapp,
    linkDaBio: c.candidateSite,
    site: stripShots(c.mainSite ?? c.site),
    anunciosAtivosDoProprioNegocio: ((c.ads.anunciosDoProprioNegocio as unknown[] | undefined) ?? []).slice(0, 5),
    legendasRecentes: postsSlim.slice(0, 6).map((p) => ({ tipo: p.tipo, legenda: p.legenda.slice(0, 500), curtidas: p.curtidas })),
  };
  const mission = await prisma.mission.findUnique({ where: { id: c.missionId }, select: { context: true } });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await prisma.mission.update({ where: { id: c.missionId }, data: { context: { ...((mission?.context ?? {}) as Json), brief } as any } });

  if (c.produce && synthesis) {
    await createProductionTasks({ missionId: c.missionId, businessName: c.businessName, handle: c.handle, synthesisId: synthesis.id, brief });
  }

  const all = await prisma.task.findMany({ where: { missionId: c.missionId, status: "QUEUED" }, select: { id: true } });
  for (const task of all) runTask(task.id);
}

// ============================================================
// PRODUÇÃO: depois do diagnóstico, a equipe produz as soluções prontas para instalar no cliente.
// ============================================================

const PRODUCTION_RULES = [
  "REGRAS DA PRODUÇÃO:",
  "- Isto é PRODUÇÃO, não análise: entregue o material final, pronto para copiar e usar. Nada de \"recomenda-se\"; escreva a peça.",
  "- Parta do Diagnóstico 360 (entregável anterior) e dos dados do contexto. Siga o guia de publicidade em saúde produzido nesta missão.",
  "- Nunca invente depoimentos, números, preços, nomes de profissionais, registros (CRO/CRM) ou resultados. O que só o cliente sabe vira [PREENCHER COM O CLIENTE: o que falta].",
  "- Nenhum texto (nem a IA de atendimento) pode orientar o paciente a tomar remédio, nem genérico: em dor ou urgência, a orientação é procurar atendimento e falar com a equipe.",
  "- Revise a ortografia antes de salvar.",
  "- Nada é publicado nem enviado agora. Não use request_approval, exec_local nem run_browser: quem instala na operação do cliente é o Ícaro.",
  "- Termine com a seção \"Como instalar\": passo a passo simples (o Ícaro é iniciante), o que pedir ao cliente (acessos, informações) e como saber se funcionou.",
  "- Salve com save_document.",
].join("\n");

interface ProductionContext {
  missionId: string;
  businessName: string;
  handle: string;
  synthesisId: string;
  brief: Json;
}

async function createProductionTasks(p: ProductionContext): Promise<string[]> {
  const base = { fase: "producao", negocio: p.businessName, instagram: `@${p.handle}`, ...p.brief };
  const create = async (def: { agentId: string; department: string; title: string; description: string; instructions: string; dependsOn: string[] }): Promise<string | null> => {
    const agentId = await resolveAgent(def.agentId, def.department);
    if (!agentId) return null;
    const task = await prisma.task.create({
      data: {
        missionId: p.missionId,
        agentId,
        title: def.title,
        description: def.description,
        instructions: [def.instructions, PRODUCTION_RULES].join("\n"),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        input: base as any,
        dependsOn: def.dependsOn,
        status: "QUEUED",
      },
    });
    return task.id;
  };
  const ids: string[] = [];
  const add = (id: string | null) => {
    if (id) ids.push(id);
    return id;
  };

  add(
    await create({
      agentId: "agent-bto-arch",
      department: "bto",
      title: "Produção: IA de atendimento no WhatsApp (pronta para instalar)",
      description: "Criar o atendente virtual da clínica: instruções completas, fluxo de conversa, base de respostas e mensagens de acompanhamento.",
      instructions: [
        "Monte a IA de atendimento deste negócio, pronta para ser colada em uma plataforma de atendimento com IA no WhatsApp:",
        "1. PROMPT DO ATENDENTE (em um bloco de código): quem ele é, tom de voz da marca, objetivo (levar ao agendamento), o que pode e o que não pode dizer (não dá diagnóstico, não promete resultado, não informa preço que o cliente não confirmou), como lidar com urgência e quando passar para um humano.",
        "2. FLUXO DA CONVERSA: saudação → entender o que a pessoa procura → qualificar (procedimento, urgência, já é paciente?) → oferecer horário → confirmar → lembrete → faltou → remarcar.",
        "3. BASE DE RESPOSTAS: perguntas frequentes já respondidas com o que é público (endereço, serviços vistos no perfil e no site, formas de contato). O resto fica como [PREENCHER COM O CLIENTE].",
        "4. MENSAGENS PRONTAS: retorno para quem parou de responder (1 hora, 24 horas, 3 dias, 7 dias), confirmação e lembrete de consulta, pós-consulta com pedido de avaliação no Google, reativação de quem sumiu há 6 meses.",
        "5. OBJEÇÕES: \"está caro\", \"vou pensar\", \"é longe\", \"tenho medo\" — resposta pronta para cada uma, sem pressionar.",
        "6. 3 conversas de exemplo completas (paciente novo, paciente com urgência, paciente que some).",
      ].join("\n"),
      dependsOn: [p.synthesisId],
    })
  );

  const campaign = add(
    await create({
      agentId: "agent-perf",
      department: "performance",
      title: "Produção: campanhas de tráfego pago (estrutura pronta para subir)",
      description: "Montar as campanhas da Meta do cliente: objetivo, públicos, verba, posicionamentos e medição.",
      instructions: [
        "Monte a estrutura completa das campanhas da Meta (Instagram e Facebook) para este negócio, no nível de detalhe de quem vai clicar no Gerenciador de Anúncios:",
        "1. Tabela de campanhas: nome (com padrão de nomenclatura), objetivo, destino (WhatsApp, página, formulário) e por que essa escolha.",
        "2. Conjuntos de anúncios: localização (cidade e raio em km), idade, interesses ou público aberto, públicos de remarketing (quem engajou com o perfil, quem visitou o site), posicionamentos.",
        "3. Verba: faixa diária sugerida por campanha, com as premissas declaradas. Não prometa custo por lead nem retorno.",
        "4. Lista de anúncios por conjunto: ângulo de cada um (dor, prova, oferta de entrada, autoridade). As copies e os criativos são produzidos nas próximas etapas a partir desta lista — numere os anúncios (A1, A2...).",
        "5. Medição: o que instalar (Pixel, eventos, link rastreado do WhatsApp) e os números para olhar toda semana, com o que fazer se estiverem ruins.",
        "6. Rotina de otimização das 4 primeiras semanas.",
        "Publicar depende do acesso à conta de anúncios do cliente e de verba aprovada: deixe pronto para subir, não suba.",
      ].join("\n"),
      dependsOn: [p.synthesisId],
    })
  );

  const adCopy = add(
    await create({
      agentId: "agent-copy1",
      department: "copywriting",
      title: "Produção: copies dos anúncios",
      description: "Escrever os textos finais de cada anúncio da estrutura de campanhas.",
      instructions: [
        "Para CADA anúncio numerado na estrutura de campanhas (entregável anterior), escreva a copy final:",
        "texto principal em 2 versões (curta, até 125 caracteres, e longa), título (até 40 caracteres), descrição (até 30), botão e a primeira mensagem que o paciente envia ao clicar para o WhatsApp.",
        "Use a linguagem que o próprio negócio usa no perfil. Varie os ângulos: dor, benefício, prova, oferta de entrada.",
        "Marque em cada copy o que precisa de confirmação do cliente antes de rodar.",
      ].join("\n"),
      dependsOn: [p.synthesisId, ...(campaign ? [campaign] : [])],
    })
  );

  add(
    await create({
      agentId: "agent-creative",
      department: "creative",
      title: "Produção: criativos e roteiros de vídeo dos anúncios",
      description: "Criar o briefing de cada imagem e o roteiro de cada vídeo dos anúncios.",
      instructions: [
        "Para cada anúncio (use a numeração das copies, entregável anterior), entregue o criativo:",
        "1. IMAGENS: para cada uma, o que aparece, o texto escrito na arte (curto), formato (1:1 e 9:16), cores e estilo coerentes com a identidade do perfil, e o que evitar.",
        "2. VÍDEOS: no mínimo 5 roteiros de 20 a 40 segundos — gancho dos 3 primeiros segundos, cena a cena, fala exata, texto na tela, chamada final.",
        "3. ROTEIRO DE GRAVAÇÃO: lista do que a clínica precisa gravar em uma única visita (quem aparece, onde, quais tomadas), em ordem, para render todos os vídeos.",
        "4. Qual criativo testar primeiro e por quê.",
        "Nada de antes e depois ou promessa de resultado fora das regras do conselho da categoria.",
      ].join("\n"),
      dependsOn: [p.synthesisId, ...(adCopy ? [adCopy] : [])],
    })
  );

  add(
    await create({
      agentId: "agent-social",
      department: "creative",
      title: "Produção: perfil novo e calendário de 30 dias",
      description: "Entregar a bio, os destaques e os posts do mês prontos para publicar.",
      instructions: [
        "Entregue pronto para publicar:",
        "1. PERFIL: nome de exibição, bio final (até 150 caracteres), texto do link e a ordem dos destaques com o que colocar em cada um.",
        "2. CALENDÁRIO DE 30 DIAS: 12 publicações (3 por semana). Para cada uma: semana e dia, formato (Reel, carrossel, foto), objetivo (atrair, gerar confiança, converter), gancho, roteiro ou textos dos slides, e a LEGENDA COMPLETA com chamada para ação.",
        "3. 10 ideias de stories de rotina que a recepção consegue fazer em 1 minuto.",
        "Use os temas que já deram mais resultado no perfil (veja o diagnóstico) e corrija o que ele apontou.",
      ].join("\n"),
      dependsOn: [p.synthesisId],
    })
  );

  add(
    await create({
      agentId: "agent-web",
      department: "web-dev",
      title: "Produção: página de agendamento (código pronto)",
      description: "Entregar a página de captação do cliente em HTML completo, pronta para publicar.",
      instructions: [
        "Escreva a página de agendamento deste negócio em UM arquivo HTML completo (CSS embutido, sem dependências externas, responsiva, rápida), dentro de um único bloco de código ```html.",
        "O arquivo precisa terminar em </html>: mantenha o HTML enxuto (até uns 20 mil caracteres, CSS curto, sem ícones SVG longos) e salve tudo com save_document, código incluído.",
        "Seções: topo com promessa clara e botão de WhatsApp, para quem é, serviços, como funciona a primeira consulta, prova (onde entram depoimentos reais: deixe o espaço marcado, não invente), equipe, localização e horário, perguntas frequentes, chamada final.",
        "O botão de WhatsApp usa o número encontrado no contexto (formato https://wa.me/NUMERO?text=...). Se não houver número, deixe [PREENCHER COM O CLIENTE].",
        "Inclua no código, como comentário, onde colar o Pixel da Meta e o Google Analytics.",
        "Antes do bloco de código, explique em 5 linhas a lógica da página. Depois do bloco, o \"Como instalar\" (onde hospedar, como apontar o link da bio).",
      ].join("\n"),
      dependsOn: [p.synthesisId],
    })
  );

  add(
    await create({
      agentId: "agent-crm",
      department: "sales",
      title: "Produção: funil no CRM e rotina de acompanhamento",
      description: "Definir as etapas do funil, as etiquetas e a rotina para nenhum paciente ficar sem resposta.",
      instructions: [
        "Entregue a operação comercial pronta para configurar em um CRM simples ou no WhatsApp Business:",
        "1. Etapas do funil (do primeiro contato ao retorno) com a regra de quando o paciente muda de etapa.",
        "2. Etiquetas e campos a registrar de cada contato.",
        "3. Rotina diária da recepção em lista de tarefas (manhã, tarde, fim do dia) e a rotina semanal do dono.",
        "4. Planilha de controle: colunas e as 6 contas que importam (contatos, agendamentos, comparecimento, fechamento, valor médio, de onde veio) — explique cada uma em uma linha.",
        "5. O que a IA de atendimento faz sozinha e onde a pessoa da recepção entra.",
      ].join("\n"),
      dependsOn: [p.synthesisId],
    })
  );

  const productionIds = [...ids];
  add(
    await create({
      agentId: "agent-mc",
      department: "strategy",
      title: "Pacote de entrega e plano de implementação",
      description: "Organizar tudo que foi produzido em um pacote que o Ícaro instala na operação do cliente.",
      instructions: [
        "Você recebeu todas as peças produzidas (entregáveis anteriores). Monte o PACOTE DE ENTREGA:",
        "1. Índice: cada peça, para que serve e o problema do diagnóstico que ela resolve.",
        "2. Ordem de instalação, semana a semana, com o tempo estimado de cada passo.",
        "3. Lista única do que pedir ao cliente (acessos, informações e materiais) — junte todos os [PREENCHER COM O CLIENTE] das peças.",
        "4. O que já está 100% pronto e o que depende do cliente.",
        "5. Como apresentar a entrega ao cliente (roteiro de 10 minutos).",
        "6. Para o Ícaro aprender: o que cada peça faz pelo faturamento da clínica, em linguagem simples.",
        "Confira se as peças são coerentes entre si (mesma oferta, mesmo tom, mesmo número de WhatsApp) e aponte qualquer contradição.",
      ].join("\n"),
      dependsOn: productionIds.length > 0 ? productionIds : [p.synthesisId],
    })
  );
  return ids;
}

// Inicia a produção de um diagnóstico já existente (quando ela não foi pedida no início).
export async function startProduction(missionId: string): Promise<{ created: number }> {
  const mission = await prisma.mission.findUnique({
    where: { id: missionId },
    select: { id: true, status: true, context: true, client: { select: { name: true, instagram: true } } },
  });
  const context = (mission?.context ?? {}) as Json;
  if (!mission || !context.diagnosis360) throw new Error("Diagnóstico não encontrado.");
  const tasks = await prisma.task.findMany({ where: { missionId }, select: { id: true, title: true, input: true } });
  if (tasks.some((t) => (t.input as Json | null)?.fase === "producao")) throw new Error("A produção deste diagnóstico já foi criada.");
  const synthesis = tasks.find((t) => t.title.startsWith("Diagnóstico consolidado"));
  if (!synthesis) throw new Error("Este diagnóstico ainda não chegou na etapa de análise. Espere a coleta terminar.");

  let brief = context.brief as Json | undefined;
  if (!brief) {
    // Diagnósticos antigos não guardaram o resumo: usa o documento de dados coletados
    const collected = await prisma.document.findFirst({ where: { missionId, type: "RESEARCH_REPORT" }, orderBy: { createdAt: "asc" }, select: { content: true } });
    brief = { dadosColetados: collected?.content.slice(0, 9000) ?? "" };
  }
  const handle = String(context.handle ?? mission.client?.instagram ?? "");
  const ids = await createProductionTasks({ missionId, businessName: mission.client?.name ?? `@${handle}`, handle, synthesisId: synthesis.id, brief });
  if (["COMPLETED", "IN_REVIEW"].includes(mission.status)) {
    await prisma.mission.update({ where: { id: missionId }, data: { status: "IN_PROGRESS", completedAt: null } });
  }
  for (const id of ids) runTask(id);
  return { created: ids.length };
}

// Grava todos os entregáveis em uma pasta do computador, para o dono entregar ao cliente.
export async function exportDeliverables(missionId: string): Promise<{ dir: string; files: number } | null> {
  const mission = await prisma.mission.findUnique({ where: { id: missionId }, select: { context: true, title: true } });
  const context = (mission?.context ?? {}) as Json;
  if (!mission || !context.diagnosis360) return null;
  const documents = await prisma.document.findMany({ where: { missionId }, orderBy: { createdAt: "asc" }, select: { title: true, type: true, content: true } });
  if (documents.length === 0) return null;

  const safe = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9 ._-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  const dir = path.join(os.homedir(), "LOTUS_Workspace", "entregas", safe(String(context.handle ?? missionId)) || missionId);
  fs.mkdirSync(dir, { recursive: true });
  let files = 0;
  documents.forEach((doc, index) => {
    const name = `${String(index + 1).padStart(2, "0")} - ${safe(doc.title) || "documento"}`;
    fs.writeFileSync(path.join(dir, `${name}.md`), `# ${doc.title}\n\n${doc.content}\n`, "utf-8");
    files++;
    // A página de agendamento também sai como arquivo .html, pronto para abrir no navegador
    const html = doc.content.match(/```html\s*\n([\s\S]*?)```/i)?.[1];
    if (html && /<html[\s>]/i.test(html)) {
      fs.writeFileSync(path.join(dir, `${name}.html`), html, "utf-8");
      files++;
    }
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await prisma.mission.update({ where: { id: missionId }, data: { context: { ...context, exportDir: dir, exportedAt: new Date().toISOString() } as any } });
  return { dir, files };
}

// Retoma uma coleta que foi interrompida (aplicativo fechado ou computador travado no meio).
export async function resumeCollection(taskId: string): Promise<"resumed" | "failed" | "skipped"> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, status: true, retryCount: true, missionId: true, mission: { select: { context: true, clientId: true } } },
  });
  if (!task || task.status !== "IN_PROGRESS") return "skipped";
  const context = (task.mission.context ?? {}) as Json;
  const handle = String(context.handle ?? "");
  if (!context.diagnosis360 || !handle || !task.mission.clientId) return "skipped";

  if (task.retryCount >= 2) {
    const message = "A coleta foi interrompida três vezes seguidas (o computador provavelmente ficou sem memória). Feche outros programas pesados e inicie o diagnóstico de novo.";
    await prisma.task.update({ where: { id: taskId }, data: { status: "FAILED", output: { error: message } } });
    await prisma.mission.update({ where: { id: task.missionId }, data: { status: "FAILED" } });
    return "failed";
  }
  const runtime = createRuntimeClient();
  if (!(await runtime.available())) return "skipped";

  await prisma.task.update({ where: { id: taskId }, data: { retryCount: { increment: 1 }, startedAt: new Date(), output: { host: os.hostname() } } });
  await prisma.activityLog.create({ data: { missionId: task.missionId, taskId, action: "DIAGNOSIS_RESUMED", details: { handle, attempt: task.retryCount + 2 }, level: "WARN" } });
  const input: DiagnosisInput = {
    instagram: handle,
    website: context.website ? String(context.website) : undefined,
    city: context.city ? String(context.city) : undefined,
    testWhatsApp: !!context.testWhatsApp,
    produce: context.produce !== false,
  };
  launchCollection({ input, handle, clientId: task.mission.clientId, missionId: task.missionId, collectTaskId: taskId, runtime });
  return "resumed";
}

async function catalog() {
  const solutions = await prisma.solution.findMany({
    where: { isActive: true },
    select: { name: true, category: true, problemSolved: true, baseSetupPrice: true, baseMonthlyPrice: true, deliveryWeeks: true },
    orderBy: { category: "asc" },
  });
  return solutions;
}

// Estado do diagnóstico para a tela acompanhar em tempo real.
export async function diagnosisProgress(missionId: string) {
  const mission = await prisma.mission.findUnique({
    where: { id: missionId },
    select: { id: true, title: true, status: true, createdAt: true, completedAt: true, context: true, client: { select: { id: true, name: true, instagram: true } } },
  });
  if (!mission) return null;
  const [tasks, documents, approvals] = await Promise.all([
    prisma.task.findMany({
      where: { missionId },
      orderBy: { createdAt: "asc" },
      select: { id: true, title: true, status: true, startedAt: true, completedAt: true, output: true, input: true, agent: { select: { name: true, title: true } } },
    }),
    prisma.document.findMany({ where: { missionId }, orderBy: { createdAt: "asc" }, select: { id: true, title: true, type: true, content: true, taskId: true } }),
    prisma.approval.findMany({ where: { missionId }, orderBy: { createdAt: "desc" }, select: { id: true, title: true, status: true, description: true } }),
  ]);
  const report = documents.find((d) => d.type === "STRATEGY" && /Diagnóstico 360/i.test(d.title)) ?? null;
  const { context, ...missionInfo } = mission;
  const phaseOf = (input: unknown) => ((input as Json | null)?.fase === "producao" ? "producao" : "diagnostico");
  const taskPhase = new Map(tasks.map((t) => [t.id, phaseOf(t.input)]));
  return {
    mission: missionInfo,
    hasProduction: tasks.some((t) => phaseOf(t.input) === "producao"),
    exportDir: ((context ?? {}) as Json).exportDir ? String(((context ?? {}) as Json).exportDir) : null,
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      phase: phaseOf(t.input),
      status: t.status,
      agent: t.agent?.name ?? "Sistema",
      role: t.agent?.title ?? "",
      error: t.status === "FAILED" ? String((t.output as { error?: string } | null)?.error ?? "") : null,
    })),
    documents: documents.map((d) => ({ id: d.id, title: d.title, type: d.type, phase: (d.taskId && taskPhase.get(d.taskId)) || "diagnostico", content: d.type === "RESEARCH_REPORT" ? d.content.slice(0, 1500) : d.content })),
    approvals,
    report: report ? { title: report.title, content: report.content } : null,
    done: tasks.length > 1 && tasks.every((t) => ["COMPLETED", "FAILED", "CANCELLED", "SKIPPED"].includes(t.status)),
  };
}
