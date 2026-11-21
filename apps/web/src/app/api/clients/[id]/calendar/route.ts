import { NextRequest } from "next/server";
import { requireOwner } from "@/lib/require-owner";
import { calendarBusy, calendarStatus, connectIcs, disconnectCalendar, googleConnectLink } from "@/lib/clinic-calendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Agenda da clínica: situação e os próximos horários ocupados (para conferir que a leitura está certa)
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;
  const { id } = await params;
  const status = await calendarStatus(id);
  const now = Date.now();
  const busy = status.status === "conectado" ? (await calendarBusy(id, now, now + 7 * 86_400_000)).slice(0, 12) : [];
  return Response.json({ ...status, busy: busy.map((b) => ({ start: new Date(b.start).toISOString(), end: new Date(b.end).toISOString() })) });
}

// { action: "ics", url } | { action: "google-link" } | { action: "desconectar" }
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;
  const { id } = await params;
  const b = (await request.json().catch(() => ({}))) as { action?: string; url?: string };
  try {
    if (b.action === "ics") return Response.json(await connectIcs(id, String(b.url ?? "")));
    if (b.action === "google-link") return Response.json({ link: await googleConnectLink(id) });
    if (b.action === "desconectar") {
      await disconnectCalendar(id);
      return Response.json({ ok: true });
    }
    return Response.json({ error: "Ação inválida" }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
