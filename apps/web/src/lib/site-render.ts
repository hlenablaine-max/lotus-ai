// Monta o site da proposta a partir do conteúdo que o agente de web escreve (JSON).
// O agente escolhe direção de arte, par de fontes, cores, fotos e escreve o texto; o desenho
// (grid, tipografia, ritmo, contraste, celular) é garantido aqui, seguindo os princípios de
// design em lib/design-knowledge.ts: sem ícones genéricos, sem cartões iguais, sem rótulos em
// caixa alta, sem palavra colorida no título, uma única animação de entrada.

import { FONT_PAIRS } from "@/lib/design-knowledge";

export type SiteStyle = "aurora" | "clinico" | "editorial" | "impacto";
export const SITE_STYLES: SiteStyle[] = ["aurora", "clinico", "editorial", "impacto"];

export const STYLE_GUIDE: Record<SiteStyle, string> = {
  aurora: "AURORA — escuro e sofisticado: fundo profundo tingido com a cor da marca, foto grande que se funde ao fundo, tipografia grande. Para estética, harmonização, odontologia de alto padrão, dermatologia.",
  clinico: "CLÍNICO — claro, limpo e preciso: muito branco, foto ocupando metade do topo até a borda da tela, cor da marca em pontos certos. Para odontologia, clínicas médicas, fisioterapia, nutrição.",
  editorial: "EDITORIAL — cara de revista: título enorme, foto larga de ponta a ponta, texto em colunas, papel levemente tingido com a cor da marca. Para marca pessoal, consultoria, psicologia, beleza autoral.",
  impacto: "IMPACTO — blocos de cor: o topo e a chamada final inteiros na cor da marca, título gigante em fonte condensada. Para academias, estúdios, marcas jovens e negócios que querem chamar atenção.",
};

export interface SiteContent {
  estilo?: string;
  fontes?: string;
  cores?: { primaria?: string; destaque?: string; secundaria?: string };
  topo?: { selo?: string; titulo?: string; tituloDestaque?: string; subtitulo?: string; botao?: string; botaoSecundario?: string; foto?: string | null };
  numeros?: Array<{ valor?: string; rotulo?: string }>;
  faixa?: string[];
  servicos?: Array<{ titulo?: string; descricao?: string; icone?: string; foto?: string | null; mensagem?: string }>;
  passos?: Array<{ titulo?: string; descricao?: string }>;
  diferenciais?: Array<{ titulo?: string; descricao?: string; icone?: string }>;
  sobre?: { titulo?: string; texto?: string; foto?: string | null; nome?: string; cargo?: string };
  galeria?: string[];
  depoimentos?: Array<{ texto?: string; autor?: string }>;
  faq?: Array<{ pergunta?: string; resposta?: string }>;
  local?: { endereco?: string; horario?: string; mapa?: string };
  chamadaFinal?: { titulo?: string; texto?: string; botao?: string };
  rodape?: { cnpj?: string; responsavelTecnico?: string };
  secoes?: Partial<Record<"servicos" | "passos" | "diferenciais" | "sobre" | "galeria" | "depoimentos" | "faq" | "local", { kicker?: string; titulo?: string; texto?: string }>>;
}

export interface SiteAsset {
  file: string;
  width: number | null;
  height: number | null;
}

export interface RenderContext {
  businessName: string;
  handle: string;
  whatsapp: string | null;
  logo: SiteAsset | null;
  assets: SiteAsset[];
  isHealth: boolean;
}

// ------------------------------------------------------------------ utilidades
const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const has = (v: unknown) => typeof v === "string" && v.trim().length > 0;
const list = <T>(v: T[] | undefined, max: number) => (Array.isArray(v) ? v.filter(Boolean).slice(0, max) : []);
// Tira os vícios de texto gerado ("A · B", "→")
const clean = (v: unknown) =>
  String(v ?? "")
    .replace(/\s*[·•]\s*/g, ", ")
    .replace(/\s*[→➜➔]\s*/g, " ")
    .trim();

function hexToRgb(hex: string): [number, number, number] | null {
  const m = hex.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
const toHex = (rgb: number[]) => "#" + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
function luminance(hex: string): number {
  const rgb = hexToRgb(hex) ?? [128, 128, 128];
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const mix = (hex: string, target: string, amount: number) => {
  const a = hexToRgb(hex) ?? [128, 128, 128];
  const b = hexToRgb(target) ?? [255, 255, 255];
  return toHex(a.map((v, i) => v + (b[i] - v) * amount));
};
const contrast = (a: string, b: string) => {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};
// Ajusta a cor até ter contraste mínimo com o fundo (texto e botões sempre legíveis)
function readableOn(color: string, bg: string, min = 4.5): string {
  let c = color;
  const target = luminance(bg) > 0.4 ? "#000000" : "#ffffff";
  for (let i = 0; i < 14 && contrast(c, bg) < min; i++) c = mix(c, target, 0.12);
  return c;
}
const onColor = (hex: string) => (contrast("#ffffff", hex) >= contrast("#111111", hex) ? "#ffffff" : "#111111");

const WA_ICON =
  '<svg viewBox="0 0 24 24" class="glyph" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1-.2-.1-1-.4-2-1.2-.7-.6-1.2-1.4-1.3-1.6-.1-.2 0-.4.1-.5l.4-.4.3-.4v-.4l-.8-1.9c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3c-.2.3-.9.9-.9 2.2s1 2.6 1.1 2.7c.1.2 1.9 2.9 4.6 4 .6.3 1.1.4 1.5.5.6.2 1.2.2 1.6.1.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2l-.4-.3z"/></svg>';
const IG_ICON =
  '<svg viewBox="0 0 24 24" class="glyph" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".8" fill="currentColor"/></svg>';

// ------------------------------------------------------------------ fotos
const isStock = (a: SiteAsset | null | undefined) => !!a && /^assets\/banco-/.test(a.file);
const isLarge = (a: SiteAsset | null | undefined) => !!a && (a.width ?? 0) >= 900 && (a.height ?? 0) >= 700;
const isMedium = (a: SiteAsset | null | undefined) => !!a && (a.width ?? 0) >= 480 && (a.height ?? 0) >= 480;
// Foto real vertical (story/post do Instagram) com resolução boa para a coluna do topo
const isTallReal = (a: SiteAsset | null | undefined) => !!a && !isStock(a) && (a.width ?? 0) >= 600 && (a.height ?? 0) >= 900 && (a.height ?? 0) > (a.width ?? 0);
const isGallery = (a: SiteAsset | null | undefined) => !!a && (a.width ?? 0) >= 500 && (a.height ?? 0) >= 340;

// ------------------------------------------------------------------ render
export function renderSite(content: SiteContent, ctx: RenderContext): { html: string; style: SiteStyle; warnings: string[] } {
  const warnings: string[] = [];
  const style: SiteStyle = SITE_STYLES.includes(content.estilo as SiteStyle) ? (content.estilo as SiteStyle) : ctx.isHealth ? "clinico" : "editorial";
  const fontKey = content.fontes && FONT_PAIRS[content.fontes] ? content.fontes : style === "impacto" ? "esporte" : style === "editorial" ? "editorial" : style === "aurora" ? "porcelana" : "precisao";
  const font = FONT_PAIRS[fontKey];

  const byFile = new Map(ctx.assets.map((a) => [a.file, a]));
  const pick = (file: string | null | undefined, test: (a: SiteAsset) => boolean, what: string, allowStock: boolean) => {
    if (!file) return null;
    const a = byFile.get(file);
    if (!a) {
      warnings.push(`${what}: o arquivo ${file} não existe; foi ignorado.`);
      return null;
    }
    if (isStock(a) && !allowStock) {
      warnings.push(`${what}: ${file} é foto de banco de imagens e não pode representar a equipe ou o lugar; foi retirada.`);
      return null;
    }
    if (!test(a)) {
      warnings.push(`${what}: ${file} é pequena demais (${a.width}x${a.height}) e ficaria pixelada; foi retirada.`);
      return null;
    }
    return a;
  };

  // ---------------- cores
  const brand0 = hexToRgb(content.cores?.primaria ?? "") ? toHex(hexToRgb(content.cores!.primaria!)!) : "#1f4fd1";
  const accent0 = hexToRgb(content.cores?.destaque ?? "") ? toHex(hexToRgb(content.cores!.destaque!)!) : brand0;
  let bg: string, bgAlt: string, fg: string;
  if (style === "aurora") {
    bg = mix(brand0, "#000000", 0.86);
    bgAlt = mix(brand0, "#000000", 0.8);
    fg = "#f4f5f7";
  } else if (style === "editorial") {
    bg = mix(brand0, "#ffffff", 0.955);
    bgAlt = mix(brand0, "#ffffff", 0.91);
    fg = mix(brand0, "#000000", 0.86);
  } else {
    bg = "#ffffff";
    bgAlt = mix(brand0, "#ffffff", 0.94);
    fg = mix(brand0, "#000000", 0.88);
  }
  const brandInk = readableOn(brand0, bg, 4.5);
  // No escuro, o botão é a cor da marca levemente clareada (ainda reconhecível, visível no fundo)
  const btn = style === "aurora" ? (contrast(accent0, bg) >= 2.2 ? accent0 : mix(accent0, "#ffffff", 0.22)) : brand0;
  const onBtn = onColor(btn);
  const block = brand0;
  const onBlock = onColor(block);
  const fgSoft = mix(fg, bg, 0.36);
  const line = mix(fg, bg, 0.86);

  // ---------------- contato
  const waBase = ctx.whatsapp ? `https://wa.me/${ctx.whatsapp.replace(/\D/g, "")}` : null;
  const contact = (msg?: string) => (waBase ? `${waBase}?text=${encodeURIComponent(msg || `Olá! Vim pelo site da ${ctx.businessName} e quero agendar.`)}` : `https://ig.me/m/${ctx.handle}`);
  const glyph = waBase ? WA_ICON : IG_ICON;

  // ---------------- conteúdo
  const topo = content.topo ?? {};
  // Topo: nos estilos com foto ao lado do título (clínico, impacto) cabe a foto REAL vertical do Instagram
  // (pessoa, equipe, paciente); nos de foto em tela cheia (aurora, editorial) só foto grande horizontal.
  const sideHero = style === "clinico" || style === "impacto";
  const heroOk = (a: SiteAsset) => isLarge(a) || (sideHero && isTallReal(a));
  const heroPhoto = pick(topo.foto, heroOk, "Foto do topo", true);
  const sobre = content.sobre ?? {};
  const aboutPhoto = pick(sobre.foto, isMedium, "Foto do 'sobre'", false);
  const services = list(content.servicos, 8).filter((s) => has(s.titulo));
  const servicePhotos = services.map((s, i) => pick(s.foto, isMedium, `Foto do serviço ${i + 1}`, true));
  // Fotos profissionais (IA ou banco) que sobraram completam os serviços: com foto, vira mosaico
  const spare = ctx.assets.filter((a) => isStock(a) && isMedium(a) && a.file !== heroPhoto?.file && !servicePhotos.some((p) => p?.file === a.file));
  if (services.length >= 2 && servicePhotos.filter(Boolean).length < Math.min(3, services.length) && servicePhotos.filter(Boolean).length + spare.length >= Math.min(3, services.length)) {
    servicePhotos.forEach((p, i) => {
      if (!p && spare.length) servicePhotos[i] = spare.shift()!;
    });
  }
  const usePhotoServices = services.length >= 2 && servicePhotos.filter(Boolean).length >= Math.min(3, services.length);
  const used = new Set([heroPhoto?.file, aboutPhoto?.file, ...servicePhotos.map((p) => p?.file)].filter(Boolean));
  const gallery = list(content.galeria, 8)
    .map((f) => pick(f, isGallery, "Galeria", false))
    .filter((a): a is SiteAsset => !!a && !used.has(a.file));
  const numbers = list(content.numeros, 4).filter((n) => has(n.valor) && has(n.rotulo));
  const steps = list(content.passos, 5).filter((s) => has(s.titulo));
  const diffs = list(content.diferenciais, 6).filter((s) => has(s.titulo));
  const testimonials = list(content.depoimentos, 3).filter((t) => has(t.texto));
  const faq = list(content.faq, 8).filter((f) => has(f.pergunta) && has(f.resposta));
  const local = content.local ?? {};
  const cta = content.chamadaFinal ?? {};
  const rodape = content.rodape ?? {};
  const sec = (key: keyof NonNullable<SiteContent["secoes"]>, titulo: string, texto = "") => {
    const s = content.secoes?.[key] ?? {};
    return { titulo: clean(s.titulo || titulo), texto: clean(s.texto ?? texto) };
  };
  const head = (h: { titulo: string; texto: string }, cls = "") =>
    `<header class="sec-head ${cls}"><h2>${esc(h.titulo)}</h2>${has(h.texto) ? `<p>${esc(h.texto)}</p>` : ""}</header>`;
  const lines = (text: unknown) =>
    String(text ?? "")
      .split(/\n+/)
      .filter(has)
      .map((p) => `<p>${esc(clean(p))}</p>`)
      .join("");

  const title = esc(clean(topo.titulo || ctx.businessName));
  const tLen = (topo.titulo || ctx.businessName).length;
  const tSize = tLen <= 26 ? "t-s" : tLen <= 48 ? "t-m" : "t-l";

  // ---------------- marca no topo
  const logoIsAvatar = !!ctx.logo && /logo-instagram/.test(ctx.logo.file);
  const wideLogo = !!ctx.logo && !logoIsAvatar && (ctx.logo.width ?? 0) >= 200 && (ctx.logo.width ?? 0) / Math.max(1, ctx.logo.height ?? 1) >= 1.8;
  const mark = wideLogo
    ? `<img src="${esc(ctx.logo!.file)}" alt="${esc(ctx.businessName)}" class="logo wide">`
    : `${ctx.logo ? `<img src="${esc(ctx.logo.file)}" alt="" class="logo${logoIsAvatar ? " round" : ""}">` : ""}<span class="wordmark">${esc(ctx.businessName)}</span>`;

  // ---------------- topo
  const btnMain = `<a class="btn btn-main" href="${esc(contact())}" target="_blank" rel="noopener">${glyph}<span>${esc(clean(topo.botao || (waBase ? "Agendar pelo WhatsApp" : "Falar no Instagram")))}</span></a>`;
  const btnSecond = services.length ? `<a class="btn btn-quiet" href="#servicos">${esc(clean(topo.botaoSecundario || (ctx.isHealth ? "Ver tratamentos" : "Ver serviços")))}</a>` : "";
  const facts = numbers.length ? `<dl class="facts">${numbers.map((n) => `<div><dt>${esc(clean(n.valor))}</dt><dd>${esc(clean(n.rotulo))}</dd></div>`).join("")}</dl>` : "";
  const selo = has(topo.selo) ? `<p class="selo in i1">${esc(clean(topo.selo))}</p>` : "";
  const sub = has(topo.subtitulo) ? `<p class="lead in i3">${esc(clean(topo.subtitulo))}</p>` : "";
  const heroCopy = `${selo}<h1 class="in i2 ${tSize}">${title}</h1>${sub}<div class="hero-btns in i4">${btnMain}${btnSecond}</div>`;
  const photoImg = (a: SiteAsset, cls = "") => `<img src="${esc(a.file)}" alt="" class="${cls}" fetchpriority="high">`;

  let hero: string;
  if (style === "aurora") {
    hero = heroPhoto
      ? `<section class="hero has-photo"><div class="hero-photo">${photoImg(heroPhoto, "kb")}</div><div class="wrap hero-in"><div class="hero-copy">${heroCopy}${facts ? `<div class="in i5">${facts}</div>` : ""}</div></div></section>`
      : `<section class="hero no-photo"><div class="glow"></div><div class="wrap hero-in center"><div class="hero-copy">${heroCopy}${facts ? `<div class="in i5">${facts}</div>` : ""}</div></div></section>`;
  } else if (style === "clinico") {
    const panel = heroPhoto
      ? `<div class="hero-side photo in i3">${photoImg(heroPhoto, "kb")}${numbers[0] ? `<div class="chip"><b>${esc(clean(numbers[0].valor))}</b><span>${esc(clean(numbers[0].rotulo))}</span></div>` : ""}</div>`
      : `<div class="hero-side panel in i3"><ul>${services.slice(0, 4).map((s) => `<li>${esc(clean(s.titulo))}</li>`).join("")}</ul></div>`;
    // Com foto, o primeiro número vai na etiqueta sobre a foto; os demais ficam abaixo (sem repetir)
    const restFacts = numbers.length > 1 ? `<dl class="facts">${numbers.slice(1).map((n) => `<div><dt>${esc(clean(n.valor))}</dt><dd>${esc(clean(n.rotulo))}</dd></div>`).join("")}</dl>` : "";
    hero = `<section class="hero"><div class="wrap hero-grid"><div class="hero-copy">${heroCopy}${heroPhoto ? (restFacts ? `<div class="in i5">${restFacts}</div>` : "") : facts ? `<div class="in i5">${facts}</div>` : ""}</div>${panel}</div></section>`;
  } else if (style === "editorial") {
    hero = `<section class="hero"><div class="wrap">${selo}<h1 class="in i2 ${tSize}">${title}</h1><div class="ed-row in i3"><div>${has(topo.subtitulo) ? `<p class="lead">${esc(clean(topo.subtitulo))}</p>` : ""}<div class="hero-btns">${btnMain}${btnSecond}</div></div>${facts}</div></div>${
      heroPhoto ? `<figure class="wide-photo in i4">${photoImg(heroPhoto, "kb")}</figure>` : ""
    }</section>`;
  } else {
    hero = `<section class="hero block"><div class="wrap hero-grid${heroPhoto ? "" : " solo"}"><div class="hero-copy">${heroCopy}</div>${heroPhoto ? `<figure class="cut in i3">${photoImg(heroPhoto, "kb")}</figure>` : ""}</div>${facts ? `<div class="wrap in i5">${facts}</div>` : ""}</section>`;
  }

  // ---------------- serviços
  const serviceLink = (s: (typeof services)[number]) =>
    `<a class="text-link" href="${esc(contact(s.mensagem || `Olá! Quero saber mais sobre ${s.titulo}.`))}" target="_blank" rel="noopener">${waBase ? `Agendar ${esc(clean(s.titulo)).toLowerCase()}` : "Perguntar no direct"}</a>`;
  const servicesHead = head(sec("servicos", ctx.isHealth ? "Tratamentos" : "Serviços"));
  const servicesHtml = !services.length
    ? ""
    : usePhotoServices
      ? `<section id="servicos" class="sec"><div class="wrap">${servicesHead}<div class="svc-photos">${services
          .map((s, i) => {
            const ph = servicePhotos[i];
            return `<article class="svc-photo${i === 0 ? " lead-card" : ""}">${ph ? `<figure>${photoImg(ph)}</figure>` : `<div class="svc-fill"></div>`}<h3>${esc(clean(s.titulo))}</h3><p>${esc(clean(s.descricao))}</p>${serviceLink(s)}</article>`;
          })
          .join("")}</div></div></section>`
      : `<section id="servicos" class="sec"><div class="wrap">${servicesHead}<div class="svc-list">${services
          .map((s) => `<article class="svc-row"><h3>${esc(clean(s.titulo))}</h3><div><p>${esc(clean(s.descricao))}</p>${serviceLink(s)}</div></article>`)
          .join("")}</div></div></section>`;

  // ---------------- passos (sequência real: aqui o número faz sentido)
  const stepsHtml = steps.length
    ? `<section id="como" class="sec alt"><div class="wrap">${head(sec("passos", "Como funciona"))}<ol class="steps">${steps
        .map((s, i) => `<li><span class="step-n">${i + 1}</span><h3>${esc(clean(s.titulo))}</h3><p>${esc(clean(s.descricao))}</p></li>`)
        .join("")}</ol></div></section>`
    : "";

  const diffsHtml = diffs.length
    ? `<section class="sec"><div class="wrap split">${head(sec("diferenciais", `Por que a ${ctx.businessName}`))}<div class="points">${diffs
        .map((d) => `<div class="point"><h3>${esc(clean(d.titulo))}</h3><p>${esc(clean(d.descricao))}</p></div>`)
        .join("")}</div></div></section>`
    : "";

  const aboutHtml =
    has(sobre.texto) || has(sobre.titulo)
      ? `<section id="sobre" class="sec alt"><div class="wrap about${aboutPhoto ? "" : " no-photo"}">${
          aboutPhoto ? `<figure class="about-photo"><img src="${esc(aboutPhoto.file)}" alt="${esc(sobre.nome || ctx.businessName)}" loading="lazy"></figure>` : ""
        }<div class="about-text">${head(sec("sobre", sobre.titulo || `Conheça a ${ctx.businessName}`))}${lines(sobre.texto)}${
          has(sobre.nome) ? `<p class="sign"><b>${esc(clean(sobre.nome))}</b>${has(sobre.cargo) ? `<span>${esc(clean(sobre.cargo))}</span>` : ""}</p>` : ""
        }</div></div></section>`
      : "";

  const galleryHtml =
    gallery.length >= 3
      ? `<section class="sec"><div class="wrap">${head(sec("galeria", "Por dentro"))}<div class="gallery">${gallery
          .slice(0, 5)
          .map((a, i) => `<figure class="g g${i + 1}"><img src="${esc(a.file)}" alt="" loading="lazy"></figure>`)
          .join("")}</div></div></section>`
      : "";

  const [firstQuote, ...otherQuotes] = testimonials;
  const testimonialsHtml = firstQuote
    ? `<section class="sec alt"><div class="wrap">${head(sec("depoimentos", "Quem já foi atendido"))}<blockquote class="quote-main"><p>${esc(clean(firstQuote.texto))}</p>${
        has(firstQuote.autor) ? `<cite>${esc(clean(firstQuote.autor))}</cite>` : ""
      }</blockquote>${
        otherQuotes.length
          ? `<div class="quotes">${otherQuotes.map((t) => `<blockquote><p>${esc(clean(t.texto))}</p>${has(t.autor) ? `<cite>${esc(clean(t.autor))}</cite>` : ""}</blockquote>`).join("")}</div>`
          : ""
      }</div></section>`
    : "";

  const faqHtml = faq.length
    ? `<section id="duvidas" class="sec"><div class="wrap split">${head(sec("faq", "Dúvidas frequentes"))}<div class="faq">${faq
        .map((f) => `<details><summary>${esc(clean(f.pergunta))}<span class="plus" aria-hidden="true"></span></summary><p>${esc(clean(f.resposta))}</p></details>`)
        .join("")}</div></div></section>`
    : "";

  const mapQuery = local.mapa || local.endereco;
  const localHtml =
    has(local.endereco) || has(local.horario) || has(mapQuery)
      ? `<section id="local" class="sec alt"><div class="wrap local"><div class="local-info">${head(sec("local", "Onde estamos"))}<dl class="info">${
          has(local.endereco) ? `<div><dt>Endereço</dt><dd>${esc(clean(local.endereco))}</dd></div>` : ""
        }${has(local.horario) ? `<div><dt>Horário</dt><dd>${esc(clean(local.horario))}</dd></div>` : ""}<div><dt>${waBase ? "WhatsApp" : "Instagram"}</dt><dd><a class="text-link" href="${esc(
          contact()
        )}" target="_blank" rel="noopener">${waBase ? "Chamar agora" : "@" + esc(ctx.handle)}</a></dd></div></dl></div>${
          has(mapQuery) ? `<div class="map"><iframe title="Mapa" loading="lazy" src="https://www.google.com/maps?q=${encodeURIComponent(String(mapQuery))}&output=embed"></iframe></div>` : ""
        }</div></section>`
      : "";

  const ctaHtml = `<section class="final"><div class="wrap final-in"><h2>${esc(clean(cta.titulo || "Vamos marcar sua avaliação?"))}</h2>${has(cta.texto) ? `<p>${esc(clean(cta.texto))}</p>` : ""}<a class="btn btn-final" href="${esc(
    contact()
  )}" target="_blank" rel="noopener">${glyph}<span>${esc(clean(cta.botao || topo.botao || "Agendar agora"))}</span></a></div></section>`;

  const footer = `<footer><div class="wrap foot"><a class="brand" href="#">${mark}</a><div class="foot-info">${has(local.endereco) ? `<span>${esc(clean(local.endereco))}</span>` : ""}${
    has(rodape.cnpj) ? `<span>CNPJ ${esc(rodape.cnpj)}</span>` : ""
  }${has(rodape.responsavelTecnico) ? `<span>Responsável técnico: ${esc(clean(rodape.responsavelTecnico))}</span>` : ""}<a href="https://instagram.com/${esc(ctx.handle)}" target="_blank" rel="noopener">@${esc(
    ctx.handle
  )}</a></div><small>Prévia de proposta criada pela LOTUS</small></div></footer>`;

  const navLinks = [
    services.length ? `<a href="#servicos">${ctx.isHealth ? "Tratamentos" : "Serviços"}</a>` : "",
    steps.length ? '<a href="#como">Como funciona</a>' : "",
    aboutHtml ? '<a href="#sobre">Sobre</a>' : "",
    faq.length ? '<a href="#duvidas">Dúvidas</a>' : "",
    localHtml ? '<a href="#local">Onde estamos</a>' : "",
  ].join("");
  const nav = `<header class="nav" id="nav"><div class="wrap nav-in"><a class="brand" href="#">${mark}</a><nav class="links">${navLinks}</nav><a class="btn btn-main btn-sm" href="${esc(
    contact()
  )}" target="_blank" rel="noopener">${glyph}<span>${waBase ? "Agendar" : "Fale conosco"}</span></a></div></header>`;
  const floatBtn = `<a class="float-cta" href="${esc(contact())}" target="_blank" rel="noopener" aria-label="${waBase ? "WhatsApp" : "Instagram"}">${glyph}</a>`;

  const vars = `:root{--bg:${bg};--bg-alt:${bgAlt};--fg:${fg};--fg-soft:${fgSoft};--line:${line};--brand:${brand0};--brand-ink:${brandInk};--btn:${btn};--on-btn:${onBtn};--block:${block};--on-block:${onBlock};--f-title:"${font.titulo}",${font.serif ? "Georgia,serif" : "system-ui,sans-serif"};--f-body:"${font.texto}",system-ui,sans-serif;--t-weight:${font.pesoTitulo};--t-track:${font.espaco}}`;

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(ctx.businessName)}</title>
<meta name="description" content="${esc(clean(topo.subtitulo || ctx.businessName))}">
<meta name="theme-color" content="${bg}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?${font.url}&display=swap" rel="stylesheet">
<style>${vars}${BASE_CSS}${STYLE_CSS[style]}</style>
</head>
<body class="st-${style}">
${nav}
<main>
${hero}
${servicesHtml}
${stepsHtml}
${diffsHtml}
${aboutHtml}
${galleryHtml}
${testimonialsHtml}
${faqHtml}
${localHtml}
${ctaHtml}
</main>
${footer}
${floatBtn}
<script>${SCRIPT}</script>
</body>
</html>`;
  return { html, style, warnings };
}

// ------------------------------------------------------------------ estilos
const BASE_CSS = `
*{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
body{font-family:var(--f-body);background:var(--bg);color:var(--fg);line-height:1.6;font-size:17.5px;-webkit-font-smoothing:antialiased;overflow-x:hidden}
img{display:block;max-width:100%}
a{color:inherit;text-decoration:none}
.wrap{width:min(1180px,100% - 56px);margin:0 auto}
h1,h2,h3{font-family:var(--f-title);font-weight:var(--t-weight);letter-spacing:var(--t-track);line-height:1.04;text-wrap:balance;hyphens:none;overflow-wrap:normal;word-break:normal}
p{text-wrap:pretty;max-width:68ch}
.glyph{width:20px;height:20px;flex:none}
.btn{display:inline-flex;align-items:center;gap:10px;padding:16px 26px;border-radius:999px;font-weight:600;font-size:16px;line-height:1;transition:background .2s,color .2s,transform .2s;white-space:nowrap}
.btn-main{background:var(--btn);color:var(--on-btn)}
.btn-main:hover{transform:translateY(-1px)}
.btn-quiet{color:var(--fg);box-shadow:inset 0 0 0 1.5px var(--line)}
.btn-quiet:hover{box-shadow:inset 0 0 0 1.5px var(--fg)}
.btn-sm{padding:11px 18px;font-size:14.5px}.btn-sm .glyph{width:17px;height:17px}
.text-link{display:inline-block;margin-top:14px;font-weight:600;color:var(--brand-ink);border-bottom:1.5px solid currentColor;padding-bottom:2px}
.nav{position:fixed;inset:0 0 auto;z-index:50;transition:background .3s,box-shadow .3s}
.nav.scrolled{background:color-mix(in srgb,var(--bg) 88%,transparent);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);box-shadow:0 1px 0 var(--line)}
.nav-in{display:flex;align-items:center;gap:30px;height:78px}
.brand{display:flex;align-items:center;gap:12px;margin-right:auto;color:var(--fg)}
.wordmark{font-family:var(--f-title);font-weight:var(--t-weight);letter-spacing:var(--t-track);font-size:21px;line-height:1}
.logo{height:40px;width:auto;object-fit:contain}
.logo.round{width:40px;height:40px;border-radius:50%;object-fit:cover}
.logo.wide{height:42px;max-width:190px}
.links{display:flex;gap:28px;font-size:15px}
.links a{color:var(--fg-soft);transition:color .2s}.links a:hover{color:var(--fg)}
.hero{position:relative;overflow:hidden}
.selo{font-size:15px;color:var(--fg-soft);margin-bottom:22px}
.hero h1{font-size:clamp(44px,6.4vw,92px)}
.hero h1.t-m{font-size:clamp(40px,5.2vw,74px)}.hero h1.t-l{font-size:clamp(36px,4.3vw,60px)}
.lead{font-size:clamp(18px,1.6vw,21px);color:var(--fg-soft);margin-top:26px;max-width:540px}
.hero-btns{display:flex;flex-wrap:wrap;gap:12px;margin-top:38px}
.facts{display:flex;flex-wrap:wrap;gap:20px 48px;margin-top:56px}
.facts dt{font-family:var(--f-title);font-weight:var(--t-weight);font-size:clamp(28px,3vw,40px);letter-spacing:var(--t-track);line-height:1}
.facts dd{font-size:14.5px;color:var(--fg-soft);margin-top:6px}
.sec{padding:clamp(80px,10vw,140px) 0}.sec.alt{background:var(--bg-alt)}
.sec-head{max-width:760px;margin-bottom:clamp(40px,5vw,64px)}
.sec-head h2{font-size:clamp(34px,4.2vw,60px)}
.sec-head p{margin-top:18px;color:var(--fg-soft);font-size:19px}
.svc-list{border-top:1px solid var(--line)}
.svc-row{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);gap:40px;padding:38px 0;border-bottom:1px solid var(--line)}
.svc-row h3{font-size:clamp(26px,2.8vw,38px)}
.svc-row p{color:var(--fg-soft);font-size:17.5px}
.svc-photos{display:grid;grid-template-columns:repeat(3,1fr);gap:clamp(20px,2.4vw,34px)}
.svc-photo figure{aspect-ratio:4/5;overflow:hidden;border-radius:18px;margin-bottom:22px;background:var(--bg-alt)}
.svc-photo img{width:100%;height:100%;object-fit:cover;transition:transform 1.2s cubic-bezier(.2,.7,.2,1)}
.svc-photo:hover img{transform:scale(1.04)}
.svc-photo.lead-card{grid-row:span 2}.svc-photo.lead-card figure{aspect-ratio:3/4}
.svc-fill{aspect-ratio:4/5;border-radius:18px;margin-bottom:22px;background:linear-gradient(160deg,var(--brand),color-mix(in srgb,var(--brand) 40%,var(--bg)))}
.svc-photo h3{font-size:clamp(24px,2.2vw,30px)}
.svc-photo p{color:var(--fg-soft);margin-top:8px;font-size:16.5px}
.steps{list-style:none;display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:40px;position:relative}
.step-n{display:block;font-family:var(--f-title);font-weight:var(--t-weight);font-size:56px;line-height:1;color:var(--brand-ink);margin-bottom:18px}
.steps h3{font-size:24px;margin-bottom:10px}
.steps p{color:var(--fg-soft);font-size:16.5px}
.split{display:grid;grid-template-columns:minmax(0,.85fr) minmax(0,1.15fr);gap:clamp(40px,6vw,96px);align-items:start}
.split .sec-head{position:sticky;top:110px;margin-bottom:0}
.points{display:grid;gap:40px}
.point h3{font-size:clamp(22px,2vw,28px);margin-bottom:8px}
.point p{color:var(--fg-soft)}
.about{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);gap:clamp(40px,6vw,90px);align-items:center}
.about.no-photo{grid-template-columns:1fr;max-width:780px}
.about-photo{aspect-ratio:4/5;overflow:hidden;border-radius:22px}
.about-photo img{width:100%;height:100%;object-fit:cover}
.about-text p{color:var(--fg-soft);margin-bottom:16px;font-size:18.5px}
.about-text .sec-head{margin-bottom:28px}
.sign{margin-top:28px;display:flex;flex-direction:column}
.sign b{font-family:var(--f-title);font-weight:var(--t-weight);font-size:24px;color:var(--fg)}.sign span{font-size:15px}
.gallery{display:grid;grid-template-columns:repeat(4,1fr);grid-auto-rows:240px;gap:14px}
.gallery .g{overflow:hidden;border-radius:14px}.gallery img{width:100%;height:100%;object-fit:cover}
.gallery .g1{grid-column:span 2;grid-row:span 2}
.quote-main{max-width:980px}
.quote-main p{font-family:var(--f-title);font-weight:var(--t-weight);letter-spacing:var(--t-track);font-size:clamp(28px,3.4vw,46px);line-height:1.18;max-width:none}
.quote-main cite{display:block;margin-top:22px}
cite{font-style:normal;font-weight:600;color:var(--fg-soft);font-size:15px}
.quotes{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:40px;margin-top:64px;padding-top:40px;border-top:1px solid var(--line)}
.quotes p{font-size:18px;margin-bottom:12px}
.faq details{border-bottom:1px solid var(--line);padding:24px 0}
.faq details:first-child{border-top:1px solid var(--line)}
.faq summary{list-style:none;cursor:pointer;display:flex;justify-content:space-between;gap:20px;font-weight:600;font-size:19px}
.faq summary::-webkit-details-marker{display:none}
.plus{position:relative;width:18px;height:18px;flex:none;margin-top:5px}
.plus::before,.plus::after{content:"";position:absolute;left:0;top:50%;width:18px;height:1.8px;background:currentColor;transition:transform .3s}
.plus::after{transform:rotate(90deg)}
details[open] .plus::after{transform:rotate(0)}
.faq details p{margin-top:12px;color:var(--fg-soft)}
.local{display:grid;grid-template-columns:minmax(0,.85fr) minmax(0,1.15fr);gap:clamp(40px,5vw,80px);align-items:stretch}
.info div{padding:20px 0;border-top:1px solid var(--line)}
.info dt{font-size:14px;color:var(--fg-soft)}.info dd{font-size:18px;margin-top:4px}
.info .text-link{margin-top:0}
.map{border-radius:20px;overflow:hidden;min-height:400px}
.map iframe{width:100%;height:100%;min-height:400px;border:0}
.final{background:var(--block);color:var(--on-block);padding:clamp(90px,11vw,150px) 0}
.final-in{text-align:center;display:flex;flex-direction:column;align-items:center}
.final h2{font-size:clamp(38px,5.4vw,78px);max-width:16ch}
.final p{margin-top:20px;opacity:.85;font-size:19px}
.btn-final{margin-top:40px;background:var(--on-block);color:var(--block)}
footer{padding:56px 0 40px}
.foot{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:20px}
.foot-info{display:flex;flex-wrap:wrap;gap:8px 24px;font-size:14.5px;color:var(--fg-soft)}
.foot small{width:100%;font-size:12.5px;color:var(--fg-soft);opacity:.7;margin-top:12px}
.float-cta{position:fixed;right:20px;bottom:20px;z-index:60;width:58px;height:58px;border-radius:50%;display:none;place-items:center;background:var(--btn);color:var(--on-btn);box-shadow:0 12px 30px -10px rgba(0,0,0,.45)}
.float-cta .glyph{width:27px;height:27px}
.in{opacity:0;transform:translateY(18px);animation:rise .9s cubic-bezier(.2,.7,.2,1) forwards}
.i1{animation-delay:.05s}.i2{animation-delay:.15s}.i3{animation-delay:.3s}.i4{animation-delay:.45s}.i5{animation-delay:.6s}
@keyframes rise{to{opacity:1;transform:none}}
.kb{animation:kb 2.4s cubic-bezier(.2,.7,.2,1) both}
@keyframes kb{from{transform:scale(1.08)}to{transform:scale(1)}}
a:focus-visible,summary:focus-visible{outline:2px solid var(--brand-ink);outline-offset:3px}
@media (max-width:960px){
.links{display:none}
.svc-row,.split,.about,.local{grid-template-columns:1fr;gap:20px}
.split .sec-head{position:static;margin-bottom:24px}
.svc-photos{grid-template-columns:1fr 1fr}.svc-photo.lead-card{grid-row:auto;grid-column:span 2}.svc-photo.lead-card figure{aspect-ratio:16/10}
.gallery{grid-template-columns:1fr 1fr;grid-auto-rows:180px}
.float-cta{display:grid}
}
@media (max-width:560px){
body{font-size:16.5px}
.wrap{width:calc(100% - 40px)}
.nav-in{height:66px}.wordmark{font-size:18px}.nav .btn-sm span{display:none}.nav .btn-sm{padding:11px}
.hero h1,.hero h1.t-m,.hero h1.t-l{font-size:clamp(34px,9.6vw,46px)}
.hero-btns .btn{width:100%;justify-content:center}
.svc-photos{grid-template-columns:1fr}.svc-photo.lead-card{grid-column:auto}
.facts{gap:18px 32px}
}
.progress{position:fixed;left:0;top:0;height:3px;width:100%;z-index:70;background:var(--btn);transform:scaleX(0);transform-origin:0 50%;pointer-events:none}
.btn{position:relative;overflow:hidden;transition:translate .35s cubic-bezier(.2,.7,.2,1),background .2s,color .2s,box-shadow .3s}
.btn::after{content:"";position:absolute;top:0;bottom:0;left:-60%;width:40%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.35),transparent);transform:skewX(-20deg);pointer-events:none;opacity:0}
.btn:hover::after{animation:shine .9s ease}
.motion .hero .btn-main::after{animation:shine 1.1s ease 1.6s,shine 1.1s ease 6s}
@keyframes shine{0%{left:-60%;opacity:1}100%{left:130%;opacity:1}}
.btn-main:hover{box-shadow:0 14px 34px -14px var(--btn)}
.motion h1.split{display:block}
.motion h1.split .w{display:inline-block;overflow:hidden;vertical-align:top;padding-bottom:.08em;margin-bottom:-.08em}
.motion h1.split .w>span{display:inline-block;transform:translateY(105%);transition:transform 1s cubic-bezier(.16,1,.3,1)}
.motion h1.split.on .w>span{transform:none}
.motion .rv{opacity:0;transform:translateY(28px);transition:opacity .9s cubic-bezier(.2,.7,.2,1),transform .9s cubic-bezier(.2,.7,.2,1)}
.motion .rv.on{opacity:1;transform:none}
.motion .wipe{clip-path:inset(18% 0 18% 0 round 18px);transition:clip-path 1.3s cubic-bezier(.16,1,.3,1)}
.motion .wipe img{scale:1.18;transition:scale 1.6s cubic-bezier(.16,1,.3,1)}
.motion .wipe.on{clip-path:inset(0 0 0 0 round 0)}
.motion .wipe.on img{scale:1}
.motion .hero-photo img,.motion .hero-side img,.motion .cut img{scale:1.08}
.svc-photo:hover img{transform:scale(1.05)}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}.in{opacity:1;transform:none}.progress{display:none}}
`;

const STYLE_CSS: Record<SiteStyle, string> = {
  aurora: `
.hero{min-height:min(100vh,940px);display:flex;align-items:center;padding:130px 0 90px}
.hero-in{position:relative;z-index:2}
.hero-copy{max-width:600px}
.hero.no-photo .hero-in.center .hero-copy{max-width:900px;margin:0 auto;text-align:center}
.hero.no-photo .lead{margin-inline:auto}.hero.no-photo .hero-btns,.hero.no-photo .facts{justify-content:center}
.hero-photo{position:absolute;inset:0 0 0 38%;z-index:1}
.hero-photo img{width:100%;height:100%;object-fit:cover}
.hero-photo::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,color-mix(in srgb,var(--bg) 85%,transparent) 0%,transparent 16%),linear-gradient(90deg,var(--bg) 0%,color-mix(in srgb,var(--bg) 70%,transparent) 22%,transparent 58%),linear-gradient(0deg,var(--bg) 0%,transparent 30%)}
.glow{position:absolute;width:900px;height:900px;left:50%;top:40%;transform:translate(-50%,-50%);background:radial-gradient(circle,color-mix(in srgb,var(--brand) 55%,transparent) 0%,transparent 62%);opacity:.55;filter:blur(20px)}
.btn-quiet{box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.28)}
.svc-photo figure,.about-photo,.gallery .g,.map{border-radius:6px}
.map iframe{filter:invert(.9) hue-rotate(180deg) saturate(.5)}
@media (max-width:960px){.hero-photo{inset:0 0 auto 0;height:62vh}.hero-photo::after{background:linear-gradient(0deg,var(--bg) 4%,color-mix(in srgb,var(--bg) 55%,transparent) 45%,color-mix(in srgb,var(--bg) 25%,transparent) 100%)}.hero{align-items:flex-end;padding-top:46vh}}
`,
  clinico: `
.hero{padding:118px 0 0}
.hero-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:clamp(40px,5vw,72px);align-items:center;min-height:min(86vh,800px)}
.hero-side.photo{position:relative;align-self:stretch;margin-right:calc((100vw - min(1180px,100vw - 56px)) / -2);border-radius:0 0 0 56px;overflow:hidden;min-height:520px}
.hero-side.photo img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.chip{position:absolute;left:28px;bottom:28px;background:#fff;color:#111;padding:16px 20px;border-radius:16px;box-shadow:0 20px 40px -20px rgba(0,0,0,.35);display:flex;align-items:baseline;gap:10px}
.chip b{font-family:var(--f-title);font-weight:var(--t-weight);font-size:30px;line-height:1}.chip span{font-size:14px;color:#555}
.hero-side.panel{background:var(--block);color:var(--on-block);border-radius:36px;padding:clamp(36px,4vw,56px)}
.hero-side.panel ul{list-style:none}
.hero-side.panel li{font-family:var(--f-title);font-weight:var(--t-weight);letter-spacing:var(--t-track);font-size:clamp(26px,2.6vw,38px);line-height:1.15;padding:18px 0;border-bottom:1px solid color-mix(in srgb,var(--on-block) 22%,transparent)}
.hero-side.panel li:last-child{border-bottom:0}
.facts-row{padding:44px 0 10px}.facts-row .facts{margin-top:0}
.hero + .sec{padding-top:clamp(80px,9vw,120px)}
@media (max-width:960px){.hero-grid{grid-template-columns:1fr;min-height:0}.hero-side.photo{margin-right:-20px;margin-left:-20px;border-radius:0;min-height:420px}}
`,
  editorial: `
.hero{padding:150px 0 0}
.hero h1{font-size:clamp(52px,9vw,148px);line-height:.96;max-width:15ch}
.hero h1.t-m{font-size:clamp(46px,7vw,112px)}.hero h1.t-l{font-size:clamp(40px,5.6vw,86px)}
.ed-row{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,.9fr);gap:48px;align-items:end;margin-top:44px;padding-bottom:64px}
.ed-row .lead{margin-top:0}.ed-row .facts{margin-top:0;justify-content:flex-end}
.wide-photo{width:100%;height:min(72vh,720px);overflow:hidden}
.wide-photo img{width:100%;height:100%;object-fit:cover}
.svc-photo figure,.about-photo,.gallery .g,.map{border-radius:2px}
.btn{border-radius:2px}
@media (max-width:960px){.ed-row{grid-template-columns:1fr}.ed-row .facts{justify-content:flex-start}.wide-photo{height:56vh}}
`,
  impacto: `
.nav:not(.scrolled) .brand,.nav:not(.scrolled) .links a{color:var(--on-block)}
.nav:not(.scrolled) .links a{opacity:.82}.nav:not(.scrolled) .links a:hover{opacity:1}
.nav:not(.scrolled) .btn-main{background:var(--on-block);color:var(--block)}
.hero.block{background:var(--block);color:var(--on-block);padding:130px 0 70px}
.hero.block .selo,.hero.block .lead,.hero.block .facts dd{color:color-mix(in srgb,var(--on-block) 78%,transparent)}
.hero.block .btn-main{background:var(--on-block);color:var(--block)}
.hero.block .btn-quiet{color:var(--on-block);box-shadow:inset 0 0 0 1.5px color-mix(in srgb,var(--on-block) 45%,transparent)}
.hero-grid{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,.85fr);gap:48px;align-items:end}
.hero-grid.solo{grid-template-columns:1fr}
.hero h1{text-transform:uppercase;line-height:.92;font-size:clamp(52px,8.4vw,132px)}
.hero h1.t-m{font-size:clamp(46px,6.6vw,104px)}.hero h1.t-l{font-size:clamp(40px,5vw,78px)}
.cut{aspect-ratio:4/5;overflow:hidden;border-radius:4px;transform:translateY(120px);box-shadow:0 40px 80px -40px rgba(0,0,0,.6)}
.cut img{width:100%;height:100%;object-fit:cover}
.hero.block + .sec{padding-top:clamp(160px,16vw,220px)}
.sec h2,.final h2{text-transform:uppercase;line-height:.95}
.svc-photo figure,.about-photo,.gallery .g,.map{border-radius:4px}
@media (max-width:960px){.hero-grid{grid-template-columns:1fr}.cut{transform:none;margin-top:20px}.hero.block + .sec{padding-top:90px}}
`,
};

// Motion do site (sem biblioteca, leve): título entra palavra por palavra, seções aparecem em cascata ao rolar,
// fotos se revelam como cortina e ganham profundidade, números contam, botões magnéticos com brilho e barra de leitura.
// Quem pediu menos movimento no aparelho (e robôs/prints) vê tudo parado e visível.
const SCRIPT = `
(function(){
  var d=document, w=window, root=d.documentElement;
  var nav=d.getElementById('nav');
  var reduce=w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var still=reduce || navigator.webdriver;
  var fine=w.matchMedia && w.matchMedia('(pointer: fine)').matches && w.innerWidth>960;
  var bar=d.createElement('div'); bar.className='progress'; d.body.appendChild(bar);
  function onScroll(){
    var y=w.scrollY||0;
    if(nav){ nav.classList.toggle('scrolled', y>24); }
    var max=root.scrollHeight-w.innerHeight; bar.style.transform='scaleX('+(max>0?Math.min(1,y/max):0)+')';
  }
  w.addEventListener('scroll',onScroll,{passive:true}); onScroll();
  if(still){ root.classList.add('still'); return; }
  // Chegou no fim da página: mostra o que ainda faltava (itens que nunca entram inteiros na tela)
  w.addEventListener('scroll',function(){
    if(w.innerHeight+(w.scrollY||0)>=root.scrollHeight-8){ Array.prototype.forEach.call(d.querySelectorAll('.rv:not(.on),.wipe:not(.on)'),function(el){ el.classList.add('on'); }); }
  },{passive:true});
  root.classList.add('motion');

  // Título do topo: cada palavra sobe de trás de uma máscara
  var h1=d.querySelector('.hero h1');
  if(h1){
    var n=0;
    (function split(el){
      Array.prototype.slice.call(el.childNodes).forEach(function(node){
        if(node.nodeType===3){
          var frag=d.createDocumentFragment();
          node.textContent.split(/(\\s+)/).forEach(function(part){
            if(!part) return;
            if(/^\\s+$/.test(part)){ frag.appendChild(d.createTextNode(part)); return; }
            var o=d.createElement('span'); o.className='w';
            var i=d.createElement('span'); i.textContent=part; i.style.transitionDelay=(0.12+n*0.07)+'s'; n++;
            o.appendChild(i); frag.appendChild(o);
          });
          node.parentNode.replaceChild(frag,node);
        } else if(node.nodeType===1 && node.tagName!=='BR'){ split(node); }
      });
    })(h1);
    h1.classList.remove('in'); h1.classList.add('split');
    requestAnimationFrame(function(){ requestAnimationFrame(function(){ h1.classList.add('on'); }); });
  }

  // Seções: aparecem em cascata quando entram na tela
  var sel='.sec-head,.svc-photo,.svc-list>*,.steps>li,.points>*,.about-text,.quote-main,.quotes>*,.faq>*,.local-info,.map,.final h2,.final p,.final .btn,.facts>div';
  var items=Array.prototype.slice.call(d.querySelectorAll(sel)).filter(function(el){ return !el.closest('.hero'); });
  items.forEach(function(el){
    var sibs=el.parentNode?Array.prototype.indexOf.call(el.parentNode.children,el):0;
    el.classList.add('rv'); el.style.transitionDelay=Math.min(sibs*0.08,0.4)+'s';
  });
  // Fotos: cortina que abre + leve zoom saindo
  var wipes=Array.prototype.slice.call(d.querySelectorAll('.about-photo,.gallery>*,.wide-photo,.svc-photo figure'));
  wipes.forEach(function(el,i){ el.classList.add('wipe'); });
  // Números: contam do zero até o valor
  var counters=Array.prototype.slice.call(d.querySelectorAll('.facts dt'));
  function count(el){
    var raw=el.textContent.trim(), m=raw.match(/^([^0-9]*)([0-9][0-9.,]*)(.*)$/);
    if(!m) return;
    var num=m[2], dec=0, val;
    if(num.indexOf(',')>=0){ dec=num.split(',')[1].length; val=parseFloat(num.replace(/\\./g,'').replace(',','.')); }
    else if(/\\.\\d{3}(\\D|$)/.test(num)){ val=parseFloat(num.replace(/\\./g,'')); }
    else { val=parseFloat(num); dec=(num.split('.')[1]||'').length; }
    if(!isFinite(val)) return;
    var t0=null, dur=1400;
    function fmt(v){ return m[1]+v.toLocaleString('pt-BR',{minimumFractionDigits:dec,maximumFractionDigits:dec})+m[3]; }
    function step(t){ if(!t0) t0=t; var p=Math.min(1,(t-t0)/dur), e=1-Math.pow(1-p,3); el.textContent=fmt(val*e); if(p<1) requestAnimationFrame(step); else el.textContent=raw; }
    el.textContent=fmt(0); requestAnimationFrame(step);
  }
  var io=new IntersectionObserver(function(entries){
    entries.forEach(function(en){
      if(!en.isIntersecting) return;
      var el=en.target; el.classList.add('on'); io.unobserve(el);
      if(el.tagName==='DT') count(el);
    });
  },{threshold:0.12, rootMargin:'0px 0px -6% 0px'});
  items.concat(wipes).concat(counters).forEach(function(el){ io.observe(el); });

  // Profundidade: fotos grandes andam mais devagar que a página (só no computador)
  var par=fine?Array.prototype.slice.call(d.querySelectorAll('.hero-photo img,.hero-side img,.wide-photo img,.about-photo img,.cut img')):[];
  if(par.length){
    var ticking=false;
    function update(){
      ticking=false; var vh=w.innerHeight;
      par.forEach(function(img){
        var r=img.parentNode.getBoundingClientRect(); if(r.bottom<0||r.top>vh) return;
        var c=(r.top+r.height/2-vh/2)/vh; img.style.translate='0 '+(c*-38).toFixed(1)+'px';
      });
    }
    w.addEventListener('scroll',function(){ if(!ticking){ ticking=true; requestAnimationFrame(update); } },{passive:true}); update();
  }

  // Botões magnéticos: puxam levemente para o mouse
  if(fine){
    Array.prototype.slice.call(d.querySelectorAll('.btn')).forEach(function(b){
      b.addEventListener('pointermove',function(e){ var r=b.getBoundingClientRect(); b.style.translate=((e.clientX-r.left-r.width/2)*0.18).toFixed(1)+'px '+((e.clientY-r.top-r.height/2)*0.3).toFixed(1)+'px'; });
      b.addEventListener('pointerleave',function(){ b.style.translate='0 0'; });
    });
  }
})();
`;
