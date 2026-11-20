// Foto de cada cliente = foto de perfil do Instagram dele, em alta, guardada neste computador.
// É buscada sozinha na primeira vez que o cliente aparece no app (uma de cada vez, em segundo plano).
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { prisma } from "@/lib/prisma";
import { createRuntimeClient } from "@/lib/runtime-client";

const DIR = path.join(os.homedir(), "LOTUS_Workspace", "avatars", "clientes");
const FAIL_TTL = 6 * 60 * 60_000; // não tenta de novo por 6 h quem falhou

const state = globalThis as unknown as { __lotusAvatarQueue?: Promise<unknown>; __lotusAvatarPending?: Set<string>; __lotusAvatarFailed?: Map<string, number> };
const pending = (state.__lotusAvatarPending ??= new Set<string>());
const failed = (state.__lotusAvatarFailed ??= new Map<string, number>());

export function clientAvatarPath(clientId: string): string {
  return path.join(DIR, `${clientId.replace(/[^a-z0-9_-]/gi, "")}.jpg`);
}

export function instagramHandle(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  const fromUrl = v.match(/instagram\.com\/([a-z0-9._]+)/i)?.[1];
  const handle = (fromUrl ?? v).replace(/^@/, "").replace(/\/.*$/, "").trim();
  return /^[a-z0-9._]{2,30}$/i.test(handle) ? handle : null;
}

// Guarda uma foto já baixada (ex.: no Diagnóstico 360) como foto do cliente
export function saveClientAvatar(clientId: string, sourceFile: string): void {
  try {
    if (!fs.existsSync(sourceFile)) return;
    fs.mkdirSync(DIR, { recursive: true });
    fs.copyFileSync(sourceFile, clientAvatarPath(clientId));
  } catch {
    /* sem foto, o app mostra as iniciais */
  }
}

// Coloca o cliente na fila para buscar a foto (não espera)
export function queueClientAvatar(clientId: string): void {
  if (pending.has(clientId) || fs.existsSync(clientAvatarPath(clientId))) return;
  const lastFail = failed.get(clientId);
  if (lastFail && Date.now() - lastFail < FAIL_TTL) return;
  pending.add(clientId);
  state.__lotusAvatarQueue = (state.__lotusAvatarQueue ?? Promise.resolve())
    .then(async () => {
      const client = await prisma.client.findUnique({ where: { id: clientId }, select: { instagram: true } });
      const handle = instagramHandle(client?.instagram);
      if (!handle) throw new Error("sem instagram");
      const runtime = createRuntimeClient();
      if (!(await runtime.available())) throw new Error("app desktop fechado");
      const result = (await runtime.call("/runtime/research/avatar", { handle, outFile: clientAvatarPath(clientId) }, 90_000)) as { file?: string | null };
      if (!result?.file) throw new Error("foto não encontrada");
    })
    .catch(() => failed.set(clientId, Date.now()))
    .finally(() => pending.delete(clientId));
}
