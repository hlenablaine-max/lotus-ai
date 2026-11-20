// Conversa com um agente pelo escritório virtual. O agente responde no papel dele e pode:
// - fazer ele mesmo (cria a tarefa para si e começa a trabalhar);
// - pedir para um colega (vai até a mesa do colega no escritório 3D, passa a instrução, o colega começa).
import { registry, type AIMessage, type AITool } from "@lotus/ai-engine";
import { prisma } from "@/lib/prisma";
import { runTask } from "@/lib/task-runner";

type Json = Record<string, unknown>;

export interface OfficeAction {
  kind: "self" | "delegate";
  taskId: string;
  title: string;
  agentName: string;
  clientName: string;
}

const TOOLS: AITool[] = [
  {
    name: "fazer_eu_mesmo",
    description: "Use quando o pedido é da SUA área. Cria a tarefa para você e você começa a trabalhar nela agora.",
    parameters: {
      type: "object",
      properties: {
        titulo: { type: "string", description: "Título curto da tarefa" },
        instrucoes: { type: "string", description: "Instruções completas do que entregar, com todo o contexto que o Ícaro deu" },
        cliente: { type: "string", description: "Nome do cliente, se o pedido for para um cliente específico (opcional)" },
      },
      required: ["titulo", "instrucoes"],
    },
  },
  {
    name: "pedir_para_colega",
    description: "Use quando o pedido é de OUTRA área (ou o Ícaro mandou você falar com alguém). Você vai até a mesa do colega, passa a instrução e ele começa a trabalhar.",
    parameters: {
      type: "object",
      properties: {
        colegaId: { type: "string", description: "id do colega (da lista de colegas)" },
        titulo: { type: "string", description: "Título curto da tarefa" },
        instrucoes: { type: "string", description: "Recado completo para o colega: o que fazer, para quem, com todo o contexto" },
        cliente: { type: "string", description: "Nome do cliente, se houver (opcional)" },
      },
      required: ["colegaId", "titulo", "instrucoes"],
    },
  },
];

// Missão que agrupa os pedidos feitos pelo escritório (por cliente, ou interna da LOTUS)
async function officeMission(clientName?: string): Promise<{ missionId: string; clientName: string }> {
  let client = clientName
    ? await prisma.client.findFirst({ where: { name: { contains: clientName.trim(), mode: "insensitive" } }, select: { id: true, name: true } })
    : null;
  if (!client) {
    client =
      (await prisma.client.findUnique({ where: { slug: "lotus-interno" }, select: { id: true, name: true } })) ??
      (await prisma.client.create({ data: { name: "LOTUS (interno)", slug: "lotus-interno", segment: "Agência", description: "Pedidos internos feitos pelo escritório virtual" }, select: { id: true, name: true } }));
  }
  const title = `Pedidos pelo escritório — ${client.name}`;
  const mission =
    (await prisma.mission.findFirst({ where: { clientId: client.id, title, status: { notIn: ["CANCELLED"] } }, select: { id: true } })) ??
    (await prisma.mission.create({
      data: { clientId: client.id, title, description: "Pedidos feitos diretamente aos agentes pelo escritório virtual.", objective: "Executar os pedidos do dono.", status: "IN_PROGRESS" },
      select: { id: true },
    }));
  await prisma.mission.update({ where: { id: mission.id }, data: { status: "IN_PROGRESS" } }).catch(() => {});
  return { missionId: mission.id, clientName: client.name };
}

// Pedido de criação (site, landing, ferramenta) vai para o provedor de criação (Claude pela assinatura)
const CREATION = /\bsite\b|landing|p[aá]gina|ferramenta|sistema|aplicativo|\bapp\b|automa[cç][aã]o|c[oó]digo|funil/i;

export async function handleAgentChat(agentId: string, message: string, history: Array<{ role: "user" | "assistant"; content: string }>): Promise<{ reply: string; actions: OfficeAction[] }> {
  const agent = await prisma.agent.findUnique({ where: { id: agentId }, select: { id: true, name: true, title: true, department: true, specialty: true, systemPrompt: true } });
  if (!agent) throw new Error("Agente não encontrado.");
  const colleagues = await prisma.agent.findMany({ where: { isActive: true, id: { not: agentId } }, select: { id: true, name: true, title: true, department: true } });
  const clients = await prisma.client.findMany({ select: { name: true }, orderBy: { updatedAt: "desc" }, take: 15 });
  const actions: OfficeAction[] = [];

  const createTask = async (assigneeId: string, args: Json, kind: "self" | "delegate") => {
    const assignee = assigneeId === agent.id ? agent : colleagues.find((c) => c.id === assigneeId);
    if (!assignee) return `Colega com id "${assigneeId}" não existe. Use um id da lista.`;
    const { missionId, clientName } = await officeMission(typeof args.cliente === "string" ? args.cliente : undefined);
    const title = String(args.titulo ?? "Pedido do Ícaro").slice(0, 140);
    const instructions = String(args.instrucoes ?? message);
    const task = await prisma.task.create({
      data: {
        missionId,
        agentId: assignee.id,
        title,
        description: kind === "delegate" ? `Pedido passado por ${agent.name} a pedido do Ícaro.` : "Pedido do Ícaro pelo escritório.",
        instructions: `${instructions}\n\nPedido original do Ícaro: "${message}"${kind === "delegate" ? `\nQuem passou o recado: ${agent.name} (${agent.title}).` : ""}\nCliente: ${clientName}. Entregue o resultado completo em português; ele aparece em Missões.`,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        input: { origem: "escritorio", pedidoOriginal: message, cliente: clientName, ...(CREATION.test(`${title} ${instructions}`) ? { criacao: true } : {}) } as any,
        status: "QUEUED",
      },
      select: { id: true },
    });
    if (kind === "delegate") {
      // O escritório 3D lê este registro para animar o agente indo até a mesa do colega
      await prisma.activityLog.create({
        data: { agentId: agent.id, missionId, taskId: task.id, action: "AGENT_DELEGATED", details: { toAgentId: assignee.id, toAgentName: assignee.name, title }, level: "INFO" },
      });
    } else {
      await prisma.activityLog.create({ data: { agentId: agent.id, missionId, taskId: task.id, action: "AGENT_REQUEST", details: { title }, level: "INFO" } });
    }
    // Quem recebe um recado começa depois que o colega "chega" na mesa (efeito no escritório)
    setTimeout(() => runTask(task.id), kind === "delegate" ? 9_000 : 500);
    actions.push({ kind, taskId: task.id, title, agentName: assignee.name, clientName });
    return kind === "delegate" ? `Tarefa criada para ${assignee.name}: "${title}". Você está indo até a mesa dele(a) passar o recado.` : `Tarefa criada para você: "${title}". Você já começou.`;
  };

  const system = [
    `Você é ${agent.name}, ${agent.title} da LOTUS (agência autônoma de marketing para clínicas). Departamento: ${agent.department}.`,
    agent.specialty ? `Especialidade: ${agent.specialty}.` : "",
    "Você está no escritório virtual conversando com o Ícaro, o dono. Ele fala português informal. Responda curto (2 a 4 frases), simpático e direto, em português.",
    "Quando ele pedir um trabalho:",
    "- se for da SUA área, use a ferramenta fazer_eu_mesmo e diga que já começou;",
    "- se for de outra área, ou se ele mandar você falar com alguém, use pedir_para_colega com o colega certo e diga que está indo até a mesa dele(a) passar o recado.",
    "Se faltar uma informação essencial (ex.: para qual cliente), pergunte antes de criar a tarefa. Se for só conversa ou dúvida, responda sem criar tarefa.",
    "",
    "COLEGAS (id — nome — cargo — departamento):",
    ...colleagues.map((c) => `- ${c.id} — ${c.name} — ${c.title} — ${c.department}`),
    "",
    clients.length ? `Clientes cadastrados: ${clients.map((c) => c.name).join(", ")}.` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const messages: AIMessage[] = [
    { role: "system", content: system },
    ...history.slice(-10).map((h) => ({ role: h.role, content: h.content.slice(0, 3000) })),
    { role: "user", content: message },
  ];
  const result = await registry.getDefault().completeWithLoop({ messages, tools: TOOLS, maxIterations: 4, maxTokens: 1200 }, async (name, args) => {
    if (name === "fazer_eu_mesmo") return createTask(agent.id, args, "self");
    if (name === "pedir_para_colega") return createTask(String(args.colegaId ?? ""), args, "delegate");
    return `Ferramenta ${name} não existe.`;
  });
  const reply = (result.content ?? "").trim() || (actions.length ? "Combinado, já está em andamento." : "Pode falar, estou aqui.");
  return { reply, actions };
}
