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
  tags: string[];
  award: string | null;
  image: string | null; // arquivo local da imagem do site
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

const decode = (s: string) => s.replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#039;/g, "'").replace(/\\\//g, "/");

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" }, signal: AbortSignal.timeout(25_000) });
  if (!res.ok) throw new Error(`Awwwards respondeu ${res.status}`);
  return res.text();
}

// Lê a lista de premiados de uma categoria (cada card traz um JSON com nome, imagem e etiquetas)
export function parseListing(html: string): Array<{ slug: string; title: string; thumb: string | null; tags: string[]; award: string | null }> {
  const out: Array<{ slug: string; title: string; thumb: string | null; tags: string[]; award: string | null }> = [];
  const re = /data-collectable-model-value="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      const data = JSON.parse(decode(m[1])) as { slug?: string; title?: string; images?: { thumbnail?: string }; tags?: string[]; type?: string };
      if (!data.slug || !data.title || data.type !== "submission") continue;
      // O selo (SOTD, Honorable Mention...) fica dentro do próprio card, antes do card seguinte
      const nextCard = html.indexOf("data-collectable-model-value=", m.index + 30);
      const card = html.slice(m.index, nextCard > 0 ? nextCard : m.index + 8000);
      const award = card.match(/<strong[^>]*>\s*(Site of the Day|Site of the Month|Site of the Year|Honorable Mention|Developer Award)\s*<\/strong>/i)?.[1] ?? null;
      if (out.some((o) => o.slug === data.slug)) continue;
      out.push({ slug: data.slug, title: data.title, thumb: data.images?.thumbnail ?? null, tags: data.tags ?? [], award });
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
  const relevant = [...cards.filter((c) => !c.tags.some((t) => OFF_TOPIC.test(t))), ...cards.filter((c) => c.tags.some((t) => OFF_TOPIC.test(t)))];
  const refs: AwwwardsRef[] = [];
  for (const c of relevant.slice(0, 8)) {
    let image: string | null = null;
    if (c.thumb) {
      const ext = path.extname(c.thumb).toLowerCase() || ".png";
      const file = path.join(dir, `${c.slug}${ext}`);
      if (fs.existsSync(file) || (await download(c.thumb, file).catch(() => false))) image = file;
    }
    refs.push({ slug: c.slug, title: c.title, page: `https://www.awwwards.com/sites/${c.slug}`, tags: c.tags.slice(0, 8), award: c.award, image });
  }
  fs.writeFileSync(index, JSON.stringify(refs, null, 1));
  return refs;
}

// Até `count` referências premiadas para o nicho, com imagem. Nunca derruba a criação do site: sem internet, volta vazio.
export async function awwwardsReferences(segmentId: string, count = 3): Promise<AwwwardsRef[]> {
  const cats = CATEGORY[segmentId] ?? CATEGORY.geral;
  const picked: AwwwardsRef[] = [];
  for (const cat of cats) {
    try {
      for (const r of await category(cat)) {
        if (picked.length >= count) break;
        if (r.image && !picked.some((p) => p.slug === r.slug)) picked.push(r);
      }
    } catch (err) {
      console.warn("[awwwards] categoria indisponível:", cat, err instanceof Error ? err.message : err);
    }
    if (picked.length >= count) break;
  }
  return picked;
}

export function awwwardsCategoryLabel(segmentId: string): string {
  return (CATEGORY[segmentId] ?? CATEGORY.geral).map((c) => `awwwards.com/websites/${c}`).join(" e ");
}
