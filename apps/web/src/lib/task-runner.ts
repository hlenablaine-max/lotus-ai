// Orquestração de tarefas: executa, encadeia dependências (DAG), tenta de novo em falha
// e mantém o status da missão coerente com tarefas e aprovações.

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { after } from "next/server";
import { executeTask, loadSettings, registry, type AIImage, type AIProvider, type ExecutorDB, type PermissionMode } from "@lotus/ai-engine";

// Tarefas de CRIAÇÃO (site, ferramentas) vão para o provedor de criação (padrão: Claude pela assinatura);
// texto e análise ficam com o provedor ativo (Drael). Sem o provedor de criação disponível, segue no ativo.
export function creationProviderFor(input: unknown): AIProvider | undefined {
  const data = (input ?? {}) as Record<string, unknown>;
  const isCreation = data.criacao === true || Array.isArray(data.arquivosDisponiveis);
  if (!isCreation) return undefined;
  const name = loadSettings().ai.creationProvider ?? "claude-code";
  try {
    return registry.get(name);
  } catch {
    return undefined;
  }
}
import { prisma } from "@/lib/prisma";
import { createRuntimeClient } from "@/lib/runtime-client";

const TERMINAL = new Set(["COMPLETED", "CANCELLED", "SKIPPED"]);
const STALE_MINUTES = 20;
const MAX_CONCURRENT_TASKS = 2;
// Uma tarefa de agente que passa disso travou (rede caiu no meio da chamada): é cancelada e tentada de novo
const AGENT_TASK_TIMEOUT_MS = 15 * 60_000;
const IMAGE_ROOT = path.join(os.homedir(), "LOTUS_Workspace");
const AGENT_WEB_TOOLS = new Set(["search_web", "fetch_url"]);

// Fila simples: no máximo N agentes chamando a IA ao mesmo tempo (evita estourar o limite do provedor)
const globalRef = globalThis as unknown as {
  __lotusTaskSlots?: { active: number; waiting: Array<() => void> };
  __lotusRunningTasks?: Set<string>;
  __lotusResumeTimer?: ReturnType<typeof setInterval>;
};
const slots = (globalRef.__lotusTaskSlots ??= { active: 0, waiting: [] });

// Tarefas que ESTE processo está executando agora. Tudo que estiver "em execução" no banco,
// for deste computador e não estiver aqui ficou órfão (app fechado ou PC travado) e pode ser retomado.
const HOST = os.hostname();
const running = (globalRef.__lotusRunningTasks ??= new Set<string>());
export const markRunning = (taskId: string): void => void running.add(taskId);
export const unmarkRunning = (taskId: string): void => void running.delete(taskId);
export const runningCount = (): number => running.size;

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
    data: { status: "IN_PROGRESS", startedAt: new Date(), output: { host: HOST } },
  });
  if (claimed.count === 0) {
    releaseSlot();
    return;
  }
  running.add(taskId);

  await prisma.agent.update({ where: { id: task.agentId }, data: { status: "EXECUTING" } }).catch(() => {});

  let failed = false;
  try {
    // Todos os agentes podem pesquisar na web e abrir páginas (import tardio evita ciclo de módulos)
    // Etapas automáticas (publicar o site, decidir a revisão) não chamam a IA
    const systemStep = (task.input as { systemStep?: string } | null)?.systemStep;
    const { SITE_SYSTEM_STEPS, runSiteStep } = await import("@/lib/site-builder");
    if (systemStep && SITE_SYSTEM_STEPS.has(systemStep)) {
      try {
        await runSiteStep(taskId);
      } catch (err) {
        const current = await prisma.task.findUnique({ where: { id: taskId }, select: { retryCount: true } });
        await prisma.task.update({
          where: { id: taskId },
          data: { status: "FAILED", retryCount: { increment: 1 }, output: { error: err instanceof Error ? err.message : String(err), host: HOST } },
        });
        await prisma.activityLog.create({ data: { taskId, missionId: task.missionId, action: "TASK_FAILED", details: { error: String(err).slice(0, 300), attempt: (current?.retryCount ?? 0) + 1 }, level: "ERROR" } }).catch(() => {});
        throw err;
      }
    } else {
    const { DB_TOOL_DEFS, createDbToolExecutor } = await import("@/lib/root-master-tools");
    await executeTask(taskId, executorDb(), {
      provider: creationProviderFor(task.input),
      permissionMode: opts.permissionMode ?? loadSettings().agent.permissionMode,
      images: loadTaskImages(task.input),
      extraTools: DB_TOOL_DEFS.filter((t) => AGENT_WEB_TOOLS.has(t.name)),
      extraToolExecutor: createDbToolExecutor(),
      signal: AbortSignal.timeout(AGENT_TASK_TIMEOUT_MS),
    });
    }
  } catch {
    failed = true;
  } finally {
    running.delete(taskId);
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
    // Tarefas na fila com dependências também são destravadas aqui (a trava em executeAndAdvance evita rodar duas vezes)
    if ((task.status !== "WAITING_DEPENDENCY" && !(task.status === "QUEUED" && dependencyIds(task.dependsOn).length > 0)) || !task.agentId || running.has(task.id)) continue;
    if (dependencyIds(task.dependsOn).every((id) => completed.has(id))) runTask(task.id);
  }

  const allTerminal = tasks.length > 0 && tasks.every((t) => TERMINAL.has(t.status));
  if (allTerminal) {
    // Diagnóstico terminado: grava o pacote de entrega na pasta do computador (não faz nada em outras missões)
    import("@/lib/diagnosis-360").then((m) => m.exportDeliverables(missionId)).catch((err) => console.error("[task-runner] export:", err));
  }
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

// Retoma sozinho o trabalho que ficou pela metade quando o aplicativo foi fechado ou o computador travou:
// tarefas órfãs voltam para a fila, tarefas na fila são executadas e coletas interrompidas recomeçam.
export async function resumePendingWork(): Promise<{ requeued: number; started: number; collections: number }> {
  const result = { requeued: 0, started: 0, collections: 0 };
  const missions = await prisma.mission.findMany({
    where: { status: { in: ["PENDING", "PLANNING", "IN_PROGRESS", "WAITING_APPROVAL"] } },
    orderBy: { updatedAt: "desc" },
    take: 40,
    select: {
      id: true,
      context: true,
      tasks: { select: { id: true, status: true, agentId: true, input: true, output: true, updatedAt: true } },
    },
  });

  for (const mission of missions) {
    const hostOf = (value: unknown) => (value as { host?: string } | null)?.host;
    const lastActivity = Math.max(0, ...mission.tasks.map((t) => t.updatedAt.getTime()));
    // Só mexe em missões deste computador, ou paradas há mais de 20 minutos (o sócio pode estar rodando as dele)
    const mine = hostOf(mission.context) === HOST || mission.tasks.some((t) => hostOf(t.output) === HOST);
    const abandoned = Date.now() - lastActivity > STALE_MINUTES * 60_000;
    if (!mine && !abandoned) continue;

    let touched = false;
    for (const task of mission.tasks) {
      if (running.has(task.id)) continue;
      const systemStep = (task.input as { systemStep?: string } | null)?.systemStep;

      if (task.status === "IN_PROGRESS") {
        const orphan = hostOf(task.output) === HOST || Date.now() - task.updatedAt.getTime() > STALE_MINUTES * 60_000;
        if (!orphan) continue;
        if (systemStep === "diagnosis_collect") {
          const { resumeCollection } = await import("@/lib/diagnosis-360");
          if ((await resumeCollection(task.id)) === "resumed") result.collections++;
          continue;
        }
        if (!task.agentId) continue;
        const back = await prisma.task.updateMany({ where: { id: task.id, status: "IN_PROGRESS" }, data: { status: "QUEUED" } });
        if (back.count === 0) continue;
        await prisma.activityLog.create({ data: { taskId: task.id, missionId: mission.id, agentId: task.agentId, action: "TASK_RESUMED", details: { reason: "interrompida" }, level: "WARN" } }).catch(() => {});
        runTask(task.id);
        result.requeued++;
        touched = true;
      } else if (task.status === "QUEUED" && task.agentId && (!systemStep || systemStep.startsWith("site_"))) {
        // "PENDING" fica de fora: é tarefa criada sem execução automática, esperando o dono mandar rodar
        runTask(task.id);
        result.started++;
        touched = true;
      }
    }
    if (touched || mission.tasks.some((t) => t.status === "WAITING_DEPENDENCY")) await advanceMission(mission.id);
  }

  await prisma.agent.updateMany({ where: { status: { not: "IDLE" }, tasks: { none: { status: "IN_PROGRESS" } } }, data: { status: "IDLE" } }).catch(() => {});
  if (result.requeued + result.started + result.collections > 0) console.log("[task-runner] trabalho retomado:", result);
  return result;
}

// Chamado quando o servidor sobe: confere logo após abrir e depois de tempos em tempos.
export function scheduleResume(): void {
  if (globalRef.__lotusResumeTimer) return;
  const tick = () => void resumePendingWork().catch((err) => console.error("[task-runner] resume:", err));
  setTimeout(tick, 20_000);
  setTimeout(tick, 10 * 60_000);
  globalRef.__lotusResumeTimer = setInterval(tick, 30 * 60_000);
  console.log(`[task-runner] retomada automática ativa neste computador (${HOST})`);
}
