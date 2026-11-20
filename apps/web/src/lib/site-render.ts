// Monta o site da proposta a partir do conteúdo que o agente de web escreve (JSON) e de uma
// direção de arte premium escolhida para o segmento. O agente cuida do texto, das fotos e do estilo;
// o desenho (tipografia, grid, animações, contraste) é garantido aqui, então todo site sai profissional
// e cada estilo tem uma cara própria.

export type SiteStyle = "aurora" | "clinico" | "editorial" | "impacto";
export const SITE_STYLES: SiteStyle[] = ["aurora", "clinico", "editorial", "impacto"];

export const STYLE_GUIDE: Record<SiteStyle, string> = {
  aurora: "AURORA — escuro e luxuoso: fundo quase preto, luzes suaves nas cores da marca, títulos em serifa elegante, foto em arco com brilho. Para estética, harmonização, odontologia premium, dermatologia, clínicas de alto padrão.",
  clinico: "CLÍNICO FUTURISTA — claro, limpo e tecnológico: fundo branco com tons da marca, fonte geométrica moderna, foto grande arredondada com cartões flutuantes. Para odontologia, clínicas médicas, fisioterapia, nutrição, laboratórios.",
  editorial: "EDITORIAL — cara de revista: fundo creme, serifa grande, colagem de fotos assimétrica, lista numerada de serviços. Para marca pessoal, consultoria, psicologia, moda, beleza autoral, profissionais liberais.",
  impacto: "IMPACTO — ousado e jovem: fundo preto, letras gigantes em caixa alta, cor da marca em neon, faixas animadas. Para academias, estúdios, marcas jovens, tecnologia, eventos, negócios que querem chamar atenção.",
};

export interface SiteContent {
  estilo?: string;
  cores?: { primaria?: string; secundaria?: string; destaque?: string };
  topo?: { selo?: string; titulo?: string; tituloDestaque?: string; subtitulo?: string; botao?: string; botaoSecundario?: string; foto?: string | null };
  numeros?: Array<{ valor?: string; rotulo?: string }>;
  faixa?: string[];
  servicos?: Array<{ titulo?: string; descricao?: string; icone?: string; mensagem?: string }>;
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
  whatsapp: string | null; // só dígitos, do próprio negócio
  logo: SiteAsset | null;
  assets: SiteAsset[];
  isHealth: boolean;
}

// ------------------------------------------------------------------ utilidades
const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const has = (v: unknown) => typeof v === "string" && v.trim().length > 0;
const list = <T>(v: T[] | undefined, max: number) => (Array.isArray(v) ? v.filter(Boolean).slice(0, max) : []);

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
// Ajusta a cor até ter o brilho pedido (para não sumir em fundo escuro nem em fundo claro)
function ensureLight(hex: string, min: number) {
  let c = hex;
  for (let i = 0; i < 10 && luminance(c) < min; i++) c = mix(c, "#ffffff", 0.15);
  return c;
}
function ensureDark(hex: string, max: number) {
  let c = hex;
  for (let i = 0; i < 10 && luminance(c) > max; i++) c = mix(c, "#000000", 0.15);
  return c;
}
const onColor = (hex: string) => (luminance(hex) > 0.45 ? "#111111" : "#ffffff");

const ICONS: Record<string, string> = {
  dente: '<path d="M7 3c-2 0-3.5 1.6-3.5 4 0 2.2 1 3.6 1.5 6 .4 2 .6 5 2 7 1 1.4 2.2.4 2.5-1.3.4-2 .8-4.2 2.5-4.2s2.1 2.2 2.5 4.2c.3 1.7 1.5 2.7 2.5 1.3 1.4-2 1.6-5 2-7 .5-2.4 1.5-3.8 1.5-6 0-2.4-1.5-4-3.5-4-1.7 0-2.6 1-5 1S8.7 3 7 3z"/>',
  brilho: '<path d="M12 3l1.8 4.7 4.7 1.8-4.7 1.8L12 16l-1.8-4.7-4.7-1.8 4.7-1.8L12 3zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z"/>',
  escudo: '<path d="M12 3l7 3v6c0 4.5-3 7.7-7 9-4-1.3-7-4.5-7-9V6l7-3z"/><path d="M9 12l2 2 4-4"/>',
  relogio: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  coracao: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
  estrela: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3z"/>',
  calendario: '<path d="M4 6h16v14H4zM4 10h16M8 3v4M16 3v4"/>',
  mapa: '<path d="M12 21s-6-5.3-6-11a6 6 0 0 1 12 0c0 5.7-6 11-6 11z"/><circle cx="12" cy="10" r="2.2"/>',
  conversa: '<path d="M4 5h16v11H9l-5 4V5z"/><path d="M8 9.5h8M8 12.5h5"/>',
  pessoa: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/>',
  folha: '<path d="M5 19C5 10 11 5 20 4c-1 9-6 15-15 15zM5 19l7-7"/>',
  haltere: '<path d="M3 10v4M6 7v10M18 7v10M21 10v4M6 12h12"/>',
  olho: '<path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  sorriso: '<circle cx="12" cy="12" r="9"/><path d="M8 14c1 1.5 2.4 2.2 4 2.2s3-.7 4-2.2M9 9.5h.01M15 9.5h.01"/>',
  premio: '<circle cx="12" cy="9" r="5"/><path d="M8.5 13.5L7 21l5-2.5 5 2.5-1.5-7.5"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  telefone: '<path d="M6 3h3l1.5 4.5-2 1.5a12 12 0 0 0 6.5 6.5l1.5-2L21 15v3a2 2 0 0 1-2 2C10.7 20 4 13.3 4 5a2 2 0 0 1 2-2z"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4V8z"/><circle cx="12" cy="13" r="3.5"/>',
  coroa: '<path d="M4 18h16M5 15L4 7l5 4 3-6 3 6 5-4-1 8H5z"/>',
  gota: '<path d="M12 3s6 6.6 6 11a6 6 0 0 1-12 0c0-4.4 6-11 6-11z"/>',
  atividade: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  estetoscopio: '<path d="M5 3v5a5 5 0 0 0 10 0V3M10 13v3a4 4 0 0 0 8 0v-2"/><circle cx="18" cy="12" r="2"/>',
  seringa: '<path d="M18 2l4 4M20 4l-9 9M15 5l4 4M11 9l-6 6-1 5 5-1 6-6M7 13l4 4"/>',
  alvo: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  grafico: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  raio: '<path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"/>',
  mao: '<path d="M7 11V6a1.5 1.5 0 0 1 3 0v4M10 10V4.5a1.5 1.5 0 0 1 3 0V10M13 10V5.5a1.5 1.5 0 0 1 3 0V12M16 11a1.5 1.5 0 0 1 3 0v3a7 7 0 0 1-7 7h-1a6 6 0 0 1-5-2.7L3.5 15a1.5 1.5 0 0 1 2.5-1.7L7 15v-4"/>',
  setas: '<path d="M7 7h10v10M7 17L17 7"/>',
};
export const ICON_NAMES = Object.keys(ICONS);
const icon = (name: string | undefined, cls = "ico") =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[(name ?? "").toLowerCase()] ?? ICONS.brilho}</svg>`;
const WA_ICON =
  '<svg viewBox="0 0 24 24" class="ico" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1-.2-.1-1-.4-2-1.2-.7-.6-1.2-1.4-1.3-1.6-.1-.2 0-.4.1-.5l.4-.4.3-.4v-.4l-.8-1.9c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3c-.2.3-.9.9-.9 2.2s1 2.6 1.1 2.7c.1.2 1.9 2.9 4.6 4 .6.3 1.1.4 1.5.5.6.2 1.2.2 1.6.1.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2l-.4-.3z"/></svg>';
const IG_ICON =
  '<svg viewBox="0 0 24 24" class="ico" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".8" fill="currentColor"/></svg>';

// ------------------------------------------------------------------ fotos
// Só usa no topo e em destaques foto grande de verdade; foto pequena nunca é esticada
const isLarge = (a: SiteAsset | null | undefined) => !!a && (a.width ?? 0) >= 900 && (a.height ?? 0) >= 700;
const isMedium = (a: SiteAsset | null | undefined) => !!a && (a.width ?? 0) >= 480 && (a.height ?? 0) >= 480;
const isGallery = (a: SiteAsset | null | undefined) => !!a && (a.width ?? 0) >= 500 && (a.height ?? 0) >= 340;

// ------------------------------------------------------------------ render
export function renderSite(content: SiteContent, ctx: RenderContext): { html: string; style: SiteStyle; warnings: string[] } {
  const warnings: string[] = [];
  const style: SiteStyle = SITE_STYLES.includes(content.estilo as SiteStyle) ? (content.estilo as SiteStyle) : ctx.isHealth ? "clinico" : "editorial";
  const dark = style === "aurora" || style === "impacto";
  const byFile = new Map(ctx.assets.map((a) => [a.file, a]));
  const pick = (file: string | null | undefined, test: (a: SiteAsset) => boolean, what: string) => {
    if (!file) return null;
    const a = byFile.get(file);
    if (!a) {
      warnings.push(`${what}: o arquivo ${file} não existe; foi ignorado.`);
      return null;
    }
    if (!test(a)) {
      warnings.push(`${what}: ${file} é pequena demais (${a.width}x${a.height}) e ficaria pixelada; foi trocada pelo layout sem foto.`);
      return null;
    }
    return a;
  };

  // Cores
  const p0 = hexToRgb(content.cores?.primaria ?? "") ? content.cores!.primaria! : "#2563eb";
  const s0 = hexToRgb(content.cores?.secundaria ?? "") ? content.cores!.secundaria! : mix(p0, dark ? "#ffffff" : "#000000", 0.35);
  const a0 = hexToRgb(content.cores?.destaque ?? "") ? content.cores!.destaque! : s0;
  const norm = (h: string) => toHex(hexToRgb(h) ?? [37, 99, 235]);
  const primary = norm(dark ? ensureLight(p0, 0.12) : p0);
  const ink = dark ? ensureLight(p0, 0.3) : ensureDark(p0, 0.18); // cor da marca para texto
  const secondary = dark ? ensureLight(s0, 0.08) : s0;
  const accent = dark ? ensureLight(a0, 0.25) : ensureDark(a0, 0.3);

  // Contato
  const waBase = ctx.whatsapp ? `https://wa.me/${ctx.whatsapp.replace(/\D/g, "")}` : null;
  const contact = (msg?: string) => (waBase ? `${waBase}?text=${encodeURIComponent(msg || `Olá! Vim pelo site da ${ctx.businessName} e quero agendar.`)}` : `https://ig.me/m/${ctx.handle}`);
  const contactIcon = waBase ? WA_ICON : IG_ICON;

  const topo = content.topo ?? {};
  const heroPhoto = pick(topo.foto, isLarge, "Foto do topo");
  const sobre = content.sobre ?? {};
  const aboutPhoto = pick(sobre.foto, isMedium, "Foto do 'sobre'");
  const gallery = list(content.galeria, 8)
    .map((f) => pick(f, isGallery, "Galeria"))
    .filter((a): a is SiteAsset => !!a && a.file !== heroPhoto?.file && a.file !== aboutPhoto?.file);
  const sec = (key: keyof NonNullable<SiteContent["secoes"]>, kicker: string, titulo: string, texto = "") => {
    const s = content.secoes?.[key] ?? {};
    return { kicker: s.kicker || kicker, titulo: s.titulo || titulo, texto: s.texto ?? texto };
  };
  const head = (h: { kicker: string; titulo: string; texto: string }, center = false) =>
    `<div class="sec-head${center ? " center" : ""} rv"><span class="kicker">${esc(h.kicker)}</span><h2>${esc(h.titulo)}</h2>${has(h.texto) ? `<p>${esc(h.texto)}</p>` : ""}</div>`;

  // Título com trecho em destaque
  const title = esc(topo.titulo || ctx.businessName);
  const hl = has(topo.tituloDestaque) && (topo.titulo ?? "").includes(topo.tituloDestaque!) ? esc(topo.tituloDestaque) : null;
  const heroTitle = hl ? title.replace(hl, `<em>${hl}</em>`) : title;
  const tLen = (topo.titulo || ctx.businessName).length;
  const tSize = tLen <= 30 ? "t-s" : tLen <= 55 ? "t-m" : "t-l";

  const numbers = list(content.numeros, 4).filter((n) => has(n.valor) && has(n.rotulo));
  const services = list(content.servicos, 8).filter((s) => has(s.titulo));
  const steps = list(content.passos, 5).filter((s) => has(s.titulo));
  const diffs = list(content.diferenciais, 6).filter((s) => has(s.titulo));
  const testimonials = list(content.depoimentos, 3).filter((t) => has(t.texto));
  const faq = list(content.faq, 8).filter((f) => has(f.pergunta) && has(f.resposta));
  const strip = list(content.faixa, 10).filter(has);
  const local = content.local ?? {};
  const cta = content.chamadaFinal ?? {};
  const rodape = content.rodape ?? {};

  // Logo quadrado pequeno (foto de perfil do Instagram) vira ícone redondo, sem fundo branco
  const roundLogo = !!ctx.logo && /logo-instagram/.test(ctx.logo.file);
  const logoImg = ctx.logo ? `<img src="${esc(ctx.logo.file)}" alt="" class="logo-img${roundLogo ? " round" : ""}">` : "";
  const monogram = esc(ctx.businessName.replace(/^(cl[ií]nica|consult[oó]rio|instituto|espa[cç]o)\s+/i, "").trim().charAt(0).toUpperCase());
  const wideLogo = !!ctx.logo && (ctx.logo.width ?? 0) >= 200 && (ctx.logo.width ?? 0) / Math.max(1, ctx.logo.height ?? 1) >= 1.8;
  const brandMark = logoImg || `<span class="mono">${monogram}</span>`;
  const brandFull = wideLogo ? `<img src="${esc(ctx.logo!.file)}" alt="${esc(ctx.businessName)}" class="logo-img wide">` : `${brandMark}<b>${esc(ctx.businessName)}</b>`;

  // ---------------- topo por estilo
  const btns = `<div class="hero-btns"><a class="btn btn-primary" href="${esc(contact())}" target="_blank" rel="noopener">${contactIcon}<span>${esc(topo.botao || (waBase ? "Agendar pelo WhatsApp" : "Falar no Instagram"))}</span></a>${
    services.length ? `<a class="btn btn-ghost" href="#servicos">${esc(topo.botaoSecundario || "Ver serviços")}</a>` : ""
  }</div>`;
  const numbersHtml = numbers.length ? `<div class="stats">${numbers.map((n) => `<div class="stat"><b>${esc(n.valor)}</b><span>${esc(n.rotulo)}</span></div>`).join("")}</div>` : "";
  const heroText = `<div class="hero-text">${has(topo.selo) ? `<span class="badge rv">${esc(topo.selo)}</span>` : ""}<h1 class="rv ${tSize}">${heroTitle}</h1>${
    has(topo.subtitulo) ? `<p class="lead rv">${esc(topo.subtitulo)}</p>` : ""
  }<div class="rv">${btns}</div>${numbersHtml ? `<div class="rv">${numbersHtml}</div>` : ""}</div>`;
  const firstService = services[0];
  const emblem = `<div class="emblem" aria-hidden="true"><div class="ring r1"></div><div class="ring r2"></div><div class="ring r3"></div><div class="core">${icon(firstService?.icone ?? "brilho", "ico big")}</div>${services
    .slice(0, 4)
    .map((s, i) => `<span class="orbit o${i + 1}">${icon(s.icone, "ico")}<em>${esc(s.titulo)}</em></span>`)
    .join("")}</div>`;

  let hero = "";
  if (style === "aurora") {
    hero = `<section class="hero"><div class="aur a1"></div><div class="aur a2"></div><div class="aur a3"></div><div class="wrap hero-grid">${heroText}<div class="hero-visual rv">${
      heroPhoto
        ? `<div class="arch"><img src="${esc(heroPhoto.file)}" alt="${esc(ctx.businessName)}"></div>${numbers[0] ? `<div class="float-chip">${icon("estrela")}<b>${esc(numbers[0].valor)}</b><span>${esc(numbers[0].rotulo)}</span></div>` : ""}`
        : emblem
    }</div></div></section>`;
  } else if (style === "clinico") {
    hero = `<section class="hero"><div class="mesh"></div><div class="wrap hero-grid">${heroText}<div class="hero-visual rv">${
      heroPhoto
        ? `<div class="photo-card"><img src="${esc(heroPhoto.file)}" alt="${esc(ctx.businessName)}"></div><div class="float-card fc1">${contactIcon}<div><b>Agende em minutos</b><span>${waBase ? "Resposta pelo WhatsApp" : "Fale pelo direct"}</span></div></div>${
            numbers[0] ? `<div class="float-card fc2">${icon("estrela")}<div><b>${esc(numbers[0].valor)}</b><span>${esc(numbers[0].rotulo)}</span></div></div>` : ""
          }`
        : `<div class="stack">${services
            .slice(0, 3)
            .map((s, i) => `<div class="stack-card sc${i + 1}">${icon(s.icone)}<b>${esc(s.titulo)}</b><span>${esc((s.descricao ?? "").slice(0, 70))}</span></div>`)
            .join("")}</div>`
    }</div></div></section>`;
  } else if (style === "editorial") {
    const collage = [heroPhoto, ...gallery].filter(Boolean).slice(0, 3) as SiteAsset[];
    hero = `<section class="hero"><div class="wrap">${has(topo.selo) ? `<div class="ed-top rv"><span class="badge">${esc(topo.selo)}</span><span class="ed-line"></span><span class="ed-handle">@${esc(ctx.handle)}</span></div>` : ""}<h1 class="rv ${tSize}">${heroTitle}</h1><div class="ed-grid"><div class="ed-copy">${
      has(topo.subtitulo) ? `<p class="lead rv">${esc(topo.subtitulo)}</p>` : ""
    }<div class="rv">${btns}</div>${numbersHtml ? `<div class="rv">${numbersHtml}</div>` : ""}</div>${
      collage.length
        ? `<div class="collage c${collage.length} rv">${collage.map((a, i) => `<figure class="ph ph${i + 1}"><img src="${esc(a.file)}" alt=""></figure>`).join("")}</div>`
        : `<div class="quote-block rv"><span>“</span><p>${esc(topo.subtitulo || ctx.businessName)}</p></div>`
    }</div></div></section>`;
  } else {
    hero = `<section class="hero"><div class="grid-bg"></div><div class="wrap">${has(topo.selo) ? `<span class="badge rv">${esc(topo.selo)}</span>` : ""}<h1 class="rv ${tSize}">${heroTitle}</h1><div class="imp-grid"><div>${
      has(topo.subtitulo) ? `<p class="lead rv">${esc(topo.subtitulo)}</p>` : ""
    }<div class="rv">${btns}</div></div>${heroPhoto ? `<div class="duo rv"><img src="${esc(heroPhoto.file)}" alt=""></div>` : numbersHtml ? `<div class="rv">${numbersHtml}</div>` : ""}</div>${heroPhoto && numbersHtml ? `<div class="rv">${numbersHtml}</div>` : ""}</div></section>`;
  }

  // ---------------- seções
  const marquee = strip.length
    ? `<div class="marquee" aria-hidden="true"><div class="track">${[...strip, ...strip, ...strip].map((t) => `<span>${esc(t)}</span><i>✦</i>`).join("")}</div></div>`
    : "";

  const servicesHtml = services.length
    ? `<section id="servicos" class="sec"><div class="wrap">${head(sec("servicos", ctx.isHealth ? "Tratamentos" : "Serviços", ctx.isHealth ? "Cuidado completo, em um só lugar" : "O que fazemos por você"))}<div class="cards">${services
        .map(
          (s, i) =>
            `<article class="card rv" style="--d:${i * 70}ms"><span class="num">${String(i + 1).padStart(2, "0")}</span><div class="card-ico">${icon(s.icone)}</div><h3>${esc(s.titulo)}</h3><p>${esc(s.descricao)}</p><a class="more" href="${esc(contact(s.mensagem || `Olá! Quero saber mais sobre ${s.titulo}.`))}" target="_blank" rel="noopener">${waBase ? "Quero saber mais" : "Perguntar no direct"} ${icon("setas", "ico sm")}</a></article>`
        )
        .join("")}</div></div></section>`
    : "";

  const stepsHtml = steps.length
    ? `<section id="como" class="sec alt"><div class="wrap">${head(sec("passos", "Como funciona", "Simples do primeiro contato ao resultado"), true)}<ol class="steps">${steps
        .map((s, i) => `<li class="rv" style="--d:${i * 90}ms"><span class="step-n">${i + 1}</span><h3>${esc(s.titulo)}</h3><p>${esc(s.descricao)}</p></li>`)
        .join("")}</ol></div></section>`
    : "";

  const diffsHtml = diffs.length
    ? `<section class="sec"><div class="wrap">${head(sec("diferenciais", "Diferenciais", "Por que escolher a " + ctx.businessName))}<div class="bento">${diffs
        .map((d, i) => `<div class="bento-item b${i + 1} rv" style="--d:${i * 70}ms">${icon(d.icone ?? "check")}<h3>${esc(d.titulo)}</h3><p>${esc(d.descricao)}</p></div>`)
        .join("")}</div></div></section>`
    : "";

  const aboutHtml =
    has(sobre.texto) || has(sobre.titulo)
      ? `<section id="sobre" class="sec alt"><div class="wrap about${aboutPhoto ? "" : " no-photo"}">${
          aboutPhoto ? `<figure class="about-photo rv"><img src="${esc(aboutPhoto.file)}" alt="${esc(sobre.nome || ctx.businessName)}"></figure>` : ""
        }<div class="about-text rv">${head(sec("sobre", "Sobre", sobre.titulo || `Conheça a ${ctx.businessName}`))}${String(sobre.texto ?? "")
          .split(/\n+/)
          .filter(has)
          .map((p) => `<p>${esc(p)}</p>`)
          .join("")}${has(sobre.nome) ? `<div class="sign"><b>${esc(sobre.nome)}</b>${has(sobre.cargo) ? `<span>${esc(sobre.cargo)}</span>` : ""}</div>` : ""}</div></div></section>`
      : "";

  const galleryHtml =
    gallery.length >= 3
      ? `<section class="sec"><div class="wrap">${head(sec("galeria", "Por dentro", "Um pouco do nosso dia a dia"), true)}<div class="gallery">${gallery
          .slice(0, 6)
          .map((a, i) => `<figure class="g g${i + 1} rv"><img src="${esc(a.file)}" alt="" loading="lazy"></figure>`)
          .join("")}</div></div></section>`
      : "";

  const testimonialsHtml = testimonials.length
    ? `<section class="sec alt"><div class="wrap">${head(sec("depoimentos", "Depoimentos", "Quem já passou por aqui"), true)}<div class="quotes">${testimonials
        .map((t) => `<blockquote class="rv"><div class="stars">${"★".repeat(5)}</div><p>${esc(t.texto)}</p>${has(t.autor) ? `<cite>${esc(t.autor)}</cite>` : ""}</blockquote>`)
        .join("")}</div></div></section>`
    : "";

  const faqHtml = faq.length
    ? `<section id="duvidas" class="sec"><div class="wrap faq-wrap">${head(sec("faq", "Dúvidas", "Perguntas frequentes"))}<div class="faq">${faq
        .map((f) => `<details class="rv"><summary>${esc(f.pergunta)}<span class="plus"></span></summary><p>${esc(f.resposta)}</p></details>`)
        .join("")}</div></div></section>`
    : "";

  const mapQuery = local.mapa || local.endereco;
  const localHtml =
    has(local.endereco) || has(local.horario) || has(mapQuery)
      ? `<section id="local" class="sec alt"><div class="wrap local">${`<div class="local-info rv">${head(sec("local", "Onde estamos", "Venha nos visitar"))}${
          has(local.endereco) ? `<div class="info-row">${icon("mapa")}<div><b>Endereço</b><span>${esc(local.endereco)}</span></div></div>` : ""
        }${has(local.horario) ? `<div class="info-row">${icon("relogio")}<div><b>Horário</b><span>${esc(local.horario)}</span></div></div>` : ""}<div class="info-row">${contactIcon}<div><b>${
          waBase ? "WhatsApp" : "Instagram"
        }</b><a href="${esc(contact())}" target="_blank" rel="noopener">${waBase ? "Chamar agora" : "@" + esc(ctx.handle)}</a></div></div></div>`}${
          has(mapQuery) ? `<div class="map rv"><iframe title="Mapa" loading="lazy" src="https://www.google.com/maps?q=${encodeURIComponent(String(mapQuery))}&output=embed"></iframe></div>` : ""
        }</div></section>`
      : "";

  const ctaHtml = `<section class="final"><div class="wrap final-box rv"><h2>${esc(cta.titulo || "Vamos começar?")}</h2>${has(cta.texto) ? `<p>${esc(cta.texto)}</p>` : ""}<a class="btn btn-primary btn-lg" href="${esc(contact())}" target="_blank" rel="noopener">${contactIcon}<span>${esc(
    cta.botao || topo.botao || "Agendar agora"
  )}</span></a></div></section>`;

  const footer = `<footer><div class="wrap foot"><div class="foot-brand">${brandFull}</div><div class="foot-info">${has(local.endereco) ? `<span>${esc(local.endereco)}</span>` : ""}${
    has(rodape.cnpj) ? `<span>CNPJ ${esc(rodape.cnpj)}</span>` : ""
  }${has(rodape.responsavelTecnico) ? `<span>Responsável técnico: ${esc(rodape.responsavelTecnico)}</span>` : ""}<a href="https://instagram.com/${esc(ctx.handle)}" target="_blank" rel="noopener">@${esc(ctx.handle)}</a></div><small>Prévia de proposta criada pela LOTUS</small></div></footer>`;

  const navLinks = [
    services.length ? `<a href="#servicos">${ctx.isHealth ? "Tratamentos" : "Serviços"}</a>` : "",
    steps.length ? '<a href="#como">Como funciona</a>' : "",
    aboutHtml ? '<a href="#sobre">Sobre</a>' : "",
    faq.length ? '<a href="#duvidas">Dúvidas</a>' : "",
    localHtml ? '<a href="#local">Onde estamos</a>' : "",
  ].join("");
  const nav = `<header class="nav" id="nav"><div class="wrap nav-in"><a class="brand" href="#">${brandFull}</a><nav class="links">${navLinks}</nav><a class="btn btn-primary btn-sm" href="${esc(
    contact()
  )}" target="_blank" rel="noopener">${contactIcon}<span>${esc(waBase ? "Agendar" : "Fale conosco")}</span></a></div></header>`;
  const floatBtn = `<a class="float-wa" href="${esc(contact())}" target="_blank" rel="noopener" aria-label="${waBase ? "WhatsApp" : "Instagram"}">${contactIcon}</a>`;

  const fonts = FONTS[style];
  const vars = `:root{--p:${primary};--ink:${ink};--s:${secondary};--a:${accent};--on-p:${onColor(primary)};--p-soft:${mix(primary, dark ? "#000000" : "#ffffff", dark ? 0.75 : 0.9)};--p-15:${primary}26;--p-30:${primary}4d;}`;

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(ctx.businessName)}${has(topo.selo) ? " · " + esc(topo.selo) : ""}</title>
<meta name="description" content="${esc(topo.subtitulo || ctx.businessName)}">
<meta name="theme-color" content="${dark ? "#07060b" : "#ffffff"}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${fonts}" rel="stylesheet">
<style>${vars}${BASE_CSS}${STYLE_CSS[style]}</style>
</head>
<body class="st-${style}">
${nav}
<main>
${hero}
${marquee}
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
const FONTS: Record<SiteStyle, string> = {
  aurora: "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Inter:wght@400;500;600&display=swap",
  clinico: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap",
  editorial: "https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@500&display=swap",
  impacto: "https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=Inter:wght@400;500;600&display=swap",
};

const BASE_CSS = `
*{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
body{font-family:var(--font-body);background:var(--bg);color:var(--fg);line-height:1.6;font-size:17px;-webkit-font-smoothing:antialiased;overflow-x:hidden}
img{display:block;max-width:100%}
a{color:inherit;text-decoration:none}
.wrap{width:min(1200px,100% - 48px);margin:0 auto}
h1,h2,h3{font-family:var(--font-display);line-height:1.08;letter-spacing:-.02em;color:var(--fg-strong)}
h1 em,h2 em{font-style:normal;color:var(--hl)}
.ico{width:24px;height:24px;flex:none}.ico.sm{width:16px;height:16px}.ico.big{width:44px;height:44px}
.btn{display:inline-flex;align-items:center;gap:10px;padding:15px 26px;border-radius:var(--radius-btn);font-weight:600;font-size:16px;transition:transform .25s,box-shadow .25s,background .25s;white-space:nowrap}
.btn .ico{width:20px;height:20px}
.btn-primary{background:var(--p);color:var(--on-p);box-shadow:0 10px 30px -10px var(--p)}
.btn-primary:hover{transform:translateY(-2px);box-shadow:0 18px 40px -12px var(--p)}
.btn-ghost{border:1px solid var(--line-strong);color:var(--fg-strong)}
.btn-ghost:hover{background:var(--surface)}
.btn-sm{padding:10px 18px;font-size:14px}.btn-lg{padding:18px 34px;font-size:18px}
.nav{position:fixed;inset:0 0 auto;z-index:50;transition:background .3s,backdrop-filter .3s,border-color .3s;border-bottom:1px solid transparent}
.nav.scrolled{background:var(--nav-bg);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border-color:var(--line)}
.nav-in{display:flex;align-items:center;gap:28px;height:76px}
.brand{display:flex;align-items:center;gap:12px;font-weight:700;color:var(--fg-strong);margin-right:auto}
.brand b{font-family:var(--font-display);font-size:20px;letter-spacing:-.01em}
.logo-img{height:38px;width:auto;object-fit:contain;border-radius:8px}
.mono{width:38px;height:38px;border-radius:12px;display:grid;place-items:center;background:var(--p);color:var(--on-p);font-family:var(--font-display);font-weight:700;font-size:20px}
.links{display:flex;gap:26px;font-size:15px;color:var(--fg-muted)}
.links a:hover{color:var(--fg-strong)}
.hero{position:relative;padding:150px 0 90px;overflow:hidden}
.hero-grid{display:grid;grid-template-columns:1.15fr .85fr;gap:56px;align-items:center;position:relative;z-index:2}
.badge{display:inline-flex;align-items:center;gap:8px;padding:8px 16px;border-radius:999px;font-size:13px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;background:var(--badge-bg);color:var(--badge-fg);border:1px solid var(--line)}
.hero h1{font-size:clamp(42px,6.2vw,80px);margin:22px 0 22px}
.lead{font-size:clamp(17px,1.6vw,20px);color:var(--fg-muted);max-width:560px}
.hero-btns{display:flex;flex-wrap:wrap;gap:14px;margin-top:34px}
.stats{display:flex;flex-wrap:wrap;gap:34px;margin-top:44px;padding-top:28px;border-top:1px solid var(--line)}
.stat b{display:block;font-family:var(--font-display);font-size:34px;line-height:1;color:var(--fg-strong)}
.stat span{font-size:14px;color:var(--fg-muted)}
.marquee{overflow:hidden;border-block:1px solid var(--line);padding:22px 0;background:var(--marquee-bg)}
.marquee .track{display:flex;gap:34px;width:max-content;animation:mq 38s linear infinite}
.marquee span{font-family:var(--font-display);font-size:clamp(22px,2.6vw,34px);white-space:nowrap;color:var(--fg-strong)}
.marquee i{color:var(--hl);font-style:normal;font-size:20px;align-self:center}
@keyframes mq{to{transform:translateX(-33.333%)}}
.sec{padding:120px 0}.sec.alt{background:var(--bg-alt)}
.sec-head{max-width:720px;margin-bottom:56px}.sec-head.center{margin-inline:auto;text-align:center}
.kicker{display:inline-block;font-size:13px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--hl);margin-bottom:14px}
.sec-head h2{font-size:clamp(34px,4.4vw,56px)}
.sec-head p{margin-top:18px;color:var(--fg-muted);font-size:18px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:22px}
.card{position:relative;padding:34px 30px;border-radius:var(--radius);background:var(--surface);border:1px solid var(--line);transition:transform .35s,border-color .35s,box-shadow .35s;display:flex;flex-direction:column}
.card:hover{transform:translateY(-6px);border-color:var(--p-30);box-shadow:var(--shadow-hover)}
.card .num{position:absolute;top:26px;right:28px;font-family:var(--font-display);font-size:15px;color:var(--fg-faint)}
.card-ico{width:56px;height:56px;border-radius:16px;display:grid;place-items:center;background:var(--p-15);color:var(--ink);margin-bottom:24px}
.card h3{font-size:24px;margin-bottom:10px}
.card p{color:var(--fg-muted);font-size:16px;flex:1}
.more{display:inline-flex;align-items:center;gap:6px;margin-top:22px;font-weight:600;font-size:15px;color:var(--ink)}
.steps{list-style:none;display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:22px;counter-reset:s}
.steps li{padding:34px 28px;border-radius:var(--radius);background:var(--surface);border:1px solid var(--line)}
.step-n{display:grid;place-items:center;width:46px;height:46px;border-radius:50%;background:var(--p);color:var(--on-p);font-weight:700;margin-bottom:20px;font-family:var(--font-display);font-size:20px}
.steps h3{font-size:21px;margin-bottom:8px}.steps p{color:var(--fg-muted);font-size:16px}
.bento{display:grid;grid-template-columns:repeat(6,1fr);gap:20px}
.bento-item{grid-column:span 2;padding:32px;border-radius:var(--radius);background:var(--surface);border:1px solid var(--line);color:var(--ink)}
.bento-item.b1{grid-column:span 3;background:var(--bento-hl);color:var(--bento-hl-fg)}.bento-item.b2{grid-column:span 3}
.bento-item h3{font-size:22px;margin:18px 0 8px;color:inherit}.bento-item.b1 h3{color:inherit}
.bento-item p{color:var(--fg-muted);font-size:16px}.bento-item.b1 p{color:inherit;opacity:.85}
.about{display:grid;grid-template-columns:.9fr 1.1fr;gap:70px;align-items:center}.about.no-photo{grid-template-columns:1fr;max-width:820px}
.about-photo{border-radius:var(--radius-lg);overflow:hidden;aspect-ratio:4/5}
.about-photo img{width:100%;height:100%;object-fit:cover}
.about-text p{color:var(--fg-muted);margin-bottom:16px;font-size:18px}
.about-text .sec-head{margin-bottom:26px}
.sign{margin-top:26px;padding-top:22px;border-top:1px solid var(--line)}
.sign b{display:block;font-family:var(--font-display);font-size:24px;color:var(--fg-strong)}.sign span{color:var(--fg-muted);font-size:15px}
.gallery{display:grid;grid-template-columns:repeat(4,1fr);grid-auto-rows:220px;gap:16px}
.gallery .g{border-radius:var(--radius);overflow:hidden}.gallery .g img{width:100%;height:100%;object-fit:cover;transition:transform .8s}
.gallery .g:hover img{transform:scale(1.06)}
.gallery .g1{grid-column:span 2;grid-row:span 2}
.quotes{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:22px}
blockquote{padding:34px;border-radius:var(--radius);background:var(--surface);border:1px solid var(--line)}
blockquote p{font-size:18px;color:var(--fg-strong);margin:14px 0 18px}
.stars{color:#f5b301;letter-spacing:3px}
cite{font-style:normal;font-weight:600;color:var(--fg-muted)}
.faq-wrap{display:grid;grid-template-columns:.8fr 1.2fr;gap:60px;align-items:start}
.faq details{border-bottom:1px solid var(--line);padding:24px 0}
.faq summary{list-style:none;cursor:pointer;display:flex;justify-content:space-between;gap:20px;font-weight:600;font-size:19px;color:var(--fg-strong)}
.faq summary::-webkit-details-marker{display:none}
.plus{position:relative;width:22px;height:22px;flex:none}
.plus::before,.plus::after{content:"";position:absolute;left:50%;top:50%;width:14px;height:2px;background:var(--hl);transform:translate(-50%,-50%);transition:transform .3s}
.plus::after{transform:translate(-50%,-50%) rotate(90deg)}
details[open] .plus::after{transform:translate(-50%,-50%) rotate(0)}
.faq details p{margin-top:12px;color:var(--fg-muted)}
.local{display:grid;grid-template-columns:.9fr 1.1fr;gap:50px;align-items:stretch}
.info-row{display:flex;gap:16px;align-items:flex-start;padding:18px 0;border-bottom:1px solid var(--line);color:var(--ink)}
.info-row b{display:block;color:var(--fg-strong)}.info-row span,.info-row a{color:var(--fg-muted)}.info-row a{color:var(--ink);font-weight:600}
.map{border-radius:var(--radius-lg);overflow:hidden;min-height:380px;border:1px solid var(--line)}
.map iframe{width:100%;height:100%;min-height:380px;border:0;filter:var(--map-filter)}
.final{padding:110px 0}
.final-box{text-align:center;padding:90px 40px;border-radius:var(--radius-lg);background:var(--final-bg);color:var(--final-fg);position:relative;overflow:hidden}
.final-box h2{color:inherit;font-size:clamp(36px,5vw,64px);max-width:860px;margin:0 auto}
.final-box p{margin:20px auto 0;max-width:620px;opacity:.85;font-size:19px}
.final-box .btn{margin-top:36px;background:var(--final-btn);color:var(--final-btn-fg)}
footer{padding:56px 0 40px;border-top:1px solid var(--line)}
.foot{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:20px}
.foot-brand{display:flex;align-items:center;gap:12px;color:var(--fg-strong)}
.foot-info{display:flex;flex-wrap:wrap;gap:8px 22px;font-size:14px;color:var(--fg-muted)}
.foot small{width:100%;font-size:12px;color:var(--fg-faint);margin-top:12px}
.float-wa{position:fixed;right:22px;bottom:22px;z-index:60;width:60px;height:60px;border-radius:50%;display:grid;place-items:center;background:var(--p);color:var(--on-p);box-shadow:0 14px 34px -8px var(--p);transition:transform .25s}
.float-wa:hover{transform:scale(1.08)}.float-wa .ico{width:28px;height:28px}
.rv{opacity:0;transform:translateY(26px);transition:opacity .9s cubic-bezier(.2,.7,.2,1),transform .9s cubic-bezier(.2,.7,.2,1);transition-delay:var(--d,0ms)}
.rv.in{opacity:1;transform:none}
.emblem{position:relative;width:min(460px,100%);aspect-ratio:1;margin-left:auto}
.ring{position:absolute;inset:0;border-radius:50%;border:1px solid var(--line-strong)}
.ring.r2{inset:14%;border-color:var(--p-30)}.ring.r3{inset:28%;background:radial-gradient(circle,var(--p-30),transparent 70%);border:none}
.r1{animation:spin 40s linear infinite;border-style:dashed}
.core{position:absolute;inset:38%;border-radius:50%;display:grid;place-items:center;background:var(--p);color:var(--on-p);box-shadow:0 0 80px var(--p)}
.orbit{position:absolute;display:flex;align-items:center;gap:8px;padding:10px 14px;border-radius:999px;background:var(--surface-strong);border:1px solid var(--line);color:var(--ink);font-size:13px;font-weight:600;backdrop-filter:blur(10px);animation:bob 6s ease-in-out infinite}
.orbit em{font-style:normal;color:var(--fg-strong)}
.o1{top:6%;left:2%}.o2{top:22%;right:-4%;animation-delay:-1.5s}.o3{bottom:16%;left:-6%;animation-delay:-3s}.o4{bottom:2%;right:8%;animation-delay:-4.5s}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes bob{50%{transform:translateY(-12px)}}
.logo-img.wide{height:44px;max-width:190px}
body .logo-img.round{width:40px;height:40px;padding:0;border-radius:50%;object-fit:cover;background:none;box-shadow:0 0 0 2px var(--line-strong)}
.hero h1.t-m{font-size:clamp(38px,5vw,64px)}.hero h1.t-l{font-size:clamp(34px,4.2vw,54px)}
.hero h1{overflow-wrap:break-word;hyphens:auto}
@media (max-width:960px){
.links{display:none}
.hero{padding:120px 0 70px}
.hero-grid,.about,.faq-wrap,.local{grid-template-columns:1fr;gap:40px}
.bento{grid-template-columns:1fr}.bento-item,.bento-item.b1,.bento-item.b2{grid-column:auto}
.gallery{grid-template-columns:1fr 1fr;grid-auto-rows:170px}
.sec{padding:84px 0}
.emblem{margin:0 auto;width:min(380px,100%)}
}
@media (max-width:560px){
body{font-size:16px}
body .hero h1.t-s{font-size:clamp(38px,11vw,58px)}body .hero h1.t-m,body .hero h1.t-l{font-size:clamp(32px,8.6vw,44px)}
.logo-img.wide{height:36px;max-width:150px}
.wrap{width:calc(100% - 36px)}
.nav-in{height:66px}.brand b{font-size:17px}.nav .btn-sm span{display:none}.nav .btn-sm{padding:10px}
.hero-btns .btn{width:100%;justify-content:center}
.stats{gap:22px}.stat b{font-size:28px}
.final-box{padding:64px 24px}
.orbit{font-size:11px;padding:8px 10px}.orbit em{display:none}
}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}.rv{opacity:1;transform:none}}
`;

const STYLE_CSS: Record<SiteStyle, string> = {
  aurora: `
body{--font-display:"Cormorant Garamond",Georgia,serif;--font-body:Inter,system-ui,sans-serif;--bg:#07060b;--bg-alt:#0d0b14;--fg:#d9d6e3;--fg-strong:#ffffff;--fg-muted:#a29fb3;--fg-faint:#5d5a6c;--line:rgba(255,255,255,.09);--line-strong:rgba(255,255,255,.18);--surface:rgba(255,255,255,.035);--surface-strong:rgba(20,18,30,.75);--nav-bg:rgba(7,6,11,.72);--badge-bg:rgba(255,255,255,.05);--badge-fg:var(--a);--hl:var(--a);--marquee-bg:#0a0910;--radius:24px;--radius-lg:32px;--radius-btn:999px;--shadow-hover:0 30px 60px -30px var(--p);--bento-hl:linear-gradient(135deg,var(--p),var(--s));--bento-hl-fg:var(--on-p);--final-bg:radial-gradient(120% 140% at 50% 0%,var(--p) 0%,#120f1c 60%);--final-fg:#fff;--final-btn:#fff;--final-btn-fg:#0b0a10;--map-filter:invert(.9) hue-rotate(180deg) saturate(.6)}
.hero h1{font-weight:500;letter-spacing:-.03em}.hero h1.t-s{font-size:clamp(52px,7.5vw,104px)}.hero h1.t-m{font-size:clamp(44px,5.6vw,76px)}.hero h1.t-l{font-size:clamp(38px,4.6vw,62px)}
.logo-img{background:#fff;padding:5px 9px;border-radius:10px}
.hero h1 em{font-style:italic;background:linear-gradient(90deg,var(--a),#fff 60%);-webkit-background-clip:text;background-clip:text;color:transparent}
.sec-head h2,.final-box h2{font-weight:500}
.aur{position:absolute;border-radius:50%;filter:blur(90px);opacity:.55;z-index:0;animation:drift 18s ease-in-out infinite}
.a1{width:560px;height:560px;background:var(--p);top:-180px;right:-120px}
.a2{width:460px;height:460px;background:var(--s);bottom:-200px;left:-160px;animation-delay:-6s;opacity:.4}
.a3{width:320px;height:320px;background:var(--a);top:40%;left:45%;animation-delay:-12s;opacity:.25}
@keyframes drift{50%{transform:translate(40px,-30px) scale(1.08)}}
.arch{position:relative;border-radius:999px 999px 28px 28px;overflow:hidden;aspect-ratio:4/5;max-width:440px;margin-left:auto;border:1px solid var(--line-strong);box-shadow:0 0 0 10px rgba(255,255,255,.02),0 40px 120px -40px var(--p)}
.arch img{width:100%;height:100%;object-fit:cover}
.hero-visual{position:relative}
.float-chip{position:absolute;left:0;bottom:12%;display:flex;align-items:center;gap:10px;padding:14px 18px;border-radius:18px;background:var(--surface-strong);border:1px solid var(--line-strong);backdrop-filter:blur(14px);color:var(--a);animation:bob 6s ease-in-out infinite}
.float-chip b{font-family:var(--font-display);font-size:26px;color:#fff}.float-chip span{font-size:13px;color:var(--fg-muted)}
.card{background:linear-gradient(180deg,rgba(255,255,255,.05),rgba(255,255,255,.015));backdrop-filter:blur(10px)}
.card h3,.steps h3,.bento-item h3{font-family:Inter,sans-serif;font-weight:600;letter-spacing:-.01em;font-size:21px}
.marquee span{font-style:italic}
`,
  clinico: `
body{--font-display:"Plus Jakarta Sans",system-ui,sans-serif;--font-body:"Plus Jakarta Sans",system-ui,sans-serif;--bg:#ffffff;--bg-alt:var(--p-soft);--fg:#334155;--fg-strong:#0b1324;--fg-muted:#5b6476;--fg-faint:#a2a9b8;--line:rgba(11,19,36,.08);--line-strong:rgba(11,19,36,.16);--surface:#ffffff;--surface-strong:rgba(255,255,255,.9);--nav-bg:rgba(255,255,255,.82);--badge-bg:var(--p-soft);--badge-fg:var(--ink);--hl:var(--ink);--marquee-bg:var(--fg-strong);--radius:22px;--radius-lg:30px;--radius-btn:14px;--shadow-hover:0 30px 60px -30px rgba(11,19,36,.28);--bento-hl:var(--ink);--bento-hl-fg:#fff;--final-bg:linear-gradient(135deg,var(--ink),var(--s));--final-fg:#fff;--final-btn:#fff;--final-btn-fg:var(--ink);--map-filter:none}
.hero h1{font-weight:800;letter-spacing:-.035em}.hero h1.t-s{font-size:clamp(46px,6vw,80px)}.hero h1.t-m{font-size:clamp(40px,4.8vw,64px)}.hero h1.t-l{font-size:clamp(34px,4vw,54px)}
.hero h1 em{color:var(--ink);background:linear-gradient(transparent 68%,var(--p-15) 68%);-webkit-box-decoration-break:clone;box-decoration-break:clone}
.mesh{position:absolute;inset:0;background:radial-gradient(60% 60% at 85% 20%,var(--p-15),transparent 70%),radial-gradient(50% 50% at 10% 90%,var(--p-15),transparent 70%);z-index:0}
.photo-card{border-radius:36px;overflow:hidden;aspect-ratio:4/5;max-width:480px;margin-left:auto;box-shadow:0 50px 100px -40px rgba(11,19,36,.45)}
.photo-card img{width:100%;height:100%;object-fit:cover}
.hero-visual{position:relative}
.float-card{position:absolute;display:flex;align-items:center;gap:12px;padding:14px 18px;border-radius:18px;background:#fff;box-shadow:0 20px 50px -20px rgba(11,19,36,.35);color:var(--ink);animation:bob 7s ease-in-out infinite}
.float-card b{display:block;color:var(--fg-strong);font-size:15px}.float-card span{font-size:13px;color:var(--fg-muted)}
.fc1{left:-8%;bottom:14%}.fc2{right:-4%;top:10%;animation-delay:-3s}
.stack{position:relative;height:520px}
.stack-card{position:absolute;width:300px;padding:28px;border-radius:24px;background:#fff;box-shadow:0 30px 70px -30px rgba(11,19,36,.35);color:var(--ink);display:flex;flex-direction:column;gap:8px;animation:bob 7s ease-in-out infinite}
.stack-card b{color:var(--fg-strong);font-size:19px}.stack-card span{color:var(--fg-muted);font-size:14px}
.sc1{top:0;right:0}.sc2{top:175px;left:0;animation-delay:-2s}.sc3{top:345px;right:24px;animation-delay:-4s}
.marquee{border:none}.marquee span{color:#fff;font-weight:700}
.card{box-shadow:0 1px 2px rgba(11,19,36,.04)}
.sec.alt .card,.sec.alt .steps li,.sec.alt blockquote{background:#fff}
.bento-item.b1 .ico{color:#fff}
`,
  editorial: `
body{--font-display:"Instrument Serif",Georgia,serif;--font-body:Inter,system-ui,sans-serif;--bg:#f5f0e8;--bg-alt:#ece5d8;--fg:#3b352d;--fg-strong:#1b1712;--fg-muted:#6b6257;--fg-faint:#a59b8d;--line:rgba(27,23,18,.12);--line-strong:rgba(27,23,18,.28);--surface:#fbf8f2;--surface-strong:#fbf8f2;--nav-bg:rgba(245,240,232,.85);--badge-bg:transparent;--badge-fg:var(--fg-strong);--hl:var(--ink);--marquee-bg:var(--bg);--radius:4px;--radius-lg:6px;--radius-btn:999px;--shadow-hover:0 24px 50px -30px rgba(27,23,18,.35);--bento-hl:var(--fg-strong);--bento-hl-fg:#f5f0e8;--final-bg:var(--fg-strong);--final-fg:#f5f0e8;--final-btn:var(--p);--final-btn-fg:var(--on-p);--map-filter:grayscale(.6) sepia(.15)}
h1,h2,h3{font-weight:400;letter-spacing:-.01em}
.kicker,.badge,.ed-handle,.card .num{font-family:"JetBrains Mono",monospace;font-weight:500;letter-spacing:.08em}
.hero{padding-top:140px}
.hero h1{line-height:.95;margin:30px 0 40px;max-width:16ch}.hero h1.t-s{font-size:clamp(56px,10vw,150px)}.hero h1.t-m{font-size:clamp(48px,7vw,104px)}.hero h1.t-l{font-size:clamp(40px,5.4vw,80px)}
.hero h1 em{font-style:italic;color:var(--ink)}
.ed-top{display:flex;align-items:center;gap:18px}.ed-line{flex:1;height:1px;background:var(--line-strong)}.ed-handle{font-size:13px;color:var(--fg-muted)}
.badge{border:1px solid var(--line-strong);border-radius:999px}
.ed-grid{display:grid;grid-template-columns:.85fr 1.15fr;gap:60px;align-items:end}
.collage{display:grid;grid-template-columns:1.2fr .8fr;grid-template-rows:240px 240px;gap:16px}
.collage .ph{overflow:hidden}.collage img{width:100%;height:100%;object-fit:cover;filter:saturate(.9)}
.collage.c3 .ph1{grid-row:span 2}.collage.c2 .ph1{grid-row:span 2}.collage.c1{grid-template-columns:1fr}.collage.c1 .ph1{grid-row:span 2}
.quote-block{padding:40px;border:1px solid var(--line-strong);position:relative;min-height:320px;display:flex;align-items:flex-end}
.quote-block span{position:absolute;top:-30px;left:24px;font-family:var(--font-display);font-size:180px;line-height:1;color:var(--ink)}
.quote-block p{font-family:var(--font-display);font-size:34px;line-height:1.15;color:var(--fg-strong)}
.cards{grid-template-columns:1fr;gap:0;border-top:1px solid var(--line-strong)}
.card{flex-direction:row;align-items:center;gap:36px;background:transparent;border:none;border-bottom:1px solid var(--line-strong);border-radius:0;padding:34px 0}
.card:hover{transform:none;box-shadow:none;background:var(--surface)}
.card .num{position:static;font-size:15px;width:40px;color:var(--ink)}
.card-ico{display:none}
.card h3{font-size:clamp(28px,3vw,40px);margin:0;flex:0 0 38%}
.card p{flex:1}.card .more{margin:0;white-space:nowrap}
.steps li,.bento-item,blockquote{background:transparent;border:1px solid var(--line-strong)}
.step-n{background:transparent;color:var(--ink);border:1px solid var(--ink);font-family:var(--font-display);font-size:22px}
.marquee span{font-style:italic}
.btn-primary{box-shadow:none}
@media (max-width:960px){.ed-grid{grid-template-columns:1fr}.card{flex-wrap:wrap;gap:12px}.card h3{flex:1 1 100%}}
`,
  impacto: `
body{--font-display:Syne,system-ui,sans-serif;--font-body:Inter,system-ui,sans-serif;--bg:#050505;--bg-alt:#0d0d0d;--fg:#cfcfcf;--fg-strong:#ffffff;--fg-muted:#9a9a9a;--fg-faint:#555;--line:rgba(255,255,255,.1);--line-strong:rgba(255,255,255,.22);--surface:#101010;--surface-strong:rgba(16,16,16,.85);--nav-bg:rgba(5,5,5,.8);--badge-bg:transparent;--badge-fg:var(--a);--hl:var(--a);--marquee-bg:var(--a);--radius:18px;--radius-lg:24px;--radius-btn:999px;--shadow-hover:0 0 0 1px var(--a),0 30px 60px -30px var(--a);--bento-hl:var(--a);--bento-hl-fg:#050505;--final-bg:var(--a);--final-fg:#050505;--final-btn:#050505;--final-btn-fg:#fff;--map-filter:invert(.92) hue-rotate(180deg) saturate(.4)}
h1,h2{text-transform:uppercase;font-weight:800;letter-spacing:-.03em}
.hero h1{line-height:.9;margin:26px 0 34px}.hero h1.t-s{font-size:clamp(48px,11vw,160px)}.hero h1.t-m{font-size:clamp(40px,7.5vw,110px)}.hero h1.t-l{font-size:clamp(34px,5.5vw,80px)}
.logo-img{background:#fff;padding:5px 9px;border-radius:10px}
.hero h1 em{color:transparent;-webkit-text-stroke:2px var(--a)}
.grid-bg{position:absolute;inset:0;background-image:linear-gradient(var(--line) 1px,transparent 1px),linear-gradient(90deg,var(--line) 1px,transparent 1px);background-size:64px 64px;mask-image:radial-gradient(70% 60% at 50% 30%,#000,transparent);-webkit-mask-image:radial-gradient(70% 60% at 50% 30%,#000,transparent)}
.hero .wrap{position:relative;z-index:2}
.badge{border:1px solid var(--a)}
.imp-grid{display:grid;grid-template-columns:1fr 1fr;gap:50px;align-items:end}
.duo{border-radius:var(--radius-lg);overflow:hidden;aspect-ratio:4/3;position:relative}
.duo img{width:100%;height:100%;object-fit:cover;filter:grayscale(1) contrast(1.1)}
.duo::after{content:"";position:absolute;inset:0;background:var(--a);mix-blend-mode:multiply;opacity:.55}
.marquee span{color:#050505;text-transform:uppercase;font-weight:800}.marquee i{color:#050505}
.btn-primary{background:var(--a);color:#050505;box-shadow:0 0 40px -10px var(--a)}
.float-wa{background:var(--a);color:#050505}
.card-ico{background:transparent;border:1px solid var(--a);color:var(--a)}
.card .num{color:var(--a)}
.step-n{background:var(--a);color:#050505}
.stat b{color:var(--a)}
@media (max-width:960px){.imp-grid{grid-template-columns:1fr}}
`,
};

const SCRIPT = `
(function(){
  var nav=document.getElementById('nav');
  function onScroll(){ if(nav){ nav.classList.toggle('scrolled', window.scrollY>30); } }
  window.addEventListener('scroll',onScroll,{passive:true}); onScroll();
  var els=document.querySelectorAll('.rv');
  if(!('IntersectionObserver' in window)){ els.forEach(function(e){e.classList.add('in')}); return; }
  var io=new IntersectionObserver(function(entries){ entries.forEach(function(en){ if(en.isIntersecting){ en.target.classList.add('in'); io.unobserve(en.target); } }); },{threshold:.12,rootMargin:'0px 0px -40px 0px'});
  els.forEach(function(e){ io.observe(e); });
  setTimeout(function(){ document.querySelectorAll('.hero .rv').forEach(function(e){ e.classList.add('in'); }); }, 60);
})();
`;
