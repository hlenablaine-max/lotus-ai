import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/require-owner";
import { normalizePhone, patientStats, phoneKey } from "@/lib/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Base de pacientes do cliente com o LTV (quanto cada paciente já gastou, quantas vezes voltou)
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;
  const { id } = await params;
  const sp = request.nextUrl.searchParams;
  const q = (sp.get("q") ?? "").trim();
  const filtro = sp.get("filtro") ?? "todos";
  const page = Math.max(0, Number(sp.get("pagina") ?? 0) || 0);
  const where: Prisma.PatientWhereInput = { clientId: id };
  if (q) where.OR = [{ name: { contains: q, mode: "insensitive" } }, { phone: { contains: q.replace(/\D/g, "") || q } }, { email: { contains: q, mode: "insensitive" } }];
  const sixMonthsAgo = new Date(Date.now() - 182 * 86_400_000);
  if (filtro === "inativos") where.AND = [{ OR: [{ lastVisitAt: { lt: sixMonthsAgo } }, { lastVisitAt: null }] }];
  if (filtro === "ativos") where.lastVisitAt = { gte: sixMonthsAgo };
  if (filtro === "recompra") where.visits = { gte: 2 };
  if (filtro === "lotus") where.origin = "lotus";
  const orderBy: Prisma.PatientOrderByWithRelationInput = sp.get("ordem") === "recentes" ? { lastVisitAt: { sort: "desc", nulls: "last" } } : { totalSpent: "desc" };
  const [patients, count, stats] = await Promise.all([
    prisma.patient.findMany({ where, orderBy, skip: page * 50, take: 50 }),
    prisma.patient.count({ where }),
    patientStats(id),
  ]);
  return Response.json({ patients, count, page, stats });
}

interface PatientInput {
  name?: string;
  phone?: string;
  email?: string;
  birthDate?: string;
  firstVisitAt?: string;
  lastVisitAt?: string;
  totalSpent?: number | string;
  visits?: number | string;
  lastProcedure?: string;
  notes?: string;
}

const parseDate = (v: string | undefined) => {
  if (!v) return null;
  const s = String(v).trim();
  const br = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  const d = br ? new Date(Number(br[3].length === 2 ? `20${br[3]}` : br[3]), Number(br[2]) - 1, Number(br[1]), 12) : new Date(s);
  return Number.isNaN(d.getTime()) || d.getFullYear() < 1900 || d.getFullYear() > 2100 ? null : d;
};
const parseMoney = (v: unknown) => {
  if (v === undefined || v === null || v === "") return 0;
  let s = String(v).replace(/[R$\s]/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

// Importa a base antiga da clínica (planilha). Junta repetidos pelo telefone; não duplica quem já está na base.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;
  const { id } = await params;
  const client = await prisma.client.findUnique({ where: { id }, select: { id: true } });
  if (!client) return Response.json({ error: "Cliente não encontrado" }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as { patients?: PatientInput[]; patient?: PatientInput };
  const input = Array.isArray(body.patients) ? body.patients.slice(0, 20000) : body.patient ? [body.patient] : [];
  if (input.length === 0) return Response.json({ error: "Nenhum paciente enviado" }, { status: 400 });

  const existing = await prisma.patient.findMany({ where: { clientId: id }, select: { id: true, phone: true } });
  const known = new Set(existing.map((p) => phoneKey(p.phone)).filter(Boolean) as string[]);
  const seen = new Set<string>();
  const rows: Prisma.PatientCreateManyInput[] = [];
  let skipped = 0;
  for (const p of input) {
    const name = String(p.name ?? "").trim();
    if (!name) {
      skipped += 1;
      continue;
    }
    const phone = normalizePhone(p.phone);
    const key = phoneKey(phone);
    if (key && (known.has(key) || seen.has(key))) {
      skipped += 1;
      continue;
    }
    if (key) seen.add(key);
    const visits = Math.max(0, Math.round(Number(String(p.visits ?? "").replace(/\D/g, "")) || 0));
    const totalSpent = parseMoney(p.totalSpent);
    const lastVisitAt = parseDate(p.lastVisitAt);
    rows.push({
      clientId: id,
      name: name.slice(0, 120),
      phone,
      email: p.email?.trim() || null,
      birthDate: parseDate(p.birthDate),
      firstVisitAt: parseDate(p.firstVisitAt),
      lastVisitAt,
      totalSpent,
      visits: visits || (totalSpent > 0 || lastVisitAt ? 1 : 0),
      lastProcedure: p.lastProcedure?.trim() || null,
      notes: p.notes?.trim() || null,
      origin: "base",
      source: "PACIENTE_BASE",
    });
  }
  for (let i = 0; i < rows.length; i += 500) await prisma.patient.createMany({ data: rows.slice(i, i + 500) });
  // Conversas que já existem com esses números passam a aparecer como pacientes da base
  const fresh = await prisma.patient.findMany({ where: { clientId: id }, select: { id: true, phone: true } });
  const byKey = new Map(fresh.map((p) => [phoneKey(p.phone), p.id]));
  const convs = await prisma.conversation.findMany({ where: { clientId: id, patientId: null, phone: { not: null } }, select: { id: true, phone: true } });
  for (const c of convs) {
    const pid = byKey.get(phoneKey(c.phone));
    if (pid) await prisma.conversation.update({ where: { id: c.id }, data: { patientId: pid } });
  }
  return Response.json({ ok: true, created: rows.length, skipped });
}
