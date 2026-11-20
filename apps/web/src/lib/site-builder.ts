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
import { SITE_STYLES, STYLE_GUIDE, renderSite, type SiteContent } from "@/lib/site-render";
import { AI_TELLS, DESIGN_PRINCIPLES, FONT_PAIRS, segmentFor, type SegmentPlaybook } from "@/lib/design-knowledge";
import { triagePhotos, usableVerdict, type PhotoVerdict } from "@/lib/photo-triage";
import { awwwardsCategoryLabel, awwwardsReferences, type AwwwardsRef } from "@/lib/awwwards";
import { stockPhotosFor } from "@/lib/stock-photos";
import { aiPhotosFor } from "@/lib/ai-photos";

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

// Nome aproximado da cor (o gerador de imagens entende "deep blue" melhor que um código hex)
function colorWord(hex: string | undefined): string {
  const m = (hex ?? "").match(/^#?([0-9a-f]{6})$/i);
  if (!m) return "soft neutral";
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max - min < 0.08) return l > 0.7 ? "white" : l < 0.25 ? "black" : "grey";
  const d = max - min;
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  const names: Array<[number, string]> = [[15, "red"], [40, "orange"], [65, "golden"], [160, "green"], [200, "teal"], [250, "blue"], [290, "purple"], [335, "pink"], [360, "red"]];
  const hue = names.find(([limit]) => h < limit)?.[1] ?? "blue";
  return `${l < 0.35 ? "deep " : l > 0.7 ? "light " : ""}${hue}`;
}

export async function prepareSiteAssets(
  handle: string,
  brand: Json | null,
  stockQueries: string[] = [],
  aiPrompts: Array<{ prompt: string; formato: "paisagem" | "retrato" }> = []
): Promise<{ dir: string; assets: PreparedAsset[] }> {
  const dir = path.join(SITES_DIR, `lotus-${slug(handle)}`);
  const assetsDir = path.join(dir, "assets");
  // Pasta limpa a cada site: sobra de tentativa antiga não entra no site novo
  fs.rmSync(assetsDir, { recursive: true, force: true });
  fs.mkdirSync(assetsDir, { recursive: true });
  const assets: PreparedAsset[] = [];
  // Fotos criadas por IA (chave do ChatGPT) para o topo e os serviços; reaproveitadas nas tentativas seguintes
  const brandColor = ((brand?.paleta as Json | undefined)?.coresDaMarca as Array<{ hex?: string }> | undefined)?.[0]?.hex;
  // Triagem das fotos REAIS: a IA separa foto de verdade (paciente, profissional, equipe, clínica) de arte com texto
  const realFiles = [...((brand?.fotosSite as string[] | undefined) ?? []).slice(0, 8), ...((brand?.fotosInstagram as string[] | undefined) ?? []).slice(0, 9)].filter((f) => typeof f === "string" && fs.existsSync(f));
  const verdicts = await triagePhotos(realFiles).catch(() => new Map<string, PhotoVerdict>());
  // O site tem que ter a cara da clínica: com 4+ fotos reais boas, nada de foto de IA; com 1 a 3, no máximo 2 para completar
  const realGood = realFiles.filter((f) => {
    const s = imageSize(f);
    return !!s && s.width >= 600 && s.height >= 600 && usableVerdict(verdicts.get(f));
  }).length;
  aiPrompts = realGood >= 4 ? [] : realGood >= 1 ? aiPrompts.slice(0, 2) : aiPrompts;
  const aiPhotos = aiPrompts.length ? await aiPhotosFor(handle, aiPrompts.map((p) => ({ ...p, prompt: p.prompt.replace(/\{cor\}/g, colorWord(brandColor)) }))) : [];
  aiPhotos.forEach((photo, i) => {
    const file = `assets/banco-ia-${i + 1}${path.extname(photo.file)}`;
    fs.copyFileSync(photo.file, path.join(dir, file));
    const size = imageSize(photo.file);
    const w = size?.width ?? photo.width;
    const h = size?.height ?? photo.height;
    assets.push({
      file,
      descricao: `Foto PROFISSIONAL criada por IA para este site (${i === 0 ? "horizontal, ideal para o topo" : "vertical, ideal para um serviço"}): "${photo.prompt.slice(0, 140)}". ${sizeLabel(w, h)}. Pode ir no TOPO e nos SERVIÇOS; não pode ir em 'sobre' nem na galeria (não é a equipe nem o lugar do cliente)`,
      source: photo.file,
      width: w,
      height: h,
    });
  });
  // Fotos profissionais de banco de imagens (Pexels) para o topo e os serviços, se houver chave
  const stock = aiPhotos.length ? [] : await stockPhotosFor(stockQueries, 2);
  stock.forEach((photo, i) => {
    const file = `assets/banco-${i + 1}.jpg`;
    fs.copyFileSync(photo.file, path.join(dir, file));
    assets.push({
      file,
      descricao: `Foto PROFISSIONAL de banco de imagens (Pexels, uso livre): "${photo.alt}". ${sizeLabel(photo.width, photo.height)}. Pode ir no TOPO e nos SERVIÇOS; não pode ir em 'sobre' nem na galeria (não é a equipe nem o lugar do cliente)`,
      source: photo.file,
      width: photo.width,
      height: photo.height,
    });
  });
  if (!brand) return { dir, assets };
  const copy = (source: unknown, name: string, descricao: string) => {
    if (typeof source !== "string" || !fs.existsSync(source)) return;
    const v = verdicts.get(source);
    // Arte com texto, pôster ou procedimento não entra no site
    if (v && !usableVerdict(v)) return;
    if (v) descricao = `FOTO REAL do cliente — ${v.tipo}: ${v.descricao} (qualidade ${v.nota}/5, sem texto por cima). PRIORIDADE no site`;
    const file = `assets/${name}${path.extname(source).toLowerCase()}`;
    fs.copyFileSync(source, path.join(dir, file));
    const size = imageSize(source);
    assets.push({ file, descricao: `${descricao}. ${sizeLabel(size?.width ?? null, size?.height ?? null)}`, source, width: size?.width ?? null, height: size?.height ?? null });
  };
  copy(brand.logoSite, "logo", "Logo oficial (do site do negócio)");
  copy(brand.logoInstagram, "logo-instagram", "Foto de perfil do Instagram (use só como ícone)");
  ((brand.fotosSite as string[] | undefined) ?? []).slice(0, 8).forEach((f, i) => copy(f, `foto-site-${i + 1}`, "FOTO REAL do site atual do negócio: PRIORIDADE no site"));
  ((brand.fotosInstagram as string[] | undefined) ?? []).slice(0, 9).forEach((f, i) => copy(f, `foto-instagram-${i + 1}`, "FOTO REAL do cliente (post/story do Instagram): PRIORIDADE no site; só não use se tiver texto, logo ou arte por cima"));
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

function buildInstructions(ctx: { businessName: string; handle: string; assets: PreparedAsset[]; attempt: number; feedback?: string; recent: string[]; hasWhatsapp: boolean; isHealth: boolean; segment: SegmentPlaybook; hasStock: boolean; refs: AwwwardsRef[]; realPhotos: number }): string {
  const exemplo: SiteContent = {
    estilo: "aurora | clinico | editorial | impacto",
    fontes: "um dos pares de fontes da lista",
    cores: { primaria: "#hex principal da marca", destaque: "#hex de realce (pode repetir a primária)" },
    topo: { selo: "Segmento em cidade (sem ponto no meio)", titulo: "Promessa curta e específica (até 7 palavras)", subtitulo: "1 ou 2 frases: o que faz, para quem, por que confiar", botao: "Agendar avaliação pelo WhatsApp", botaoSecundario: "Ver tratamentos", foto: "assets/... (GRANDE) ou null" },
    numeros: [{ valor: "5,0", rotulo: "nota no Google" }],
    servicos: [{ titulo: "Serviço real", descricao: "benefício concreto em 1 frase", foto: "assets/... ou null", mensagem: "mensagem pronta para o WhatsApp sobre este serviço" }],
    passos: [{ titulo: "Etapa", descricao: "1 frase" }],
    diferenciais: [{ titulo: "Diferencial verificável", descricao: "1 frase" }],
    sobre: { titulo: "Título", texto: "2 parágrafos curtos separados por quebra de linha", foto: "assets/... (foto REAL do cliente) ou null", nome: "nome real ou omita", cargo: "cargo ou omita" },
    galeria: ["assets/... (só fotos REAIS do cliente, sem texto por cima)"],
    depoimentos: [{ texto: "depoimento real (Google) ou [Depoimento real do cliente]", autor: "nome real ou [Nome]" }],
    faq: [{ pergunta: "Dúvida real de quem procura este serviço", resposta: "Resposta curta e honesta" }],
    local: { endereco: "só se estiver nos dados", horario: "só se estiver nos dados, senão [horário de atendimento]", mapa: "nome + cidade para o Google Maps" },
    chamadaFinal: { titulo: "Chamada final", texto: "1 frase", botao: "Texto do botão" },
    rodape: { cnpj: "só se existir nos dados", responsavelTecnico: "só se existir nos dados" },
    secoes: { servicos: { titulo: "título da seção (frase normal, não rótulo)", texto: "1 frase opcional" } },
  };
  const seg = ctx.segment;
  return [
    `Crie o SITE NOVO da ${ctx.businessName} (@${ctx.handle}). É a proposta que a LOTUS mostra ao dono: ele tem que olhar e pensar "que site foda, parece que custou R$ 10 mil".`,
    "",
    "COMO FUNCIONA: você NÃO escreve HTML. Você é o diretor de arte e redator: escolhe direção de arte, par de fontes, cores e fotos, e escreve todo o texto. O sistema monta o site com acabamento profissional (grid, ritmo, contraste, celular). Entrega: um bloco ```json.",
    "",
    "PRINCÍPIOS DE DESIGN DA LOTUS:",
    ...DESIGN_PRINCIPLES.map((p) => `- ${p}`),
    "",
    "SINAIS DE 'SITE FEITO POR IA' QUE VOCÊ NÃO PODE PRODUZIR (a revisora reprova):",
    ...AI_TELLS.map((t) => `- ${t}`),
    "",
    `SEGMENTO DESTE NEGÓCIO: ${seg.nome}.`,
    `- O mundo do negócio: ${seg.mundo}.`,
    `- Ordem que converte: ${seg.pagina}.`,
    `- Foco de conversão: ${seg.conversao}.`,
    `- Direções que costumam servir: ${seg.estilos}. Fontes que costumam servir: ${seg.fontes.join(", ")}.`,
    "",
    ...(ctx.refs.length
      ? [
          `REFERÊNCIAS DE NÍVEL (AWWWARDS): as ÚLTIMAS ${ctx.refs.length} imagens anexadas são sites premiados no Awwwards (a premiação dos melhores sites do mundo) na categoria deste nicho (${awwwardsCategoryLabel(seg.id)}). São INSPIRAÇÃO de acabamento, não molde:`,
          ...ctx.refs.map((r) => `- ${r.title}${r.award ? ` (${r.award})` : ""}: ${r.tags.slice(0, 6).join(", ")}`),
          "O que tirar delas: (1) a ESCALA e o caráter da tipografia; (2) o movimento (o site da LOTUS já tem título entrando palavra por palavra, seções em cascata, fotos em cortina e profundidade: escolha a direção de arte que mais combina com o clima da referência); (3) poucas cores bem usadas (normalmente 2 + neutros), sempre com as cores REAIS da marca do cliente; (4) UM elemento memorável por página.",
          "PRIORIDADE ACIMA DAS REFERÊNCIAS: a cara REAL da clínica (fotos reais, nome, profissional, pacientes). Referência premiada nunca justifica trocar foto real por foto genérica. Não copie textos, marca, fotos ou layout deles. No plano de design, diga em 1 linha o que você tirou das referências para ESTE negócio.",
          "",
        ]
      : []),
    "1) DIREÇÃO DE ARTE (campo estilo):",
    ...SITE_STYLES.map((s) => `- ${STYLE_GUIDE[s]}`),
    ctx.recent.length ? `Os últimos sites da LOTUS usaram: ${ctx.recent.join(", ")}. Se mais de uma direção servir, escolha uma diferente, para cada cliente ter cara própria.` : "",
    "",
    "2) FONTES (campo fontes), escolha UM par pelo caráter deste negócio:",
    ...Object.entries(FONT_PAIRS).map(([id, f]) => `- ${id}: ${f.titulo} + ${f.texto} (${f.descricao})`),
    "",
    "3) CORES: as cores reais da marca (coresDaMarca/neutrasDaMarca e o logo). primaria = cor principal; destaque = realce. O sistema calcula fundo e contraste.",
    "",
    "4) FOTOS: O SITE TEM QUE TER A CARA DA CLÍNICA DE VERDADE (olhe as imagens anexadas; `arquivosDisponiveis` diz tamanho e origem de cada uma):",
    `- REGRA Nº 1: o dono tem que abrir o site e reconhecer a clínica DELE: o rosto do dentista/médico, a equipe, os pacientes reais sorrindo, o lugar. Site só com foto genérica de IA é REPROVADO, mesmo bonito. ${ctx.realPhotos > 0 ? `Há ${ctx.realPhotos} foto(s) REAIS do cliente (assets/foto-...): use as melhores no topo, no 'sobre', nos serviços e na galeria.` : "Não há fotos reais boas do cliente: aí sim as fotos profissionais preenchem."}`,
    "- topo.foto: de preferência uma foto REAL forte: o profissional responsável, um paciente real sorrindo, a equipe ou a clínica. Foto real VERTICAL (de story/post) funciona no topo dos estilos 'clinico' e 'impacto' (a foto fica numa coluna ao lado do título); nos estilos 'aurora' e 'editorial' o topo pede foto GRANDE horizontal. Se a melhor foto do cliente é vertical, escolha 'clinico' ou 'impacto'. NUNCA boca aberta de perto, procedimento, sangue, instrumento, antes e depois.",
    ctx.hasStock
      ? "- Fotos PROFISSIONAIS criadas por IA ou de banco (assets/banco-...) são só para TAPAR BURACO: use apenas onde não houver foto real boa, no máximo 2 no site inteiro, e nunca no 'sobre' nem na galeria (não são a clínica)."
      : "- Não há fotos de banco de imagens. Onde não houver foto real boa, use null: o sistema faz um layout tipográfico elegante.",
    "- galeria: quando houver 3 ou mais fotos reais boas (pacientes, equipe, clínica, evento da marca), monte a galeria com elas. É a prova de que a clínica existe e é querida.",
    "- servicos[].foto: dê foto a TODOS os serviços ou a nenhum (o layout muda: com fotos vira mosaico; sem fotos vira lista elegante). Foto PEQUENA nunca.",
    "- ARTE DE POST NÃO É FOTO: imagem com letras, título, logo grande, promoção, convite, banner ou capa de vídeo com texto NÃO entra em lugar nenhum.",
    "- sobre.foto e galeria: só fotos REAIS do cliente (profissional, equipe, lugar). Não repita a mesma foto em dois lugares.",
    "- 'Quem somos' (seção sobre): quando houver uma foto real boa, use. Vale o dono ou profissional responsável (até em evento ou ao lado de alguém, se ele aparece bem e com boa qualidade), a equipe ou a fachada/recepção da clínica. Isso dá confiança: é gente de verdade. Não é obrigatório: sem foto real boa, a seção fica só com texto.",
    "",
    "5) TEXTO (é o que mais vende):",
    "- Título do topo: até 7 palavras, específico deste negócio (o diferencial real do diagnóstico), sem palavra destacada. Nada que serviria para qualquer concorrente.",
    "- Frases normais (sem caixa alta), voz ativa, linguagem do paciente/cliente; cada texto faz um só trabalho. Botões dizem a ação ('Agendar avaliação pelo WhatsApp').",
    "- servicos: os serviços REAIS (destaques, bio, posts, site), 3 a 6.",
    "- numeros: só dados reais e verificáveis (nota e avaliações do Google, anos, pacientes se o próprio negócio divulga). Sem dado, lista vazia.",
    "- faq: 4 a 6 dúvidas reais (dor, preço, convênio, tempo, primeira consulta).",
    ctx.isHealth
      ? "- Saúde: sem promessa de resultado, sem superlativos (melhor, único, garantido), sem antes e depois, sem preço."
      : "- Este negócio NÃO é da área da saúde: use 'clientes' e 'serviços' e o tom do segmento.",
    "",
    "6) NADA INVENTADO: depoimento, preço, nome, endereço, telefone, prêmio e número só se estiverem nos dados. O que só o cliente sabe vira marcador curto: [horário de atendimento], [Depoimento real do cliente]. Nada de anotação interna.",
    ctx.hasWhatsapp
      ? "Os botões vão para o WhatsApp do próprio negócio (o sistema monta o link); escreva a `mensagem` de cada serviço."
      : "Sem WhatsApp próprio nos dados: o sistema liga os botões ao direct do Instagram. Não invente número.",
    "",
    "ANTES DO JSON, escreva o PLANO DE DESIGN em 5 linhas: (a) o conceito, tirado do mundo deste negócio; (b) a direção e o par de fontes, e por que são DESTE negócio; (c) as cores; (d) o elemento memorável; (e) o que você cortou para não parecer modelo pronto. Depois revise o plano: se alguma parte serviria para qualquer clínica, troque.",
    "",
    "FORMATO: o plano curto, depois UM bloco ```json com esta estrutura (campos sem dado podem ser omitidos):",
    "```json",
    JSON.stringify(exemplo, null, 2),
    "```",
    'Salve com save_document (type "other"), com o plano e o bloco json.',
    ...(ctx.feedback
      ? [
          "",
          `ESTA É A TENTATIVA ${ctx.attempt}. A revisora reprovou a versão anterior. Corrija TODOS os pontos abaixo no novo JSON (pode trocar estilo, fontes, fotos, cores e textos), mantendo o que estava bom:`,
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
    "Você é exigente como um diretor de arte de agência: este site vai ser mostrado ao dono do negócio para vender um projeto de site de uns R$ 10 mil. O dono tem que olhar e achar o site incrível. Avalie de 0 a 10:",
    "O acabamento (grid, espaçamento, contraste) vem do sistema; o agente escolhe direção de arte, par de fontes, cores, fotos e escreve o texto (`conteudoDoSite`). Suas correções dizem o que mudar NESSAS escolhas: trocar direção, fontes, foto (diga qual arquivo), cor ou texto. `avisosDoSistema` lista fotos que o sistema recusou e quantas fotos REAIS do cliente existiam e foram usadas.",
    "Régua: os sites premiados do Awwwards (awwwards.com) na categoria deste nicho. O diretor de arte recebeu exemplos deles. Se este site ficar visivelmente abaixo desse nível em tipografia, respiro, força da foto principal ou ideia visual, diga exatamente o que falta.",
    "0. Impressiona? Tem cara própria deste negócio ou parece modelo pronto / feito por IA? Procure estes sinais de site gerado por IA (cada um é correção obrigatória):",
    ...AI_TELLS.map((t) => `   - ${t}`),
    "0a. TEM A CARA DA CLÍNICA DE VERDADE? O dono precisa reconhecer o negócio dele (rosto do profissional, equipe, pacientes reais, o lugar). Se `avisosDoSistema` mostra fotos REAIS disponíveis e o site usa poucas ou nenhuma, ou usa mais foto de IA do que real: nota máxima 6 e correção obrigatória dizendo QUAIS arquivos reais colocar e onde (topo, sobre, galeria). Site genérico com cara de IA não vende para o dono.",
    "0b. As fotos são fortes? Foto fraca ou arte de post num lugar de destaque derruba a nota. Fotos de IA ou de banco só são aceitáveis para tapar buraco onde não há foto real boa. No 'Sobre', foto REAL do dono, da equipe ou da clínica é um ponto forte, mesmo que seja de evento ou com outra pessoa ao lado, desde que esteja nítida e o profissional apareça bem: não peça para trocar só por isso.",
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
  // Segmento (odonto, estética, academia...) define referências de design e as buscas de fotos profissionais
  const segment = segmentFor(`${opts.businessName} ${JSON.stringify(opts.brief.perfil ?? opts.brief).slice(0, 4000)}`);
  const { dir, assets } = await prepareSiteAssets(opts.handle, opts.brand, segment.bancoDeImagens, segment.fotosIA);
  const palette = (opts.brand?.paleta ?? null) as Json | null;
  // O agente vê primeiro as fotos REAIS do cliente (maiores primeiro), depois as de IA/banco, e o logo
  const isStockFile = (a: PreparedAsset) => /^assets\/banco-/.test(a.file);
  const usable = assets
    .filter((a) => !/logo/.test(a.file) && (a.width ?? 0) >= 480)
    .sort((a, b) => Number(isStockFile(a)) - Number(isStockFile(b)) || (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0));
  const realPhotos = usable.filter((a) => !isStockFile(a)).length;
  const logo = assets.find((a) => /^assets\/logo\./.test(a.file));
  const imagePaths = [...(logo ? [logo] : []), ...usable].slice(0, 10).map((a) => path.join(dir, a.file));
  const suffix = attempt > 1 ? ` (tentativa ${attempt})` : "";
  const hasWhatsapp = Array.isArray(opts.brief.whatsappEncontrado) && (opts.brief.whatsappEncontrado as unknown[]).length > 0;
  const isHealth = typeof opts.brief.negocioDeSaude === "boolean" ? (opts.brief.negocioDeSaude as boolean) : HEALTH_HINT.test(JSON.stringify(opts.brief.perfil ?? opts.brief).slice(0, 4000));
  const hasStock = assets.some((a) => /^assets\/banco-/.test(a.file));
  // Premiados do Awwwards no nicho: o diretor de arte vê como referência de nível (nunca trava o site se falhar)
  const refs = await awwwardsReferences(segment.id, 3).catch(() => [] as AwwwardsRef[]);

  const build = await prisma.task.create({
    data: {
      missionId: opts.missionId,
      agentId: webId,
      title: `Produção: site novo${isHealth ? " da clínica" : ""}${suffix}`,
      description: "Conteúdo, fotos, cores e direção de arte do site; o sistema monta o site premium e publica.",
      instructions: buildInstructions({ businessName: opts.businessName, handle: opts.handle, assets, attempt, feedback: opts.feedback, recent: await recentStyles(), hasWhatsapp, isHealth, segment, hasStock, refs, realPhotos }),
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
        referenciasAwwwards: refs.map((r) => ({ site: r.title, premio: r.award, etiquetas: r.tags, pagina: r.page })),
        referenceImagePaths: refs.map((r) => r.image).filter(Boolean),
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
      // Quantas fotos REAIS do cliente existiam e quantas o site usou (a revisora reprova site sem cara da clínica)
      const realFiles = all.filter((a) => /^assets\/foto-/.test(a.file) && (a.width ?? 0) >= 480).map((a) => a.file);
      const usedReal = realFiles.filter((f) => rendered.html.includes(`src="${f}"`));
      const usedStock = [...new Set([...rendered.html.matchAll(/src="(assets\/banco-[^"]+)"/g)].map((m) => m[1]))];
      renderWarnings.push(`Fotos REAIS do cliente disponíveis: ${realFiles.length}; usadas no site: ${usedReal.length}${realFiles.length ? ` (${usedReal.join(", ") || "nenhuma"})` : ""}. Fotos de IA/banco usadas: ${usedStock.length}.`);
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
