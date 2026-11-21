// LGPD: direitos do paciente (art. 18) dentro da LOTUS. A clínica é a controladora dos dados; a LOTUS é a operadora
// e atende os pedidos que a clínica repassa: ver tudo o que existe sobre a pessoa e apagar tudo.
import { prisma } from "@/lib/prisma";
import { phoneKey } from "@/lib/whatsapp";

async function scope(clientId: string, patientId: string) {
  const patient = await prisma.patient.findFirst({ where: { id: patientId, clientId }, include: { purchases: true } });
  if (!patient) throw new Error("Paciente não encontrado nesta clínica");
  const key = phoneKey(patient.phone);
  const tail = key?.slice(-8) ?? null;
  const conversations = tail
    ? (await prisma.conversation.findMany({ where: { clientId, OR: [{ patientId }, { phone: { endsWith: tail } }] }, select: { id: true, phone: true, name: true, channel: true, createdAt: true } })).filter((c) => !c.phone || phoneKey(c.phone) === key)
    : await prisma.conversation.findMany({ where: { clientId, patientId }, select: { id: true, phone: true, name: true, channel: true, createdAt: true } });
  const convIds = conversations.map((c) => c.id);
  const leads = await prisma.lead.findMany({
    where: { clientId, OR: [{ patientId }, ...(convIds.length ? [{ conversationId: { in: convIds } }] : []), ...(tail ? [{ phone: { endsWith: tail } }] : [])] },
  });
  const leadsOfPerson = leads.filter((l) => l.patientId === patientId || (l.conversationId && convIds.includes(l.conversationId)) || (key && phoneKey(l.phone) === key));
  const outbound = tail ? (await prisma.outboundMessage.findMany({ where: { clientId, phone: { endsWith: tail } } })).filter((o) => phoneKey(o.phone) === key) : [];
  return { patient, conversations, convIds, leads: leadsOfPerson, outbound };
}

// Tudo o que a LOTUS guarda sobre a pessoa (para entregar quando ela pedir)
export async function exportPatientData(clientId: string, patientId: string) {
  const s = await scope(clientId, patientId);
  const messages = s.convIds.length
    ? await prisma.whatsappMessage.findMany({ where: { conversationId: { in: s.convIds } }, orderBy: { sentAt: "asc" }, select: { conversationId: true, direction: true, body: true, sentAt: true } })
    : [];
  return {
    geradoEm: new Date().toISOString(),
    observacao: "Dados guardados pela LOTUS como operadora, em nome da clínica (controladora).",
    paciente: { ...s.patient, purchases: undefined },
    compras: s.patient.purchases,
    leads: s.leads,
    conversas: s.conversations.map((c) => ({ ...c, mensagens: messages.filter((m) => m.conversationId === c.id).map((m) => ({ quem: m.direction === "IN" ? "paciente" : "clínica", texto: m.body, em: m.sentAt })) })),
    mensagensAgendadas: s.outbound.map((o) => ({ tipo: o.kind, texto: o.body, status: o.status, para: o.scheduledFor })),
  };
}

// Apaga tudo da pessoa nesta clínica. Fica só um registro sem dados pessoais de que o pedido foi atendido.
export async function erasePatient(clientId: string, patientId: string, by: string) {
  const s = await scope(clientId, patientId);
  const counts = { conversas: s.convIds.length, leads: s.leads.length, mensagensAgendadas: s.outbound.length, compras: s.patient.purchases.length };
  await prisma.$transaction([
    prisma.outboundMessage.deleteMany({ where: { id: { in: s.outbound.map((o) => o.id) } } }),
    prisma.whatsappMessage.deleteMany({ where: { conversationId: { in: s.convIds } } }),
    prisma.lead.deleteMany({ where: { id: { in: s.leads.map((l) => l.id) } } }),
    prisma.conversation.deleteMany({ where: { id: { in: s.convIds } } }),
    prisma.purchase.deleteMany({ where: { patientId } }),
    prisma.patient.updateMany({ where: { referredById: patientId }, data: { referredById: null } }),
    prisma.patient.delete({ where: { id: patientId } }),
  ]);
  await prisma.activityLog.create({ data: { clientId, action: "LGPD_DADOS_APAGADOS", details: { ...counts, pedidoPor: by, em: new Date().toISOString() } } }).catch(() => undefined);
  return counts;
}
