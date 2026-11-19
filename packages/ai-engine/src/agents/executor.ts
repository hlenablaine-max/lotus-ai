// Task Executor — Runs a DB task through the right agent and saves output
// Uses dependency injection for the DB layer so ai-engine stays DB-agnostic.

import { registry } from "../providers/registry";
import type { AIImage, AIProvider, AITool, ToolExecutor } from "../providers/types";
import type { PermissionMode } from "../settings";

export interface ExecuteTaskOptions {
  provider?: AIProvider;
  model?: string;
  // "ask": ações no computador local viram pedidos de aprovação; "auto": executam direto.
  permissionMode?: PermissionMode;
  // Imagens anexadas à tarefa (o agente "enxerga" prints e quadros de vídeo)
  images?: AIImage[];
  // Ferramentas extras fornecidas pela aplicação (ex.: pesquisa na web)
  extraTools?: AITool[];
  extraToolExecutor?: ToolExecutor;
}

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
      select: { title: boolean; content: boolean; type: boolean; taskId?: boolean };
      orderBy?: { createdAt: "asc" | "desc" };
      take?: number;
    }): Promise<Array<{ title: string; content: string; type: string; taskId?: string | null }>>;
  };
  approval?: {
    create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
    findUnique(args: { where: { id: string }; select: { status: boolean } }): Promise<{ status: string } | null>;
  };
  integration?: {
    findFirst(args: { where: { type: string; status: string } }): Promise<{ config: unknown } | null>;
  };
  memory?: {
    findMany(args: {
      where: { scope: string; clientId: string };
      select: { key: boolean; content: boolean };
      orderBy: { updatedAt: "asc" | "desc" };
      take: number;
    }): Promise<Array<{ key: string; content: string }>>;
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
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
    client: {
      id: string;
      name: string;
      segment?: string | null;
      website?: string | null;
      instagram?: string | null;
      description?: string | null;
    };
  };
}

// Tools available to ALL agents
const BASE_AGENT_TOOLS: AITool[] = [
  {
    name: "request_approval",
    description:
      "Solicita aprovação humana para uma ação crítica (publicar post, enviar mensagem, criar campanha paga, gastar verba, etc.). A ação NÃO é executada por você: registre no payload tudo que o sistema precisa para executá-la depois que o dono aprovar, e siga com o restante da tarefa.",
    parameters: {
      properties: {
        type: {
          type: "string",
          enum: ["PUBLISH_CAMPAIGN", "SPEND_BUDGET", "SEND_EXTERNAL_MESSAGE", "EXTERNAL_ACTION", "IMPLEMENT_IN_PRODUCTION", "SEND_PROPOSAL", "CREATE_AGENT", "OTHER"],
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
      "Envia mensagem WhatsApp via Evolution API. Só funciona com o approvalId de uma aprovação JÁ CONCEDIDA; sem isso, use request_approval (type SEND_EXTERNAL_MESSAGE, payload { phone, message }) e o sistema envia após a aprovação.",
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

export async function executeTask(taskId: string, db: ExecutorDB, opts: ExecuteTaskOptions = {}): Promise<void> {
  await db.task.update({
    where: { id: taskId },
    data: { status: "IN_PROGRESS", startedAt: new Date() },
  });
  const permissionMode: PermissionMode = opts.permissionMode ?? "ask";

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
    let prevDocs: PrevDoc[] = [];
    if (db.document?.findMany) {
      try {
        const all = await db.document.findMany({
          where: { missionId: task.missionId, NOT: { taskId: task.id } },
          select: { title: true, content: true, type: true, taskId: true },
          orderBy: { createdAt: "asc" },
          take: 40,
        });
        // Os entregáveis de que esta tarefa depende entram primeiro e com mais espaço;
        // o restante da missão entra como contexto resumido.
        const direct = all.filter((d) => d.taskId && dependsOnIds.includes(d.taskId)).map((d) => ({ ...d, direct: true }));
        const others = all.filter((d) => !d.taskId || !dependsOnIds.includes(d.taskId));
        prevDocs = [...direct, ...others.slice(0, Math.max(0, 14 - direct.length))];
      } catch {
        // non-critical — proceed without context
      }
    }

    // Memória do cliente: aprendizados de missões anteriores do MESMO cliente
    let clientMemories: Array<{ key: string; content: string }> = [];
    if (db.memory) {
      try {
        clientMemories = await db.memory.findMany({
          where: { scope: "CLIENT", clientId: task.mission.client.id },
          select: { key: true, content: true },
          orderBy: { updatedAt: "desc" },
          take: 8,
        });
      } catch {
        // non-critical
      }
    }

    const userPrompt = buildUserPrompt(task, prevDocs, clientMemories);

    const provider = opts.provider ?? registry.getDefault();

    await db.activityLog.create({
      data: {
        agentId: task.agentId!,
        missionId: task.missionId,
        taskId: task.id,
        action: "TASK_STARTED",
        details: { title: task.title, provider: provider.name },
        level: "INFO",
      },
    });

    const messages = task.agent.systemPrompt
      ? [
          { role: "system" as const, content: task.agent.systemPrompt },
          { role: "user" as const, content: userPrompt, images: opts.images },
        ]
      : [{ role: "user" as const, content: userPrompt, images: opts.images }];

    const extraToolNames = new Set((opts.extraTools ?? []).map((t) => t.name));
    const tools = [...getToolsForAgent(task.agent), ...(opts.extraTools ?? [])];
    const savedDocuments: Array<{ title: string; type: string }> = [];
    const clarifications: string[] = [];
    const pendingApprovals: string[] = [];

    // Aprovação durável: o agente não fica esperando; o sistema executa após a decisão.
    const createApproval = async (
      type: string,
      title: string,
      description: string,
      payload: Record<string, unknown>
    ): Promise<string | null> => {
      if (!db.approval) return null;
      const approval = await db.approval.create({
        data: {
          missionId: task.missionId,
          requestedBy: task.agentId ?? "unknown",
          type,
          title,
          description,
          payload: { ...payload, taskId: task.id, agentId: task.agentId, clientId: task.mission.client.id },
          status: "PENDING",
        },
      });
      pendingApprovals.push(approval.id);
      await db.activityLog.create({
        data: {
          agentId: task.agentId!,
          missionId: task.missionId,
          taskId: task.id,
          action: "APPROVAL_REQUESTED",
          details: { approvalId: approval.id, type, title },
          level: "WARN",
        },
      });
      if (db.mission) {
        await db.mission.update({ where: { id: task.missionId }, data: { status: "WAITING_APPROVAL" } });
      }
      return approval.id;
    };

    // Agentic loop via completeWithLoop
    const result = await provider.completeWithLoop(
      {
        model: opts.model,
        messages,
        // Entregas de produção (página em HTML, calendário de 30 dias) passam de 4 mil tokens
        maxTokens: 16000,
        maxIterations: 15,
        tools,
      },
      async (toolName, args) => {
        if (opts.extraToolExecutor && extraToolNames.has(toolName)) {
          return opts.extraToolExecutor(toolName, args);
        }

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

          const approvalId = await createApproval(type, title, approvalDesc, payload ?? {});
          if (approvalId) {
            return `Aprovação solicitada (ID: ${approvalId}) e enviada ao dono. A ação "${title}" NÃO foi executada e será executada pelo sistema assim que for aprovada. Não espere: conclua o restante da tarefa e registre no entregável que esta ação aguarda aprovação.`;
          }

          return `Aprovação registrada para "${title}". Aguardando decisão humana.`;
        }

        if (toolName === "send_whatsapp") {
          const { phone, message, approvalId } = args as { phone: string; message: string; approvalId?: string };

          // Mensagem externa sempre exige aprovação humana concedida.
          const waApproval = approvalId && db.approval
            ? await db.approval.findUnique({ where: { id: approvalId }, select: { status: true } })
            : null;
          if (waApproval?.status !== "APPROVED") {
            return `WhatsApp NÃO enviado: é obrigatória uma aprovação concedida (status atual: ${waApproval?.status ?? "sem aprovação"}). Use request_approval com type SEND_EXTERNAL_MESSAGE e payload { phone, message }; o sistema envia após a aprovação.`;
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

          if (permissionMode === "ask" && (action === "click" || action === "type")) {
            const id = await createApproval(
              "EXTERNAL_ACTION",
              `Ação no navegador: ${action} ${selector ?? ""}`.trim(),
              `O agente ${task.agent!.name} quer executar "${action}" no navegador local${selector ? ` em ${selector}` : ""}${text ? ` com o texto "${text.slice(0, 200)}"` : ""}.`,
              { action: "run_browser", args: { action, url, selector, text } }
            );
            return `Ação de navegador NÃO executada: aguardando aprovação do dono (ID: ${id ?? "n/d"}). Conclua o restante da tarefa.`;
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

          if (permissionMode === "ask") {
            const id = await createApproval(
              "EXTERNAL_ACTION",
              `Executar ${type === "python" ? "script Python" : "comando"} no computador`,
              `O agente ${task.agent!.name} quer executar no computador local:\n\n${code.slice(0, 1500)}`,
              { action: "exec_local", args: { type, code } }
            );
            return `Execução local NÃO realizada: aguardando aprovação do dono (ID: ${id ?? "n/d"}). Conclua o restante da tarefa.`;
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

    // O agente entregou o trabalho como resposta, mas esqueceu de salvar: o sistema salva por ele,
    // para nenhuma entrega sumir do pacote (aconteceu com uma página de 22 mil tokens).
    if (savedDocuments.length === 0 && db.document && (result.content ?? "").trim().length >= 800) {
      await db.document.create({
        data: { title: task.title, content: result.content, type: "DELIVERABLE", taskId: task.id, missionId: task.missionId },
      });
      savedDocuments.push({ title: task.title, type: "auto" });
    }

    await db.task.update({
      where: { id: taskId },
      data: {
        status: "COMPLETED",
        output: {
          text: result.content,
          usage: result.usage,
          documents: savedDocuments,
          clarifications,
          pendingApprovals,
        },
        completedAt: new Date(),
      },
    });

    // Memória do cliente: resumo do que foi entregue, para as próximas missões
    if (db.memory && result.content) {
      try {
        await db.memory.create({
          data: {
            scope: "CLIENT",
            clientId: task.mission.client.id,
            agentId: task.agentId,
            key: `task:${task.id}`,
            content: `[${task.agent.name}] ${task.title} — ${result.content.replace(/\s+/g, " ").slice(0, 700)}`,
            metadata: { missionId: task.missionId, documents: savedDocuments },
          },
        });
      } catch {
        // non-critical
      }
    }

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
        if (allDone && pendingApprovals.length === 0) {
          await db.mission.update({
            where: { id: task.missionId },
            data: { status: "COMPLETED", completedAt: new Date() },
          });
        }
      } catch {
        // non-critical
      }
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
    throw error;
  }
}

type PrevDoc = { title: string; content: string; type: string; taskId?: string | null; direct?: boolean };

function buildUserPrompt(
  task: TaskWithRelations,
  prevDocs: PrevDoc[] = [],
  clientMemories: Array<{ key: string; content: string }> = []
): string {
  const client = task.mission.client;
  const clientProfile = [
    `Cliente: ${client.name}`,
    client.segment ? `Segmento: ${client.segment}` : "",
    client.website ? `Site: ${client.website}` : "",
    client.instagram ? `Instagram: @${client.instagram.replace(/^@/, "")}` : "",
    client.description ? `Contexto: ${client.description}` : "",
  ].filter(Boolean);

  const parts = [
    `# Missão: ${task.mission.title}`,
    ...clientProfile,
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
    `Nunca invente dados, números, depoimentos ou resultados: o que não foi verificado deve ser marcado como hipótese.`,
    `Ações que afetam o mundo externo (publicar, enviar mensagem, gastar verba, implementar em produção) exigem \`request_approval\`.`,
    ``,
    `## Como escrever (vale para todo documento)`,
    `Quem lê é o Ícaro, dono da agência, que está aprendendo, e depois o dono da clínica. Escreva para eles entenderem de primeira:`,
    `- Português simples, frases curtas. Sem termos em inglês ou siglas sem explicação: escreva "custo por contato (CPL)" na primeira vez, nunca só "CPL"; nada de "growth", "insight", "funnel", "awareness".`,
    `- Comece pelo que importa: 3 a 5 linhas de resumo no topo, dizendo a situação e o principal problema.`,
    `- Use títulos curtos (##), listas e tabelas. Negrito só para a ideia principal de cada parágrafo, nunca em frases inteiras. No máximo um emoji por título.`,
    `- Todo problema/gargalo segue este formato:`,
    `  **O problema:** o que está errado, em uma frase.`,
    `  **A prova:** o dado real que mostra isso (cite números, trechos, prints).`,
    `  **Por que custa dinheiro:** o que acontece com o paciente por causa disso.`,
    `  **O que fazer:** a correção concreta.`,
    `  **Quanto pode melhorar:** uma faixa, com a conta e de onde vem a referência (ex.: "estudos de mercado mostram..."). Sem os números do cliente, diga quais premissas usou. Nunca apresente estimativa como certeza.`,
    `- Não comece com "Relatório salvo", "Segue" ou "Claro": comece pelo conteúdo.`,
  ];

  if (clientMemories.length > 0) {
    parts.push(``, `## Memória deste Cliente (trabalhos anteriores)`);
    for (const mem of clientMemories) parts.push(`- ${mem.content}`);
  }

  if (task.input) {
    // imagePaths são anexados como imagens à mensagem; não precisam aparecer no texto
    const { imagePaths: _imagePaths, ...context } = task.input as Record<string, unknown>;
    if (Object.keys(context).length > 0) {
      parts.push(``, `## Contexto Adicional`, JSON.stringify(context, null, 2));
    }
  }

  if (prevDocs.length > 0) {
    parts.push(``, `## Entregáveis Anteriores desta Missão`);
    parts.push(
      `Os seguintes documentos já foram produzidos por outros agentes nesta missão. Use-os como contexto para o seu trabalho:`
    );
    // Orçamento de ~42 mil caracteres dividido entre os entregáveis dos quais a tarefa depende
    const directCount = prevDocs.filter((d) => d.direct).length;
    const directLimit = directCount > 0 ? Math.min(14_000, Math.max(3_500, Math.floor(42_000 / directCount))) : 3_500;
    for (const doc of prevDocs) {
      // Dados brutos de coleta já chegam no contexto de cada tarefa; aqui entra só um trecho
      const limit = doc.direct ? directLimit : doc.type === "RESEARCH_REPORT" ? 1200 : 3500;
      parts.push(``, `### ${doc.title} (${doc.type})`, doc.content.slice(0, limit));
    }
  }

  return parts.join("\n");
}
