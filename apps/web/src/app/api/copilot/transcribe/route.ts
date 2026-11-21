import { NextRequest } from "next/server";
import { requireOwner } from "@/lib/require-owner";
import { createRuntimeClient } from "@/lib/runtime-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Transcreve um trecho de áudio da call aqui no PC (faster-whisper local, nada sai do computador)
export async function POST(request: NextRequest) {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;
  const body = (await request.json().catch(() => ({}))) as { base64?: string; ext?: string };
  if (!body.base64 || body.base64.length < 200) return Response.json({ text: "" });
  if (body.base64.length > 8 * 1024 * 1024) return Response.json({ error: "Trecho de áudio grande demais" }, { status: 413 });
  const rt = createRuntimeClient();
  if (!(await rt.available())) return Response.json({ error: "Abra o app LOTUS no PC: a transcrição roda nele." }, { status: 503 });
  try {
    const r = (await rt.call("/runtime/transcribe", { base64: body.base64, ext: body.ext ?? "webm", timeoutMs: 60_000 }, 90_000)) as { text?: string; model?: string };
    return Response.json({ text: (r.text ?? "").trim(), model: r.model ?? null });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
