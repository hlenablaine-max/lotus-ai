import * as os from "os";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/require-owner";
import { createRuntimeClient } from "@/lib/runtime-client";
import { integrationsView } from "@/lib/integrations-catalog";
import { vercelUser, whatsappSessionSaved, workspaceFolders } from "@/lib/local-accounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CheckStatus = "ok" | "warn" | "fail";
interface Check {
  id: string;
  area: string;
  label: string;
  status: CheckStatus;
  detail: string;
  fix?: { label: string; href: string };
}

const DAY = 86_400_000;
const STUCK_MS = 20 * 60_000; // uma tarefa tem até 15 min; depois de 20 está travada

// Verificação ao vivo: cada item é conferido agora, no banco, no computador e nas contas conectadas.
export async function GET() {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;

  const checks: Check[] = [];
  const add = (c: Check) => checks.push(c);

  // Banco
  let dbOk = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
    add({ id: "db", area: "Sistema", label: "Banco de dados", status: "ok", detail: "Conectado e respondendo." });
  } catch (err) {
    add({
      id: "db", area: "Sistema", label: "Banco de dados", status: "fail",
      detail: `Sem conexão: ${err instanceof Error ? err.message.split("\n").pop() : String(err)}`,
      fix: { label: "Ver Integrações", href: "/integrations" },
    });
  }

  // App desktop (navegador de pesquisa, terminal, arquivos)
  const desktop = await createRuntimeClient().available().catch(() => false);
  add({
    id: "desktop", area: "Sistema", label: "App desktop LOTUS", status: desktop ? "ok" : "fail",
    detail: desktop
      ? "Aberto: a pesquisa no Instagram, Google, sites e o teste de WhatsApp funcionam."
      : "Fechado: sem ele os diagnósticos não conseguem pesquisar nem testar o WhatsApp.",
    fix: desktop ? undefined : { label: "Abra o aplicativo LOTUS", href: "/integrations" },
  });

  // Memória do computador
  const freeGb = os.freemem() / 1024 ** 3;
  const totalGb = os.totalmem() / 1024 ** 3;
  add({
    id: "ram", area: "Sistema", label: "Memória RAM livre (não é o espaço do disco)",
    status: freeGb < 0.5 ? "fail" : freeGb < 1.2 ? "warn" : "ok",
    detail: `RAM: ${freeGb.toFixed(1)} GB livres de ${totalGb.toFixed(1)} GB (é a memória dos programas abertos agora; o espaço livre do disco é outra coisa).${freeGb < 1.2 ? " Feche outros programas (navegador com muitas abas, ChatGPT, Ubuntu/WSL) antes de rodar diagnósticos: a pesquisa e a transcrição de vídeos usam bastante RAM." : ""}`,
  });

  // IA
  const integrations = integrationsView();
  const aiReady = integrations.filter((i) => i.aiProvider && i.configured).map((i) => i.name);
  add({
    id: "ai", area: "Integrações", label: "Provedor de IA", status: aiReady.length ? "ok" : "fail",
    detail: aiReady.length ? `Com chave: ${aiReady.join(", ")}.` : "Nenhuma chave de IA configurada: os agentes não conseguem trabalhar.",
    fix: aiReady.length ? undefined : { label: "Colar chave em Integrações", href: "/integrations" },
  });

  // WhatsApp e Vercel
  const whatsapp = whatsappSessionSaved();
  add({
    id: "whatsapp", area: "Integrações", label: "WhatsApp conectado", status: whatsapp ? "ok" : "warn",
    detail: whatsapp ? "Sessão do WhatsApp Web salva: o teste de atendimento das clínicas pode rodar." : "Sem sessão: o teste de atendimento no WhatsApp das clínicas fica de fora.",
    fix: whatsapp ? undefined : { label: "Conectar pelo QR Code", href: "/integrations" },
  });
  const vercel = await vercelUser();
  add({
    id: "vercel", area: "Integrações", label: "Vercel (publicação dos sites)", status: vercel ? "ok" : "warn",
    detail: vercel ? `Logado como ${vercel}: os sites das propostas são publicados sozinhos.` : "Não logado: os sites ficam só no computador, sem link para mandar ao dono da clínica.",
    fix: vercel ? undefined : { label: "Ver Integrações", href: "/integrations" },
  });

  const optional = integrations.filter((i) => !i.aiProvider && ["meta-ads", "google-ads", "ga4"].includes(i.id));
  const missingOptional = optional.filter((i) => !i.configured).map((i) => i.name);
  add({
    id: "ads", area: "Integrações", label: "Contas de anúncio e métricas", status: missingOptional.length ? "warn" : "ok",
    detail: missingOptional.length
      ? `Ainda sem conexão: ${missingOptional.join(", ")}. As campanhas são criadas como plano, mas não sobem sozinhas nem trazem resultado real.`
      : "Meta Ads, Google Ads e GA4 configurados.",
    fix: missingOptional.length ? { label: "Configurar", href: "/integrations" } : undefined,
  });

  // Operação (só com banco)
  const ops = { activeMissions: 0, pendingApprovals: 0, failedTasks: 0, stuckTasks: 0, demoRuns: 0 };
  if (dbOk) {
    const now = Date.now();
    const [activeMissions, pendingApprovals, failed, stuck, demoRuns] = await Promise.all([
      prisma.mission.count({ where: { status: { in: ["PENDING", "PLANNING", "IN_PROGRESS", "WAITING_APPROVAL", "IN_REVIEW"] } } }),
      prisma.approval.count({ where: { status: "PENDING" } }),
      prisma.task.findMany({
        where: { status: "FAILED", updatedAt: { gte: new Date(now - 7 * DAY) }, mission: { status: { notIn: ["CANCELLED", "COMPLETED"] } } },
        select: { title: true, mission: { select: { title: true } } },
        take: 50,
      }),
      prisma.task.findMany({
        where: { status: "IN_PROGRESS", startedAt: { lt: new Date(now - STUCK_MS) } },
        select: { title: true, mission: { select: { title: true } } },
        take: 50,
      }),
      prisma.activityLog.count({ where: { action: { endsWith: "_DEMO" }, createdAt: { gte: new Date(now - 7 * DAY) } } }),
    ]);
    Object.assign(ops, { activeMissions, pendingApprovals, failedTasks: failed.length, stuckTasks: stuck.length, demoRuns });

    add({
      id: "approvals", area: "Operação", label: "Aprovações esperando você", status: pendingApprovals ? "warn" : "ok",
      detail: pendingApprovals ? `${pendingApprovals} pedido(s) parado(s) até você decidir.` : "Nada esperando decisão.",
      fix: pendingApprovals ? { label: "Abrir Aprovações", href: "/approvals" } : undefined,
    });
    add({
      id: "failed", area: "Operação", label: "Tarefas com falha (7 dias)", status: failed.length ? "fail" : "ok",
      detail: failed.length
        ? `${failed.length} tarefa(s) falharam em missões abertas: ${failed.slice(0, 3).map((t) => `"${t.title}" (${t.mission.title})`).join("; ")}${failed.length > 3 ? "…" : ""}.`
        : "Nenhuma falha em missões abertas.",
      fix: failed.length ? { label: "Ver Missões", href: "/missions" } : undefined,
    });
    add({
      id: "stuck", area: "Operação", label: "Tarefas travadas", status: stuck.length ? "fail" : "ok",
      detail: stuck.length
        ? `${stuck.length} tarefa(s) "em andamento" há mais de 20 minutos: ${stuck.slice(0, 3).map((t) => `"${t.title}"`).join(", ")}. Se o app foi fechado no meio, ao reabrir ele retoma sozinho.`
        : "Nenhuma tarefa parada no meio.",
      fix: stuck.length ? { label: "Ver Missões", href: "/missions" } : undefined,
    });
    add({
      id: "demo", area: "Operação", label: "Respostas de demonstração (7 dias)", status: demoRuns ? "warn" : "ok",
      detail: demoRuns
        ? `${demoRuns} execução(ões) de motor devolveram dado de exemplo porque a IA falhou. Não use esses resultados com cliente.`
        : "Nenhum motor caiu no modo demonstração.",
      fix: demoRuns ? { label: "Ver Atividade", href: "/activity" } : undefined,
    });
  }

  const sites = workspaceFolders("sites");
  const deliveries = workspaceFolders("entregas");

  return Response.json({
    checkedAt: new Date().toISOString(),
    checks,
    summary: {
      ok: checks.filter((c) => c.status === "ok").length,
      warn: checks.filter((c) => c.status === "warn").length,
      fail: checks.filter((c) => c.status === "fail").length,
    },
    ops,
    output: { sites: sites.length, deliveries: deliveries.length, deliveryNames: deliveries.slice(0, 20) },
  });
}
