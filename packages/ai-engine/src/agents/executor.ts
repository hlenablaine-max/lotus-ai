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
      where: { id?: { in: string[] }; missionId?: string; status?: string; NOT?: { id: string } };
      select: { id: boolean; status: boolean; retryCount?: boolean };
      take?: number;
    }): Promise<Array<{ id: string; status: string; retryCount?: number }>>;
  };
  agent: {
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
  };
  activityLog: {
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
  };
  mission?: {
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
  };
  document?: {
    create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
    findMany?(args: {
      where: { missionId: string; NOT?: { taskId: string } };
      select: { title: boolean; content: boolean; type: boolean };
      orderBy?: { createdAt: "asc" | "desc" };
      take?: number;
    }): Promise<Array<{ title: string; content: string; type: string }>>;
  };
  approval?: {
    create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
    findUnique(args: { where: { id: string }; select: { status: boolean } }): Promise<{ status: string } | null>;
  };
  integration?: {
    findFirst(args: { where: { type: string; status: string } }): Promise<{ config: unknown } | null>;
  };
  runtime?: {
    call(endpoint: string, data?: Record<string, unknown>): Promise<unknown>;
    available(): Promise<boolean>;
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
    name: "request_approval",
    description:
      "Solicita aprovação humana antes de executar uma ação crítica (publicar post, enviar mensagem, criar campanha paga, etc.). Use SEMPRE antes de qualquer ação que afete o mundo externo.",
    parameters: {
      properties: {
        type: {
          type: "string",
          enum: ["PUBLISH_CAMPAIGN", "SPEND_BUDGET", "SEND_EXTERNAL_MESSAGE", "EXTERNAL_ACTION", "SEND_PROPOSAL", "OTHER"],
          description: "Tipo de aprovação necessária",
        },
        title: { type: "string", description: "Título curto da ação que precisa de aprovação" },
        description: { type: "string", description: "Descrição detalhada do que será feito se aprovado" },
        payload: {
          type: "object",
          description: "Dados da ação a executar (phone, message, post_content, budget, etc.)",
        },
      },
      required: ["type", "title", "description", "payload"],
    },
  },
  {
    name: "send_whatsapp",
    description:
      "Envia mensagem WhatsApp para o cliente via Evolution API. SEMPRE use request_approval antes.",
    parameters: {
      properties: {
        phone: { type: "string", description: "Número com DDI, ex: 5571920001249" },
        message: { type: "string", description: "Mensagem a enviar" },
        approvalId: { type: "string", description: "ID da aprovação já concedida para este envio" },
      },
      required: ["phone", "message"],
    },
  },
  {
    name: "schedule_post",
    description:
      "Agenda um post para publicação numa rede social. Salva como entregável com data/horário e plataforma.",
    parameters: {
      properties: {
        platform: { type: "string", enum: ["instagram", "facebook", "linkedin", "tiktok"], description: "Rede social" },
        caption: { type: "string", description: "Legenda do post" },
        scheduledFor: { type: "string", description: "Data/hora ISO 8601, ex: 2026-11-20T14:00:00Z" },
        mediaDescription: { type: "string", description: "Descrição do visual/foto/vídeo a usar" },
        hashtags: { type: "array", items: { type: "string" }, description: "Hashtags sem o #" },
      },
      required: ["platform", "caption", "scheduledFor"],
    },
  },
  {
    name: "run_browser",
    description:
      "Controla o navegador no computador local via Playwright (abre URLs, clica, digita, tira screenshot). Requer que o app LOTUS desktop esteja rodando. Use para publicar posts, acessar portais de clientes, etc.",
    parameters: {
      properties: {
        action: {
          type: "string",
          enum: ["open", "navigate", "click", "type", "screenshot", "get_text", "close"],
          description: "Ação a executar no browser",
        },
        url: { type: "string", description: "URL para abrir/navegar (use com action=open ou navigate)" },
        selector: { type: "string", description: "Seletor CSS do elemento (use com click, type, get_text)" },
        text: { type: "string", description: "Texto a digitar (use com action=type)" },
      },
      required: ["action"],
    },
  },
  {
    name: "exec_local",
    description:
      "Executa um comando ou script Python no computador local. Use para automações, geração de arquivos, scrapers, etc. Requer app LOTUS desktop rodando.",
    parameters: {
      properties: {
        type: {
          type: "string",
          enum: ["python", "command"],
          description: "python = executa script Python; command = executa comando shell",
        },
        code: { type: "string", description: "O script Python ou comando shell a executar" },
      },
      required: ["type", "code"],
    },
  },
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

    // Fetch documents from already-completed sibling tasks (feedback loop)
    let prevDocs: Array<{ title: string; content: string; type: string }> = [];
    if (db.document?.findMany) {
      try {
        prevDocs = await db.document.findMany({
          where: { missionId: task.missionId, NOT: { taskId: task.id } },
          select: { title: true, content: true, type: true },
          orderBy: { createdAt: "asc" },
          take: 5,
        });
      } catch {
        // non-critical — proceed without context
      }
    }

    const userPrompt = buildUserPrompt(task, prevDocs);

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

        if (toolName === "request_approval") {
          const { type, title, description: approvalDesc, payload } = args as {
            type: string; title: string; description: string; payload: Record<string, unknown>;
          };

          if (db.approval) {
            const approval = await db.approval.create({
              data: {
                missionId: task.missionId,
                requestedBy: task.agentId ?? "unknown",
                type,
                title,
                description: approvalDesc,
                payload,
                status: "PENDING",
              },
            });
            // Poll for decision (up to 5 minutes)
            const startWait = Date.now();
            while (Date.now() - startWait < 300_000) {
              await new Promise((r) => setTimeout(r, 5000));
              const updated = await db.approval.findUnique({
                where: { id: approval.id },
                select: { status: true },
              });
              if (updated?.status === "APPROVED") {
                return `Aprovação concedida para: "${title}". ID: ${approval.id}. Pode prosseguir.`;
              }
              if (updated?.status === "REJECTED") {
                return `Aprovação NEGADA para: "${title}". Não execute esta ação. Registre como pendente.`;
              }
            }
            return `Aprovação criada (ID: ${approval.id}) mas não decidida em 5 minutos. Salve como pendente e continue com outras tarefas.`;
          }

          return `Aprovação registrada para "${title}". Aguardando decisão humana.`;
        }

        if (toolName === "send_whatsapp") {
          const { phone, message, approvalId } = args as { phone: string; message: string; approvalId?: string };

          if (approvalId && db.approval) {
            const approval = await db.approval.findUnique({
              where: { id: approvalId },
              select: { status: true },
            });
            if (approval?.status !== "APPROVED") {
              return `WhatsApp NÃO enviado. Aprovação "${approvalId}" ainda não foi concedida (status: ${approval?.status ?? "não encontrada"}). Use request_approval primeiro.`;
            }
          }

          // Try to send via Evolution API if integration is configured
          if (db.integration) {
            const integration = await db.integration.findFirst({
              where: { type: "WHATSAPP", status: "CONNECTED" },
            });

            if (integration) {
              const config = integration.config as Record<string, string>;
              try {
                const evoResponse = await fetch(`${config.apiUrl}/message/sendText/${config.instance}`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json", apikey: config.apiKey ?? "" },
                  body: JSON.stringify({ number: phone, text: message }),
                });
                if (evoResponse.ok) {
                  return `WhatsApp enviado para ${phone}. Mensagem: "${message.substring(0, 100)}..."`;
                }
                const err = await evoResponse.text();
                return `Falha ao enviar WhatsApp: ${err}. Integração configurada mas API retornou erro.`;
              } catch (e) {
                return `Erro ao chamar Evolution API: ${e}. Registre para envio manual.`;
              }
            }
          }

          // No integration: save as pending delivery
          if (db.document) {
            await db.document.create({
              data: {
                missionId: task.missionId,
                taskId: task.id,
                title: `WhatsApp Pendente — ${phone}`,
                type: "DELIVERABLE",
                content: `**Para:** ${phone}\n\n**Mensagem:**\n${message}\n\n*Envio manual necessário — integração WhatsApp não configurada.*`,
              },
            });
          }

          return `WhatsApp salvo como entregável pendente para ${phone}. Configure a integração WhatsApp em Configurações > Integrações para envio automático.`;
        }

        if (toolName === "run_browser") {
          const { action, url, selector, text } = args as {
            action: string; url?: string; selector?: string; text?: string;
          };

          if (!db.runtime) {
            return "Runtime local indisponível. App LOTUS desktop não está rodando ou não iniciou o runtime.";
          }

          try {
            const endpointMap: Record<string, string> = {
              open: "/runtime/browser/open",
              navigate: "/runtime/browser/navigate",
              click: "/runtime/browser/click",
              type: "/runtime/browser/type",
              screenshot: "/runtime/browser/screenshot",
              get_text: "/runtime/browser/get-text",
              close: "/runtime/browser/close",
            };
            const endpoint = endpointMap[action];
            if (!endpoint) return `Ação de browser desconhecida: ${action}`;

            const data: Record<string, unknown> = {};
            if (url) data.url = url;
            if (selector) data.selector = selector;
            if (text) data.text = text;

            const result = await db.runtime.call(endpoint, data) as Record<string, unknown>;

            if (action === "screenshot") {
              const screenshot = result.screenshot as string;
              if (db.document && screenshot) {
                await db.document.create({
                  data: {
                    missionId: task.missionId,
                    taskId: task.id,
                    title: `Screenshot — ${new Date().toLocaleString("pt-BR")}`,
                    type: "DELIVERABLE",
                    content: `Screenshot capturado:\n\n![screenshot](${screenshot.substring(0, 100)}...)`,
                  },
                });
              }
              return `Screenshot capturado com sucesso (base64, ${screenshot?.length ?? 0} chars).`;
            }

            if (action === "get_text") {
              return `Texto obtido: "${result.text}"`;
            }

            return `Browser: ação "${action}" executada com sucesso.`;
          } catch (e) {
            return `Erro no browser: ${String(e)}`;
          }
        }

        if (toolName === "exec_local") {
          const { type, code } = args as { type: string; code: string };

          if (!db.runtime) {
            return "Runtime local indisponível. App LOTUS desktop não está rodando.";
          }

          try {
            const endpoint = type === "python" ? "/runtime/exec-python" : "/runtime/exec";
            const data = type === "python" ? { script: code } : { cmd: code };
            const result = await db.runtime.call(endpoint, data) as {
              success: boolean; stdout: string; stderr: string; exitCode: number; duration: number;
            };

            const summary = [
              `Execução ${result.success ? "concluída" : "falhou"} em ${result.duration}ms (exit ${result.exitCode})`,
              result.stdout ? `\nSaída:\n${result.stdout.slice(0, 2000)}` : "",
              result.stderr ? `\nErros:\n${result.stderr.slice(0, 500)}` : "",
            ].filter(Boolean).join("");

            if (result.stdout && db.document) {
              await db.document.create({
                data: {
                  missionId: task.missionId,
                  taskId: task.id,
                  title: `Resultado exec_local — ${new Date().toLocaleString("pt-BR")}`,
                  type: "DELIVERABLE",
                  content: summary,
                },
              });
            }

            return summary;
          } catch (e) {
            return `Erro ao executar localmente: ${String(e)}`;
          }
        }

        if (toolName === "schedule_post") {
          const { platform, caption, scheduledFor, mediaDescription, hashtags } = args as {
            platform: string; caption: string; scheduledFor: string; mediaDescription?: string; hashtags?: string[];
          };

          const hashtagStr = hashtags ? `\n\n${hashtags.map((h) => `#${h}`).join(" ")}` : "";
          const content = [
            `**Plataforma:** ${platform.toUpperCase()}`,
            `**Agendado para:** ${new Date(scheduledFor).toLocaleString("pt-BR")}`,
            ``,
            `**Legenda:**`,
            caption + hashtagStr,
            mediaDescription ? `\n**Visual:** ${mediaDescription}` : "",
          ].filter(Boolean).join("\n");

          if (db.document) {
            await db.document.create({
              data: {
                missionId: task.missionId,
                taskId: task.id,
                title: `Post Agendado — ${platform.toUpperCase()} — ${new Date(scheduledFor).toLocaleDateString("pt-BR")}`,
                type: "DELIVERABLE",
                content,
                metadata: { platform, scheduledFor, hashtags, status: "SCHEDULED" },
              },
            });
          }

          return `Post agendado para ${platform} em ${new Date(scheduledFor).toLocaleString("pt-BR")}. Legenda salva como entregável.`;
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

    // Auto-complete mission when all sibling tasks are done
    if (db.mission) {
      try {
        const siblings = await db.task.findMany({
          where: { missionId: task.missionId, NOT: { id: task.id } },
          select: { id: true, status: true },
        });
        const allDone = siblings.every(
          (t) => t.status === "COMPLETED" || t.status === "CANCELLED" || t.status === "SKIPPED"
        );
        if (allDone) {
          await db.mission.update({
            where: { id: task.missionId },
            data: { status: "COMPLETED", completedAt: new Date() },
          });
        }
      } catch {
        // non-critical
      }
    }

    // Auto-retry sibling FAILED tasks (respects maxRetries=3)
    try {
      const failedSiblings = await db.task.findMany({
        where: { missionId: task.missionId, status: "FAILED", NOT: { id: task.id } },
        select: { id: true, status: true, retryCount: true },
        take: 5,
      });
      for (const sibling of failedSiblings) {
        if ((sibling.retryCount ?? 0) < 3) {
          executeTask(sibling.id, db).catch(() => {});
        }
      }
    } catch {
      // non-critical
    }
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

function buildUserPrompt(
  task: TaskWithRelations,
  prevDocs: Array<{ title: string; content: string; type: string }> = []
): string {
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

  if (prevDocs.length > 0) {
    parts.push(``, `## Entregáveis Anteriores desta Missão`);
    parts.push(
      `Os seguintes documentos já foram produzidos por outros agentes nesta missão. Use-os como contexto para o seu trabalho:`
    );
    for (const doc of prevDocs) {
      parts.push(``, `### ${doc.title} (${doc.type})`, doc.content.slice(0, 2000));
    }
  }

  return parts.join("\n");
}
