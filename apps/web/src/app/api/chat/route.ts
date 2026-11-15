import { NextRequest } from "next/server";
import { streamRootMaster } from "@lotus/ai-engine";
import type { AITool, ToolExecutor } from "@lotus/ai-engine";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// DB tools the Root Master can call to query real company data
const DB_TOOL_DEFS: AITool[] = [
  {
    name: "get_clients",
    description: "Lista todos os clientes da LOTUS com status, missões ativas e data de última atividade",
    parameters: {
      properties: {
        status: { type: "string", enum: ["ACTIVE", "INACTIVE", "CHURNED", "ALL"], description: "Filtrar por status" },
        limit: { type: "number", description: "Máximo de resultados (padrão 20)" },
      },
    },
  },
  {
    name: "get_missions",
    description: "Lista missões com status, cliente, progresso e agentes envolvidos",
    parameters: {
      properties: {
        status: {
          type: "string",
          enum: ["DRAFT", "ACTIVE", "PAUSED", "COMPLETED", "CANCELLED", "ALL"],
          description: "Filtrar por status",
        },
        clientId: { type: "string", description: "Filtrar por cliente específico" },
        limit: { type: "number", description: "Máximo de resultados (padrão 10)" },
      },
    },
  },
  {
    name: "get_agents",
    description: "Lista todos os agentes de IA com status atual, tarefas completadas e custos",
    parameters: {
      properties: {},
    },
  },
  {
    name: "get_costs",
    description: "Retorna custos de tokens/API por período",
    parameters: {
      properties: {
        days: { type: "number", description: "Últimos N dias (padrão 30)" },
      },
    },
  },
  {
    name: "get_pending_tasks",
    description: "Lista tarefas pendentes ou em execução com agente responsável",
    parameters: {
      properties: {
        missionId: { type: "string", description: "Filtrar por missão específica" },
        limit: { type: "number", description: "Máximo de resultados (padrão 20)" },
      },
    },
  },
  {
    name: "get_activity_log",
    description: "Retorna log de atividades recentes dos agentes",
    parameters: {
      properties: {
        hours: { type: "number", description: "Últimas N horas (padrão 24)" },
        agentId: { type: "string", description: "Filtrar por agente específico" },
        limit: { type: "number", description: "Máximo de resultados (padrão 50)" },
      },
    },
  },
  {
    name: "fetch_url",
    description: "Busca e lê o conteúdo de uma URL (site da empresa, Instagram, landing page, etc.) para análise. Use quando o usuário enviar um link.",
    parameters: {
      properties: {
        url: { type: "string", description: "URL completa a ser buscada (https://...)" },
      },
      required: ["url"],
    },
  },
  {
    name: "get_client_details",
    description: "Detalhes completos de um cliente: histórico, missões, métricas",
    parameters: {
      properties: {
        clientId: { type: "string", description: "ID do cliente" },
        clientName: { type: "string", description: "Nome do cliente (alternativa ao ID)" },
      },
    },
  },
  {
    name: "get_agents_available",
    description: "Lista agentes disponíveis com suas especialidades e status atual. Use antes de criar tarefas para escolher o agente certo.",
    parameters: {
      properties: {
        department: { type: "string", description: "Filtrar por departamento (opcional): copywriting, business-intelligence, performance-marketing, creative-studio, web-development, sales, data-analytics" },
        onlyIdle: { type: "boolean", description: "Se true, retorna apenas agentes IDLE disponíveis (padrão false)" },
      },
    },
  },
  {
    name: "create_task",
    description: "Cria e executa uma tarefa para um agente de IA. Use para delegar trabalho específico a um agente especialista.",
    parameters: {
      properties: {
        agentId: { type: "string", description: "ID do agente (use get_agents_available para obter IDs)" },
        agentName: { type: "string", description: "Nome do agente (alternativa ao ID, busca por nome parcial)" },
        missionId: { type: "string", description: "ID da missão. Se não informado, cria a tarefa sem missão vinculada." },
        missionName: { type: "string", description: "Nome da missão (alternativa ao ID)" },
        title: { type: "string", description: "Título curto e claro da tarefa" },
        description: { type: "string", description: "Descrição do que precisa ser feito e por quê" },
        instructions: { type: "string", description: "Instruções detalhadas para o agente: o que produzir, formato esperado, critérios de qualidade" },
        input: { type: "object", description: "Dados de entrada adicionais (URL do site, contexto do cliente, etc.)" },
        autoExecute: { type: "boolean", description: "Se true (padrão), inicia execução imediatamente após criar a tarefa" },
      },
      required: ["title", "description", "instructions"],
    },
  },
];

function createDbToolExecutor(): ToolExecutor {
  return async (toolName: string, args: Record<string, unknown>): Promise<string> => {
    try {
      switch (toolName) {
        case "get_clients": {
          const { status = "ALL", limit = 20 } = args as { status?: string; limit?: number };
          const clientWhere = status !== "ALL" ? { status: status as "ACTIVE" | "PAUSED" | "CHURNED" | "PROSPECT" } : undefined;
          const clients = await prisma.client.findMany({
            where: clientWhere,
            take: Number(limit),
            orderBy: { updatedAt: "desc" },
            include: {
              _count: { select: { missions: true } },
              missions: {
                where: { status: "IN_PROGRESS" as const },
                select: { id: true, title: true, status: true },
                take: 3,
              },
            },
          });
          return JSON.stringify({
            total: clients.length,
            clients: clients.map((c) => ({
              id: c.id,
              name: c.name,
              status: c.status,
              segment: c.segment,
              website: c.website,
              activeMissions: c.missions.length,
              totalMissions: c._count.missions,
              lastActivity: c.updatedAt,
              missions: c.missions,
            })),
          });
        }

        case "get_missions": {
          const { status = "ALL", clientId, limit = 10 } = args as {
            status?: string; clientId?: string; limit?: number;
          };
          const where: Record<string, unknown> = {};
          if (status !== "ALL") where.status = status;
          if (clientId) where.clientId = clientId;
          const missions = await prisma.mission.findMany({
            where,
            take: Number(limit),
            orderBy: { updatedAt: "desc" },
            include: {
              client: { select: { name: true } },
              _count: { select: { tasks: true } },
              tasks: {
                where: { status: { in: (["PENDING", "IN_PROGRESS"] as ["PENDING", "IN_PROGRESS"]) } },
                select: { id: true, title: true, status: true, agentId: true },
                take: 5,
              },
            },
          });
          return JSON.stringify({
            total: missions.length,
            missions: missions.map((m) => ({
              id: m.id,
              title: m.title,
              status: m.status,
              client: m.client.name,
              objective: m.objective,
              totalTasks: m._count.tasks,
              pendingTasks: m.tasks.length,
              tasks: m.tasks,
              createdAt: m.createdAt,
              updatedAt: m.updatedAt,
            })),
          });
        }

        case "get_agents": {
          const agents = await prisma.agent.findMany({
            orderBy: { tasksCompleted: "desc" },
          });
          return JSON.stringify({
            total: agents.length,
            agents: agents.map((a) => ({
              id: a.id,
              name: a.name,
              status: a.status,
              department: a.department,
              specialty: a.specialty,
              tasksCompleted: a.tasksCompleted,
              tasksTotal: a.tasksTotal,
              avgQualityScore: a.avgQualityScore,
              lastActive: a.updatedAt,
            })),
          });
        }

        case "get_costs": {
          const { days = 30 } = args as { days?: number };
          const since = new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000);
          const logs = await prisma.activityLog.findMany({
            where: {
              createdAt: { gte: since },
              action: "TASK_COMPLETED",
            },
            select: { details: true, createdAt: true, agentId: true },
          });
          let totalInputTokens = 0;
          let totalOutputTokens = 0;
          for (const log of logs) {
            const details = log.details as Record<string, unknown> | null;
            if (details?.tokens) {
              const tokens = details.tokens as { inputTokens?: number; outputTokens?: number };
              totalInputTokens += tokens.inputTokens ?? 0;
              totalOutputTokens += tokens.outputTokens ?? 0;
            }
          }
          return JSON.stringify({
            period: `Últimos ${days} dias`,
            totalInputTokens,
            totalOutputTokens,
            totalTokens: totalInputTokens + totalOutputTokens,
            estimatedCostUSD: ((totalInputTokens * 0.003 + totalOutputTokens * 0.015) / 1000).toFixed(4),
            taskCount: logs.length,
          });
        }

        case "get_pending_tasks": {
          const { missionId, limit = 20 } = args as { missionId?: string; limit?: number };
          const where: Record<string, unknown> = { status: { in: ["PENDING", "IN_PROGRESS", "WAITING_DEPENDENCY"] } };
          if (missionId) where.missionId = missionId;
          const tasks = await prisma.task.findMany({
            where,
            take: Number(limit),
            orderBy: { createdAt: "asc" },
            include: {
              agent: { select: { name: true, status: true } },
              mission: { select: { title: true, client: { select: { name: true } } } },
            },
          });
          return JSON.stringify({
            total: tasks.length,
            tasks: tasks.map((t) => ({
              id: t.id,
              title: t.title,
              status: t.status,
              mission: t.mission.title,
              client: t.mission.client.name,
              agent: t.agent?.name ?? "Não atribuído",
              agentStatus: t.agent?.status,
              createdAt: t.createdAt,
            })),
          });
        }

        case "get_activity_log": {
          const { hours = 24, agentId, limit = 50 } = args as {
            hours?: number; agentId?: string; limit?: number;
          };
          const since = new Date(Date.now() - Number(hours) * 60 * 60 * 1000);
          const where: Record<string, unknown> = { createdAt: { gte: since } };
          if (agentId) where.agentId = agentId;
          const logs = await prisma.activityLog.findMany({
            where,
            take: Number(limit),
            orderBy: { createdAt: "desc" },
            include: {
              agent: { select: { name: true } },
            },
          });
          return JSON.stringify({
            period: `Últimas ${hours} horas`,
            total: logs.length,
            logs: logs.map((l) => ({
              action: l.action,
              agent: l.agent?.name ?? "Sistema",
              level: l.level,
              details: l.details,
              time: l.createdAt,
            })),
          });
        }

        case "get_client_details": {
          const { clientId, clientName } = args as { clientId?: string; clientName?: string };
          const where = clientId ? { id: clientId } : clientName ? { name: { contains: clientName } } : null;
          if (!where) return JSON.stringify({ error: "Forneça clientId ou clientName" });
          const client = await prisma.client.findFirst({
            where,
            include: {
              missions: {
                orderBy: { updatedAt: "desc" },
                take: 10,
                include: { _count: { select: { tasks: true } } },
              },
            },
          });
          if (!client) return JSON.stringify({ error: "Cliente não encontrado" });
          return JSON.stringify({
            id: client.id,
            name: client.name,
            status: client.status,
            segment: client.segment,
            website: client.website,
            instagram: client.instagram,
            description: client.description,
            missions: client.missions.map((m) => ({
              id: m.id,
              title: m.title,
              status: m.status,
              totalTasks: m._count.tasks,
              updatedAt: m.updatedAt,
            })),
            createdAt: client.createdAt,
            lastActivity: client.updatedAt,
          });
        }

        case "fetch_url": {
          const { url } = args as { url: string };
          try {
            const res = await fetch(url, {
              headers: { "User-Agent": "Mozilla/5.0 (compatible; LOTUS-AI/1.0; +https://lotus.ai)" },
              signal: AbortSignal.timeout(10_000),
            });
            const contentType = res.headers.get("content-type") ?? "";
            if (!contentType.includes("text")) {
              return JSON.stringify({ error: "URL retornou conteúdo binário ou não-textual", url });
            }
            const html = await res.text();
            const text = html
              .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
              .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
              .replace(/<[^>]+>/g, " ")
              .replace(/\s+/g, " ")
              .slice(0, 6_000)
              .trim();
            return JSON.stringify({ url, status: res.status, content: text });
          } catch (err) {
            return JSON.stringify({ error: `Não foi possível acessar ${url}: ${err instanceof Error ? err.message : String(err)}` });
          }
        }

        case "get_agents_available": {
          const { department, onlyIdle = false } = args as { department?: string; onlyIdle?: boolean };
          const whereClause: Record<string, unknown> = { isActive: true };
          if (department) whereClause.department = { contains: department };
          if (onlyIdle) whereClause.status = "IDLE";
          const agents = await prisma.agent.findMany({
            where: whereClause,
            orderBy: [{ status: "asc" }, { name: "asc" }],
            select: { id: true, name: true, title: true, department: true, specialty: true, status: true, tasksCompleted: true },
          });
          return JSON.stringify({
            total: agents.length,
            agents: agents.map((a) => ({
              id: a.id,
              name: a.name,
              title: a.title,
              department: a.department,
              specialty: a.specialty,
              status: a.status,
              tasksCompleted: a.tasksCompleted,
            })),
          });
        }

        case "create_task": {
          const {
            agentId,
            agentName,
            missionId,
            missionName,
            title,
            description,
            instructions,
            input,
            autoExecute = true,
          } = args as {
            agentId?: string;
            agentName?: string;
            missionId?: string;
            missionName?: string;
            title: string;
            description: string;
            instructions: string;
            input?: Record<string, unknown>;
            autoExecute?: boolean;
          };

          // Resolve agent
          let resolvedAgentId = agentId;
          if (!resolvedAgentId && agentName) {
            const agent = await prisma.agent.findFirst({
              where: { name: { contains: agentName }, isActive: true },
              select: { id: true, name: true },
            });
            if (!agent) return JSON.stringify({ error: `Agente "${agentName}" não encontrado` });
            resolvedAgentId = agent.id;
          }
          if (!resolvedAgentId) return JSON.stringify({ error: "Informe agentId ou agentName" });

          // Resolve mission (optional)
          let resolvedMissionId = missionId;
          if (!resolvedMissionId && missionName) {
            const mission = await prisma.mission.findFirst({
              where: { title: { contains: missionName } },
              select: { id: true },
            });
            resolvedMissionId = mission?.id;
          }
          // If no mission, use or create a default system mission
          if (!resolvedMissionId) {
            const systemClient = await prisma.client.findFirst({ where: { slug: "lotus-internal" } })
              ?? await prisma.client.create({
                data: { name: "LOTUS Internal", slug: "lotus-internal", status: "ACTIVE" },
              });
            const mission = await prisma.mission.create({
              data: {
                title: `Tarefa: ${title}`,
                description: description,
                objective: description,
                status: "IN_PROGRESS",
                clientId: systemClient.id,
              },
            });
            resolvedMissionId = mission.id;
          }

          // Create the task
          const task = await prisma.task.create({
            data: {
              title,
              description,
              instructions,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              input: (input ?? {}) as any,
              status: "PENDING",
              missionId: resolvedMissionId,
              agentId: resolvedAgentId,
            },
          });

          // Resolve final agent display name
          const resolvedAgentName = agentName
            ?? (resolvedAgentId
              ? (await prisma.agent.findUnique({ where: { id: resolvedAgentId }, select: { name: true } }))?.name
              : undefined);

          // Auto-execute
          if (autoExecute) {
            const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";
            fetch(`${baseUrl}/api/agents/execute`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ taskId: task.id }),
            }).catch(() => {});
          }

          return JSON.stringify({
            success: true,
            taskId: task.id,
            missionId: resolvedMissionId,
            agentName: resolvedAgentName,
            status: autoExecute ? "executing" : "created",
            message: autoExecute
              ? `Tarefa criada e ${resolvedAgentName ?? "agente"} já está executando!`
              : `Tarefa criada. Para executar: POST /api/agents/execute { taskId: "${task.id}" }`,
          });
        }

        default:
          return JSON.stringify({ error: `Ferramenta desconhecida: ${toolName}` });
      }
    } catch (err) {
      return JSON.stringify({ error: `Erro ao executar ${toolName}: ${err instanceof Error ? err.message : String(err)}` });
    }
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, history = [], clientId } = body;

    if (!message || typeof message !== "string") {
      return new Response(JSON.stringify({ error: "message is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Persist user message
    await prisma.chatMessage.create({
      data: {
        role: "USER",
        content: message,
        clientId: clientId || null,
        metadata: { source: "chat-ui" },
      },
    });

    // Look up client name if clientId provided
    let clientName: string | undefined;
    if (clientId) {
      const client = await prisma.client.findUnique({ where: { id: clientId }, select: { name: true } });
      clientName = client?.name;
    }

    const encoder = new TextEncoder();
    let fullResponse = "";

    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of streamRootMaster(message, {
            conversationHistory: history,
            clientId,
            clientName,
            dbToolDefs: DB_TOOL_DEFS,
            dbToolExecutor: createDbToolExecutor(),
          })) {
            if (chunk.delta) {
              fullResponse += chunk.delta;
              const data = `data: ${JSON.stringify({ delta: chunk.delta })}\n\n`;
              controller.enqueue(encoder.encode(data));
            }
          }

          // Persist assistant response after stream completes
          if (fullResponse) {
            await prisma.chatMessage.create({
              data: {
                role: "ASSISTANT",
                content: fullResponse,
                clientId: clientId || null,
                metadata: { model: "root-master" },
              },
            });
          }

          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch {
          const errorData = `data: ${JSON.stringify({ error: "Stream error" })}\n\n`;
          controller.enqueue(encoder.encode(errorData));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch {
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get("limit") || "50");
  const clientId = searchParams.get("clientId");

  const messages = await prisma.chatMessage.findMany({
    where: clientId ? { clientId } : {},
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  return Response.json({ messages });
}
