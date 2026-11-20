// Site da clínica: o agente de web constrói, o sistema publica na Vercel e tira prints,
// a agente de qualidade revisa e o sistema decide: aprovado ou refaz (até 3 tentativas).
// Tudo roda sozinho; o Ícaro recebe o link já revisado.

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { prisma } from "@/lib/prisma";
import { createRuntimeClient } from "@/lib/runtime-client";
import { imageSize } from "@/lib/image-size";
import { ICON_NAMES, SITE_STYLES, STYLE_GUIDE, renderSite, type SiteContent } from "@/lib/site-render";

const execAsync = promisify(exec);
type Json = Record<string, unknown>;

export const SITE_SYSTEM_STEPS = new Set(["site_publish", "site_decide"]);
const MAX_ATTEMPTS = 3;
const MIN_SCORE = 8;
const SITES_DIR = path.join(os.homedir(), "LOTUS_Workspace", "sites");

const HEALTH_HINT = /odonto|dent[ai]|cl[ií]nica|m[eé]dic|est[eé]tica|sa[uú]de|harmoniza|fisioter|nutri|psic[oó]|dermat|implante|ortodon/i;

const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "clinica";

async function agentFor(id: string, department: string): Promise<string | null> {
  const byId = await prisma.agent.findFirst({ where: { id, isActive: true }, select: { id: true } });
  if (byId) return byId.id;
  return (await prisma.agent.findFirst({ where: { department, isActive: true }, select: { id: true } }))?.id ?? null;
}

// Copia logo e fotos do kit da marca para a pasta do site, com nomes simples que o HTML usa.
export interface PreparedAsset {
  file: string;
  descricao: string;
  source: string;
  width: number | null;
  height: number | null;
}

// Classifica pelo tamanho real: só foto grande vai para o topo; foto pequena nunca é esticada
function sizeLabel(w: number | null, h: number | null): string {
  if (!w || !h) return "tamanho desconhecido: evite usar em destaque";
  if (w >= 900 && h >= 700) return `GRANDE (${w}x${h}): serve para o topo, "sobre" ou galeria`;
  if (w >= 480 && h >= 480) return `MÉDIA (${w}x${h}): serve para "sobre" ou galeria, NÃO para o topo`;
  if (w >= 500 && h >= 340) return `MÉDIA-PEQUENA (${w}x${h}): só galeria`;
  return `PEQUENA (${w}x${h}): não use (ficaria pixelada)`;
}

export function prepareSiteAssets(handle: string, brand: Json | null): { dir: string; assets: PreparedAsset[] } {
  const dir = path.join(SITES_DIR, `lotus-${slug(handle)}`);
  const assetsDir = path.join(dir, "assets");
  // Pasta limpa a cada site: sobra de tentativa antiga não entra no site novo
  fs.rmSync(assetsDir, { recursive: true, force: true });
  fs.mkdirSync(assetsDir, { recursive: true });
  const assets: PreparedAsset[] = [];
  if (!brand) return { dir, assets };
  const copy = (source: unknown, name: string, descricao: string) => {
    if (typeof source !== "string" || !fs.existsSync(source)) return;
    const file = `assets/${name}${path.extname(source).toLowerCase()}`;
    fs.copyFileSync(source, path.join(dir, file));
    const size = imageSize(source);
    assets.push({ file, descricao: `${descricao}. ${sizeLabel(size?.width ?? null, size?.height ?? null)}`, source, width: size?.width ?? null, height: size?.height ?? null });
  };
  copy(brand.logoSite, "logo", "Logo oficial (do site do negócio)");
  copy(brand.logoInstagram, "logo-instagram", "Foto de perfil do Instagram (use só como ícone)");
  ((brand.fotosSite as string[] | undefined) ?? []).slice(0, 8).forEach((f, i) => copy(f, `foto-site-${i + 1}`, "Foto do site atual do negócio"));
  ((brand.fotosInstagram as string[] | undefined) ?? []).slice(0, 9).forEach((f, i) => copy(f, `foto-instagram-${i + 1}`, "Foto de um post do Instagram (pode ter texto escrito por cima)"));
  return { dir, assets };
}

// Estilos usados nos últimos sites (para não sair tudo igual)
async function recentStyles(): Promise<string[]> {
  const missions = await prisma.mission.findMany({
    where: { context: { path: ["siteStyle"], not: "null" } },
    orderBy: { updatedAt: "desc" },
    select: { context: true },
    take: 4,
  });
  return missions.map((m) => String(((m.context ?? {}) as Json).siteStyle ?? "")).filter(Boolean);
}

function buildInstructions(ctx: { businessName: string; handle: string; assets: PreparedAsset[]; attempt: number; feedback?: string; recent: string[]; hasWhatsapp: boolean; isHealth: boolean }): string {
  const exemplo: SiteContent = {
    estilo: "aurora | clinico | editorial | impacto",
    cores: { primaria: "#hex da marca", secundaria: "#hex", destaque: "#hex (cor de realce, pode ser a mesma da primária)" },
    topo: { selo: "Segmento · cidade", titulo: "Promessa curta (até 7 palavras)", tituloDestaque: "trecho exato do título que ganha cor", subtitulo: "1 ou 2 frases: o que faz, para quem, por que confiar", botao: "Agendar avaliação", botaoSecundario: "Ver tratamentos", foto: "assets/... (só foto GRANDE) ou null" },
    numeros: [{ valor: "5,0", rotulo: "nota no Google" }],
    faixa: ["4 a 8 palavras-chave curtas (serviços ou valores) para a faixa animada"],
    servicos: [{ titulo: "Serviço real", descricao: "benefício em 1 frase", icone: "um dos ícones da lista", mensagem: "mensagem pronta para o WhatsApp sobre este serviço" }],
    passos: [{ titulo: "Etapa", descricao: "1 frase" }],
    diferenciais: [{ titulo: "Diferencial", descricao: "1 frase", icone: "ícone" }],
    sobre: { titulo: "Título", texto: "2 parágrafos curtos separados por quebra de linha", foto: "assets/... (GRANDE ou MÉDIA) ou null", nome: "nome real do responsável ou omita", cargo: "cargo ou omita" },
    galeria: ["assets/... (3 a 6 fotos boas, sem texto por cima)"],
    depoimentos: [{ texto: "[Depoimento real do cliente]", autor: "[Nome]" }],
    faq: [{ pergunta: "Dúvida real de quem procura este serviço", resposta: "Resposta curta e honesta" }],
    local: { endereco: "só se estiver nos dados", horario: "só se estiver nos dados, senão [horário de atendimento]", mapa: "termo de busca no Google Maps (nome + cidade)" },
    chamadaFinal: { titulo: "Chamada final forte", texto: "1 frase", botao: "Texto do botão" },
    rodape: { cnpj: "só se existir nos dados", responsavelTecnico: "só se existir nos dados" },
    secoes: { servicos: { kicker: "Tratamentos", titulo: "título da seção", texto: "1 frase" } },
  };
  return [
    `Crie o SITE NOVO da ${ctx.businessName} (@${ctx.handle}). É a proposta que a LOTUS vai mostrar ao dono: ele tem que pensar "eu quero isso" e aceitar pagar caro por ele.`,
    "",
    "COMO FUNCIONA: você NÃO escreve HTML. Você escolhe a direção de arte, as cores, as fotos e escreve todo o conteúdo; o sistema monta o site com um design premium já pronto (tipografia, animações, celular, contraste). Sua entrega é um bloco ```json com o conteúdo.",
    "",
    "1) DIREÇÃO DE ARTE (campo estilo). Escolha a que mais combina com o segmento e o posicionamento do negócio:",
    ...SITE_STYLES.map((s) => `- ${STYLE_GUIDE[s]}`),
    ctx.recent.length ? `Os últimos sites da LOTUS usaram: ${ctx.recent.join(", ")}. Se mais de uma direção servir bem para este negócio, prefira uma diferente dessas, para cada cliente ter um site com cara própria.` : "",
    "",
    "2) CORES: use as cores reais da marca (coresDaMarca/neutrasDaMarca do contexto e o logo). primaria = cor principal da marca; destaque = a cor de realce. Nada de azul ou roxo genérico se a marca não usa.",
    "",
    "3) FOTOS (veja as imagens anexadas; a lista `arquivosDisponiveis` diz o tamanho de cada uma):",
    "- topo.foto: SÓ foto marcada como GRANDE, e só se der vontade de ir ao lugar: pessoa sorrindo, equipe, profissional, ambiente bonito, recepção. NUNCA boca aberta, dentes de perto, procedimento, sangue, instrumentos, antes e depois, nem imagem com texto escrito por cima. Se nenhuma servir, use null: o sistema faz um topo sem foto, elegante (não é defeito).",
    "- sobre.foto: o profissional ou a equipe (GRANDE ou MÉDIA). galeria: 3 a 6 fotos de ambiente/equipe/resultado discreto, sem texto por cima. Foto PEQUENA nunca.",
    "- Não repita a mesma foto em dois lugares.",
    "- ARTE DE POST NÃO É FOTO: imagem com letras, título, logo grande, promoção, convite, banner, carrossel informativo ou capa de vídeo com texto NÃO entra em lugar nenhum do site (nem topo, nem galeria). Olhe cada imagem anexada antes de escolher. Muitos perfis só têm artes: nesse caso use null nas fotos; o site sem foto continua bonito.",
    "",
    "4) TEXTO (o que mais vende):",
    "- Título do topo com no máximo 7 palavras, específico para este negócio (nada de frase genérica que serviria para qualquer clínica). Use o diferencial real que apareceu no diagnóstico.",
    "- Fale com o cliente final, na forma como o negócio já fala no Instagram, corrigindo os erros apontados no diagnóstico.",
    "- servicos: os serviços REAIS que o negócio oferece (dos destaques, bio, posts e site). 3 a 6 itens.",
    "- numeros: só dados reais e verificáveis do contexto (nota e quantidade de avaliações do Google, anos de mercado, pacientes atendidos se o próprio negócio divulga). Se não houver, deixe a lista vazia.",
    "- faq: 4 a 6 dúvidas reais de quem procura esse serviço.",
    `- ícones disponíveis: ${ICON_NAMES.join(", ")}.`,
    ctx.isHealth
      ? "- Saúde: sem promessa de resultado, sem superlativos (melhor, único, garantido), sem antes e depois, sem preço."
      : "- Este negócio NÃO é da área da saúde: use 'clientes', 'serviços' e o tom do segmento; nada de regras de saúde nem 'responsável técnico'.",
    "",
    "5) NADA INVENTADO: nem depoimento, preço, nome de profissional, endereço, telefone, prêmio ou número. O que só o cliente sabe vira marcador curto entre colchetes, ex.: [horário de atendimento], [Depoimento real do cliente]. Nada de anotação interna (HIPÓTESE, CONFIRMAR, TODO).",
    ctx.hasWhatsapp
      ? "Os botões vão para o WhatsApp do próprio negócio (o sistema monta o link); escreva em cada serviço a `mensagem` que o cliente vai mandar."
      : "Este negócio não tem WhatsApp próprio nos dados: o sistema liga os botões ao direct do Instagram. Não invente número.",
    "",
    "FORMATO DA ENTREGA: um parágrafo curto explicando a direção de arte escolhida e por quê, depois UM bloco ```json exatamente com esta estrutura (campos sem dado podem ser omitidos):",
    "```json",
    JSON.stringify(exemplo, null, 2),
    "```",
    'Salve com save_document (type "other"), com o bloco json incluído.',
    ...(ctx.feedback
      ? [
          "",
          `ESTA É A TENTATIVA ${ctx.attempt}. A revisora reprovou a versão anterior. Corrija TODOS os pontos abaixo no novo JSON (pode trocar estilo, fotos, cores e textos), mantendo o que estava bom:`,
          ctx.feedback,
        ]
      : []),
  ]
    .filter((l) => l !== "")
    .join("\n");
}

const REVIEW_INSTRUCTIONS = (businessName: string, url: string) =>
  [
    `Revise o site novo da ${businessName}, publicado em ${url}. As imagens anexadas são prints do site no ar (3 partes no computador e o topo no celular).`,
    "Você é exigente: este site vai ser mostrado ao dono do negócio para vender um projeto de site profissional (algo que se cobra de R$ 3 a 8 mil). Avalie de 0 a 10:",
    "O design (tipografia, espaçamento, animações) vem de uma direção de arte pronta do sistema (`direcaoDeArte`); o agente escolhe a direção, as cores, as fotos e escreve o texto (`conteudoDoSite`). Suas correções devem dizer o que mudar NESSAS escolhas: trocar a direção de arte, trocar ou remover uma foto (diga qual arquivo), ajustar cor, reescrever um texto. `avisosDoSistema` lista fotos que o sistema recusou por serem pequenas.",
    "0. Impressiona? Parece site de agência premium, com cara própria deste negócio, ou parece genérico? A direção de arte combina com o segmento e o público?",
    "1. Visual: usa as cores e o logo da marca? As fotos são reais e bem usadas? Algo quebrado, cortado, sobreposto ou ilegível?",
    "1b. Olhe de perto: alguma foto está PIXELADA ou borrada (imagem pequena esticada)? Algum botão ou texto tem pouco contraste (ex.: letra escura sobre fundo escuro)? Cada um desses é correção obrigatória.",
    "2. Celular: o topo funciona no celular, texto legível, botão de agendar visível?",
    "3. Conversão: fica claro em 5 segundos o que a clínica faz, para quem e como agendar? Os botões levam ao WhatsApp certo?",
    "4. Texto: claro, sem erros, sem promessas proibidas em saúde, sem nada inventado?",
    "5. Técnica: use os dados de `verificacaoTecnica` (imagens quebradas, erros, tempo de carregamento).",
    "Seja específico nas correções: diga onde está o problema e como corrigir.",
    "REPROVA AUTOMÁTICA (nota máxima 6) se houver: foto clínica de boca/dentes/procedimento no topo ou em destaque; imagem quebrada; texto ilegível; dado inventado (inclusive número de telefone); botão de contato que não abre nada; anotação interna visível (ex.: 'HIPÓTESE', 'CONFIRMAR NA REUNIÃO').",
    "O QUE É ESPERADO E NÃO TIRA PONTO: marcadores curtos entre colchetes para dados que só o cliente tem (CRO, horário, depoimentos reais); a frase 'Prévia de proposta criada pela LOTUS' no rodapé; botões levando ao direct do Instagram (ig.me) quando o negócio não tem WhatsApp próprio. Nunca peça para inventar número, depoimento ou dado.",
    `Aprove só se a nota for ${MIN_SCORE} ou mais.`,
    "OBRIGATÓRIO: termine o documento com um bloco ```json exatamente assim (é ele que o sistema lê para aprovar ou refazer):",
    '{"veredito": "APROVADO" ou "REFAZER", "nota": 0, "pontosFortes": ["..."], "correcoes": ["..."]}',
    "Salve com save_document (type \"analysis\").",
  ].join("\n");

// Cria a cadeia construir → publicar → revisar → decidir. Devolve os ids (o último é o que as outras tarefas devem esperar).
export async function createSiteChain(opts: {
  missionId: string;
  businessName: string;
  handle: string;
  brief: Json;
  brand: Json | null;
  dependsOn: string[];
  attempt?: number;
  feedback?: string;
}): Promise<{ buildId: string; decideId: string } | null> {
  const attempt = opts.attempt ?? 1;
  const webId = await agentFor("agent-web", "web-dev");
  const qaId = await agentFor("agent-auditor", "mission-control");
  if (!webId || !qaId) return null;
  const { dir, assets } = prepareSiteAssets(opts.handle, opts.brand);
  const palette = (opts.brand?.paleta ?? null) as Json | null;
  // O agente vê as fotos que podem ir para o site (as maiores primeiro) e o logo
  const usable = assets
    .filter((a) => !/logo-instagram/.test(a.file) && (a.width ?? 0) >= 480)
    .sort((a, b) => (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0));
  const logo = assets.find((a) => /^assets\/logo\./.test(a.file));
  const imagePaths = [...(logo ? [logo] : []), ...usable].slice(0, 8).map((a) => path.join(dir, a.file));
  const suffix = attempt > 1 ? ` (tentativa ${attempt})` : "";
  const hasWhatsapp = Array.isArray(opts.brief.whatsappEncontrado) && (opts.brief.whatsappEncontrado as unknown[]).length > 0;
  const isHealth = typeof opts.brief.negocioDeSaude === "boolean" ? (opts.brief.negocioDeSaude as boolean) : HEALTH_HINT.test(JSON.stringify(opts.brief.perfil ?? opts.brief).slice(0, 4000));

  const build = await prisma.task.create({
    data: {
      missionId: opts.missionId,
      agentId: webId,
      title: `Produção: site novo${isHealth ? " da clínica" : ""}${suffix}`,
      description: "Conteúdo, fotos, cores e direção de arte do site; o sistema monta o site premium e publica.",
      instructions: buildInstructions({ businessName: opts.businessName, handle: opts.handle, assets, attempt, feedback: opts.feedback, recent: await recentStyles(), hasWhatsapp, isHealth }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      input: {
        fase: "producao",
        negocio: opts.businessName,
        instagram: `@${opts.handle}`,
        ...opts.brief,
        coresDaMarca: palette?.coresDaMarca ?? null,
        neutrasDaMarca: palette?.neutrasDaMarca ?? null,
        arquivosDisponiveis: assets.filter((a) => !/logo/.test(a.file)).map(({ file, descricao }) => ({ file, descricao })),
        logoDisponivel: logo ? logo.descricao : "sem logo em arquivo: o sistema usa a inicial do nome",
        imagePaths,
      } as any,
      dependsOn: opts.dependsOn,
      status: "QUEUED",
    },
  });
  const publish = await prisma.task.create({
    data: {
      missionId: opts.missionId,
      agentId: webId,
      title: `Publicar o site na Vercel${suffix}`,
      description: "Etapa automática: grava o site, publica e tira prints para a revisão.",
      instructions: "Etapa automática do sistema.",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      input: { fase: "producao", systemStep: "site_publish", buildTaskId: build.id, siteDir: dir, handle: opts.handle, attempt } as any,
      dependsOn: [build.id],
      status: "QUEUED",
    },
  });
  const review = await prisma.task.create({
    data: {
      missionId: opts.missionId,
      agentId: qaId,
      title: `Revisão de qualidade do site${suffix}`,
      description: "Avaliar o site publicado e aprovar ou pedir correções.",
      instructions: "Aguardando a publicação.",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      input: { fase: "producao", negocio: opts.businessName } as any,
      dependsOn: [publish.id],
      status: "QUEUED",
    },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await prisma.task.update({ where: { id: publish.id }, data: { input: { ...((publish.input ?? {}) as Json), reviewTaskId: review.id } as any } });
  const decide = await prisma.task.create({
    data: {
      missionId: opts.missionId,
      agentId: qaId,
      title: `Decisão sobre o site${suffix}`,
      description: "Etapa automática: aprova o site ou manda refazer com as correções.",
      instructions: "Etapa automática do sistema.",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      input: { fase: "producao", systemStep: "site_decide", buildTaskId: build.id, publishTaskId: publish.id, reviewTaskId: review.id, attempt, handle: opts.handle, businessName: opts.businessName } as any,
      dependsOn: [review.id],
      status: "QUEUED",
    },
  });
  return { buildId: build.id, decideId: decide.id };
}

// Aceita o HTML dentro de um bloco ```html ou solto no texto (há agente que salva o código puro)
export function extractHtml(text: string): string | null {
  const fenced = text.match(/```html\s*\n([\s\S]*?)```/i)?.[1]?.trim();
  if (fenced && /<\/html>\s*$/i.test(fenced)) return fenced;
  const start = text.search(/<!doctype html|<html[\s>]/i);
  const end = text.toLowerCase().lastIndexOf("</html>");
  if (start >= 0 && end > start) return text.slice(start, end + "</html>".length).trim();
  return null;
}

function extractJson(text: string): Json | null {
  const blocks = [...text.matchAll(/```json\s*\n([\s\S]*?)```/gi)].map((m) => m[1]);
  for (const block of blocks.reverse()) {
    try {
      return JSON.parse(block) as Json;
    } catch {
      /* tenta o anterior */
    }
  }
  return null;
}

function verdictFromText(text: string): Json {
  const nota = Number(
    (text.match(/(?:GERAL|nota geral|Nota final)[^0-9]{0,40}(\d{1,2}(?:[.,]\d)?)\s*\/\s*10/i)?.[1] ?? text.match(/(\d{1,2}(?:[.,]\d)?)\s*\/\s*10/)?.[1] ?? "0").replace(",", ".")
  );
  const reprovado = /\b(REFAZER|REPROVADO)\b/.test(text);
  const aprovado = !reprovado && /\bAPROVADO\b/.test(text);
  return { veredito: aprovado ? "APROVADO" : "REFAZER", nota, pontosFortes: [], correcoes: [] };
}

async function deployToVercel(dir: string): Promise<string> {
  // O nome da pasta vira o nome do projeto na Vercel (ex.: lotus-centraldosorrisofsa)
  const { stdout, stderr } = await execAsync(`vercel deploy "${dir}" --yes --prod`, { timeout: 300_000, maxBuffer: 5 * 1024 * 1024, windowsHide: true });
  const all = `${stdout}\n${stderr}`;
  const urls = all.match(/https:\/\/[a-z0-9.-]+\.vercel\.app/gi) ?? [];
  const aliased = all.match(/Aliased:?\s+(https:\/\/[a-z0-9.-]+\.vercel\.app)/i)?.[1];
  const url = aliased ?? urls.sort((a, b) => a.length - b.length)[0];
  if (!url) throw new Error(`A Vercel não devolveu o link do site. Saída: ${all.slice(-400)}`);
  return url;
}

async function latestDocument(taskId: string): Promise<string> {
  const doc = await prisma.document.findFirst({ where: { taskId }, orderBy: { createdAt: "desc" }, select: { content: true } });
  if (doc) return doc.content;
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { output: true } });
  return String((task?.output as Json | null)?.text ?? "");
}

async function complete(taskId: string, output: Json): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await prisma.task.update({ where: { id: taskId }, data: { status: "COMPLETED", completedAt: new Date(), output: output as any } });
}

// Executa uma etapa automática do site. Lança erro em falha (o orquestrador tenta de novo).
export async function runSiteStep(taskId: string): Promise<void> {
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { id: true, missionId: true, input: true } });
  if (!task) return;
  const input = (task.input ?? {}) as Json;

  if (input.systemStep === "site_publish") {
    const buildDoc = await latestDocument(String(input.buildTaskId));
    // Formato novo: o agente entrega o conteúdo em JSON e o sistema monta o site premium.
    // Formato antigo (HTML pronto) continua aceito.
    const content = extractJson(buildDoc) as SiteContent | null;
    let html: string | null = null;
    let style: string | null = null;
    let renderWarnings: string[] = [];
    if (content && (content.topo || content.servicos)) {
      const build = await prisma.task.findUnique({ where: { id: String(input.buildTaskId) }, select: { input: true } });
      const buildInput = (build?.input ?? {}) as Json;
      const dir = String(input.siteDir);
      const files = fs.existsSync(path.join(dir, "assets")) ? fs.readdirSync(path.join(dir, "assets")) : [];
      const all = files.map((f) => {
        const size = imageSize(path.join(dir, "assets", f));
        return { file: `assets/${f}`, width: size?.width ?? null, height: size?.height ?? null };
      });
      // Sem logo no site, a foto de perfil do Instagram (quase sempre o logo) vira o ícone do topo
      const logoAsset = all.find((a) => /^assets\/logo\./.test(a.file)) ?? all.find((a) => /^assets\/logo-instagram\./.test(a.file)) ?? null;
      const whatsapp = ((buildInput.whatsappEncontrado as string[] | undefined) ?? []).map((n) => String(n).replace(/\D/g, "")).find((n) => n.length >= 10) ?? null;
      const isHealth = typeof buildInput.negocioDeSaude === "boolean" ? (buildInput.negocioDeSaude as boolean) : HEALTH_HINT.test(JSON.stringify(buildInput.perfil ?? {}).slice(0, 4000));
      const rendered = renderSite(content, {
        businessName: String(buildInput.negocio ?? input.handle),
        handle: String(input.handle),
        whatsapp,
        logo: logoAsset,
        assets: all.filter((a) => !/logo/.test(a.file)),
        isHealth,
      });
      html = rendered.html;
      style = rendered.style;
      renderWarnings = rendered.warnings;
    } else {
      html = extractHtml(buildDoc);
    }
    if (!html) {
      // Código cortado: em vez de publicar de novo o mesmo arquivo, devolve ao agente de web para refazer
      const redos = Number(input.htmlRedos ?? 0);
      if (redos >= 2) throw new Error("O agente entregou o HTML cortado três vezes seguidas (sem </html>).");
      const buildId = String(input.buildTaskId);
      const build = await prisma.task.findUnique({ where: { id: buildId }, select: { instructions: true } });
      await prisma.document.deleteMany({ where: { taskId: buildId } });
      await prisma.task.update({
        where: { id: buildId },
        data: {
          status: "QUEUED",
          completedAt: null,
          output: {},
          instructions: `${build?.instructions ?? ""}\n\nA entrega anterior veio SEM o bloco json do conteúdo (ou cortada no meio). Entregue de novo: um parágrafo curto e o bloco \`\`\`json COMPLETO, fechado, com a estrutura pedida. Textos enxutos.`,
        },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await prisma.task.update({ where: { id: taskId }, data: { status: "WAITING_DEPENDENCY", startedAt: null, input: { ...input, htmlRedos: redos + 1 } as any } });
      await prisma.activityLog.create({ data: { missionId: task.missionId, taskId, action: "SITE_HTML_REDO", details: { redos: redos + 1 }, level: "WARN" } });
      const { runTask } = await import("@/lib/task-runner");
      runTask(buildId);
      return;
    }
    const dir = String(input.siteDir);
    let page = html;
    if (!/name=["']robots["']/i.test(page)) page = page.replace(/<head([^>]*)>/i, '<head$1>\n<meta name="robots" content="noindex">');
    fs.writeFileSync(path.join(dir, "index.html"), page, "utf-8");
    const url = await deployToVercel(dir);
    const runtime = createRuntimeClient();
    const check = (await runtime.call("/runtime/research/shots", { url, name: String(input.handle) }, 180_000).catch((err) => ({ erro: String(err) }))) as Json;

    // A revisão recebe o link, os prints e a verificação técnica
    const reviewTask = input.reviewTaskId ? await prisma.task.findUnique({ where: { id: String(input.reviewTaskId) }, select: { id: true, input: true } }) : null;
    if (reviewTask) {
      const businessName = String(((reviewTask.input ?? {}) as Json).negocio ?? "clínica");
      await prisma.task.update({
        where: { id: reviewTask.id },
        data: {
          instructions: REVIEW_INSTRUCTIONS(businessName, url),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          input: {
            ...((reviewTask.input ?? {}) as Json),
            siteUrl: url,
            verificacaoTecnica: { status: check.status, carregouEmMs: check.loadMs, imagensQuebradas: check.brokenImages, errosNaPagina: check.consoleErrors, erroAoAbrir: check.erro ?? null },
            ...(content && style
              ? { direcaoDeArte: style, conteudoDoSite: content, avisosDoSistema: renderWarnings }
              : { codigoHtml: html.slice(0, 30_000) }),
            imagePaths: ((check.shots as string[] | undefined) ?? []).slice(0, 4),
          } as any,
        },
      });
    }
    const mission = await prisma.mission.findUnique({ where: { id: task.missionId }, select: { context: true } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await prisma.mission.update({ where: { id: task.missionId }, data: { context: { ...((mission?.context ?? {}) as Json), siteUrl: url, sitePublishedAt: new Date().toISOString(), ...(style ? { siteStyle: style } : {}) } as any } });
    await prisma.activityLog.create({ data: { missionId: task.missionId, taskId, action: "SITE_PUBLISHED", details: { url, attempt: Number(input.attempt ?? 1) }, level: "INFO" } });
    await complete(taskId, { text: `Site publicado em ${url}`, url, prints: check.shots ?? [], verificacao: { status: check.status, loadMs: check.loadMs, brokenImages: check.brokenImages } });
    return;
  }

  if (input.systemStep === "site_decide") {
    const attempt = Number(input.attempt ?? 1);
    const reviewText = await latestDocument(String(input.reviewTaskId));
    // Sem o bloco de dados, lê o veredito e a nota geral do próprio texto da revisão
    const verdict = extractJson(reviewText) ?? verdictFromText(reviewText);
    const score = Number(verdict.nota ?? 0);
    const approved = String(verdict.veredito ?? "").toUpperCase() === "APROVADO" && score >= MIN_SCORE;
    const mission = await prisma.mission.findUnique({ where: { id: task.missionId }, select: { context: true } });
    const context = (mission?.context ?? {}) as Json;
    const url = String(context.siteUrl ?? "");

    if (approved || attempt >= MAX_ATTEMPTS) {
      const status = approved ? "aprovado pela revisão de qualidade" : `publicado após ${attempt} tentativas, ainda com pontos a melhorar`;
      await prisma.document.create({
        data: {
          missionId: task.missionId,
          taskId,
          type: "DELIVERABLE",
          title: `Site novo publicado — ${String(input.businessName)}`,
          content: [
            `# Site novo — ${String(input.businessName)}`,
            "",
            `**Link para mandar ao dono:** ${url}`,
            "",
            `Situação: ${status} (nota ${score}/10, tentativa ${attempt}).`,
            "",
            "## Pontos fortes apontados na revisão",
            ...((verdict.pontosFortes as string[] | undefined) ?? []).map((p) => `- ${p}`),
            ...(!approved && ((verdict.correcoes as string[] | undefined) ?? []).length > 0
              ? ["", "## O que ainda dá para melhorar", ...((verdict.correcoes as string[]) ?? []).map((p) => `- ${p}`)]
              : []),
            "",
            "## Como usar",
            "- Mande o link ao dono da clínica como prévia da proposta (a página não aparece no Google).",
            "- Os depoimentos e dados marcados entre colchetes são preenchidos com o cliente depois que ele fechar.",
            "- Para colocar no domínio da clínica, basta apontar o domínio dele para este projeto na Vercel.",
          ].join("\n"),
        },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await prisma.mission.update({ where: { id: task.missionId }, data: { context: { ...context, siteApproved: approved, siteScore: score } as any } });
      await complete(taskId, { text: `Site ${status}: ${url}`, url, nota: score, aprovado: approved });
      return;
    }

    // Reprovado: nova tentativa com as correções da revisora; quem esperava esta decisão passa a esperar a próxima
    const feedback = ((verdict.correcoes as string[] | undefined) ?? []).map((c, i) => `${i + 1}. ${c}`).join("\n") || reviewText.slice(0, 3000);
    const build = await prisma.task.findUnique({ where: { id: String(input.buildTaskId) }, select: { input: true } });
    const buildInput = (build?.input ?? {}) as Json;
    const { fase: _f, negocio: _n, instagram: _i, coresDaMarca, neutrasDaMarca, arquivosDisponiveis: _a, imagePaths: _p, ...brief } = buildInput;
    const marcaDir = path.join(os.homedir(), "LOTUS_Workspace", "diagnosticos", String(input.handle), "marca", "marca.json");
    const brand = fs.existsSync(marcaDir) ? (JSON.parse(fs.readFileSync(marcaDir, "utf-8")) as Json) : { paleta: { coresDaMarca, neutrasDaMarca } };
    const next = await createSiteChain({
      missionId: task.missionId,
      businessName: String(input.businessName),
      handle: String(input.handle),
      brief: brief as Json,
      brand,
      dependsOn: [],
      attempt: attempt + 1,
      feedback,
    });
    if (next) {
      const waiting = await prisma.task.findMany({ where: { missionId: task.missionId }, select: { id: true, dependsOn: true } });
      for (const t of waiting) {
        const deps = Array.isArray(t.dependsOn) ? (t.dependsOn as string[]) : [];
        if (deps.includes(taskId)) {
          await prisma.task.update({ where: { id: t.id }, data: { dependsOn: deps.map((d) => (d === taskId ? next.decideId : d)) } });
        }
      }
    }
    await prisma.activityLog.create({ data: { missionId: task.missionId, taskId, action: "SITE_REDO", details: { attempt, nota: score }, level: "WARN" } });
    await complete(taskId, { text: `Site reprovado (nota ${score}). Nova tentativa criada com ${((verdict.correcoes as string[] | undefined) ?? []).length} correções.`, nota: score, aprovado: false, proximaTentativa: next?.buildId ?? null });
    if (next) {
      const { runTask } = await import("@/lib/task-runner");
      runTask(next.buildId);
    }
  }
}
