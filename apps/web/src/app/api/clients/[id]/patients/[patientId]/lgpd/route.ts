import { NextRequest } from "next/server";
import { requireOwner } from "@/lib/require-owner";
import { erasePatient, exportPatientData } from "@/lib/lgpd";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Exporta tudo o que existe sobre o paciente (arquivo JSON para entregar a ele)
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string; patientId: string }> }) {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;
  const { id, patientId } = await params;
  try {
    const data = await exportPatientData(id, patientId);
    return new Response(JSON.stringify(data, null, 2), {
      headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="dados-paciente-${patientId}.json"` },
    });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 404 });
  }
}

// Apaga tudo do paciente a pedido dele (exige { confirmar: "APAGAR" })
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string; patientId: string }> }) {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;
  const { id, patientId } = await params;
  const b = (await request.json().catch(() => ({}))) as { confirmar?: string };
  if (b.confirmar !== "APAGAR") return Response.json({ error: 'Confirme digitando "APAGAR"' }, { status: 400 });
  try {
    return Response.json({ ok: true, apagado: await erasePatient(id, patientId, owner.email) });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
