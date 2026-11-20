// Fotos profissionais de banco de imagens (Pexels: uso comercial livre, sem exigir crédito).
// Precisa da chave gratuita do Pexels em Integrações. Sem chave, o site usa só as fotos do cliente.
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { integrationValue } from "@lotus/ai-engine";

const CACHE_DIR = path.join(os.homedir(), "LOTUS_Workspace", "banco-de-imagens");

export interface StockPhoto {
  file: string; // caminho local
  alt: string;
  width: number;
  height: number;
  photographer: string;
  source: string;
}

export function pexelsKey(): string {
  return integrationValue("pexels", "apiKey", "PEXELS_API_KEY");
}

async function search(query: string, perPage: number, key: string): Promise<Array<{ id: number; alt: string; width: number; height: number; photographer: string; url: string; src: string }>> {
  const res = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${perPage}&orientation=portrait&size=large`, {
    headers: { Authorization: key },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Pexels respondeu ${res.status}`);
  const data = (await res.json()) as { photos?: Array<{ id: number; alt: string; width: number; height: number; photographer: string; url: string; src: Record<string, string> }> };
  return (data.photos ?? []).map((p) => ({ id: p.id, alt: p.alt, width: p.width, height: p.height, photographer: p.photographer, url: p.url, src: p.src.large2x || p.src.original }));
}

// Busca e baixa (com cache) algumas fotos para cada tema. Nunca lança erro: sem foto, segue sem.
export async function stockPhotosFor(queries: string[], perQuery = 2): Promise<StockPhoto[]> {
  const key = pexelsKey();
  if (!key) return [];
  const out: StockPhoto[] = [];
  for (const query of queries) {
    try {
      const results = await search(query, perQuery + 2, key);
      for (const r of results.slice(0, perQuery)) {
        const file = path.join(CACHE_DIR, `pexels-${r.id}.jpg`);
        if (!fs.existsSync(file)) {
          const img = await fetch(r.src, { signal: AbortSignal.timeout(30_000) });
          if (!img.ok) continue;
          fs.mkdirSync(CACHE_DIR, { recursive: true });
          fs.writeFileSync(file, Buffer.from(await img.arrayBuffer()));
        }
        out.push({ file, alt: r.alt || query, width: r.width, height: r.height, photographer: r.photographer, source: r.url });
      }
    } catch (err) {
      console.warn("[stock] busca falhou:", query, err instanceof Error ? err.message : err);
    }
  }
  return out;
}

export async function testPexels(key: string): Promise<{ ok: boolean; message: string }> {
  try {
    const r = await search("smile", 1, key);
    return r.length ? { ok: true, message: "Chave do Pexels funcionando." } : { ok: false, message: "A busca não trouxe fotos." };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}
