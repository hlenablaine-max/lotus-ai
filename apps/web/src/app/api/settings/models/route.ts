import { NextRequest } from "next/server";
import { registry, PROVIDER_DEFAULTS, type AIProviderName } from "@lotus/ai-engine";
import { requireOwner } from "@/lib/require-owner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lista os modelos que a chave configurada realmente enxerga (serve também como teste da chave).
export async function GET(request: NextRequest) {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;

  const name = new URL(request.url).searchParams.get("provider") as AIProviderName | null;
  if (!name || !(name in PROVIDER_DEFAULTS)) {
    return Response.json({ error: "provider inválido" }, { status: 400 });
  }
  try {
    const models = await registry.get(name).listModels();
    return Response.json({ provider: name, models });
  } catch (err) {
    return Response.json({ provider: name, models: [], error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
