import { NextRequest } from "next/server";
import { requireOwner } from "@/lib/require-owner";
import { createRuntimeClient } from "@/lib/runtime-client";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);
const PROFILE_DIR = path.join(os.homedir(), "LOTUS_Workspace", "browser-profile");

// O WhatsApp Web guarda a sessão no armazenamento do próprio site dentro do perfil do navegador de pesquisa
function whatsappSessionSaved(): boolean {
  try {
    const idb = path.join(PROFILE_DIR, "Default", "IndexedDB");
    return fs.existsSync(idb) && fs.readdirSync(idb).some((d) => d.startsWith("https_web.whatsapp.com"));
  } catch {
    return false;
  }
}

// Conta da Vercel onde os sites das clínicas são publicados (consultada uma vez a cada 10 minutos)
const vercelCache = globalThis as unknown as { __lotusVercel?: { at: number; user: string | null } };
async function vercelUser(): Promise<string | null> {
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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Contas que o navegador de pesquisa do app usa (Instagram e WhatsApp Web).
export async function GET() {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;
  const client = createRuntimeClient();
  const extra = { whatsapp: whatsappSessionSaved(), vercel: await vercelUser() };
  if (!(await client.available())) return Response.json({ desktop: false, ...extra });
  try {
    const status = (await client.call("/runtime/research/status", {}, 60_000)) as Record<string, unknown>;
    return Response.json({ desktop: true, ...status, ...extra });
  } catch (err) {
    return Response.json({ desktop: true, ...extra, error: err instanceof Error ? err.message : String(err) });
  }
}

// { action: "connect", service: "instagram" | "whatsapp" } abre a janela de login; { action: "close" } fecha.
export async function POST(request: NextRequest) {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;
  const body = (await request.json().catch(() => ({}))) as { action?: string; service?: string };
  const client = createRuntimeClient();
  if (!(await client.available())) {
    return Response.json({ error: "Abra o aplicativo LOTUS desktop para conectar contas." }, { status: 503 });
  }
  try {
    if (body.action === "close") {
      await client.call("/runtime/research/close", {}, 30_000);
      return Response.json({ ok: true });
    }
    if (body.action === "connect" && (body.service === "instagram" || body.service === "whatsapp" || body.service === "google")) {
      await client.call("/runtime/research/connect", { service: body.service }, 90_000);
      return Response.json({ ok: true, opened: body.service });
    }
    return Response.json({ error: "Ação inválida" }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
