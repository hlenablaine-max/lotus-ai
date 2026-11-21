import { NextRequest } from "next/server";
import { requireRole } from "@/lib/require-owner";
import { addMember, listTeam, type TeamRole } from "@/lib/team";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const me = await requireRole(["OWNER"]);
  if (me instanceof Response) return me;
  return Response.json({ team: await listTeam(), me: me.email });
}

// { name, email, role: "ADMIN" | "VIEWER" } → devolve a senha provisória UMA vez
export async function POST(request: NextRequest) {
  const me = await requireRole(["OWNER"]);
  if (me instanceof Response) return me;
  const b = (await request.json().catch(() => ({}))) as { name?: string; email?: string; role?: string };
  try {
    const role = (b.role === "ADMIN" || b.role === "VIEWER" ? b.role : "VIEWER") as TeamRole;
    return Response.json(await addMember({ name: String(b.name ?? ""), email: String(b.email ?? ""), role }));
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
