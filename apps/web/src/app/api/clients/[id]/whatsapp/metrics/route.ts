import { NextRequest } from "next/server";
import { requireOwner } from "@/lib/require-owner";
import { whatsappMetrics } from "@/lib/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TZ = "America/Sao_Paulo";

// Começo do dia de hoje no horário de Brasília
function startOfToday(): Date {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: TZ }).format(now);
  return new Date(`${parts}T00:00:00-03:00`);
}

// Painel do atendimento: hoje, 7 dias, 30 dias ou o mês
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;
  const { id } = await params;
  const periodo = request.nextUrl.searchParams.get("periodo") ?? "hoje";
  const canalParam = request.nextUrl.searchParams.get("canal");
  const canal = canalParam === "whatsapp" || canalParam === "instagram" ? canalParam : null;
  const today = startOfToday();
  const to = new Date(Date.now() + 60_000);
  let from = today;
  if (periodo === "ontem") {
    from = new Date(today.getTime() - 86_400_000);
    return Response.json(await whatsappMetrics(id, from, today, canal));
  }
  if (periodo === "7d") from = new Date(today.getTime() - 6 * 86_400_000);
  if (periodo === "30d") from = new Date(today.getTime() - 29 * 86_400_000);
  if (periodo === "mes") {
    const ym = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", timeZone: TZ }).format(new Date());
    from = new Date(`${ym}-01T00:00:00-03:00`);
  }
  return Response.json(await whatsappMetrics(id, from, to, canal));
}
