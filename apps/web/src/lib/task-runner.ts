// Orquestração de tarefas: executa, encadeia dependências (DAG), tenta de novo em falha
// e mantém o status da missão coerente com tarefas e aprovações.

import { after } from "next/server";
import { executeTask, loadSettings, type ExecutorDB, type PermissionMode } from "@lotus/ai-engine";
import { prisma } from "@/lib/prisma";
import { createRuntimeClient } from "@/lib/runtime-client";

const TERMINAL = new Set(["COMPLETED", "CANCELLED", "SKIPPED"]);
const STALE_MINUTES = 20;

function executorDb(): ExecutorDB {
  return {
    task: prisma.task,
    agent: prisma.agent,
    activityLog: prisma.activityLog,
    mission: prisma.mission,
    document: prisma.document,
    approval: prisma.approval,
    integration: prisma.integration,
    memory: prisma.memory,
    runtime: createRuntimeClient(),
  } as unknown as ExecutorDB;
}

function dependencyIds(dependsOn: unknown): string[] {
  return Array.isArray(dependsOn) ? dependsOn.map(String) : [];
}

// Mantém a execução viva em ambiente serverless; fora de uma requisição, apenas segue em segundo plano.
function keepAlive(promise: Promise<unknown>): void {
  try {
    after(promise);
  } catch {
    // sem contexto de requisição (ex.: timer de retry)
  }
}

export function runTask(taskId: string, opts: { permissionMode?: PermissionMode } = {}): void {
  keepAlive(executeAndAdvance(taskId, opts).catch((err) => console.error(`[task-runner] ${taskId}:`, err)));
}

async function executeAndAdvance(taskId: string, opts: { permissionMode?: PermissionMode }): Promise<void> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, status: true, agentId: true, missionId: true, dependsOn: true, retryCount: true, maxRetries: true },
  });
  if (!task || !task.agentId) return;
  if (task.status === "IN_PROGRESS" || TERMINAL.has(task.status)) return;

  // Dependências pendentes: fica aguardando; advanceMission dispara quando concluírem.
  const deps = dependencyIds(task.dependsOn);
  if (deps.length > 0) {
    const done = await prisma.task.count({ where: { id: { in: deps }, status: "COMPLETED" } });
    if (done < deps.length) {
      await prisma.task.update({ where: { id: taskId }, data: { status: "WAITING_DEPENDENCY" } });
      return;
    }
  }

  // Trava contra execução duplicada da mesma tarefa
  const claimed = await prisma.task.updateMany({
    where: { id: taskId, status: task.status },
    data: { status: "IN_PROGRESS", startedAt: new Date() },
  });
  if (claimed.count === 0) return;

  await prisma.agent.update({ where: { id: task.agentId }, data: { status: "EXECUTING" } }).catch(() => {});

  let failed = false;
  try {
    await executeTask(taskId, executorDb(), {
      permissionMode: opts.permissionMode ?? loadSettings().agent.permissionMode,
    });
  } catch {
    failed = true;
  } finally {
    const stillBusy = await prisma.task.count({ where: { agentId: task.agentId, status: "IN_PROGRESS" } });
    if (stillBusy === 0) {
      await prisma.agent.update({ where: { id: task.agentId }, data: { status: "IDLE" } }).catch(() => {});
    }
  }

  if (failed) {
    await prisma.agent.update({ where: { id: task.agentId }, data: { tasksTotal: { increment: 1 } } }).catch(() => {});
    const current = await prisma.task.findUnique({ where: { id: taskId }, select: { retryCount: true, maxRetries: true } });
    if (current && current.retryCount < current.maxRetries) {
      const delayMs = 15_000 * current.retryCount;
      setTimeout(() => runTask(taskId, opts), delayMs);
      return;
    }
  }

  await advanceMission(task.missionId);
}

// Dispara tarefas cujas dependências terminaram e recalcula o status da missão.
export async function advanceMission(missionId: string): Promise<void> {
  const [mission, tasks, pendingApprovals] = await Promise.all([
    prisma.mission.findUnique({ where: { id: missionId }, select: { status: true } }),
    prisma.task.findMany({ where: { missionId }, select: { id: true, status: true, dependsOn: true, agentId: true } }),
    // Confirmações do chat não têm missionId, então só contam aqui as aprovações pedidas por agentes da missão
    prisma.approval.count({ where: { missionId, status: "PENDING" } }),
  ]);
  if (!mission || mission.status === "CANCELLED") return;

  const completed = new Set(tasks.filter((t) => t.status === "COMPLETED").map((t) => t.id));
  for (const task of tasks) {
    if (task.status !== "WAITING_DEPENDENCY" || !task.agentId) continue;
    if (dependencyIds(task.dependsOn).every((id) => completed.has(id))) runTask(task.id);
  }

  const allTerminal = tasks.length > 0 && tasks.every((t) => TERMINAL.has(t.status));
  let next = mission.status;
  if (pendingApprovals > 0) next = "WAITING_APPROVAL";
  else if (allTerminal) next = "COMPLETED";
  else if (["WAITING_APPROVAL", "PENDING", "PLANNING", "COMPLETED"].includes(mission.status)) next = "IN_PROGRESS";

  if (next !== mission.status) {
    await prisma.mission.update({
      where: { id: missionId },
      data: { status: next, completedAt: next === "COMPLETED" ? new Date() : null },
    });
  }
}

// Tarefas que ficaram "em execução" depois de o servidor reiniciar voltam para a fila de retry.
export async function recoverStaleTasks(): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_MINUTES * 60_000);
  const stale = await prisma.task.findMany({
    where: { status: "IN_PROGRESS", updatedAt: { lt: cutoff } },
    select: { id: true },
  });
  for (const task of stale) {
    await prisma.task.update({
      where: { id: task.id },
      data: { status: "FAILED", output: { error: "Execução interrompida (servidor reiniciado)" } },
    });
    await prisma.activityLog.create({
      data: { taskId: task.id, action: "TASK_INTERRUPTED", details: { reason: "stale" }, level: "WARN" },
    });
  }
  await prisma.agent.updateMany({
    where: { status: { not: "IDLE" }, tasks: { none: { status: "IN_PROGRESS" } } },
    data: { status: "IDLE" },
  });
  return stale.length;
}
