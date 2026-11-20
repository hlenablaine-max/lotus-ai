// Atualiza um lead com as mesmas regras em qualquer tela (CRM, conversa do WhatsApp, Root Master):
// mudar de etapa marca as datas; fechar registra a compra na base de pacientes (para o LTV).
import { prisma } from "@/lib/prisma";
import { SOURCES, STAGES, type Source, type Stage } from "@/lib/crm";
import { recordClosing } from "@/lib/whatsapp";

const toNum = (v: unknown) => {
  if (v === null || v === "" || v === undefined) return null;
  const n = Number(String(v).replace(/\./g, (m, i, s: string) => (s.includes(",") ? "" : m)).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

export async function applyLeadUpdate(id: string, body: Record<string, unknown>) {
  const current = await prisma.lead.findUnique({ where: { id }, select: { stage: true, firstContactAt: true } });
  if (!current) return null;
  const data: Record<string, unknown> = {};
  for (const key of ["name", "phone", "email", "campaign", "interest", "notes", "lostReason"] as const) {
    if (typeof body[key] === "string") data[key] = (body[key] as string).trim() || null;
  }
  if (typeof body.viaLotus === "boolean") data.viaLotus = body.viaLotus;
  if (body.value !== undefined) data.value = toNum(body.value);
  if (body.quotedValue !== undefined) data.quotedValue = toNum(body.quotedValue);
  if (body.appointmentAt !== undefined) {
    const d = body.appointmentAt ? new Date(String(body.appointmentAt)) : null;
    data.appointmentAt = d && !Number.isNaN(d.getTime()) ? d : null;
  }
  if (typeof body.source === "string" && (SOURCES as readonly string[]).includes(body.source)) data.source = body.source as Source;
  if (typeof body.stage === "string" && (STAGES as readonly string[]).includes(body.stage) && body.stage !== current.stage) {
    const stage = body.stage as Stage;
    data.stage = stage;
    data.stageChangedAt = new Date();
    if (stage !== "NOVO" && !current.firstContactAt) data.firstContactAt = new Date();
    data.closedAt = stage === "FECHADO" ? new Date() : null;
  }
  // Marcar data de consulta já coloca o lead em "Agendado"
  if (data.appointmentAt && !data.stage && ["NOVO", "EM_CONTATO"].includes(current.stage)) {
    data.stage = "AGENDADO";
    data.stageChangedAt = new Date();
    if (!current.firstContactAt) data.firstContactAt = new Date();
  }
  const lead = await prisma.lead.update({ where: { id }, data });
  if (lead.stage === "FECHADO") await recordClosing(lead.id);
  return lead;
}
