import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/require-owner";
import { SOURCES, STAGES, monthRange, type Source, type Stage } from "@/lib/crm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Leads do cliente (do mês pedido, ou dos últimos 90 dias)
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;
  const { id } = await params;
  const month = request.nextUrl.searchParams.get("month");
  const range = month ? monthRange(month) : { start: new Date(Date.now() - 90 * 86_400_000), end: new Date(Date.now() + 86_400_000) };
  const leads = await prisma.lead.findMany({ where: { clientId: id, createdAt: { gte: range.start, lt: range.end } }, orderBy: { createdAt: "desc" }, take: 500 });
  return Response.json({ leads });
}

interface LeadInput {
  name?: string;
  phone?: string;
  email?: string;
  source?: string;
  campaign?: string;
  interest?: string;
  stage?: string;
  value?: number | string | null;
  notes?: string;
  viaLotus?: boolean;
  createdAt?: string;
}

const normalizeSource = (v: string | undefined): Source => {
  const s = (v ?? "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if ((SOURCES as readonly string[]).includes(s)) return s as Source;
  if (/MAPS|MAPA|GMB|PERFIL DA EMPRESA/.test(s)) return "GOOGLE_MAPS";
  if (/GOOGLE|ADWORDS/.test(s)) return "GOOGLE_ADS";
  if (/META|FACEBOOK|FB|ANUNCIO/.test(s)) return "META_ADS";
  if (/SITE|LANDING|PAGINA/.test(s)) return "SITE";
  if (/INSTA/.test(s)) return "INSTAGRAM";
  if (/WHATS|ZAP/.test(s)) return "WHATSAPP";
  if (/INDICA/.test(s)) return "INDICACAO";
  if (/REATIV|BASE/.test(s)) return "REATIVACAO";
  return "OUTRO";
};
const normalizeStage = (v: string | undefined): Stage => {
  const s = (v ?? "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "_");
  if ((STAGES as readonly string[]).includes(s)) return s as Stage;
  if (/FECH|VEND|GANH/.test(s)) return "FECHADO";
  if (/COMPAREC|ATEND|COMPARE/.test(s)) return "COMPARECEU";
  if (/AGEND|MARC/.test(s)) return "AGENDADO";
  if (/CONTAT|CONVERS/.test(s)) return "EM_CONTATO";
  if (/PERD|DESIST|NAO/.test(s)) return "PERDIDO";
  return "NOVO";
};
const toNumber = (v: unknown) => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

function leadData(clientId: string, input: LeadInput) {
  const stage = normalizeStage(input.stage);
  const created = input.createdAt ? new Date(input.createdAt) : new Date();
  return {
    clientId,
    name: (input.name ?? "").trim().slice(0, 120) || "Sem nome",
    phone: input.phone?.trim() || null,
    email: input.email?.trim() || null,
    source: normalizeSource(input.source),
    campaign: input.campaign?.trim() || null,
    interest: input.interest?.trim() || null,
    stage,
    value: toNumber(input.value),
    notes: input.notes?.trim() || null,
    viaLotus: input.viaLotus !== false,
    createdAt: Number.isNaN(created.getTime()) ? new Date() : created,
    firstContactAt: stage !== "NOVO" ? new Date() : null,
    closedAt: stage === "FECHADO" ? new Date() : null,
  };
}

// Cria um lead ({...}) ou vários de uma vez ({ leads: [...] }, ex.: planilha importada)
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;
  const { id } = await params;
  const client = await prisma.client.findUnique({ where: { id }, select: { id: true } });
  if (!client) return Response.json({ error: "Cliente não encontrado" }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as LeadInput & { leads?: LeadInput[] };
  if (Array.isArray(body.leads)) {
    const rows = body.leads.filter((l) => (l.name ?? l.phone ?? "").toString().trim()).slice(0, 5000).map((l) => leadData(id, l));
    if (!rows.length) return Response.json({ error: "Nenhum lead com nome ou telefone na planilha." }, { status: 400 });
    const result = await prisma.lead.createMany({ data: rows });
    return Response.json({ ok: true, created: result.count });
  }
  if (!(body.name ?? body.phone ?? "").toString().trim()) return Response.json({ error: "Informe pelo menos o nome ou o telefone." }, { status: 400 });
  const lead = await prisma.lead.create({ data: leadData(id, body) });
  return Response.json({ lead });
}
