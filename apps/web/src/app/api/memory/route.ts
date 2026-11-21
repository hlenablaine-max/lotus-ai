import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/require-owner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Memória da empresa: regras da agência (GLOBAL), orientações por departamento e o que cada agente entregou por último
export async function GET() {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;
  const [global, department, agent, departments] = await Promise.all([
    prisma.memory.findMany({ where: { scope: "GLOBAL" }, orderBy: { updatedAt: "desc" }, take: 100, select: { id: true, key: true, content: true, updatedAt: true } }),
    prisma.memory.findMany({ where: { scope: "DEPARTMENT" }, orderBy: { updatedAt: "desc" }, take: 100, select: { id: true, key: true, content: true, updatedAt: true } }),
    prisma.memory.findMany({ where: { scope: "AGENT" }, orderBy: { updatedAt: "desc" }, take: 30, select: { id: true, content: true, updatedAt: true, agent: { select: { name: true } } } }),
    prisma.agent.findMany({ distinct: ["department"], select: { department: true }, orderBy: { department: "asc" } }),
  ]);
  return Response.json({ global, department: department.map((d) => ({ ...d, department: d.key.split(":")[1] ?? "" })), agent, departments: departments.map((d) => d.department) });
}

// { scope: "GLOBAL" | "DEPARTMENT", content, department? }
export async function POST(request: NextRequest) {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;
  const b = (await request.json().catch(() => ({}))) as { scope?: string; content?: string; department?: string };
  const content = String(b.content ?? "").trim();
  if (content.length < 5) return Response.json({ error: "Escreva a regra ou o aprendizado" }, { status: 400 });
  if (b.scope === "DEPARTMENT" && !b.department) return Response.json({ error: "Escolha o departamento" }, { status: 400 });
  const scope = b.scope === "DEPARTMENT" ? "DEPARTMENT" : "GLOBAL";
  const key = `${scope === "DEPARTMENT" ? `dept:${b.department}` : "regra"}:${Date.now().toString(36)}`;
  const m = await prisma.memory.create({ data: { scope, key, content: content.slice(0, 1000), metadata: { by: owner.email } } });
  return Response.json({ memory: m });
}

export async function DELETE(request: NextRequest) {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return Response.json({ error: "id obrigatório" }, { status: 400 });
  await prisma.memory.deleteMany({ where: { id, scope: { in: ["GLOBAL", "DEPARTMENT", "AGENT"] } } });
  return Response.json({ ok: true });
}
