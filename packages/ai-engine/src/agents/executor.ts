// Task Executor — Runs a DB task through the right agent and saves output
// Uses dependency injection for the DB layer so ai-engine stays DB-agnostic.

import { registry, initializeProviders } from "../providers/registry";
import type { AITool } from "../providers/types";

// Minimal interface for the DB operations executor needs
export interface ExecutorDB {
  task: {
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
    findUniqueOrThrow(args: {
      where: { id: string };
      include: { agent: boolean; mission: { include: { client: boolean } } };
    }): Promise<TaskWithRelations>;
    findMany(args: {
      where: { id: { in: string[] } };
      select: { id: boolean; status: boolean };
    }): Promise<Array<{ id: string; status: string }>>;
  };
  agent: {
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
  };
  activityLog: {
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
  };
  document?: {
    create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
  };
}

interface TaskWithRelations {
  id: string;
  title: string;
  description: string;
  instructions: string;
  input: unknown;
  dependsOn: string[];
  agentId: string | null;
  missionId: string;
  agent: {
    id: string;
    name: string;
    model: string | null;
    systemPrompt: string;
    specialty?: string;
  } | null;
  mission: {
    title: string;
    objective: string;
    client: { name: string };
  };
}

// Tools available to ALL agents
const BASE_AGENT_TOOLS: AITool[] = [
  {
    name: "save_document",
    description:
      "Salva um documento/entrega como resultado da tarefa. Use quando completar uma análise, copy, relatório, estratégia ou qualquer entrega textual.",
    parameters: {
      properties: {
        title: { type: "string", description: "Título do documento" },
        content: { type: "string", description: "Conteúdo completo do documento" },
        type: {
          type: "string",
          description: "Tipo do documento",
          enum: ["copy", "analysis", "report", "brief", "strategy", "script", "proposal", "other"],
        },
      },
      required: ["title", "content", "type"],
    },
  },
  {
    name: "request_clarification",
    description:
      "Registra uma dúvida ou pedido de informação adicional necessária para completar a tarefa com mais precisão.",
    parameters: {
      properties: {
        question: { type: "string", description: "O que precisa ser esclarecido" },
        continueWithAssumptions: {
          type: "boolean",
          description: "Se true, continua com suposições razoáveis. Se false, bloqueia até receber resposta.",
        },
        assumptions: { type: "string", description: "As suposições que serão adotadas ao continuar" },
      },
      required: ["question", "continueWithAssumptions"],
    },
  },
];

// Extra tools by specialty
const SPECIALTY_TOOLS: Record<string, AITool[]> = {
  copywriting: [
    {
      name: "generate_headline_variations",
      description: "Gera variações de headline para seleção e teste A/B",
      parameters: {
        properties: {
          mainMessage: { type: "string" },
          count: { type: "number", description: "Quantidade de variações (padrão 5)" },
        },
        required: ["mainMessage"],
      },
    },
  ],
  "business-intelligence": [
    {
      name: "structure_analysis",
      description: "Estrutura uma análise em formato de relatório executivo com seções definidas",
      parameters: {
        properties: {
          topic: { type: "string" },
          sections: { type: "array", items: { type: "string" }, description: "Seções do relatório" },
        },
        required: ["topic", "sections"],
      },
    },
  ],
};

function getToolsForAgent(agent: TaskWithRelations["agent"]): AITool[] {
  const tools = [...BASE_AGENT_TOOLS];
  if (agent?.specialty) {
    const extra = SPECIALTY_TOOLS[agent.specialty];
    if (extra) tools.push(...extra);
  }
  return tools;
}

// Emit real-time event for HQ 3D sync
function emitAgentEvent(
  agentId: string,
  status: string,
  taskId: string,
  missionTitle: string
) {
  if (typeof process !== "undefined" && process.env.HQ_SSE_ENABLED === "true") {
    // Event is picked up by the HQ SSE route via global event emitter
    try {
      const { eventEmitter } = require("../events");
      eventEmitter.emit("agent:status", { agentId, status, taskId, missionTitle, ts: Date.now() });
    } catch {
      // Event emitter not available — not critical
    }
  }
}

export async function executeTask(taskId: string, db: ExecutorDB): Promise<void> {
  await db.task.update({
    where: { id: taskId },
    data: { status: "IN_PROGRESS", startedAt: new Date() },
  });

  try {
    const task = await db.task.findUniqueOrThrow({
      where: { id: taskId },
      include: { agent: true, mission: { include: { client: true } } },
    });

    if (!task.agent) {
      throw new Error("Task has no assigned agent");
    }

    // Check dependencies are complete
    const dependsOnIds = Array.isArray(task.dependsOn) ? (task.dependsOn as string[]) : []
    if (dependsOnIds.length > 0) {
      const deps = await db.task.findMany({
        where: { id: { in: dependsOnIds } },
        select: { id: true, status: true },
      });
      const incomplete = deps.filter((d) => d.status !== "COMPLETED");
      if (incomplete.length > 0) {
        await db.task.update({
          where: { id: taskId },
          data: { status: "WAITING_DEPENDENCY" },
        });
        return;
      }
    }

    emitAgentEvent(task.agentId!, "working", taskId, task.mission.title);

    const userPrompt = buildUserPrompt(task);

    await initializeProviders();
    const provider = registry.getDefault();

    const messages = task.agent.systemPrompt
      ? [
          { role: "system" as const, content: task.agent.systemPrompt },
          { role: "user" as const, content: userPrompt },
        ]
      : [{ role: "user" as const, content: userPrompt }];

    const tools = getToolsForAgent(task.agent);
    const savedDocuments: Array<{ title: string; type: string }> = [];
    const clarifications: string[] = [];

    // Agentic loop via completeWithLoop
    const result = await provider.completeWithLoop(
      {
        model: task.agent.model ?? undefined,
        messages,
        maxTokens: 4096,
        tools,
      },
      async (toolName, args) => {
        if (toolName === "save_document") {
          const { title, content, type } = args as { title: string; content: string; type: string };
          savedDocuments.push({ title, type });

          if (db.document) {
            const DOC_TYPE_MAP: Record<string, string> = {
              report: "RESEARCH_REPORT",
              analysis: "ANALYSIS",
              copy: "COPY",
              strategy: "STRATEGY",
              brief: "CREATIVE_BRIEF",
              script: "DELIVERABLE",
              proposal: "PROPOSAL",
              other: "OTHER",
            };
            const prismaType = DOC_TYPE_MAP[type] ?? "OTHER";
            await db.document.create({
              data: {
                title,
                content,
                type: prismaType,
                taskId: task.id,
                missionId: task.missionId,
                agentId: task.agentId!,
              },
            });
          }

          return `Documento "${title}" (${type}) salvo com sucesso no sistema.`;
        }

        if (toolName === "request_clarification") {
          const { question, continueWithAssumptions, assumptions } = args as {
            question: string;
            continueWithAssumptions: boolean;
            assumptions?: string;
          };
          clarifications.push(question);

          if (continueWithAssumptions && assumptions) {
            return `Dúvida registrada: "${question}". Continuando com as suposições: ${assumptions}`;
          }
          return `Dúvida registrada: "${question}". Continuando com informações disponíveis.`;
        }

        if (toolName === "generate_headline_variations") {
          const { mainMessage, count = 5 } = args as { mainMessage: string; count?: number };
          return `Tarefa de geração de ${count} variações de headline para: "${mainMessage}". Gere-as no documento final.`;
        }

        if (toolName === "structure_analysis") {
          const { topic, sections } = args as { topic: string; sections: string[] };
          return `Estrutura de análise criada para "${topic}" com seções: ${sections.join(", ")}. Preencha cada seção no documento final.`;
        }

        return `Ferramenta "${toolName}" executada.`;
      }
    );

    await db.task.update({
      where: { id: taskId },
      data: {
        status: "COMPLETED",
        output: {
          text: result.content,
          usage: result.usage,
          documents: savedDocuments,
          clarifications,
        },
        completedAt: new Date(),
      },
    });

    await db.agent.update({
      where: { id: task.agentId! },
      data: {
        tasksCompleted: { increment: 1 },
        tasksTotal: { increment: 1 },
        status: "IDLE",
      },
    });

    emitAgentEvent(task.agentId!, "idle", taskId, task.mission.title);

    await db.activityLog.create({
      data: {
        agentId: task.agentId!,
        missionId: task.missionId,
        taskId: task.id,
        action: "TASK_COMPLETED",
        details: {
          tokens: result.usage,
          documentsSaved: savedDocuments.length,
          clarifications,
        },
        level: "INFO",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    await db.task.update({
      where: { id: taskId },
      data: {
        status: "FAILED",
        output: { error: message },
        retryCount: { increment: 1 },
      },
    });

    await db.activityLog.create({
      data: {
        taskId,
        action: "TASK_FAILED",
        details: { error: message },
        level: "ERROR",
      },
    });
  }
}

function buildUserPrompt(task: TaskWithRelations): string {
  const parts = [
    `# Missão: ${task.mission.title}`,
    `Cliente: ${task.mission.client.name}`,
    `Objetivo: ${task.mission.objective}`,
    ``,
    `## Sua Tarefa: ${task.title}`,
    task.description,
    ``,
    `## Instruções Detalhadas`,
    task.instructions,
    ``,
    `## Instruções de Entrega`,
    `Use a ferramenta \`save_document\` para salvar o resultado final. Isso é OBRIGATÓRIO.`,
    `Se precisar de informações adicionais, use \`request_clarification\` e continue com suposições razoáveis.`,
  ];

  if (task.input) {
    parts.push(``, `## Contexto Adicional`, JSON.stringify(task.input, null, 2));
  }

  return parts.join("\n");
}
