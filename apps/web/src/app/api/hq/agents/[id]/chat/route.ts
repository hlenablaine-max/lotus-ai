import { NextRequest } from "next/server";
import { requireOwner } from "@/lib/require-owner";
import { handleAgentChat } from "@/lib/office-chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Conversa com um agente pelo escritório virtual: { message, history } → { reply, actions }
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { message?: string; history?: Array<{ role: "user" | "assistant"; content: string }> };
  const message = (body.message ?? "").trim();
  if (!message) return Response.json({ error: "Escreva uma mensagem." }, { status: 400 });
  try {
    const history = (body.history ?? []).filter((h) => (h.role === "user" || h.role === "assistant") && typeof h.content === "string");
    return Response.json(await handleAgentChat(id, message, history));
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
