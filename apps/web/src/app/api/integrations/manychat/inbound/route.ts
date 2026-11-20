import { NextRequest } from "next/server";
import { ingestManychat } from "@/lib/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// O ManyChat entrega aqui cada DM do Instagram (ação External Request), com o token secreto no endereço.
// Sem login: quem protege é o token, que é único por cliente.
export async function POST(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("t") ?? "";
  if (token.length < 16) return Response.json({ error: "Não autorizado" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const r = await ingestManychat(token, body);
  if (!r.ok && r.reason === "token inválido") return Response.json({ error: "Não autorizado" }, { status: 401 });
  return Response.json(r);
}
