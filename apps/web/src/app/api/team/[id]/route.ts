import { NextRequest } from "next/server";
import { requireRole } from "@/lib/require-owner";
import { updateMember, type TeamRole } from "@/lib/team";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// { role?, active?, resetPassword? }
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await requireRole(["OWNER"]);
  if (me instanceof Response) return me;
  const { id } = await params;
  const b = (await request.json().catch(() => ({}))) as { role?: string; active?: boolean; resetPassword?: boolean };
  try {
    const role = b.role === "ADMIN" || b.role === "VIEWER" ? (b.role as TeamRole) : undefined;
    return Response.json({ ok: true, ...(await updateMember(id, { role, active: b.active, resetPassword: !!b.resetPassword })) });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
