import { requireOwner } from "@/lib/require-owner";
import { funnelHealth, LOTUS_GOALS, RATE_LABEL } from "@/lib/funnel-health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Saúde do funil (últimos 30 dias): taxas da clínica, média do segmento e onde está vazando
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;
  const { id } = await params;
  return Response.json({ ...(await funnelHealth(id, 30)), goals: LOTUS_GOALS, labels: RATE_LABEL });
}
