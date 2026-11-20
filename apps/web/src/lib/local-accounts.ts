// Contas guardadas neste computador: sessão do WhatsApp Web no perfil do navegador de pesquisa e login da Vercel.
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);
export const WORKSPACE_DIR = path.join(os.homedir(), "LOTUS_Workspace");
const PROFILE_DIR = path.join(WORKSPACE_DIR, "browser-profile");

// O WhatsApp Web guarda a sessão no armazenamento do próprio site dentro do perfil do navegador de pesquisa
export function whatsappSessionSaved(): boolean {
  try {
    const idb = path.join(PROFILE_DIR, "Default", "IndexedDB");
    return fs.existsSync(idb) && fs.readdirSync(idb).some((d) => d.startsWith("https_web.whatsapp.com"));
  } catch {
    return false;
  }
}

// Conta da Vercel onde os sites das clínicas são publicados (consultada uma vez a cada 10 minutos)
const vercelCache = globalThis as unknown as { __lotusVercel?: { at: number; user: string | null } };
export async function vercelUser(): Promise<string | null> {
  const cached = vercelCache.__lotusVercel;
  if (cached && Date.now() - cached.at < 10 * 60_000) return cached.user;
  let user: string | null = null;
  try {
    const { stdout } = await execAsync("vercel whoami", { timeout: 30_000, windowsHide: true });
    user = stdout.trim().split(/\r?\n/).pop()?.trim() || null;
  } catch {
    user = null;
  }
  vercelCache.__lotusVercel = { at: Date.now(), user };
  return user;
}

// Pastas dentro de ~/LOTUS_Workspace/<nome> (sites publicados, pacotes de entrega)
export function workspaceFolders(name: string): string[] {
  try {
    const dir = path.join(WORKSPACE_DIR, name);
    return fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  } catch {
    return [];
  }
}
