import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/require-owner";
import { createRuntimeClient } from "@/lib/runtime-client";
import { SOURCES } from "@/lib/crm";
import { defaultSettings, getLinks, getSettings, waLink, type AutomationSettings, type TrackedLink } from "@/lib/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface LiveStatus {
  state: string;
  qrImage: string | null;
  phone: string | null;
  name: string | null;
  lastError: string | null;
  savedSession?: boolean;
}

async function live(clientId: string): Promise<LiveStatus | null> {
  const rt = createRuntimeClient();
  if (!(await rt.available())) return null;
  return (await rt.call("/runtime/wa/status", { clientId }, 15_000).catch(() => null)) as LiveStatus | null;
}

// Estado do WhatsApp do cliente: conexão (com o QR code quando está esperando), links rastreados e automações
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;
  const { id } = await params;
  const [channel, status, links, settings] = await Promise.all([
    prisma.whatsappChannel.findUnique({ where: { clientId: id } }),
    live(id),
    getLinks(id),
    getSettings(id),
  ]);
  // O estado real vem do app de PC; o banco guarda o último que ele avisou
  if (status && channel && ((status.state === "conectado") !== (channel.status === "conectado")) && status.state !== "conectando" && status.state !== "qr") {
    await prisma.whatsappChannel.update({ where: { clientId: id }, data: { status: status.state === "conectado" ? "conectado" : "desconectado", ...(status.phone ? { phone: status.phone } : {}) } }).catch(() => undefined);
  }
  const phone = status?.phone ?? channel?.phone ?? null;
  return Response.json({
    runtimeOnline: status !== null,
    status: status ?? { state: channel?.status ?? "desconectado", qrImage: null, phone, name: channel?.displayName ?? null, lastError: null },
    channel: channel ? { phone: channel.phone, displayName: channel.displayName, connectedAt: channel.connectedAt, lastEventAt: channel.lastEventAt } : null,
    links: links.map((l) => ({ ...l, url: phone ? waLink(phone, l.text) : null })),
    settings,
  });
}

// Conectar (gera o QR code), desconectar ou desligar de vez o aparelho
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { action?: string };
  const rt = createRuntimeClient();
  if (!(await rt.available())) return Response.json({ error: "Abra o aplicativo LOTUS neste computador para conectar o WhatsApp." }, { status: 503 });
  const exists = await prisma.client.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return Response.json({ error: "Cliente não encontrado" }, { status: 404 });
  try {
    if (body.action === "connect") {
      await prisma.whatsappChannel.upsert({ where: { clientId: id }, create: { clientId: id, status: "desconectado" }, update: {} });
      return Response.json(await rt.call("/runtime/wa/connect", { clientId: id }, 60_000));
    }
    if (body.action === "disconnect" || body.action === "logout") {
      await rt.call("/runtime/wa/disconnect", { clientId: id, logout: body.action === "logout" }, 30_000);
      await prisma.whatsappChannel.updateMany({ where: { clientId: id }, data: { status: "desconectado" } });
      return Response.json({ ok: true });
    }
    return Response.json({ error: "Ação inválida" }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

// Salva os links rastreados (saudação de cada canal) e as automações
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { links?: TrackedLink[]; settings?: Partial<AutomationSettings> };
  const data: Record<string, unknown> = {};
  if (Array.isArray(body.links)) {
    const clean = body.links
      .filter((l) => l && typeof l.text === "string" && l.text.trim() && (SOURCES as readonly string[]).includes(l.source))
      .slice(0, 40)
      .map((l, i) => ({
        id: String(l.id || `link${Date.now().toString(36)}${i}`).slice(0, 40),
        label: String(l.label || l.source).slice(0, 80),
        source: l.source,
        campaign: l.campaign ? String(l.campaign).slice(0, 80) : null,
        text: l.text.trim().slice(0, 300),
      }));
    // Duas saudações iguais deixariam a origem ambígua
    const texts = new Set<string>();
    for (const l of clean) {
      const k = l.text.toLowerCase();
      if (texts.has(k)) return Response.json({ error: `Há duas saudações iguais ("${l.text}"). Cada link precisa de um texto diferente.` }, { status: 400 });
      texts.add(k);
    }
    data.links = clean;
  }
  if (body.settings && typeof body.settings === "object") {
    const merged = { ...defaultSettings(), ...(await getSettings(id)), ...body.settings };
    merged.porHora = Math.min(60, Math.max(1, Number(merged.porHora) || 20));
    merged.janela = { inicio: Math.min(23, Math.max(0, Number(merged.janela?.inicio) || 8)), fim: Math.min(24, Math.max(1, Number(merged.janela?.fim) || 20)) };
    data.settings = merged;
  }
  await prisma.whatsappChannel.upsert({ where: { clientId: id }, create: { clientId: id, status: "desconectado", ...data }, update: data });
  return Response.json({ ok: true });
}
