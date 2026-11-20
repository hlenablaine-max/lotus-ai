import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as crypto from "crypto";
import { NextRequest } from "next/server";
import { ingestEvents, type WaEvent } from "@/lib/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Só o app de PC (mesmo computador, com o token secreto do runtime) pode entregar mensagens aqui.
function validToken(provided: string): boolean {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(os.homedir(), "LOTUS_Workspace", ".runtime-port"), "utf-8")) as { token?: string };
    if (!cfg.token || provided.length !== cfg.token.length) return false;
    return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(cfg.token));
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (!validToken(request.headers.get("x-runtime-token") ?? "")) return Response.json({ error: "Não autorizado" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { events?: WaEvent[] };
  const events = Array.isArray(body.events) ? body.events.slice(0, 500) : [];
  const result = await ingestEvents(events);
  return Response.json(result);
}
