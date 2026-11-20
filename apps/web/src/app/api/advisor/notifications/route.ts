import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

interface Notification {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  body: string;
  action: string;
  href: string;
  ts: number;
}

export async function GET() {
  const notifications: Notification[] = [];

  try {
    // Avisos do atendimento e da prospecção (alguém respondeu, a IA agendou, pediram humano...)
    const events = await prisma.appNotification.findMany({ where: { createdAt: { gte: new Date(Date.now() - 3 * 86_400_000) } }, orderBy: { createdAt: "desc" }, take: 25 });
    for (const e of events) {
      notifications.push({
        id: `app-${e.id}`,
        severity: e.kind === "humano" || e.kind === "prospect" || e.kind === "agendou" ? "critical" : "info",
        title: e.title,
        body: e.body,
        action: "Abrir",
        href: e.href ?? "/",
        ts: e.createdAt.getTime(),
      });
    }
    const now = Date.now();
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const threeDaysAgo = new Date(now - 3 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

    // 1. Active clients with no mission activity in 7+ days
    const inactiveClients = await prisma.client.findMany({
      where: {
        status: "ACTIVE" as const,
        missions: {
          none: { updatedAt: { gte: sevenDaysAgo } },
        },
      },
      select: { id: true, name: true, updatedAt: true },
      take: 3,
      orderBy: { updatedAt: "asc" },
    });

    for (const c of inactiveClients) {
      const daysInactive = Math.floor((now - c.updatedAt.getTime()) / (1000 * 60 * 60 * 24));
      notifications.push({
        id: `inactive-${c.id}`,
        severity: daysInactive > 14 ? "critical" : "warning",
        title: `${c.name} sem atividade há ${daysInactive} dias`,
        body: `Nenhuma missão atualizada para ${c.name} em ${daysInactive} dias. Risco de churn. Recomendo contato proativo.`,
        action: "Ver cliente",
        href: `/clients/${c.id}`,
        ts: c.updatedAt.getTime(),
      });
    }

    // 2. Overdue missions — IN_PROGRESS but not updated in 3+ days
    const overdueMissions = await prisma.mission.findMany({
      where: {
        status: "IN_PROGRESS" as const,
        updatedAt: { lt: threeDaysAgo },
      },
      include: { client: { select: { name: true } } },
      take: 3,
      orderBy: { updatedAt: "asc" },
    });

    for (const m of overdueMissions) {
      const daysOverdue = Math.floor((now - m.updatedAt.getTime()) / (1000 * 60 * 60 * 24));
      notifications.push({
        id: `overdue-mission-${m.id}`,
        severity: daysOverdue > 7 ? "critical" : "warning",
        title: `Missão "${m.title}" atrasada`,
        body: `A missão de ${m.client.name} está ${daysOverdue}d sem atualização. Verifique o progresso e desbloqueie tarefas pendentes.`,
        action: "Ver missão",
        href: `/missions/${m.id}`,
        ts: m.updatedAt.getTime(),
      });
    }

    // 3. Failed tasks
    const failedTasks = await prisma.task.findMany({
      where: {
        status: "FAILED" as const,
        updatedAt: { gte: threeDaysAgo },
      },
      include: {
        agent: { select: { name: true } },
        mission: { select: { title: true, client: { select: { name: true } } } },
      },
      take: 3,
      orderBy: { updatedAt: "desc" },
    });

    for (const t of failedTasks) {
      notifications.push({
        id: `failed-task-${t.id}`,
        severity: "critical",
        title: `Tarefa falhou: ${t.title}`,
        body: `Agente ${t.agent?.name ?? "desconhecido"} falhou na tarefa "${t.title}" (${t.mission.client.name} / ${t.mission.title}). Requer atenção.`,
        action: "Ver tarefa",
        href: `/missions/${t.missionId}`,
        ts: t.updatedAt.getTime(),
      });
    }

    // 4. High API cost alert (last 7 days vs previous 7 days)
    const recentLogs = await prisma.activityLog.findMany({
      where: {
        action: "TASK_COMPLETED",
        createdAt: { gte: new Date(now - 7 * 24 * 60 * 60 * 1000) },
      },
      select: { details: true },
    });

    let recentTokens = 0;
    for (const log of recentLogs) {
      const details = log.details as Record<string, unknown> | null;
      if (details?.tokens) {
        const tokens = details.tokens as { inputTokens?: number; outputTokens?: number };
        recentTokens += (tokens.inputTokens ?? 0) + (tokens.outputTokens ?? 0);
      }
    }

    if (recentTokens > 500000) {
      const costUSD = ((recentTokens * 0.003) / 1000).toFixed(2);
      notifications.push({
        id: "high-cost-alert",
        severity: "warning",
        title: `Uso elevado de tokens esta semana`,
        body: `${(recentTokens / 1000).toFixed(0)}k tokens usados nos últimos 7 dias (~$${costUSD} USD). Monitore o consumo para controlar custos.`,
        action: "Ver atividade",
        href: "/activity",
        ts: now - 60000,
      });
    }

    // 5. Agents idle for too long while there are pending tasks
    const [idleAgents, pendingTaskCount] = await Promise.all([
      prisma.agent.count({ where: { status: "IDLE" } }),
      prisma.task.count({ where: { status: "PENDING" } }),
    ]);

    if (pendingTaskCount > 5 && idleAgents > 0) {
      notifications.push({
        id: "idle-agents-pending-tasks",
        severity: "info",
        title: `${pendingTaskCount} tarefas aguardando com ${idleAgents} agentes livres`,
        body: `Há ${pendingTaskCount} tarefas pendentes mas ${idleAgents} agente(s) estão ociosos. Verifique se as missões estão sendo executadas corretamente.`,
        action: "Ver tarefas",
        href: "/missions",
        ts: now - 120000,
      });
    }

    // 6. Upsell opportunity: active clients without a mission in 30 days
    const clientsWithoutRecentMission = await prisma.client.count({
      where: {
        status: "ACTIVE",
        missions: {
          none: { createdAt: { gte: thirtyDaysAgo } },
        },
      },
    });

    if (clientsWithoutRecentMission > 0) {
      notifications.push({
        id: "upsell-opportunity",
        severity: "info",
        title: `${clientsWithoutRecentMission} cliente(s) sem nova missão em 30 dias`,
        body: `Oportunidade de upsell ou reativação. Clientes ativos sem nova missão criada no último mês podem estar subaproveitando a LOTUS.`,
        action: "Ver clientes",
        href: "/clients",
        ts: now - 180000,
      });
    }

    // Sort: critical first, then warning, then info; within same severity: most recent first
    const severityOrder = { critical: 0, warning: 1, info: 2 };
    notifications.sort((a, b) => {
      const diff = severityOrder[a.severity] - severityOrder[b.severity];
      if (diff !== 0) return diff;
      return b.ts - a.ts;
    });
  } catch (err) {
    // On DB error, return empty rather than crashing the advisor page
    console.error("[advisor/notifications] DB error:", err);
  }

  return NextResponse.json({ notifications });
}
