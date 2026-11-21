import * as os from "os";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/require-owner";
import { createRuntimeClient } from "@/lib/runtime-client";
import { integrationsView } from "@/lib/integrations-catalog";
import { vercelUser, whatsappSessionSaved, workspaceFolders } from "@/lib/local-accounts";
import { lotusWhatsappReady } from "@/lib/lotus-whatsapp";
import { registry } from "@lotus/ai-engine";
import { LOTUS_SLUG } from "@/lib/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Uma falha já está resolvida quando uma tentativa nova da mesma tarefa terminou depois dela
// ("Produção: site" falhou e "Produção: site (tentativa 2)" concluiu), ou quando a missão inteira
// foi refeita depois e a nova não falhou.
type FailedTask = { title: string; missionId: string; createdAt: Date; mission: { title: string; clientId: string; createdAt: Date } };
const baseTitle = (t: string) => t.replace(/\s*\(tentativa \d+\)\s*$/i, "").trim();
async function unresolvedFailures(failed: FailedTask[]): Promise<FailedTask[]> {
  const out: FailedTask[] = [];
  for (const t of failed) {
    const retried = await prisma.task.findFirst({
      where: { missionId: t.missionId, status: "COMPLETED", createdAt: { gt: t.createdAt }, title: { startsWith: baseTitle(t.title) } },
      select: { id: true },
    });
    if (retried) continue;
    const redone = await prisma.mission.findFirst({
      where: { title: t.mission.title, clientId: t.mission.clientId, createdAt: { gt: t.mission.createdAt }, status: { not: "FAILED" } },
      select: { id: true },
    });
    if (redone) continue;
    out.push(t);
  }
  return out;
}

// Teste real de cada IA (uma pergunta de uma palavra), guardado por 10 minutos para não gastar a cada abertura
const AI_LABEL: Record<string, string> = { drael: "Drael", openai: "ChatGPT (OpenAI)", anthropic: "Claude (chave)", "claude-code": "Claude (assinatura)" };
const aiCache = globalThis as unknown as { __lotusAiTest?: { at: number; result: Array<{ label: string; ok: boolean; error?: string }> } };
async function testAiProviders(): Promise<Array<{ label: string; ok: boolean; error?: string }>> {
  if (aiCache.__lotusAiTest && Date.now() - aiCache.__lotusAiTest.at < 10 * 60_000) return aiCache.__lotusAiTest.result;
  const names = registry.listAvailable();
  const result = await Promise.all(
    names.map(async (n) => {
      try {
        await Promise.race([
          registry.get(n).complete({ messages: [{ role: "user", content: "Responda só: ok" }], maxTokens: 5 } as never),
          new Promise((_, rej) => setTimeout(() => rej(new Error("não respondeu em 30 s")), 30_000)),
        ]);
        return { label: AI_LABEL[n] ?? n, ok: true };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const error = /401|incorrect api key|invalid.*key|unauthorized/i.test(msg)
          ? "a chave foi recusada (está errada ou foi cancelada). Cole uma chave nova em Integrações."
          : /429|quota|insufficient|billing|limit/i.test(msg)
            ? "sem crédito ou no limite de uso."
            : msg.slice(0, 120);
        return { label: AI_LABEL[n] ?? n, ok: false, error };
      }
    })
  );
  aiCache.__lotusAiTest = { at: Date.now(), result };
  return result;
}

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
  const aiTest = aiReady.length ? await testAiProviders() : [];
  const aiOk = aiTest.filter((t) => t.ok).map((t) => t.label);
  const aiBad = aiTest.filter((t) => !t.ok);
  add({
    id: "ai", area: "Integrações", label: "Provedor de IA (testado de verdade)", status: !aiReady.length || (aiTest.length && !aiOk.length) ? "fail" : aiBad.length ? "warn" : "ok",
    detail: !aiReady.length
      ? "Nenhuma chave de IA configurada: os agentes não conseguem trabalhar."
      : [aiOk.length ? `Respondendo: ${aiOk.join(", ")}.` : "Nenhuma IA respondeu ao teste.", ...aiBad.map((b) => `${b.label}: ${b.error}`)].join(" "),
    fix: aiReady.length && !aiBad.length ? undefined : { label: "Abrir Integrações", href: "/integrations" },
  });

  // WhatsApp e Vercel
  // WhatsApp da LOTUS (QR que ouve): prospecção, teste de atendimento e relatórios
  const lotusWa = dbOk ? await lotusWhatsappReady().catch(() => null) : null;
  const browserWa = whatsappSessionSaved();
  add({
    id: "whatsapp", area: "Integrações", label: "WhatsApp da LOTUS", status: lotusWa ? "ok" : "warn",
    detail: lotusWa
      ? "Conectado e ouvindo, com o escudo anti-ban: prospecção, teste de atendimento das clínicas e relatórios saem por ele."
      : browserWa
        ? "Desconectado. Só a sessão antiga do navegador está salva: o teste de atendimento roda, mas a prospecção e as respostas da IA ficam paradas."
        : "Desconectado: prospecção, teste de atendimento e respostas da IA ficam paradas.",
    fix: lotusWa ? undefined : { label: "Conectar pelo QR Code", href: "/integrations" },
  });
  if (dbOk) {
    const [clinicWa, igAccounts] = await Promise.all([
      prisma.whatsappChannel.findMany({ where: { client: { slug: { not: LOTUS_SLUG } } }, select: { status: true, client: { select: { name: true, status: true } } } }),
      prisma.manychatAccount.findMany({ select: { status: true, client: { select: { name: true, slug: true } } } }),
    ]);
    const off = clinicWa.filter((c) => c.client.status === "ACTIVE" && c.status !== "conectado");
    add({
      id: "clinic-wa", area: "Integrações", label: "WhatsApp das clínicas", status: off.length ? "warn" : "ok",
      detail: !clinicWa.length
        ? "Nenhuma clínica com WhatsApp conectado ainda (conecta no perfil de cada clínica, na aba Atendimento, depois de fechar)."
        : off.length
          ? `${off.length} clínica(s) ativa(s) com o WhatsApp desconectado: ${off.slice(0, 3).map((c) => c.client.name.split("|")[0].trim()).join(", ")}. Os leads delas não entram enquanto isso.`
          : `${clinicWa.length} clínica(s) com o WhatsApp conectado.`,
      fix: off.length ? { label: "Ver clientes", href: "/clients" } : undefined,
    });
    const igOff = igAccounts.filter((a) => a.status !== "conectado");
    const lotusIg = igAccounts.some((a) => a.client.slug === LOTUS_SLUG && a.status === "conectado");
    add({
      id: "instagram", area: "Integrações", label: "Instagram (ManyChat)", status: igOff.length || !lotusIg ? "warn" : "ok",
      detail: igOff.length
        ? `${igOff.length} conta(s) do ManyChat com problema: ${igOff.map((a) => a.client.name.split("|")[0].trim()).join(", ")}.`
        : `${lotusIg ? "Instagram da LOTUS conectado. " : "Instagram da LOTUS ainda não conectado. "}${igAccounts.filter((a) => a.client.slug !== LOTUS_SLUG).length} clínica(s) com Instagram conectado.`,
      fix: igOff.length || !lotusIg ? { label: "Conectar em Integrações", href: "/integrations" } : undefined,
    });
  }
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
        select: { title: true, missionId: true, createdAt: true, mission: { select: { title: true, clientId: true, createdAt: true } } },
        take: 50,
      }).then(unresolvedFailures),
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
