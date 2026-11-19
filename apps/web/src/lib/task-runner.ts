// Orquestração de tarefas: executa, encadeia dependências (DAG), tenta de novo em falha
// e mantém o status da missão coerente com tarefas e aprovações.

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { after } from "next/server";
import { executeTask, loadSettings, type AIImage, type ExecutorDB, type PermissionMode } from "@lotus/ai-engine";
import { prisma } from "@/lib/prisma";
import { createRuntimeClient } from "@/lib/runtime-client";

const TERMINAL = new Set(["COMPLETED", "CANCELLED", "SKIPPED"]);
const STALE_MINUTES = 20;
const MAX_CONCURRENT_TASKS = 2;
const IMAGE_ROOT = path.join(os.homedir(), "LOTUS_Workspace");
const AGENT_WEB_TOOLS = new Set(["search_web", "fetch_url"]);

// Fila simples: no máximo N agentes chamando a IA ao mesmo tempo (evita estourar o limite do provedor)
const globalRef = globalThis as unknown as { __lotusTaskSlots?: { active: number; waiting: Array<() => void> } };
const slots = (globalRef.__lotusTaskSlots ??= { active: 0, waiting: [] });

async function acquireSlot(): Promise<void> {
  if (slots.active < MAX_CONCURRENT_TASKS) {
    slots.active++;
    return;
  }
  await new Promise<void>((resolve) => slots.waiting.push(resolve));
}

function releaseSlot(): void {
  const next = slots.waiting.shift();
  if (next) next();
  else slots.active = Math.max(0, slots.active - 1);
}

// Imagens anexadas à tarefa (prints e quadros de vídeo gerados pelo app na pasta de trabalho)
function loadTaskImages(input: unknown): AIImage[] {
  const paths = (input as { imagePaths?: unknown } | null)?.imagePaths;
  if (!Array.isArray(paths)) return [];
  const images: AIImage[] = [];
  for (const raw of paths.slice(0, 4)) {
    try {
      const file = path.resolve(String(raw));
      if (!file.startsWith(IMAGE_ROOT) || !fs.existsSync(file)) continue;
      const stat = fs.statSync(file);
      if (stat.size > 2_500_000) continue;
      const ext = path.extname(file).toLowerCase();
      const mediaType = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
      images.push({ mediaType, data: fs.readFileSync(file).toString("base64") });
    } catch {
      // imagem indisponível: a tarefa segue só com texto
    }
  }
  return images;
}

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
    select: { id: true, status: true, agentId: true, missionId: true, dependsOn: true, retryCount: true, maxRetries: true, input: true },
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

  await acquireSlot();

  // Trava contra execução duplicada da mesma tarefa
  const claimed = await prisma.task.updateMany({
    where: { id: taskId, status: task.status },
    data: { status: "IN_PROGRESS", startedAt: new Date() },
  });
  if (claimed.count === 0) {
    releaseSlot();
    return;
  }

  await prisma.agent.update({ where: { id: task.agentId }, data: { status: "EXECUTING" } }).catch(() => {});

  let failed = false;
  try {
    // Todos os agentes podem pesquisar na web e abrir páginas (import tardio evita ciclo de módulos)
    const { DB_TOOL_DEFS, createDbToolExecutor } = await import("@/lib/root-master-tools");
    await executeTask(taskId, executorDb(), {
      permissionMode: opts.permissionMode ?? loadSettings().agent.permissionMode,
      images: loadTaskImages(task.input),
      extraTools: DB_TOOL_DEFS.filter((t) => AGENT_WEB_TOOLS.has(t.name)),
      extraToolExecutor: createDbToolExecutor(),
    });
  } catch {
    failed = true;
  } finally {
    releaseSlot();
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
