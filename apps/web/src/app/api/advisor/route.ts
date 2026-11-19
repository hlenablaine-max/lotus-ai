import { NextRequest } from "next/server";
import { streamRootMaster, type AIMessage, type AITool, type ToolExecutor } from "@lotus/ai-engine";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/require-owner";
import { DB_TOOL_DEFS, createDbToolExecutor } from "@/lib/root-master-tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// LOTUS AI CEO: pensa sobre a LOTUS em si (não executa missões de clientes — isso é do Root Master).
const ADVISOR_SYSTEM_PROMPT = `Você é AURORA — LOTUS AI CEO, a advisor estratégica da LOTUS AI Enterprise.

SEU PAPEL (diferente do Root Master):
- O Root Master EXECUTA missões para os clientes. Você PENSA sobre a LOTUS como empresa, para o proprietário (Ícaro).
- Temas: pipeline de prospecção, quais clientes aceitar, precificação, posicionamento, risco de churn, capacidade da equipe de agentes, expansão.
- Você não cria missões nem delega tarefas. Quando a conclusão for "executar X", diga para pedir ao Root Master.

COMO TRABALHAR:
- Antes de opinar, consulte os dados reais com as ferramentas (clientes, missões, agentes, custos, atividade, aprovações, catálogo de soluções). Nunca invente números.
- Para precificar um prospect: use get_client_details e get_solutions, estime esforço e valor, explique as premissas e registre com save_client_assessment. Referência de preço da LOTUS: setup R$10.000–25.000 e mensalidade R$3.000–8.000; transformação digital por projeto.
- Separe sempre FATO (veio dos dados) de HIPÓTESE (sua estimativa).
- Seja direta: diagnóstico, recomendação, risco principal, próximo passo. Sem floreio.

CONTEXTO: a LOTUS é uma empresa de Business Growth & Transformation com foco inicial em saúde (clínicas de estética, plástica, odontologia). A força de trabalho são agentes de IA em 9 departamentos, incluindo o Business Transformation Office.`;

const ADVISOR_TOOL_NAMES = new Set([
  "get_clients",
  "get_missions",
  "get_agents",
  "get_costs",
  "get_pending_tasks",
  "get_activity_log",
  "get_client_details",
  "get_solutions",
  "get_mission_documents",
  "get_approvals",
  "save_client_assessment",
  "search_web",
  "fetch_url",
]);

const ADVISOR_TOOLS: AITool[] = DB_TOOL_DEFS.filter((t) => ADVISOR_TOOL_NAMES.has(t.name));

export async function POST(request: NextRequest) {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;

  const body = await request.json();
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) return Response.json({ error: "message required" }, { status: 400 });

  const history: AIMessage[] = (Array.isArray(body.history) ? body.history : [])
    .filter((m: { role?: string; content?: unknown }) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-12)
    .map((m: { role: "user" | "assistant"; content: string }) => ({ role: m.role, content: m.content.slice(0, 6000) }));

  const encoder = new TextEncoder();
  const dbExecutor = createDbToolExecutor();
  const executor: ToolExecutor = async (name, args) =>
    ADVISOR_TOOL_NAMES.has(name) ? dbExecutor(name, args) : `Ferramenta "${name}" não disponível para a advisor.`;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      let full = "";
      try {
        for await (const chunk of streamRootMaster(message, {
          conversationHistory: history,
          overrideSystem: ADVISOR_SYSTEM_PROMPT,
          dbToolDefs: ADVISOR_TOOLS,
          dbToolExecutor: executor,
          maxIterations: 12,
          signal: request.signal,
        })) {
          if (chunk.delta) {
            full += chunk.delta;
            send({ delta: chunk.delta });
          }
        }
      } catch (err) {
        const text = err instanceof Error ? err.message : String(err);
        console.error("[api/advisor]", err);
        send({ delta: `\n\n⚠️ Erro ao consultar a IA: ${text}` });
      } finally {
        if (full) {
          await prisma.activityLog
            .create({ data: { action: "ADVISOR_CONSULTED", details: { question: message.slice(0, 300) }, level: "INFO" } })
            .catch(() => {});
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
