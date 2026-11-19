import { NextRequest } from "next/server";
import { requireOwner } from "@/lib/require-owner";
import { createRuntimeClient } from "@/lib/runtime-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Contas que o navegador de pesquisa do app usa (Instagram e WhatsApp Web).
export async function GET() {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;
  const client = createRuntimeClient();
  if (!(await client.available())) return Response.json({ desktop: false });
  try {
    const status = (await client.call("/runtime/research/status", {}, 60_000)) as Record<string, unknown>;
    return Response.json({ desktop: true, ...status });
  } catch (err) {
    return Response.json({ desktop: true, error: err instanceof Error ? err.message : String(err) });
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
    if (body.action === "connect" && (body.service === "instagram" || body.service === "whatsapp")) {
      await client.call("/runtime/research/connect", { service: body.service }, 90_000);
      return Response.json({ ok: true, opened: body.service });
    }
    return Response.json({ error: "Ação inválida" }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
