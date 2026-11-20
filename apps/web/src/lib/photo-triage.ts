// Triagem das fotos REAIS do cliente antes do site: a IA olha cada uma e diz se é foto de verdade
// (paciente, profissional, equipe, clínica) ou arte de post com texto (pôster, promoção, convite, print com legenda).
// Arte com texto não entra no site; as fotos boas ganham uma descrição clara para o diretor de arte.
import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { registry, type AIImage } from "@lotus/ai-engine";

export interface PhotoVerdict {
  temTexto: boolean; // tem letreiro, legenda, logo grande ou arte gráfica por cima
  tipo: "paciente" | "profissional" | "equipe" | "ambiente" | "evento" | "procedimento" | "arte" | "outro";
  nota: number; // 1 a 5: força para um site profissional (nitidez, luz, enquadramento)
  descricao: string; // o que aparece, em poucas palavras
}

const CACHE_FILE = path.join(os.homedir(), "LOTUS_Workspace", "fotos-triagem.json");

function key(file: string): string {
  const st = fs.statSync(file);
  return crypto.createHash("sha1").update(`${file}|${st.size}|${st.mtimeMs}`).digest("hex");
}

function readCache(): Record<string, PhotoVerdict> {
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8")) as Record<string, PhotoVerdict>;
  } catch {
    return {};
  }
}

const TYPES = new Set(["paciente", "profissional", "equipe", "ambiente", "evento", "procedimento", "arte", "outro"]);

// Devolve o veredito de cada arquivo (os que a IA não conseguir avaliar ficam de fora do mapa)
export async function triagePhotos(files: string[]): Promise<Map<string, PhotoVerdict>> {
  const out = new Map<string, PhotoVerdict>();
  const cache = readCache();
  const pending: string[] = [];
  for (const f of files) {
    if (!fs.existsSync(f)) continue;
    const k = key(f);
    if (cache[k]) out.set(f, cache[k]);
    else pending.push(f);
  }
  // Até 6 imagens por pergunta, para a IA olhar com atenção
  for (let i = 0; i < pending.length; i += 6) {
    const batch = pending.slice(i, i + 6);
    const images: AIImage[] = batch.map((f) => ({
      mediaType: f.toLowerCase().endsWith(".png") ? "image/png" : f.toLowerCase().endsWith(".webp") ? "image/webp" : "image/jpeg",
      data: fs.readFileSync(f).toString("base64"),
    }));
    try {
      const res = await registry.getDefault().complete({
        messages: [
          {
            role: "system",
            content:
              'Você faz a triagem de fotos para o site de uma clínica. Para CADA imagem anexada (na ordem), responda se ela tem TEXTO gráfico por cima (letreiro, legenda de story, título, preço, data, logo grande, arte de pôster/promoção/convite: true) e o tipo: paciente (pessoa atendida sorrindo/posando), profissional (dentista/médico), equipe, ambiente (recepção, consultório, fachada), evento, procedimento (boca aberta, instrumento, cirurgia), arte (pôster/banner/montagem), outro. Nota 1 a 5 para usar num site profissional (nitidez, luz, enquadramento, pessoa bem). Responda SOMENTE JSON: {"fotos":[{"n":1,"temTexto":false,"tipo":"paciente","nota":4,"descricao":"homem sorrindo de boné, fundo escuro"}]}',
          },
          { role: "user", content: `São ${batch.length} imagens, na ordem 1 a ${batch.length}.`, images },
        ],
        maxTokens: 900,
        temperature: 0.1,
      });
      const json = res.content.match(/\{[\s\S]*\}/)?.[0];
      const parsed = json ? (JSON.parse(json) as { fotos?: Array<{ n?: number; temTexto?: boolean; tipo?: string; nota?: number; descricao?: string }> }) : null;
      for (const item of parsed?.fotos ?? []) {
        const f = batch[(item.n ?? 0) - 1];
        if (!f) continue;
        const v: PhotoVerdict = {
          temTexto: !!item.temTexto,
          tipo: (TYPES.has(String(item.tipo)) ? item.tipo : "outro") as PhotoVerdict["tipo"],
          nota: Math.min(5, Math.max(1, Number(item.nota) || 3)),
          descricao: String(item.descricao ?? "").slice(0, 140),
        };
        out.set(f, v);
        cache[key(f)] = v;
      }
    } catch (err) {
      console.warn("[fotos] triagem indisponível:", err instanceof Error ? err.message : err);
    }
  }
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
  } catch {
    // sem cache: na próxima vez a IA olha de novo
  }
  return out;
}

// Foto que pode ir para o site: sem texto por cima, não é arte nem procedimento, e com qualidade mínima
export const usableVerdict = (v: PhotoVerdict | undefined) => !v || (!v.temTexto && v.tipo !== "arte" && v.tipo !== "procedimento" && v.nota >= 3);
