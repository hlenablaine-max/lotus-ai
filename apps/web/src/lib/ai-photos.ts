// Fotos criadas por IA para os sites. Usa o gerador de imagens da Drael (a IA principal da LOTUS);
// se não der, tenta a OpenAI. Usadas no topo e nos serviços quando o cliente não tem fotos boas.
// São ilustrativas: nunca entram em "sobre", equipe ou galeria (o sistema bloqueia).
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { resolveProviderConfig, type AIProviderName } from "@lotus/ai-engine";
import { createRuntimeClient } from "@/lib/runtime-client";

const CACHE_DIR = path.join(os.homedir(), "LOTUS_Workspace", "fotos-ia");

export interface AiPhoto {
  file: string;
  prompt: string;
  width: number;
  height: number;
}

// Estilo comum: parece ensaio fotográfico real, sem texto nem logo
const STYLE =
  "Photorealistic editorial photograph for a premium Brazilian business website. Natural soft light, shallow depth of field, shot on a full-frame camera with a 50mm lens, true-to-life skin texture, authentic Brazilian people, calm confident expressions. Clean, modern, uncluttered composition. Absolutely no text, no letters, no logos, no watermarks, no signage.";

const PROVIDERS: AIProviderName[] = ["drael", "openai"];

export function aiPhotosAvailable(): boolean {
  return PROVIDERS.some((p) => !!resolveProviderConfig(p).apiKey);
}

async function generateWith(provider: AIProviderName, prompt: string, size: string): Promise<Buffer> {
  const { apiKey, baseUrl } = resolveProviderConfig(provider);
  if (!apiKey) throw new Error("sem chave");
  const base = baseUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/images/generations`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gpt-image-1", prompt: `${prompt}\n\n${STYLE}`, size, quality: "medium", n: 1 }),
    signal: AbortSignal.timeout(240_000),
  });
  const data = (await res.json().catch(() => ({}))) as { data?: Array<{ b64_json?: string; url?: string }>; error?: { message?: string } | string };
  if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : data.error?.message ?? `erro ${res.status}`);
  const item = data.data?.[0];
  if (item?.b64_json) return Buffer.from(item.b64_json, "base64");
  if (item?.url) {
    // A Drael devolve um caminho relativo ao próprio servidor
    const img = await fetch(new URL(item.url, new URL(base).origin), { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(60_000) });
    if (!img.ok) throw new Error(`download da imagem: ${img.status}`);
    return Buffer.from(await img.arrayBuffer());
  }
  throw new Error("o gerador não devolveu imagem");
}

async function generateOne(prompt: string, size: string): Promise<Buffer> {
  let last: unknown = null;
  for (const provider of PROVIDERS) {
    // A Drael desenha uma imagem por vez: se ainda estiver ocupada, espera e tenta de novo
    for (let tries = 0; tries < 15; tries++) {
      try {
        return await generateWith(provider, prompt, size);
      } catch (err) {
        last = err;
        const busy = /one image at a time|still drawing|rate limit|429/i.test(err instanceof Error ? err.message : String(err));
        if (busy) {
          await new Promise((r) => setTimeout(r, 12_000));
          continue;
        }
        console.warn(`[fotos-ia] ${provider} falhou:`, err instanceof Error ? err.message : err);
        break;
      }
    }
  }
  throw last instanceof Error ? last : new Error("nenhum gerador de imagem disponível");
}

// Gera (ou reaproveita, se já existem para este negócio) as fotos pedidas, uma de cada vez
// (o gerador não aceita duas ao mesmo tempo). Converte para JPG leve pelo app desktop.
// Nunca lança erro: foto que falhar fica de fora (e é tentada de novo na próxima vez).
export async function aiPhotosFor(key: string, prompts: Array<{ prompt: string; formato: "paisagem" | "retrato" }>): Promise<AiPhoto[]> {
  if (!aiPhotosAvailable() || prompts.length === 0) return [];
  const dir = path.join(CACHE_DIR, key.replace(/[^a-z0-9_-]/gi, "_"));
  fs.mkdirSync(dir, { recursive: true });
  const runtime = createRuntimeClient();
  const canCompress = await runtime.available().catch(() => false);
  const one = async (p: { prompt: string; formato: "paisagem" | "retrato" }, i: number): Promise<AiPhoto | null> => {
      const size = p.formato === "paisagem" ? "1536x1024" : "1024x1536";
      const jpg = path.join(dir, `foto-${i + 1}.jpg`);
      const png = path.join(dir, `foto-${i + 1}.png`);
      try {
        if (!fs.existsSync(jpg) && !fs.existsSync(png)) fs.writeFileSync(png, await generateOne(p.prompt, size));
        if (!fs.existsSync(jpg) && fs.existsSync(png) && canCompress) {
          await runtime.call("/runtime/image/jpeg", { input: png, output: jpg, maxWidth: p.formato === "paisagem" ? 2000 : 1300, quality: 82 }, 60_000);
          fs.rmSync(png, { force: true });
        }
        const file = fs.existsSync(jpg) ? jpg : png;
        const [w, h] = size.split("x").map(Number);
        return { file, prompt: p.prompt, width: w, height: h };
      } catch (err) {
        console.warn("[fotos-ia] foto", i + 1, "falhou:", err instanceof Error ? err.message : err);
        return null;
      }
  };
  const results: Array<AiPhoto | null> = [];
  for (const [i, p] of prompts.entries()) results.push(await one(p, i));
  return results.filter((r): r is AiPhoto => !!r);
}
