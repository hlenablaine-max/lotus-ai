// O que o sistema faz depois que o dono decide uma aprovação pedida por um agente.
// O agente propõe, o dono aprova, o SISTEMA executa exatamente o que foi aprovado.

import type { Approval } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createRuntimeClient } from "@/lib/runtime-client";
import { advanceMission, runTask } from "@/lib/task-runner";

type Payload = Record<string, unknown> & {
  kind?: string;
  action?: string;
  args?: Record<string, unknown>;
  taskId?: string;
  agentId?: string;
  phone?: string;
  message?: string;
};

async function saveResult(approval: Approval, payload: Payload, title: string, content: string) {
  if (!approval.missionId) return;
  await prisma.document.create({
    data: {
      missionId: approval.missionId,
      taskId: payload.taskId ?? null,
      title,
      type: "DELIVERABLE",
      content,
      metadata: { approvalId: approval.id },
    },
  });
}

async function sendWhatsApp(phone: string, message: string): Promise<{ sent: boolean; detail: string }> {
  const integration = await prisma.integration.findFirst({ where: { type: "WHATSAPP", status: "CONNECTED" } });
  const config = (integration?.config ?? null) as { apiUrl?: string; instance?: string; apiKey?: string } | null;
  if (!config?.apiUrl || !config.instance) {
    return { sent: false, detail: "Integração WhatsApp (Evolution API) não configurada — envio manual necessário." };
  }
  try {
    const res = await fetch(`${config.apiUrl}/message/sendText/${config.instance}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: config.apiKey ?? "" },
      body: JSON.stringify({ number: phone, text: message }),
      signal: AbortSignal.timeout(20_000),
    });
    if (res.ok) return { sent: true, detail: "Mensagem enviada." };
    return { sent: false, detail: `A API do WhatsApp recusou o envio: ${(await res.text()).slice(0, 300)}` };
  } catch (err) {
    return { sent: false, detail: `Falha ao chamar a API do WhatsApp: ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function executeApproved(approval: Approval, payload: Payload): Promise<string> {
  // Mensagem externa aprovada: o sistema envia (ou registra para envio manual).
  if (approval.type === "SEND_EXTERNAL_MESSAGE" && payload.phone && payload.message) {
    const result = await sendWhatsApp(String(payload.phone), String(payload.message));
    await saveResult(
      approval,
      payload,
      `WhatsApp ${result.sent ? "enviado" : "pendente"} — ${payload.phone}`,
      `**Para:** ${payload.phone}\n\n**Mensagem:**\n${payload.message}\n\n*${result.detail}*`
    );
    return result.detail;
  }

  // Ação local aprovada (comando/navegador pedido por um agente em tarefa): executa como foi aprovada.
  if (payload.action === "exec_local" && payload.args) {
    const runtime = createRuntimeClient();
    if (!(await runtime.available())) return "Aprovado, mas o aplicativo desktop não está aberto: ação não executada.";
    const type = String(payload.args.type ?? "command");
    const code = String(payload.args.code ?? "");
    const result = (await runtime.call(
      type === "python" ? "/runtime/exec-python" : "/runtime/exec",
      type === "python" ? { script: code } : { cmd: code }
    )) as { success: boolean; stdout: string; stderr: string; exitCode: number };
    const summary = `exit ${result.exitCode}\n${result.stdout.slice(0, 4000)}${result.stderr ? `\n--- erros ---\n${result.stderr.slice(0, 1000)}` : ""}`;
    await saveResult(approval, payload, `Execução aprovada — ${approval.title}`, `\`\`\`\n${code.slice(0, 2000)}\n\`\`\`\n\n${summary}`);
    return `Comando executado (exit ${result.exitCode}).`;
  }

  if (payload.action === "run_browser" && payload.args) {
    const runtime = createRuntimeClient();
    if (!(await runtime.available())) return "Aprovado, mas o aplicativo desktop não está aberto: ação não executada.";
    const action = String(payload.args.action ?? "");
    const endpoints: Record<string, string> = { click: "/runtime/browser/click", type: "/runtime/browser/type" };
    if (!endpoints[action]) return `Ação de navegador não suportada após aprovação: ${action}`;
    await runtime.call(endpoints[action], { selector: payload.args.selector, text: payload.args.text });
    return `Ação de navegador "${action}" executada.`;
  }

  // Demais aprovações: o agente que pediu recebe uma tarefa de continuação, já autorizada.
  if (approval.missionId && payload.agentId) {
    const task = await prisma.task.create({
      data: {
        missionId: approval.missionId,
        agentId: String(payload.agentId),
        title: `Executar ação aprovada: ${approval.title}`.slice(0, 180),
        description: `O dono APROVOU a ação "${approval.title}". Execute-a agora.`,
        instructions: [
          `A aprovação ${approval.id} foi CONCEDIDA pelo dono${approval.decisionNote ? ` com a nota: "${approval.decisionNote}"` : ""}.`,
          `Ação aprovada: ${approval.description}`,
          `Execute exatamente o que foi aprovado, usando os dados do contexto adicional. Se a execução depender de uma integração que não existe (ex.: publicar em plataforma sem acesso), entregue o pacote final pronto para execução manual e diga claramente o que falta.`,
        ].join("\n"),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        input: { approvalId: approval.id, approved: true, payload } as any,
        status: "PENDING",
      },
    });
    runTask(task.id, { permissionMode: "auto" });
    return "Tarefa de execução criada para o agente que solicitou.";
  }

  return "Aprovação registrada.";
}

export async function handleApprovalDecision(approval: Approval): Promise<string> {
  const payload = (approval.payload ?? {}) as Payload;

  // Confirmações do chat (modo CLI) são consumidas pela própria conversa, que está aguardando.
  if (payload.kind === "chat_tool") return "Decisão entregue ao chat.";

  let outcome = "Ação rejeitada: nada foi executado.";
  if (approval.status === "APPROVED") {
    try {
      outcome = await executeApproved(approval, payload);
    } catch (err) {
      outcome = `Falha ao executar a ação aprovada: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  await prisma.activityLog.create({
    data: {
      missionId: approval.missionId,
      taskId: payload.taskId ?? null,
      agentId: payload.agentId ?? null,
      action: approval.status === "APPROVED" ? "APPROVED_ACTION_EXECUTED" : "APPROVED_ACTION_SKIPPED",
      details: { approvalId: approval.id, title: approval.title, outcome },
      level: "INFO",
    },
  });

  if (approval.missionId) await advanceMission(approval.missionId);
  return outcome;
}
