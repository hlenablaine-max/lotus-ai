import { NextRequest } from "next/server";
import { requireOwner } from "@/lib/require-owner";
import { createRuntimeClient } from "@/lib/runtime-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// QR code de um link rastreado (para imprimir na recepção, cartão, panfleto, story)
export async function POST(request: NextRequest) {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;
  const body = (await request.json().catch(() => ({}))) as { url?: string };
  const url = String(body.url ?? "");
  if (!/^https:\/\/wa\.me\/\d+/.test(url)) return Response.json({ error: "Link inválido" }, { status: 400 });
  const rt = createRuntimeClient();
  if (!(await rt.available())) return Response.json({ error: "Abra o aplicativo LOTUS neste computador." }, { status: 503 });
  return Response.json(await rt.call("/runtime/qr", { text: url }, 15_000));
}
