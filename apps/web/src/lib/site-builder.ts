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

const execAsync = promisify(exec);
type Json = Record<string, unknown>;

export const SITE_SYSTEM_STEPS = new Set(["site_publish", "site_decide"]);
const MAX_ATTEMPTS = 3;
const MIN_SCORE = 8;
const SITES_DIR = path.join(os.homedir(), "LOTUS_Workspace", "sites");

const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "clinica";

async function agentFor(id: string, department: string): Promise<string | null> {
  const byId = await prisma.agent.findFirst({ where: { id, isActive: true }, select: { id: true } });
  if (byId) return byId.id;
  return (await prisma.agent.findFirst({ where: { department, isActive: true }, select: { id: true } }))?.id ?? null;
}

// Copia logo e fotos do kit da marca para a pasta do site, com nomes simples que o HTML usa.
export function prepareSiteAssets(handle: string, brand: Json | null): { dir: string; assets: Array<{ file: string; descricao: string; source: string }> } {
  const dir = path.join(SITES_DIR, `lotus-${slug(handle)}`);
  const assetsDir = path.join(dir, "assets");
  fs.mkdirSync(assetsDir, { recursive: true });
  const assets: Array<{ file: string; descricao: string; source: string }> = [];
  if (!brand) return { dir, assets };
  const copy = (source: unknown, name: string, descricao: string) => {
    if (typeof source !== "string" || !fs.existsSync(source)) return;
    const file = `assets/${name}${path.extname(source).toLowerCase()}`;
    fs.copyFileSync(source, path.join(dir, file));
    assets.push({ file, descricao, source });
  };
  copy(brand.logoSite, "logo", "Logo oficial (do site da clínica)");
  copy(brand.logoInstagram, "logo-instagram", "Símbolo/foto do perfil do Instagram (quadrado)");
  ((brand.fotosSite as string[] | undefined) ?? []).slice(0, 6).forEach((f, i) => copy(f, `foto-site-${i + 1}`, "Foto usada no site atual da clínica"));
  ((brand.fotosInstagram as string[] | undefined) ?? []).slice(0, 6).forEach((f, i) => copy(f, `foto-instagram-${i + 1}`, "Imagem de um post do Instagram (pode ter texto por cima)"));
  return { dir, assets };
}

function buildInstructions(ctx: { businessName: string; assets: Array<{ file: string; descricao: string }>; attempt: number; feedback?: string }): string {
  return [
    `Construa o SITE NOVO da ${ctx.businessName}: o site que a LOTUS vai mostrar ao dono como proposta. Ele precisa fazer o dono pensar "eu quero isso".`,
    "",
    "IDENTIDADE (obrigatório):",
    "- Use as CORES DA MARCA do contexto (coresDaMarca/neutrasDaMarca) como base da paleta. Nada de roxo genérico.",
    "- Use o LOGO e as FOTOS REAIS listados em `arquivosDisponiveis` (caminhos relativos, ex.: assets/logo.png). As imagens anexadas são esses arquivos: veja quais servem para o topo, equipe, ambiente e tratamentos. Não use imagens da internet nem banco de imagens.",
    "- O tom dos textos segue a forma como a clínica já fala no Instagram, corrigindo os erros apontados no diagnóstico.",
    "- Escolha das fotos: no topo e nos destaques só fotos que dão vontade de ir à clínica (pessoas sorrindo, equipe, ambiente, recepção). NUNCA use foto clínica de boca aberta, dentes com manchas, sangue, instrumentos ou procedimento no topo. Fotos com texto escrito por cima (posts) não servem de fundo. Se nenhuma foto servir para o topo, use um fundo com o gradiente da marca e o logo grande.",
    "- Ícones: desenhe ícones simples em SVG embutido (traço fino, cor da marca). Nada de emoji como ícone.",
    "",
    "DESIGN: premium e futurista, mas limpo e legível: tipografia grande e elegante (Google Fonts permitido), muito respiro, gradientes suaves com as cores da marca, cartões com vidro fosco (glassmorphism) discreto, cantos arredondados, animações sutis ao rolar (IntersectionObserver), botão de WhatsApp fixo no celular. Contraste alto: texto sempre legível sobre o fundo.",
    "",
    "ESTRUTURA: topo com promessa clara + botão de agendar; para quem é; tratamentos (cartões, cada um com botão que abre o WhatsApp com mensagem do tratamento); como funciona a primeira consulta; diferenciais; equipe/profissional responsável; prova social (só o que é real: nota e número de avaliações do Google, se houver; depoimentos reais ficam como [DEPOIMENTO REAL DO CLIENTE]); localização e horário com mapa (iframe do Google Maps pela busca do endereço); perguntas frequentes; chamada final; rodapé com nome, endereço, CNPJ e responsável técnico se existirem nos dados.",
    "",
    "REGRAS:",
    "- WhatsApp: links https://wa.me/NUMERO?text=... com o número real do contexto. Se não houver número, use [WHATSAPP DA CLÍNICA].",
    "- Nada inventado: nem depoimento, nem preço, nem nome de profissional, nem número de pacientes que não esteja nos dados.",
    "- Regras de publicidade em saúde: sem promessa de resultado, sem superlativos (melhor, único, garantido), sem antes e depois.",
    '- No <head>: <meta name="robots" content="noindex"> (é uma prévia). No fim do rodapé, discreto: "Prévia de proposta criada pela LOTUS".',
    "- UM único arquivo HTML completo (CSS e JS embutidos), terminando em </html>, de até uns 35 mil caracteres. Sem frameworks pesados.",
    "",
    "ENTREGA: um parágrafo curto explicando as escolhas de design, depois o código num único bloco ```html. Salve com save_document (type \"other\"), código incluído.",
    ...(ctx.feedback
      ? [
          "",
          `ESTA É A TENTATIVA ${ctx.attempt}. A revisora de qualidade reprovou a versão anterior. Corrija TODOS os pontos abaixo, mantendo o que estava bom:`,
          ctx.feedback,
        ]
      : []),
  ].join("\n");
}

const REVIEW_INSTRUCTIONS = (businessName: string, url: string) =>
  [
    `Revise o site novo da ${businessName}, publicado em ${url}. As imagens anexadas são prints do site no ar (3 partes no computador e o topo no celular).`,
    "Você é exigente: este site vai ser mostrado ao dono da clínica para vender o projeto. Avalie de 0 a 10:",
    "1. Visual: parece premium e moderno? Usa as cores e o logo da marca? As fotos são reais e bem usadas? Algo quebrado, cortado, sobreposto ou ilegível?",
    "2. Celular: o topo funciona no celular, texto legível, botão de agendar visível?",
    "3. Conversão: fica claro em 5 segundos o que a clínica faz, para quem e como agendar? Os botões levam ao WhatsApp certo?",
    "4. Texto: claro, sem erros, sem promessas proibidas em saúde, sem nada inventado?",
    "5. Técnica: use os dados de `verificacaoTecnica` (imagens quebradas, erros, tempo de carregamento).",
    "Seja específico nas correções: diga onde está o problema e como corrigir.",
    "REPROVA AUTOMÁTICA (nota máxima 6) se houver: foto clínica de boca/dentes/procedimento no topo ou em destaque; imagem quebrada; texto ilegível; dado inventado; botão de agendar que não abre o WhatsApp da clínica.",
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
  const imagePaths = assets.filter((a) => /logo\.|foto-site-1|foto-site-2|foto-instagram-1/.test(a.file)).map((a) => path.join(dir, a.file)).slice(0, 4);
  const suffix = attempt > 1 ? ` (tentativa ${attempt})` : "";

  const build = await prisma.task.create({
    data: {
      missionId: opts.missionId,
      agentId: webId,
      title: `Produção: site novo da clínica${suffix}`,
      description: "Site completo com a identidade da clínica (logo, fotos e cores reais), pronto para publicar.",
      instructions: buildInstructions({ businessName: opts.businessName, assets, attempt, feedback: opts.feedback }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      input: {
        fase: "producao",
        negocio: opts.businessName,
        instagram: `@${opts.handle}`,
        ...opts.brief,
        coresDaMarca: palette?.coresDaMarca ?? null,
        neutrasDaMarca: palette?.neutrasDaMarca ?? null,
        arquivosDisponiveis: assets.map(({ file, descricao }) => ({ file, descricao })),
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

function extractHtml(text: string): string | null {
  const html = text.match(/```html\s*\n([\s\S]*?)```/i)?.[1]?.trim();
  return html && /<\/html>\s*$/i.test(html) ? html : null;
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
    const html = extractHtml(await latestDocument(String(input.buildTaskId)));
    if (!html) throw new Error("O agente não entregou um HTML completo (terminando em </html>).");
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
            codigoHtml: html.slice(0, 30_000),
            imagePaths: ((check.shots as string[] | undefined) ?? []).slice(0, 4),
          } as any,
        },
      });
    }
    const mission = await prisma.mission.findUnique({ where: { id: task.missionId }, select: { context: true } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await prisma.mission.update({ where: { id: task.missionId }, data: { context: { ...((mission?.context ?? {}) as Json), siteUrl: url, sitePublishedAt: new Date().toISOString() } as any } });
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
