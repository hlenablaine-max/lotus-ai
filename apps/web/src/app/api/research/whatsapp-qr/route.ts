import { requireOwner } from "@/lib/require-owner";
import { createRuntimeClient } from "@/lib/runtime-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A tela pergunta a cada poucos segundos: devolve o QR code atual ou "connected" quando o celular leu.
export async function GET() {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;
  const client = createRuntimeClient();
  if (!(await client.available())) return Response.json({ error: "Abra o aplicativo LOTUS neste computador." }, { status: 503 });
  try {
    return Response.json(await client.call("/runtime/research/whatsapp-qr", {}, 90_000));
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

// Fecha o WhatsApp Web que ficou aberto para o QR code.
export async function DELETE() {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;
  const client = createRuntimeClient();
  if (!(await client.available())) return Response.json({ closed: false });
  return Response.json(await client.call("/runtime/research/whatsapp-qr-stop", {}, 30_000).catch(() => ({ closed: false })));
}
