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

// Teste de atendimento: envia a mensagem pelo WhatsApp Web do app e mede a resposta por até 10 minutos.
async function runWhatsAppProbe(approval: Approval, payload: Payload): Promise<string> {
  const runtime = createRuntimeClient();
  if (!(await runtime.available())) return "Aprovado, mas o aplicativo desktop não está aberto: teste não realizado.";
  const phone = String(payload.phone ?? "");
  const sent = (await runtime.call("/runtime/research/whatsapp-send", { phone, message: String(payload.message ?? "") }, 120_000)) as {
    sent: boolean;
    sentAt: string | null;
    reason?: string;
  };
  if (!sent.sent || !sent.sentAt) {
    await saveResult(approval, payload, `Teste de atendimento no WhatsApp — não realizado`, `**Número:** ${phone}\n\nO teste não foi feito: ${sent.reason ?? "motivo desconhecido"}`);
    return `Teste não realizado: ${sent.reason ?? "motivo desconhecido"}`;
  }

  const sentAt = new Date(sent.sentAt).getTime();
  const checksAtMinutes = [1, 3, 6, 10];
  const check = async (index: number, baseline: number) => {
    const minutes = checksAtMinutes[index];
    try {
      const read = (await runtime.call("/runtime/research/whatsapp-read", { phone }, 120_000)) as { connected: boolean; incoming: Array<{ meta: string; text: string }> };
      const replies = read.incoming.slice(baseline);
      if (replies.length > 0 || index === checksAtMinutes.length - 1) {
        const elapsed = Math.round((Date.now() - sentAt) / 60_000);
        const content = [
          `**Número testado:** ${phone}`,
          `**Mensagem enviada às** ${new Date(sentAt).toLocaleTimeString("pt-BR")}: "${payload.message}"`,
          ``,
          replies.length > 0
            ? `**Resposta recebida em até ${elapsed} minuto(s).**\n\n${replies.map((r) => `> ${r.text}`).join("\n")}\n\n${elapsed <= 1 ? "Resposta em menos de 1 minuto costuma indicar mensagem automática — confira o texto acima." : ""}`
            : `**Nenhuma resposta em ${minutes} minutos.** Um lead vindo de anúncio que espera mais de 5 minutos tem chance muito menor de agendar — aqui está um gargalo de atendimento.`,
          ``,
          `_Teste único, feito em horário ${new Date(sentAt).getHours() >= 8 && new Date(sentAt).getHours() < 18 ? "comercial" : "fora do comercial"}. Repita em outro horário antes de concluir._`,
        ].join("\n");
        await saveResult(approval, payload, `Teste de atendimento no WhatsApp — ${replies.length > 0 ? "respondeu" : "sem resposta"}`, content);
        await prisma.activityLog.create({
          data: { missionId: approval.missionId, action: "WHATSAPP_PROBE_RESULT", details: { phone, replied: replies.length > 0, minutes: elapsed }, level: "INFO" },
        });
        return;
      }
    } catch (err) {
      console.error("[whatsapp-probe]", err);
    }
    if (index < checksAtMinutes.length - 1) {
      setTimeout(() => check(index + 1, baseline), (checksAtMinutes[index + 1] - minutes) * 60_000);
    }
  };
  // Quantas mensagens recebidas já existiam nessa conversa antes do teste
  let baseline = 0;
  try {
    const before = (await runtime.call("/runtime/research/whatsapp-read", { phone }, 120_000)) as { incoming: unknown[] };
    baseline = before.incoming.length;
  } catch {
    baseline = 0;
  }
  setTimeout(() => check(0, baseline), checksAtMinutes[0] * 60_000);
  return "Mensagem de teste enviada. O resultado (se respondeu e em quanto tempo) entra nos entregáveis da missão em até 10 minutos.";
}

async function executeApproved(approval: Approval, payload: Payload): Promise<string> {
  if (payload.action === "whatsapp_probe") return runWhatsAppProbe(approval, payload);

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

// Aprovação dada pelo dono no ato do pedido (ex.: marcou "testar WhatsApp" ao iniciar o diagnóstico).
export async function decideApprovalBySystem(approvalId: string, note: string): Promise<void> {
  const claimed = await prisma.approval.updateMany({
    where: { id: approvalId, status: "PENDING" },
    data: { status: "APPROVED", decisionNote: note, decidedAt: new Date() },
  });
  if (claimed.count === 0) return;
  const approval = await prisma.approval.findUniqueOrThrow({ where: { id: approvalId } });
  await handleApprovalDecision(approval);
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
