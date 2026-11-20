// Referências do Awwwards (a premiação dos melhores sites do mundo) para o criador de sites da LOTUS.
// Antes de cada site, a LOTUS pega os premiados mais recentes da categoria do nicho (saúde, esporte, comida...),
// baixa a imagem de cada um e entrega ao diretor de arte como padrão de nível. Não é para copiar:
// são sites reais de outras empresas. É para mirar o mesmo acabamento (tipografia, respiro, hierarquia, movimento).
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

export interface AwwwardsRef {
  slug: string;
  title: string;
  page: string; // página do site no Awwwards
  siteUrl: string | null; // URL do site ORIGINAL (para baixar o HTML e estudar o motion)
  tags: string[];
  award: string | null;
  image: string | null; // arquivo local da imagem do site
  html: string | null; // arquivo local com o HTML original baixado (para o agente clonar a estrutura)
  motion: boolean; // true se tem tags de animation / interaction / GSAP / Framer / WebGL / infinite scroll
  motionSignals: string | null; // resumo extraído do HTML original: frameworks, técnicas, fontes, cores, estrutura
}

const CACHE_DIR = path.join(os.homedir(), "LOTUS_Workspace", "referencias-awwwards");
const WEEK = 7 * 86_400_000;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";

// Nicho da LOTUS -> categorias do Awwwards (a primeira é a principal)
const CATEGORY: Record<string, string[]> = {
  odonto: ["health"],
  estetica: ["health", "fashion"],
  medico: ["health"],
  terapias: ["health"],
  fitness: ["sports", "health"],
  "marca-pessoal": ["business-corporate"],
  juridico: ["business-corporate", "institutions"],
  geral: ["business-corporate"],
};
// Etiquetas que indicam site de app/loja/jogo, pouco úteis como referência para um site de clínica
const OFF_TOPIC = /mobile & apps|e-commerce|games|crypto|nft|web3/i;
// Etiquetas que indicam motion design / interação avançada — são as que o Ícaro quer priorizar:
// sites com movimento e identidade forte, o padrão "futurista diferencial" que a LOTUS clona.
const MOTION = /animation|gsap|framer|webgl|three|interaction|gestures|infinite scroll|scrolling|micro-interaction|creative coding/i;

const decode = (s: string) => s.replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#039;/g, "'").replace(/\\\//g, "/");

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" }, signal: AbortSignal.timeout(25_000) });
  if (!res.ok) throw new Error(`Awwwards respondeu ${res.status}`);
  return res.text();
}

// Lê a lista de premiados de uma categoria (cada card traz um JSON com nome, imagem e etiquetas)
// Também extrai o link do site ORIGINAL (para baixar o HTML e estudar o motion)
export function parseListing(html: string): Array<{ slug: string; title: string; thumb: string | null; tags: string[]; award: string | null; siteUrl: string | null }> {
  const out: Array<{ slug: string; title: string; thumb: string | null; tags: string[]; award: string | null; siteUrl: string | null }> = [];
  const re = /data-collectable-model-value="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      const data = JSON.parse(decode(m[1])) as { slug?: string; title?: string; images?: { thumbnail?: string }; tags?: string[]; type?: string };
      if (!data.slug || !data.title || data.type !== "submission") continue;
      // O selo (SOTD, Honorable Mention...) e o link do site original ficam dentro do próprio card
      const nextCard = html.indexOf("data-collectable-model-value=", m.index + 30);
      const card = html.slice(m.index, nextCard > 0 ? nextCard : m.index + 8000);
      const award = card.match(/<strong[^>]*>\s*(Site of the Day|Site of the Month|Site of the Year|Honorable Mention|Developer Award)\s*<\/strong>/i)?.[1] ?? null;
      // O link do site real é o único href que não aponta para awwwards.com
      const siteUrl = card.match(/href="(https?:\/\/(?!www\.awwwards|awwwards)[^"]+)"/)?.[1] ?? null;
      if (out.some((o) => o.slug === data.slug)) continue;
      out.push({ slug: data.slug, title: data.title, thumb: data.images?.thumbnail ?? null, tags: data.tags ?? [], award, siteUrl });
    } catch {
      // card em outro formato: ignora
    }
  }
  return out;
}

async function download(thumb: string, file: string): Promise<boolean> {
  // Versão 880x660: boa para enxergar o design sem pesar
  const url = `https://assets.awwwards.com/awards/media/cache/thumb_880_660/${thumb}`;
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(25_000) });
  if (!res.ok) return false;
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 5_000 || buf.length > 2_400_000) return false;
  fs.writeFileSync(file, buf);
  return true;
}

// Baixa o HTML ORIGINAL do site premiado, para o agente de web clonar a estrutura/motion por cima.
// Guarda só a página inicial (o suficiente para estudar grid, tipografia, animações e ritmo).
async function downloadHtml(siteUrl: string, file: string): Promise<boolean> {
  try {
    const res = await fetch(siteUrl, { headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" }, redirect: "follow", signal: AbortSignal.timeout(30_000) });
    if (!res.ok) return false;
    const text = await res.text();
    // HTML muito pequeno (landing mínima) ou gigante (SPA montada em JS) não servem como molde
    if (text.length < 2_000 || text.length > 1_200_000) return false;
    fs.writeFileSync(file, text, "utf-8");
    return true;
  } catch {
    return false;
  }
}

// Extrai do HTML original os SINAIS DE MOTION e a estrutura visual — é isso que o agente de web
// usa para clonar o "feeling" do site premiado e modelar por cima para o cliente.
// Devolve um resumo curto (máx ~1500 chars) com: frameworks de animação, técnicas de scroll,
// estrutura de seções, fontes usadas e paleta de cores.
export function extractMotionSignals(htmlFile: string): string | null {
  let html: string;
  try {
    html = fs.readFileSync(htmlFile, "utf-8");
  } catch {
    return null;
  }

  const signals: string[] = [];

  // Frameworks / bibliotecas de animação
  const frameworks: Array<[RegExp, string]> = [
    [/gsap|greensock/i, "GSAP (GreenSock)"],
    [/framer-motion|framer\.io/i, "Framer Motion"],
    [/three\.js|three@/i, "Three.js (WebGL 3D)"],
    [/barba\.js|barba/i, "Barba.js (transições entre páginas)"],
    [/lenis|smooth-scroll/i, "Lenis (smooth scroll)"],
    [/swiper|swiperjs/i, "Swiper (carrossel)"],
    [/locomotive-scroll|locomotive/i, "Locomotive Scroll"],
    [/lottie/i, "Lottie (animações JSON)"],
    [/anime\.js|anm-]/i, "Anime.js"],
    [/p5\.js/i, "p5.js (generative art)"],
    [/spline/i, "Spline (3D interativo)"],
    [/r3f|react-three-fiber/i, "React Three Fiber"],
    [/lottie-web|lottie-light/i, "Lottie Web"],
    [/glfx|gl-anim/i, "Custom WebGL/GLSL shaders"],
    [/view-transition/i, "View Transitions API (nativo)"],
  ];
  const foundFrameworks = frameworks.filter(([re]) => re.test(html)).map(([, name]) => name);
  if (foundFrameworks.length) signals.push(`Frameworks de animação: ${foundFrameworks.join(", ")}`);

  // Técnicas de scroll / interação
  const techniques: Array<[RegExp, string]> = [
    [/scroll-trigger|scrollTrigger/i, "scroll-trigger (animação ligada ao scroll)"],
    [/data-scroll|scroll-section/i, "seções com scroll parallax"],
    [/parallax/i, "efeito parallax"],
    [/infinite.?scroll/i, "infinite scroll"],
    [/intersectionobserver|intersection-observer/i, "IntersectionObserver (reveal on scroll)"],
    [/requestanimationframe|rAF/i, "requestAnimationFrame (animação por frame)"],
    [/transition:/i, "CSS transitions"],
    [/@keyframes|animation:/i, "CSS keyframes/animations"],
    [/transform:\s*translate|translateY|translateX/i, "transform translate (movimento)"],
    [/clip-path/i, "clip-path (revelação de conteúdo)"],
    [/backdrop-filter/i, "backdrop-filter (efeito glassmorphism)"],
    [/perspective:/i, "perspective 3D em CSS"],
    [/mix-blend-mode/i, "mix-blend-mode (mistura de camadas)"],
    [/cursor|custom-cursor/i, "cursor customizado"],
    [/magnetic/i, "botões magnéticos"],
    [/text-split|split-text|splitText/i, "split text (letras animadas individualmente)"],
    [/mask-image|webkit-mask/i, "máscara de imagem (revelação)"],
  ];
  const foundTechs = techniques.filter(([re]) => re.test(html)).map(([, name]) => name);
  if (foundTechs.length) signals.push(`Técnicas visuais: ${foundTechs.join(", ")}`);

  // Fontes (Google Fonts ou @font-face)
  const fontFamilies = [...new Set([...html.matchAll(/font-family:\s*['"]?([^;'"]+)/gi)].map((m) => m[1].trim()))].slice(0, 6);
  if (fontFamilies.length) signals.push(`Fontes no original: ${fontFamilies.join(" | ")}`);

  // Cores (variáveis CSS)
  const colorVars = [...new Set([...html.matchAll(/--[\w-]+\s*:\s*(#[0-9a-fA-F]{3,8}|hsl\([^)]+\))/g)].map((m) => m[1]))].slice(0, 8);
  if (colorVars.length) signals.push(`Paleta no original: ${colorVars.join(", ")}`);

  // Estrutura de seções (headings h1/h2)
  const headings = [...html.matchAll(/<(h[12])[^>]*>([^<]{3,80})<\/h[12]>/gi)].map((m) => m[2].trim()).slice(0, 10);
  if (headings.length) signals.push(`Estrutura de seções (títulos): ${headings.join(" → ")}`);

  // Total de scripts e links CSS (indica complexidade)
  const scriptCount = (html.match(/<script/gi) ?? []).length;
  const linkCount = (html.match(/<link[^>]*stylesheet/gi) ?? []).length;
  signals.push(`Complexidade: ${scriptCount} scripts, ${linkCount} stylesheets`);

  if (!signals.length) return null;
  return signals.join("\n").slice(0, 1500);
}

async function category(slug: string): Promise<AwwwardsRef[]> {
  const dir = path.join(CACHE_DIR, slug);
  const index = path.join(dir, "index.json");
  try {
    if (fs.existsSync(index) && Date.now() - fs.statSync(index).mtimeMs < WEEK) {
      const cached = JSON.parse(fs.readFileSync(index, "utf-8")) as AwwwardsRef[];
      if (cached.length) return cached;
    }
  } catch {
    // cache estragado: busca de novo
  }
  fs.mkdirSync(dir, { recursive: true });
  const cards = parseListing(await fetchText(`https://www.awwwards.com/websites/${slug}/`));
  // Tira os off-topic para o fim e, entre os relevantes, PRIORIZA os com motion/interação
  // (é o padrão "futurista diferencial" que a LOTUS clona)
  const relevant = [
    ...cards.filter((c) => !c.tags.some((t) => OFF_TOPIC.test(t)) && c.tags.some((t) => MOTION.test(t))),
    ...cards.filter((c) => !c.tags.some((t) => OFF_TOPIC.test(t)) && !c.tags.some((t) => MOTION.test(t))),
    ...cards.filter((c) => c.tags.some((t) => OFF_TOPIC.test(t))),
  ];
  const refs: AwwwardsRef[] = [];
  for (const c of relevant.slice(0, 8)) {
    let image: string | null = null;
    if (c.thumb) {
      const ext = path.extname(c.thumb).toLowerCase() || ".png";
      const file = path.join(dir, `${c.slug}${ext}`);
      if (fs.existsSync(file) || (await download(c.thumb, file).catch(() => false))) image = file;
    }
    // Baixa o HTML original do site premiado (para o agente clonar a estrutura por cima)
    let htmlFile: string | null = null;
    if (c.siteUrl) {
      const htmlPath = path.join(dir, `${c.slug}.html`);
      if (!fs.existsSync(htmlPath)) await downloadHtml(c.siteUrl, htmlPath).catch(() => false);
      if (fs.existsSync(htmlPath)) htmlFile = htmlPath;
    }
    // Extrai os sinais de motion/estrutura do HTML original para o agente clonar o "feeling"
    const motionSignals = htmlFile ? extractMotionSignals(htmlFile) : null;
    refs.push({
      slug: c.slug,
      title: c.title,
      page: `https://www.awwwards.com/sites/${c.slug}`,
      siteUrl: c.siteUrl ?? null,
      tags: c.tags.slice(0, 8),
      award: c.award,
      image,
      html: htmlFile,
      motion: c.tags.some((t) => MOTION.test(t)),
      motionSignals,
    });
  }
  fs.writeFileSync(index, JSON.stringify(refs, null, 1));
  return refs;
}

// Até `count` referências premiadas para o nicho, com imagem e (quando possível) o HTML original.
// Prioriza as com motion + HTML já baixado (são as que o agente consegue clonar de verdade).
// Nunca derruba a criação do site: sem internet, volta vazio.
export async function awwwardsReferences(segmentId: string, count = 3): Promise<AwwwardsRef[]> {
  const cats = CATEGORY[segmentId] ?? CATEGORY.geral;
  const all: AwwwardsRef[] = [];
  for (const cat of cats) {
    try {
      for (const r of await category(cat)) {
        if (!all.some((p) => p.slug === r.slug)) all.push(r);
      }
    } catch (err) {
      console.warn("[awwwards] categoria indisponível:", cat, err instanceof Error ? err.message : err);
    }
  }
  // Ordem: (1) tem HTML original + motion, (2) tem HTML, (3) só imagem. Dentro de cada grupo, mantém a ordem de premiação/motion da categoria.
  const rank = (r: AwwwardsRef) => (r.html && r.motion ? 0 : r.html ? 1 : r.image ? 2 : 3);
  return [...all].sort((a, b) => rank(a) - rank(b)).filter((r) => r.image).slice(0, count);
}

export function awwwardsCategoryLabel(segmentId: string): string {
  return (CATEGORY[segmentId] ?? CATEGORY.geral).map((c) => `awwwards.com/websites/${c}`).join(" e ");
}
