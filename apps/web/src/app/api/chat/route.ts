import { NextRequest } from "next/server";
import {
  streamRootMaster,
  registry,
  loadSettings,
  PROVIDER_DEFAULTS,
  type AIMessage,
  type AIProviderName,
  type ToolExecutor,
} from "@lotus/ai-engine";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/require-owner";
import { createRuntimeClient } from "@/lib/runtime-client";
import { DB_TOOL_DEFS, createDbToolExecutor } from "@/lib/root-master-tools";
import {
  LOCAL_TOOL_DEFS,
  buildLocalSystemPrompt,
  classifyLocalTool,
  describeLocalTool,
  executeLocalTool,
  isLocalTool,
} from "@/lib/local-tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CLEAR_MARKER = "__CLEAR__";
const HISTORY_LIMIT = 30;
const PERMISSION_TIMEOUT_MS = 15 * 60_000;

const DB_TOOL_LABELS: Record<string, string> = {
  get_clients: "Consultar clientes",
  get_missions: "Consultar missões",
  get_agents: "Consultar agentes",
  get_costs: "Consultar custos",
  get_pending_tasks: "Consultar tarefas pendentes",
  get_activity_log: "Consultar atividade",
  fetch_url: "Ler página",
  search_web: "Pesquisar na web",
  check_facebook_ads: "Verificar Meta Ads Library",
  search_instagram: "Consultar Instagram",
  search_google_maps: "Consultar Google Maps",
  create_client: "Cadastrar cliente",
  create_mission: "Criar missão",
  get_client_details: "Detalhes do cliente",
  get_agents_available: "Ver agentes disponíveis",
  create_task: "Delegar tarefa",
  get_solutions: "Consultar catálogo de soluções",
  get_mission_documents: "Ler entregáveis da missão",
  get_approvals: "Consultar aprovações",
  save_client_assessment: "Registrar assessment",
};

function argSummary(args: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const key of ["title", "name", "query", "url", "handle", "businessName", "clientName", "agentName", "search"]) {
    if (typeof args[key] === "string" && args[key]) parts.push(String(args[key]));
  }
  return parts.join(" · ").slice(0, 200);
}

// Mensagens da conversa atual (depois do último "limpar"), da mais antiga para a mais nova.
async function loadConversation(limit: number) {
  const marker = await prisma.chatMessage.findFirst({
    where: { role: "SYSTEM", content: CLEAR_MARKER },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  const recent = await prisma.chatMessage.findMany({
    where: {
      role: { in: ["USER", "ASSISTANT"] },
      ...(marker ? { createdAt: { gt: marker.createdAt } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return recent.reverse();
}

async function aiStatus() {
  const settings = loadSettings();
  const available = registry.listAvailable();
  let active: AIProviderName | null = null;
  try {
    active = registry.activeName();
  } catch {
    active = null;
  }
  const desktop = await createRuntimeClient().available();
  return {
    provider: active,
    model: active ? registry.get(active).getDefaultModel() : null,
    available: (Object.keys(PROVIDER_DEFAULTS) as AIProviderName[]).map((name) => ({
      name,
      label: PROVIDER_DEFAULTS[name].label,
      configured: available.includes(name),
      model: settings.ai.models[name] ?? PROVIDER_DEFAULTS[name].model,
    })),
    permissionMode: settings.agent.permissionMode,
    desktop,
  };
}

export async function POST(request: NextRequest) {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;

  let body: { message?: unknown; clientId?: string; provider?: string; model?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) return Response.json({ error: "message is required" }, { status: 400 });
  const clientId = body.clientId || undefined;

  const history: AIMessage[] = (await loadConversation(HISTORY_LIMIT)).map((m) => ({
    role: m.role === "USER" ? "user" : "assistant",
    content: m.content.slice(0, 6000),
  }));

  await prisma.chatMessage.create({
    data: { role: "USER", content: message, clientId: clientId ?? null, metadata: { source: "chat-ui" } },
  });

  let clientName: string | undefined;
  if (clientId) {
    const client = await prisma.client.findUnique({ where: { id: clientId }, select: { name: true } });
    clientName = client?.name;
  }

  const encoder = new TextEncoder();
  const abort = new AbortController();
  request.signal.addEventListener("abort", () => abort.abort());

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };

      let fullResponse = "";
      const toolsUsed: Array<{ name: string; title: string; status: string }> = [];

      try {
        const providerName = (body.provider as AIProviderName | undefined) ?? registry.activeName();
        const provider = registry.get(providerName);
        const model = body.model || provider.getDefaultModel();
        send({ meta: { provider: providerName, model } });

        const localPrompt = await buildLocalSystemPrompt();
        const desktop = localPrompt !== null;
        const tools = desktop ? [...DB_TOOL_DEFS, ...LOCAL_TOOL_DEFS] : DB_TOOL_DEFS;
        const extraSystem =
          localPrompt ??
          "FERRAMENTAS LOCAIS INDISPONÍVEIS: o aplicativo LOTUS desktop não está aberto, então você não pode executar comandos, editar arquivos nem controlar o navegador neste momento. Se o dono pedir isso, diga para abrir o aplicativo.";

        const dbExecutor = createDbToolExecutor();

        // Pede confirmação ao dono dentro do chat (e na tela de Aprovações) e espera a decisão.
        const askPermission = async (toolId: string, title: string, detail: string, risk: string, payload: Record<string, unknown>) => {
          const approval = await prisma.approval.create({
            data: {
              requestedBy: "root-master",
              type: "EXTERNAL_ACTION",
              title,
              description: detail || title,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              payload: { kind: "chat_tool", risk, ...payload } as any,
              status: "PENDING",
            },
          });
          send({ approval: { id: approval.id, toolId, title, detail, risk } });
          const deadline = Date.now() + PERMISSION_TIMEOUT_MS;
          while (Date.now() < deadline && !abort.signal.aborted) {
            await new Promise((r) => setTimeout(r, 1000));
            const current = await prisma.approval.findUnique({ where: { id: approval.id }, select: { status: true } });
            if (current && current.status !== "PENDING") {
              send({ approvalResolved: { id: approval.id, status: current.status } });
              return current.status;
            }
          }
          await prisma.approval.update({ where: { id: approval.id }, data: { status: "EXPIRED", decidedAt: new Date() } });
          send({ approvalResolved: { id: approval.id, status: "EXPIRED" } });
          return "EXPIRED";
        };

        const executor: ToolExecutor = async (name, args) => {
          const toolId = crypto.randomUUID();
          const local = isLocalTool(name);
          const described = local
            ? describeLocalTool(name, args)
            : { title: DB_TOOL_LABELS[name] ?? name, detail: argSummary(args) };
          const record = { name, title: described.title, status: "running" };
          toolsUsed.push(record);
          send({ tool: { id: toolId, name, title: described.title, detail: described.detail, status: "running" } });

          const finish = (status: "done" | "error" | "denied", result: string) => {
            record.status = status;
            send({ tool: { id: toolId, status, preview: result.slice(0, 4000) } });
            return result;
          };

          try {
            if (!local) return finish("done", await dbExecutor(name, args));

            const risk = classifyLocalTool(name, args);
            const mode = loadSettings().agent.permissionMode;
            if (risk === "destructive" || (risk === "mutating" && mode === "ask")) {
              const decision = await askPermission(toolId, described.title, described.detail, risk, { tool: name, args });
              if (decision !== "APPROVED") {
                return finish(
                  "denied",
                  decision === "REJECTED"
                    ? "Ação NEGADA pelo dono. Não tente de novo nem contorne por outro caminho; pergunte como ele prefere seguir."
                    : "Sem resposta do dono ao pedido de confirmação. Ação não executada."
                );
              }
            }

            const result = await executeLocalTool(name, args);
            if (risk !== "safe") {
              await prisma.activityLog.create({
                data: {
                  action: "LOCAL_TOOL",
                  details: { tool: name, title: described.title, detail: described.detail.slice(0, 500), risk, by: "root-master" },
                  level: risk === "destructive" ? "WARN" : "INFO",
                },
              });
            }
            return finish("done", result);
          } catch (err) {
            return finish("error", `Erro ao executar ${name}: ${err instanceof Error ? err.message : String(err)}`);
          }
        };

        for await (const chunk of streamRootMaster(
          message,
          {
            conversationHistory: history,
            clientId,
            clientName,
            extraSystem,
            model,
            maxIterations: 40,
            signal: abort.signal,
            dbToolDefs: tools,
            dbToolExecutor: executor,
          },
          providerName
        )) {
          if (chunk.delta) {
            fullResponse += chunk.delta;
            send({ delta: chunk.delta });
          }
        }

        if (!fullResponse && toolsUsed.length > 0) {
          fullResponse = `Concluído. Ações executadas: ${toolsUsed.map((t) => t.title).join("; ")}.`;
          send({ delta: fullResponse });
        }
      } catch (err) {
        if (!abort.signal.aborted) {
          const text = err instanceof Error ? err.message : String(err);
          console.error("[api/chat]", err);
          send({ error: text });
          if (!fullResponse) fullResponse = `⚠️ Erro: ${text}`;
        } else if (fullResponse) {
          fullResponse += "\n\n_(interrompido pelo dono)_";
        }
      } finally {
        if (fullResponse) {
          await prisma.chatMessage
            .create({
              data: {
                role: "ASSISTANT",
                content: fullResponse,
                clientId: clientId ?? null,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                metadata: { source: "root-master", tools: toolsUsed } as any,
              },
            })
            .catch(() => {});
        }
        if (!closed) {
          try {
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          } catch {
            // cliente desconectou
          }
        }
        closed = true;
        try {
          controller.close();
        } catch {
          // já fechado
        }
      }
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function GET(request: NextRequest) {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;

  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") || "50") || 50, 200);
  const [messages, ai] = await Promise.all([loadConversation(limit), aiStatus()]);
  return Response.json({ messages, ai });
}

// Inicia uma conversa nova (o histórico antigo fica guardado no banco).
export async function DELETE() {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;
  await prisma.chatMessage.create({ data: { role: "SYSTEM", content: CLEAR_MARKER, metadata: { source: "clear" } } });
  return Response.json({ success: true });
}
