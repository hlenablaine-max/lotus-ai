// Relatório do cliente em PDF: capa, resumo executivo (notas, gargalos, próximos passos), site publicado,
// e todos os documentos da missão organizados em capítulos. O PDF é gerado pelo app desktop (Chromium do Electron).
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { marked } from "marked";
import { prisma } from "@/lib/prisma";
import { createRuntimeClient } from "@/lib/runtime-client";
import { parseReport, type Placar } from "@/lib/playbook";
import { extractHtml } from "@/lib/site-builder";

type Json = Record<string, unknown>;

export interface ReportOptions {
  /** true = inclui roteiro de venda, auditoria interna e dados brutos */
  internal?: boolean;
}

interface Doc {
  title: string;
  type: string;
  content: string;
  createdAt: Date;
  task: { status: string; agent: { name: string; title: string } | null } | null;
}

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// Documentos que são do time (não vão para o dono da clínica)
function isInternal(doc: Doc): boolean {
  if (doc.type === "RESEARCH_REPORT") return true;
  return /roteiro da reuni|auditoria de qualidade|site novo publicado|reuni[aã]o de apresenta/i.test(doc.title);
}

type Chapter = "diagnostico" | "analises" | "solucoes" | "plano" | "interno";
function chapterOf(doc: Doc): Chapter {
  if (isInternal(doc)) return "interno";
  if (/pacote de entrega|plano de implementa/i.test(doc.title)) return "plano";
  if (doc.type === "ANALYSIS") return "analises";
  if (doc.type === "STRATEGY" && parseReport(doc.content).placar) return "diagnostico";
  return "solucoes";
}

const CHAPTERS: Array<{ id: Chapter; title: string; intro: string }> = [
  { id: "diagnostico", title: "Diagnóstico 360", intro: "A leitura completa do negócio e onde ele está perdendo faturamento." },
  { id: "analises", title: "Análises por área", intro: "Cada frente analisada por um especialista, com as provas encontradas." },
  { id: "solucoes", title: "Soluções prontas", intro: "Materiais criados para resolver os gargalos: prontos para usar." },
  { id: "plano", title: "Plano de implementação", intro: "O passo a passo para colocar tudo no ar, em ordem." },
  { id: "interno", title: "Uso interno da LOTUS", intro: "Roteiro comercial, auditorias e dados brutos. Não enviar ao cliente." },
];

// Trechos que os agentes escrevem para o time (Ícaro, reunião, próximos passos internos) não vão para o cliente
const INTERNAL_HEADING = /(para o [íi]caro|para a reuni[aã]o|na reuni[aã]o|perguntas? (para|a fazer)|uso interno|nota interna|bastidores|pr[oó]ximos passos internos|como apresentar|roteiro de venda|obje[cç][oõ]es)/i;

function stripInternalSections(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let skipLevel = 0; // nível do título que abriu o trecho interno (0 = não está pulando)
  for (const line of lines) {
    const heading = line.match(/^(#{1,6})\s+(.*)$/) ?? line.match(/^()\*\*(.+?)\*\*:?\s*$/);
    if (heading) {
      const level = heading[1] ? heading[1].length : 7; // "**Título**" sozinho na linha conta como subtítulo
      if (skipLevel && level <= skipLevel) skipLevel = 0;
      if (!skipLevel && INTERNAL_HEADING.test(heading[2])) {
        skipLevel = level;
        continue;
      }
    }
    if (!skipLevel) out.push(line);
  }
  // Frases soltas dirigidas ao Ícaro ou que citam o roteiro de venda também saem
  // (sem \b: o "Í" com acento não conta como letra para \b e a regra não pegava nada)
  return out.filter((l) => !/(^|[^a-zà-ú])[íi]caro(?![a-zà-ú])|roteiro da reuni|script da reuni|closer/i.test(l)).join("\n");
}

// Markdown do agente → HTML limpo para impressão
function renderMarkdown(content: string, internal = false): string {
  let md = parseReport(content).text;
  if (!internal) md = stripInternalSections(md);
  // Blocos de código enormes (HTML do site, JSON de dados) não cabem no PDF
  md = md.replace(/```(\w*)\s*\n([\s\S]*?)```/g, (block, lang: string, body: string) => {
    if (body.length > 2500 || /^(html|json)$/i.test(lang)) {
      const what = /html/i.test(lang) || /<html|<!doctype/i.test(body) ? "página HTML" : "bloco de dados técnico";
      return `\n> _(${what} omitido no PDF: está no pacote de entrega.)_\n`;
    }
    return block;
  });
  const html = marked.parse(md, { gfm: true, breaks: false, async: false }) as string;
  // Campos que o dono do negócio precisa informar ficam destacados
  return html.replace(/\[(PREENCHER[^\]]*)\]/gi, (_m, inner: string) => `<mark class="fill">${inner}</mark>`);
}

const scoreColor = (n: number) => (n >= 7 ? "#10b981" : n >= 5 ? "#f59e0b" : "#ef4444");
const sevColor: Record<string, string> = { alta: "#ef4444", media: "#f59e0b", média: "#f59e0b", baixa: "#64748b" };

function summaryHtml(placar: Placar | null, siteUrl: string | null, siteScore: number | null): string {
  if (!placar && !siteUrl) return "";
  const parts: string[] = [];
  if (placar?.notaGeral != null || placar?.notas?.length) {
    const nota = placar?.notaGeral;
    parts.push(`
      <div class="scoreboard">
        ${nota != null ? `<div class="big-score" style="--c:${scoreColor(nota)}"><span>${esc(nota1(nota))}</span><small>nota geral<br/>de 0 a 10</small></div>` : ""}
        <div class="bars">
          ${(placar?.notas ?? [])
            .map(
              (n) => `<div class="bar-row">
                <div class="bar-label">${esc(n.area)}</div>
                <div class="bar"><i style="width:${Math.max(4, Math.min(100, n.nota * 10))}%;background:${scoreColor(n.nota)}"></i></div>
                <div class="bar-val" style="color:${scoreColor(n.nota)}">${esc(n.nota.toLocaleString("pt-BR"))}</div>
                ${n.motivo ? `<div class="bar-why">${esc(n.motivo)}</div>` : ""}
              </div>`
            )
            .join("")}
        </div>
      </div>`);
  }
  if (placar?.ganhoPotencial) {
    parts.push(`<div class="gain"><div class="gain-k">Ganho potencial estimado</div><div class="gain-v">${esc(placar.ganhoPotencial)}</div><div class="note">Estimativa com base nos dados coletados e em médias de mercado, não é garantia.</div></div>`);
  }
  if (placar?.gargalos?.length) {
    parts.push(
      placar.gargalos
        .map((g, i) => {
          const sev = (g.gravidade ?? "media").toLowerCase();
          // O título da seção vai junto com o primeiro gargalo (não fica sozinho no pé da página)
          return `${i === 0 ? `<h2 class="sec keep-next">Os gargalos que mais custam dinheiro</h2>` : ""}<div class="gargalo" style="--s:${sevColor[sev] ?? sevColor.media}">
            <div class="g-head"><span class="g-n">${i + 1}</span><span class="g-t">${esc(g.titulo)}</span><span class="g-s">${esc(sev)}</span></div>
            <div class="g-grid">
              ${[
                ["O problema", g.problema],
                ["A prova", g.prova],
                ["Por que custa dinheiro", g.porQueCusta],
                ["O que fazer", g.oQueFazer],
              ]
                .filter(([, v]) => v)
                .map(([k, v]) => `<div><div class="g-k">${k}</div><p>${esc(v)}</p></div>`)
                .join("")}
            </div>
            ${g.impacto ? `<div class="g-impact">↗ ${esc(g.impacto)}</div>` : ""}
          </div>`;
        })
        .join("")
    );
  }
  if (placar?.proximosPassos?.length) {
    parts.push(`<h2 class="sec">Próximos passos</h2><ol class="steps">${placar.proximosPassos.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>`);
  }
  if (siteUrl) {
    parts.push(`<div class="site-card">
      <div><div class="g-k">Site novo — prévia publicada</div><div class="site-url">${esc(siteUrl.replace(/^https?:\/\//, ""))}</div>
      <p>Criado com a logo, as fotos e as cores do próprio negócio${siteScore != null ? ` e aprovado na revisão de qualidade com nota ${esc(siteScore)}` : ""}. Abra o link para ver no celular ou no computador.</p></div>
    </div>`);
  }
  return `<section class="page summary">${paged(`<div class="eyebrow">Resumo executivo</div><h1 class="h1">Playbook de Faturamento</h1>${parts.join("")}`)}</section>`;
}

// Tabela com cabeçalho e rodapé vazios: o Chromium repete os dois em cada folha impressa,
// o que dá margem em cima e embaixo nas páginas de texto sem encolher a capa (que ocupa a folha inteira).
function paged(inner: string): string {
  return `<table class="pg"><thead><tr><td><div class="pg-sp"></div></td></tr></thead><tfoot><tr><td><div class="pg-sp"></div></td></tr></tfoot><tbody><tr><td>${inner}</td></tr></tbody></table>`;
}

export async function buildMissionReportHtml(missionId: string, opts: ReportOptions = {}): Promise<{ html: string; fileBase: string } | null> {
  const mission = await prisma.mission.findUnique({
    where: { id: missionId },
    select: { title: true, createdAt: true, context: true, client: { select: { name: true, instagram: true, segment: true, website: true } } },
  });
  if (!mission) return null;
  const ctx = (mission.context ?? {}) as Json;
  const all = (await prisma.document.findMany({
    where: { missionId },
    orderBy: { createdAt: "asc" },
    select: { title: true, type: true, content: true, createdAt: true, task: { select: { status: true, agent: { select: { name: true, title: true } } } } },
  })) as Doc[];
  // Documento de tentativa cancelada (ex.: site refeito) não entra
  const docs = all.filter((d) => !d.task || d.task.status !== "CANCELLED").filter((d) => opts.internal || !isInternal(d));

  const playbookDoc = docs.find((d) => parseReport(d.content).placar);
  const placar = playbookDoc ? parseReport(playbookDoc.content).placar : null;
  const siteUrl = ctx.siteUrl ? String(ctx.siteUrl) : null;
  const siteScore = typeof ctx.siteScore === "number" ? ctx.siteScore : null;
  const handle = ctx.handle ? String(ctx.handle) : mission.client.instagram?.replace(/^@/, "") ?? "";
  const city = ctx.city ? String(ctx.city) : "";
  const date = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });

  const byChapter = CHAPTERS.map((c) => ({ ...c, docs: docs.filter((d) => chapterOf(d) === c.id) })).filter((c) => c.docs.length);

  let docIndex = 0;
  const toc = byChapter
    .map(
      (c) => `<li class="toc-ch">${esc(c.title)}<ol>${c.docs
        .map((d) => `<li><a href="#d${++docIndex}">${esc(cleanTitle(d.title, mission.client.name))}</a></li>`)
        .join("")}</ol></li>`
    )
    .join("");

  docIndex = 0;
  const body = byChapter
    .map(
      (c) => `<section class="chapter-cover page"><div class="eyebrow">Capítulo</div><h1 class="h1">${esc(c.title)}</h1><p class="lead">${esc(c.intro)}</p>
        <ul class="ch-list">${c.docs.map((d) => `<li>${esc(cleanTitle(d.title, mission.client.name))}</li>`).join("")}</ul></section>
        ${c.docs
          .map((d) => {
            const id = ++docIndex;
            const isSite = !!extractHtml(d.content) && /site/i.test(d.title);
            const content = isSite
              ? `<div class="site-card"><div><div class="g-k">Página entregue</div><div class="site-url">${esc((siteUrl ?? "").replace(/^https?:\/\//, "") || "no pacote de entrega")}</div><p>O código completo da página está no pacote de entrega e publicado no link acima.</p></div></div>`
              : renderMarkdown(d.content, !!opts.internal);
            return `<article class="doc" id="d${id}">${paged(`
              <header class="doc-head"><div class="eyebrow">${esc(c.title)}</div><h2>${esc(cleanTitle(d.title, mission.client.name))}</h2>
              ${d.task?.agent ? `<div class="by">Preparado por ${esc(d.task.agent.name)} · ${esc(d.task.agent.title)}</div>` : ""}</header>
              <div class="md">${content}</div>`)}</article>`;
          })
          .join("")}`
    )
    .join("");

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/>
<title>${esc(mission.client.name)} — Playbook LOTUS</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Fraunces:opsz,wght@9..144,500;9..144,700&display=swap" rel="stylesheet"/>
<style>${CSS}</style></head><body>
<section class="cover">
  <div class="cover-top"><div class="brand"><span class="lotus-mark">✿</span> LOTUS</div><div class="cover-date">${esc(date)}</div></div>
  <div class="cover-main">
    <div class="eyebrow light">${opts.internal ? "Versão interna completa" : "Diagnóstico 360 e plano de ação"}</div>
    <h1 class="cover-title">${esc(mission.client.name)}</h1>
    <div class="cover-sub">${[handle ? "@" + handle : "", city, mission.client.segment ?? ""].filter(Boolean).map(esc).join(" · ")}</div>
    ${placar?.notaGeral != null ? `<div class="cover-score"><b style="color:${scoreColor(placar.notaGeral)}">${esc(nota1(placar.notaGeral))}</b><span>nota geral da presença digital</span></div>` : ""}
  </div>
  <div class="cover-foot">Playbook de Faturamento preparado pela LOTUS · ${docs.length} documentos${siteUrl ? " · site novo publicado" : ""}</div>
</section>
${summaryHtml(placar, siteUrl, siteScore)}
<section class="page toc">${paged(`<div class="eyebrow">Conteúdo</div><h1 class="h1">O que tem neste relatório</h1><ol class="toc-list">${toc}</ol>
<p class="note">Números de mercado e projeções de ganho são estimativas e aparecem marcados como tal. Os dados do negócio foram coletados de fontes públicas em ${esc(new Date(mission.createdAt).toLocaleDateString("pt-BR"))}.</p>`)}</section>
${body}
<section class="page end"><div class="brand big"><span class="lotus-mark">✿</span> LOTUS</div><p>Agência autônoma de crescimento para clínicas.</p></section>
</body></html>`;

  const fileBase = `Playbook LOTUS - ${mission.client.name}${opts.internal ? " (interno)" : ""}`.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
  return { html, fileBase };
}

function cleanTitle(title: string, clientName: string): string {
  // "Diagnóstico — Reputação, Presença Local | Odonto Marco (@x)" → "Diagnóstico — Reputação, Presença Local"
  const norm = (v: string) => v.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const tokens = norm(clientName).split(/[^a-z0-9]+/).filter((t) => t.length >= 4 && !["clinica", "consultorio", "odontologia"].includes(t));
  const parts = title
    .replace(/\s*\(@[^)]*\)/g, "")
    .split(/\s+[—|–-]\s+|\s*\|\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
  const kept = parts.filter((p) => !tokens.some((t) => norm(p).includes(t)));
  let t = (kept.length ? kept : parts).join(" — ");
  // Título todo em maiúsculas vira normal
  if (t === t.toUpperCase() && /[A-Z]/.test(t)) t = t.charAt(0) + t.slice(1).toLowerCase();
  return t || title;
}

const nota1 = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// Gera o PDF (precisa do app desktop aberto). Devolve o caminho do arquivo.
export async function renderMissionReportPdf(missionId: string, opts: ReportOptions = {}): Promise<{ pdfPath: string; fileBase: string } | { error: string; html?: string }> {
  const built = await buildMissionReportHtml(missionId, opts);
  if (!built) return { error: "Missão não encontrada." };
  const dir = path.join(os.homedir(), "LOTUS_Workspace", "relatorios");
  fs.mkdirSync(dir, { recursive: true });
  const htmlPath = path.join(dir, `${missionId}${opts.internal ? "-interno" : ""}.html`);
  fs.writeFileSync(htmlPath, built.html, "utf-8");
  const runtime = createRuntimeClient();
  if (!(await runtime.available())) return { error: "Abra o aplicativo LOTUS para gerar o PDF.", html: built.html };
  const pdfPath = path.join(dir, `${built.fileBase}.pdf`);
  await runtime.call("/runtime/pdf", { htmlPath, outPath: pdfPath }, 180_000);
  return { pdfPath, fileBase: built.fileBase };
}

const CSS = `
@page { size: A4; margin: 0; }
/* Folha sem margem (a capa ocupa tudo); nas páginas de texto a margem vem da tabela .pg */
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
html, body { width: 210mm; }
body { margin: 0; font-family: Inter, system-ui, sans-serif; color: #1e1b2e; font-size: 10.5pt; line-height: 1.6; background: #fff; }
.page, .doc { padding: 0 20mm; }
.page { page-break-after: always; }
table.pg { width: 100%; border-collapse: collapse; table-layout: fixed; }
.md, .page, .doc { overflow-wrap: anywhere; word-break: break-word; }
.md img { max-width: 100%; height: auto; }
.md code { white-space: pre-wrap; word-break: break-all; }
.keep-next { break-after: avoid; page-break-after: avoid; }
table.pg td { padding: 0; vertical-align: top; }
.pg-sp { height: 15mm; }
.eyebrow { font-size: 8pt; font-weight: 700; letter-spacing: .18em; text-transform: uppercase; color: #e5007e; }
.eyebrow.light { color: #ff7ac8; }
.h1 { font-family: Fraunces, Georgia, serif; font-size: 28pt; line-height: 1.15; margin: 6px 0 18px; color: #14101f; }
.lead { font-size: 13pt; color: #4b4560; max-width: 140mm; }
.note { font-size: 8.5pt; color: #7a7490; margin-top: 10px; }

.cover { height: 297mm; overflow: hidden; padding: 20mm; color: #fff; display: flex; flex-direction: column; justify-content: space-between; page-break-after: always;
  background: radial-gradient(120% 80% at 85% 10%, rgba(255,51,187,.55), transparent 60%), radial-gradient(90% 70% at 0% 100%, rgba(124,58,237,.55), transparent 60%), #0b0716; }
.cover-top { display: flex; justify-content: space-between; align-items: center; font-size: 9pt; color: rgba(255,255,255,.7); }
.brand { font-weight: 800; letter-spacing: .3em; font-size: 11pt; color: #fff; }
.brand.big { font-size: 20pt; color: #14101f; }
.lotus-mark { color: #ff33bb; }
.cover-title { font-family: Fraunces, Georgia, serif; font-size: 44pt; line-height: 1.05; margin: 10px 0 12px; }
.cover-sub { font-size: 13pt; color: rgba(255,255,255,.75); }
.cover-score { margin-top: 28px; display: flex; align-items: baseline; gap: 12px; }
.cover-score b { font-size: 40pt; font-weight: 800; }
.cover-score span { color: rgba(255,255,255,.7); font-size: 11pt; }
.cover-foot { font-size: 9pt; color: rgba(255,255,255,.55); border-top: 1px solid rgba(255,255,255,.15); padding-top: 10px; }

.scoreboard { display: flex; gap: 22px; align-items: flex-start; margin: 8px 0 18px; }
.big-score { flex: 0 0 auto; width: 44mm; border-radius: 16px; padding: 14px; text-align: center; background: #faf7ff; border: 2px solid var(--c); }
.big-score span { display: block; font-size: 36pt; font-weight: 800; color: var(--c); line-height: 1.1; }
.big-score small { font-size: 8pt; color: #6b6580; }
.bars { flex: 1; }
.bar-row { display: grid; grid-template-columns: 42mm 1fr 10mm; gap: 6px 10px; align-items: center; margin-bottom: 7px; }
.bar-label { font-weight: 600; font-size: 9.5pt; }
.bar { height: 8px; background: #eeeaf5; border-radius: 99px; overflow: hidden; }
.bar i { display: block; height: 100%; border-radius: 99px; }
.bar-val { font-weight: 800; text-align: right; }
.bar-why { grid-column: 1 / -1; font-size: 8.5pt; color: #6b6580; margin: -3px 0 3px; }
.gain { background: linear-gradient(135deg, #ecfdf5, #f0f9ff); border: 1px solid #a7f3d0; border-radius: 14px; padding: 12px 16px; margin: 12px 0 6px; }
.gain-k, .g-k { font-size: 7.5pt; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: #7a7490; margin-bottom: 3px; }
.gain-v { font-size: 12pt; font-weight: 700; color: #065f46; }
h2.sec { font-family: Fraunces, Georgia, serif; font-size: 16pt; margin: 22px 0 10px; }
.gargalo { border: 1px solid #ebe6f3; border-left: 4px solid var(--s); border-radius: 12px; padding: 10px 14px; margin-bottom: 10px; page-break-inside: avoid; background: #fff; }
.g-head { display: flex; gap: 10px; align-items: center; }
.g-n { width: 22px; height: 22px; border-radius: 50%; background: var(--s); color: #fff; font-weight: 800; font-size: 9pt; display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto; }
.g-t { font-weight: 700; font-size: 11pt; flex: 1; }
.g-s { font-size: 7.5pt; text-transform: uppercase; letter-spacing: .1em; color: var(--s); font-weight: 700; }
.g-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 16px; margin-top: 8px; }
.g-grid p { margin: 0; font-size: 9.5pt; color: #3a3450; }
.g-impact { margin-top: 8px; background: #ecfdf5; color: #065f46; border-radius: 8px; padding: 6px 10px; font-size: 9.5pt; font-weight: 600; }
.steps li { margin-bottom: 6px; }
.site-card { margin-top: 16px; border-radius: 14px; padding: 14px 16px; background: #0b0716; color: #fff; page-break-inside: avoid; }
.site-card .g-k { color: #ff7ac8; }
.site-url { font-size: 14pt; font-weight: 800; margin: 2px 0 4px; }
.site-card p { margin: 0; color: rgba(255,255,255,.75); font-size: 9.5pt; }

.toc-list { padding-left: 0; list-style: none; counter-reset: ch; }
.toc-ch { font-weight: 700; font-size: 12pt; margin: 14px 0 4px; }
.toc-ch ol { font-weight: 400; font-size: 10pt; color: #4b4560; margin: 4px 0 0; }
.toc a { color: inherit; text-decoration: none; }
.chapter-cover { height: 297mm; overflow: hidden; padding: 20mm !important; page-break-before: always; display: flex; flex-direction: column; justify-content: center; background: linear-gradient(160deg, #fdf2fa 0%, #f5f3ff 100%); }
.ch-list { margin-top: 16px; color: #4b4560; }

.doc { page-break-before: always; }
.doc-head { border-bottom: 2px solid #f3e8f7; padding-bottom: 10px; margin-bottom: 14px; }
.doc-head h2 { font-family: Fraunces, Georgia, serif; font-size: 20pt; line-height: 1.2; margin: 4px 0; }
.by { font-size: 8.5pt; color: #7a7490; }
.md h1, .md h2, .md h3, .md h4 { font-family: Inter, sans-serif; color: #14101f; page-break-after: avoid; line-height: 1.3; }
.md h1 { font-size: 15pt; margin: 18px 0 8px; }
.md h2 { font-size: 13pt; margin: 18px 0 6px; padding-top: 6px; border-top: 1px solid #f0ecf6; }
.md h3 { font-size: 11.5pt; margin: 14px 0 4px; color: #6d28d9; }
.md h4 { font-size: 10.5pt; margin: 10px 0 4px; }
.md p { margin: 6px 0; }
.md ul, .md ol { padding-left: 18px; margin: 6px 0; }
.md li { margin: 2px 0; }
.md strong { color: #14101f; }
.md a { color: #c0006a; word-break: break-all; }
.md blockquote { margin: 10px 0; padding: 8px 12px; background: #faf7ff; border-left: 3px solid #a78bfa; border-radius: 0 8px 8px 0; color: #3a3450; }
.md table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 9pt; page-break-inside: auto; }
.md th { background: #f5f3ff; text-align: left; font-weight: 700; }
.md th, .md td { border: 1px solid #e6e0f0; padding: 5px 7px; vertical-align: top; }
.md tr { page-break-inside: avoid; }
.md code { background: #f4f1fa; padding: 1px 4px; border-radius: 4px; font-size: 9pt; }
.md pre { background: #f7f5fb; border: 1px solid #ebe6f3; border-radius: 8px; padding: 10px; white-space: pre-wrap; font-size: 8.5pt; page-break-inside: avoid; }
.md pre code { background: none; padding: 0; }
.md hr { border: 0; border-top: 1px solid #ebe6f3; margin: 14px 0; }
.md mark.fill { background: #fff4c2; color: #7a4b00; padding: 0 4px; border-radius: 4px; font-size: .92em; font-weight: 600; }
.end { min-height: 120mm; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; color: #6b6580; page-break-after: auto; }
`;
