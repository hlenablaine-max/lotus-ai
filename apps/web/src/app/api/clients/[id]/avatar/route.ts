import * as fs from "fs";
import { NextRequest } from "next/server";
import { requireOwner } from "@/lib/require-owner";
import { clientAvatarPath, queueClientAvatar } from "@/lib/client-avatar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Foto do cliente. Se ainda não existe, entra na fila para buscar no Instagram e responde 404 (o app mostra as iniciais).
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;
  const { id } = await params;
  const file = clientAvatarPath(id);
  if (!fs.existsSync(file)) {
    queueClientAvatar(id);
    return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  const body = fs.readFileSync(file);
  const isPng = body[0] === 0x89 && body[1] === 0x50;
  const isWebp = body.toString("ascii", 8, 12) === "WEBP";
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": isPng ? "image/png" : isWebp ? "image/webp" : "image/jpeg",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
