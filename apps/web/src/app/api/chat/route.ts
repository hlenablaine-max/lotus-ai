import { NextRequest } from "next/server";
import { streamRootMaster, executeTask } from "@lotus/ai-engine";
import type { AITool, ToolExecutor } from "@lotus/ai-engine";
import { prisma } from "@/lib/prisma";
import { updateAgentStatus } from "@/lib/agent-service";
import { createRuntimeClient } from "@/lib/runtime-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// DB tools the Root Master can call to query real company data
const DB_TOOL_DEFS: AITool[] = [
  {
    name: "get_clients",
    description: "Lista todos os clientes da LOTUS com status, missões ativas e data de última atividade",
    parameters: {
      properties: {
        status: { type: "string", enum: ["ACTIVE", "INACTIVE", "CHURNED", "ALL"], description: "Filtrar por status" },
        limit: { type: "number", description: "Máximo de resultados (padrão 20)" },
      },
    },
  },
  {
    name: "get_missions",
    description: "Lista missões com status, cliente, progresso e agentes envolvidos",
    parameters: {
      properties: {
        status: {
          type: "string",
          enum: ["DRAFT", "ACTIVE", "PAUSED", "COMPLETED", "CANCELLED", "ALL"],
          description: "Filtrar por status",
        },
        clientId: { type: "string", description: "Filtrar por cliente específico" },
        limit: { type: "number", description: "Máximo de resultados (padrão 10)" },
      },
    },
  },
  {
    name: "get_agents",
    description: "Lista todos os agentes de IA com status atual, tarefas completadas e custos",
    parameters: {
      properties: {},
    },
  },
  {
    name: "get_costs",
    description: "Retorna custos de tokens/API por período",
    parameters: {
      properties: {
        days: { type: "number", description: "Últimos N dias (padrão 30)" },
      },
    },
  },
  {
    name: "get_pending_tasks",
    description: "Lista tarefas pendentes ou em execução com agente responsável",
    parameters: {
      properties: {
        missionId: { type: "string", description: "Filtrar por missão específica" },
        limit: { type: "number", description: "Máximo de resultados (padrão 20)" },
      },
    },
  },
  {
    name: "get_activity_log",
    description: "Retorna log de atividades recentes dos agentes",
    parameters: {
      properties: {
        hours: { type: "number", description: "Últimas N horas (padrão 24)" },
        agentId: { type: "string", description: "Filtrar por agente específico" },
        limit: { type: "number", description: "Máximo de resultados (padrão 50)" },
      },
    },
  },
  {
    name: "fetch_url",
    description: "Busca e lê o conteúdo de uma URL (site da empresa, Instagram, landing page, etc.) para análise. Use quando o usuário enviar um link.",
    parameters: {
      properties: {
        url: { type: "string", description: "URL completa a ser buscada (https://...)" },
      },
      required: ["url"],
    },
  },
  {
    name: "search_web",
    description: "Faz uma busca na web via DuckDuckGo. Use para pesquisar empresas, concorrentes, notícias, encontrar sites, perfis e qualquer informação pública. SEMPRE use antes de dizer que não encontrou algo.",
    parameters: {
      properties: {
        query: { type: "string", description: "Termo de busca. Ex: 'JK Estética Avançada clínica estética site' ou '@jkesteticaavancada Instagram'" },
        maxResults: { type: "number", description: "Número de resultados (padrão 8)" },
      },
      required: ["query"],
    },
  },
  {
    name: "check_facebook_ads",
    description: "Verifica se uma empresa ou pessoa está rodando anúncios no Facebook/Instagram via Facebook Ad Library (público, sem login). Essencial para análise de prospects. Sempre use em prospecções.",
    parameters: {
      properties: {
        query: { type: "string", description: "Nome da empresa, clínica ou pessoa para buscar nos anúncios. Ex: 'JK Estética' ou 'Clínica JK'" },
        country: { type: "string", description: "País (padrão BR)" },
      },
      required: ["query"],
    },
  },
  {
    name: "search_instagram",
    description: "Tenta buscar dados públicos de um perfil do Instagram: bio, número de posts, seguindo/seguidores (quando acessível). Use handle com ou sem @.",
    parameters: {
      properties: {
        handle: { type: "string", description: "Handle do Instagram, com ou sem @. Ex: 'jkesteticaavancada'" },
      },
      required: ["handle"],
    },
  },
  {
    name: "search_google_maps",
    description: "Busca a presença de um negócio no Google Maps / Google Business. Verifica se tem perfil, avaliações, endereço, horário. Essencial para diagnóstico de presença digital local.",
    parameters: {
      properties: {
        businessName: { type: "string", description: "Nome do negócio. Ex: 'JK Estética Avançada'" },
        city: { type: "string", description: "Cidade para refinar a busca. Ex: 'São Paulo'" },
      },
      required: ["businessName"],
    },
  },
  {
    name: "create_client",
    description: "Cadastra um novo cliente no CRM da LOTUS. Use SEMPRE que prospectar uma empresa nova. Cria o registro para vincular missões e tarefas.",
    parameters: {
      properties: {
        name: { type: "string", description: "Nome completo da empresa. Ex: 'JK Estética Avançada'" },
        segment: { type: "string", description: "Segmento de mercado. Ex: 'Clínica de Estética', 'E-commerce', 'SaaS'" },
        website: { type: "string", description: "URL do site oficial" },
        instagram: { type: "string", description: "Handle do Instagram sem @. Ex: 'jkesteticaavancada'" },
        description: { type: "string", description: "Resumo do negócio, contexto e oportunidades identificadas" },
      },
      required: ["name"],
    },
  },
  {
    name: "create_mission",
    description: "Cria uma missão para um cliente. Use após cadastrar o cliente. Agrupa tarefas relacionadas a um objetivo estratégico.",
    parameters: {
      properties: {
        clientId: { type: "string", description: "ID do cliente (use get_clients ou create_client para obter)" },
        clientName: { type: "string", description: "Nome do cliente (alternativa ao ID, busca por nome parcial)" },
        title: { type: "string", description: "Título da missão. Ex: 'Estratégia Digital JK Estética'" },
        description: { type: "string", description: "Descrição do escopo e contexto da missão" },
        objective: { type: "string", description: "Objetivo estratégico a ser alcançado" },
        priority: { type: "string", enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"], description: "Prioridade (padrão MEDIUM)" },
      },
      required: ["title"],
    },
  },
  {
    name: "get_client_details",
    description: "Detalhes completos de um cliente: histórico, missões, métricas",
    parameters: {
      properties: {
        clientId: { type: "string", description: "ID do cliente" },
        clientName: { type: "string", description: "Nome do cliente (alternativa ao ID)" },
      },
    },
  },
  {
    name: "get_agents_available",
    description: "Lista agentes disponíveis com suas especialidades e status atual. Use antes de criar tarefas para escolher o agente certo.",
    parameters: {
      properties: {
        department: { type: "string", description: "Filtrar por departamento (opcional): copywriting, business-intelligence, performance-marketing, creative-studio, web-development, sales, data-analytics" },
        onlyIdle: { type: "boolean", description: "Se true, retorna apenas agentes IDLE disponíveis (padrão false)" },
      },
    },
  },
  {
    name: "create_task",
    description: "Cria e executa uma tarefa para um agente de IA. Use para delegar trabalho específico a um agente especialista.",
    parameters: {
      properties: {
        agentId: { type: "string", description: "ID do agente (use get_agents_available para obter IDs)" },
        agentName: { type: "string", description: "Nome do agente (alternativa ao ID, busca por nome parcial)" },
        missionId: { type: "string", description: "ID da missão. Se não informado, cria a tarefa sem missão vinculada." },
        missionName: { type: "string", description: "Nome da missão (alternativa ao ID)" },
        title: { type: "string", description: "Título curto e claro da tarefa" },
        description: { type: "string", description: "Descrição do que precisa ser feito e por quê" },
        instructions: { type: "string", description: "Instruções detalhadas para o agente: o que produzir, formato esperado, critérios de qualidade" },
        input: { type: "object", description: "Dados de entrada adicionais (URL do site, contexto do cliente, etc.)" },
        autoExecute: { type: "boolean", description: "Se true (padrão), inicia execução imediatamente após criar a tarefa" },
      },
      required: ["title", "description", "instructions"],
    },
  },
];

function createDbToolExecutor(): ToolExecutor {
  return async (toolName: string, args: Record<string, unknown>): Promise<string> => {
    try {
      switch (toolName) {
        case "get_clients": {
          const { status = "ALL", limit = 20 } = args as { status?: string; limit?: number };
          const clientWhere = status !== "ALL" ? { status: status as "ACTIVE" | "PAUSED" | "CHURNED" | "PROSPECT" } : undefined;
          const clients = await prisma.client.findMany({
            where: clientWhere,
            take: Number(limit),
            orderBy: { updatedAt: "desc" },
            include: {
              _count: { select: { missions: true } },
              missions: {
                where: { status: "IN_PROGRESS" as const },
                select: { id: true, title: true, status: true },
                take: 3,
              },
            },
          });
          return JSON.stringify({
            total: clients.length,
            clients: clients.map((c) => ({
              id: c.id,
              name: c.name,
              status: c.status,
              segment: c.segment,
              website: c.website,
              activeMissions: c.missions.length,
              totalMissions: c._count.missions,
              lastActivity: c.updatedAt,
              missions: c.missions,
            })),
          });
        }

        case "get_missions": {
          const { status = "ALL", clientId, limit = 10 } = args as {
            status?: string; clientId?: string; limit?: number;
          };
          const where: Record<string, unknown> = {};
          if (status !== "ALL") where.status = status;
          if (clientId) where.clientId = clientId;
          const missions = await prisma.mission.findMany({
            where,
            take: Number(limit),
            orderBy: { updatedAt: "desc" },
            include: {
              client: { select: { name: true } },
              _count: { select: { tasks: true } },
              tasks: {
                where: { status: { in: (["PENDING", "IN_PROGRESS"] as ["PENDING", "IN_PROGRESS"]) } },
                select: { id: true, title: true, status: true, agentId: true },
                take: 5,
              },
            },
          });
          return JSON.stringify({
            total: missions.length,
            missions: missions.map((m) => ({
              id: m.id,
              title: m.title,
              status: m.status,
              client: m.client.name,
              objective: m.objective,
              totalTasks: m._count.tasks,
              pendingTasks: m.tasks.length,
              tasks: m.tasks,
              createdAt: m.createdAt,
              updatedAt: m.updatedAt,
            })),
          });
        }

        case "get_agents": {
          const agents = await prisma.agent.findMany({
            orderBy: { tasksCompleted: "desc" },
          });
          return JSON.stringify({
            total: agents.length,
            agents: agents.map((a) => ({
              id: a.id,
              name: a.name,
              status: a.status,
              department: a.department,
              specialty: a.specialty,
              tasksCompleted: a.tasksCompleted,
              tasksTotal: a.tasksTotal,
              avgQualityScore: a.avgQualityScore,
              lastActive: a.updatedAt,
            })),
          });
        }

        case "get_costs": {
          const { days = 30 } = args as { days?: number };
          const since = new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000);
          const logs = await prisma.activityLog.findMany({
            where: {
              createdAt: { gte: since },
              action: "TASK_COMPLETED",
            },
            select: { details: true, createdAt: true, agentId: true },
          });
          let totalInputTokens = 0;
          let totalOutputTokens = 0;
          for (const log of logs) {
            const details = log.details as Record<string, unknown> | null;
            if (details?.tokens) {
              const tokens = details.tokens as { inputTokens?: number; outputTokens?: number };
              totalInputTokens += tokens.inputTokens ?? 0;
              totalOutputTokens += tokens.outputTokens ?? 0;
            }
          }
          return JSON.stringify({
            period: `Últimos ${days} dias`,
            totalInputTokens,
            totalOutputTokens,
            totalTokens: totalInputTokens + totalOutputTokens,
            estimatedCostUSD: ((totalInputTokens * 0.003 + totalOutputTokens * 0.015) / 1000).toFixed(4),
            taskCount: logs.length,
          });
        }

        case "get_pending_tasks": {
          const { missionId, limit = 20 } = args as { missionId?: string; limit?: number };
          const where: Record<string, unknown> = { status: { in: ["PENDING", "IN_PROGRESS", "WAITING_DEPENDENCY"] } };
          if (missionId) where.missionId = missionId;
          const tasks = await prisma.task.findMany({
            where,
            take: Number(limit),
            orderBy: { createdAt: "asc" },
            include: {
              agent: { select: { name: true, status: true } },
              mission: { select: { title: true, client: { select: { name: true } } } },
            },
          });
          return JSON.stringify({
            total: tasks.length,
            tasks: tasks.map((t) => ({
              id: t.id,
              title: t.title,
              status: t.status,
              mission: t.mission.title,
              client: t.mission.client.name,
              agent: t.agent?.name ?? "Não atribuído",
              agentStatus: t.agent?.status,
              createdAt: t.createdAt,
            })),
          });
        }

        case "get_activity_log": {
          const { hours = 24, agentId, limit = 50 } = args as {
            hours?: number; agentId?: string; limit?: number;
          };
          const since = new Date(Date.now() - Number(hours) * 60 * 60 * 1000);
          const where: Record<string, unknown> = { createdAt: { gte: since } };
          if (agentId) where.agentId = agentId;
          const logs = await prisma.activityLog.findMany({
            where,
            take: Number(limit),
            orderBy: { createdAt: "desc" },
            include: {
              agent: { select: { name: true } },
            },
          });
          return JSON.stringify({
            period: `Últimas ${hours} horas`,
            total: logs.length,
            logs: logs.map((l) => ({
              action: l.action,
              agent: l.agent?.name ?? "Sistema",
              level: l.level,
              details: l.details,
              time: l.createdAt,
            })),
          });
        }

        case "create_client": {
          const { name, segment, website, instagram, description } = args as {
            name: string; segment?: string; website?: string; instagram?: string; description?: string;
          };
          if (!name?.trim()) return JSON.stringify({ error: "name é obrigatório" });
          // Dedup: check by exact name OR by shared keywords (catches "Bella Pele Estética" vs "Clínica Estética Bella Pele")
          const allClients = await prisma.client.findMany({ select: { id: true, name: true } });
          const nameLower = name.toLowerCase();
          const keywords = nameLower.split(/\s+/).filter((w) => w.length >= 4);
          const existing = allClients.find((c) => {
            const cLower = c.name.toLowerCase();
            return cLower === nameLower || cLower.includes(nameLower) || nameLower.includes(cLower)
              || keywords.some((kw) => cLower.includes(kw));
          }) ?? null;
          if (existing) {
            return JSON.stringify({
              success: true,
              exists: true,
              clientId: existing.id,
              clientName: existing.name,
              message: `Cliente "${existing.name}" já existe (ID: ${existing.id}). Use esse ID para criar missões.`,
            });
          }
          const slug = name
            .toLowerCase()
            .normalize("NFD")
            .replace(/[̀-ͯ]/g, "")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "")
            + "-" + Date.now().toString(36);
          const client = await prisma.client.create({
            data: { name, slug, segment, website, instagram, description, status: "ACTIVE" },
          });
          return JSON.stringify({
            success: true,
            clientId: client.id,
            clientName: client.name,
            slug: client.slug,
            message: `Cliente "${name}" criado com sucesso! Use clientId "${client.id}" para criar missões e tarefas.`,
          });
        }

        case "create_mission": {
          const { clientId, clientName, title, description, objective, priority = "MEDIUM" } = args as {
            clientId?: string; clientName?: string; title: string; description?: string;
            objective?: string; priority?: string;
          };
          if (!title?.trim()) return JSON.stringify({ error: "title é obrigatório" });
          // Resolve client
          let resolvedClientId = clientId;
          if (!resolvedClientId && clientName) {
            const client = await prisma.client.findFirst({
              where: { name: { contains: clientName } },
              select: { id: true, name: true },
            });
            if (!client) return JSON.stringify({ error: `Cliente "${clientName}" não encontrado. Crie primeiro com create_client.` });
            resolvedClientId = client.id;
          }
          if (!resolvedClientId) {
            // Fall back to LOTUS Internal
            const internal = await prisma.client.findFirst({ where: { slug: "lotus-internal" } })
              ?? await prisma.client.create({ data: { name: "LOTUS Internal", slug: "lotus-internal", status: "ACTIVE" } });
            resolvedClientId = internal.id;
          }
          const mission = await prisma.mission.create({
            data: {
              title,
              description: description ?? title,
              objective: objective ?? description ?? title,
              status: "IN_PROGRESS",
              priority: (priority as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"),
              clientId: resolvedClientId,
            },
          });
          return JSON.stringify({
            success: true,
            missionId: mission.id,
            missionTitle: mission.title,
            clientId: resolvedClientId,
            message: `Missão "${title}" criada (ID: ${mission.id}). Use esse missionId ao criar tarefas.`,
          });
        }

        case "get_client_details": {
          const { clientId, clientName } = args as { clientId?: string; clientName?: string };
          const where = clientId ? { id: clientId } : clientName ? { name: { contains: clientName } } : null;
          if (!where) return JSON.stringify({ error: "Forneça clientId ou clientName" });
          const client = await prisma.client.findFirst({
            where,
            include: {
              missions: {
                orderBy: { updatedAt: "desc" },
                take: 10,
                include: { _count: { select: { tasks: true } } },
              },
            },
          });
          if (!client) return JSON.stringify({ error: "Cliente não encontrado" });
          return JSON.stringify({
            id: client.id,
            name: client.name,
            status: client.status,
            segment: client.segment,
            website: client.website,
            instagram: client.instagram,
            description: client.description,
            missions: client.missions.map((m) => ({
              id: m.id,
              title: m.title,
              status: m.status,
              totalTasks: m._count.tasks,
              updatedAt: m.updatedAt,
            })),
            createdAt: client.createdAt,
            lastActivity: client.updatedAt,
          });
        }

        case "fetch_url": {
          const { url } = args as { url: string };
          try {
            const res = await fetch(url, {
              headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
              },
              signal: AbortSignal.timeout(12_000),
            });
            const contentType = res.headers.get("content-type") ?? "";
            if (!contentType.includes("text")) {
              return JSON.stringify({ error: "URL retornou conteúdo binário ou não-textual", url });
            }
            const html = await res.text();
            const text = html
              .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
              .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
              .replace(/<[^>]+>/g, " ")
              .replace(/\s+/g, " ")
              .slice(0, 8_000)
              .trim();
            return JSON.stringify({ url, status: res.status, content: text });
          } catch (err) {
            return JSON.stringify({ error: `Não foi possível acessar ${url}: ${err instanceof Error ? err.message : String(err)}` });
          }
        }

        case "search_web": {
          const { query, maxResults = 8 } = args as { query: string; maxResults?: number };
          try {
            const encoded = encodeURIComponent(query);
            // DuckDuckGo HTML scrape
            const res = await fetch(`https://html.duckduckgo.com/html/?q=${encoded}`, {
              headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8",
              },
              signal: AbortSignal.timeout(15_000),
            });
            const html = await res.text();
            // Extract result titles, URLs and snippets
            const results: Array<{ title: string; url: string; snippet: string }> = [];
            const linkRe = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
            const snippetRe = /<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
            const snippets: string[] = [];
            let sm: RegExpExecArray | null;
            while ((sm = snippetRe.exec(html)) !== null && snippets.length < 15) {
              snippets.push(sm[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim());
            }
            let m: RegExpExecArray | null;
            let idx = 0;
            while ((m = linkRe.exec(html)) !== null && results.length < Number(maxResults)) {
              const rawUrl = m[1];
              const title = m[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
              // DuckDuckGo wraps URLs in redirect — extract uddg param
              const urlMatch = rawUrl.match(/uddg=([^&]+)/);
              const cleanUrl = urlMatch ? decodeURIComponent(urlMatch[1]) : rawUrl;
              if (title && cleanUrl && !cleanUrl.startsWith("//duckduckgo")) {
                results.push({ title, url: cleanUrl, snippet: snippets[idx] ?? "" });
                idx++;
              }
            }
            if (results.length === 0) {
              return JSON.stringify({ query, results: [], message: "Sem resultados encontrados. Tente refinar a busca." });
            }
            return JSON.stringify({ query, total: results.length, results });
          } catch (err) {
            return JSON.stringify({ error: `Erro ao buscar "${query}": ${err instanceof Error ? err.message : String(err)}` });
          }
        }

        case "check_facebook_ads": {
          const { query, country = "BR" } = args as { query: string; country?: string };
          try {
            const encoded = encodeURIComponent(query);
            const libUrl = `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=${country}&q=${encoded}&search_type=keyword_unordered`;
            const res = await fetch(libUrl, {
              headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
                "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.7",
                "sec-fetch-site": "none",
                "sec-fetch-mode": "navigate",
              },
              signal: AbortSignal.timeout(12_000),
            });
            const html = await res.text();
            const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 5_000);
            // Check common signals
            const hasAds = /anúncio|anuncio|ad result|resultado de anúncio/i.test(text);
            const noAds = /nenhum anúncio|no ads found|sem anúncios/i.test(text);
            return JSON.stringify({
              query,
              country,
              library_url: libUrl,
              status: res.status,
              signal: hasAds ? "tem_anuncios" : noAds ? "sem_anuncios_encontrados" : "verificar_manualmente",
              content_preview: text.slice(0, 2_000),
              note: "Acesse a URL acima para ver os anúncios completos. O Facebook Ad Library é público — verifique também manualmente.",
            });
          } catch (err) {
            return JSON.stringify({ error: `Erro ao acessar Facebook Ad Library: ${err instanceof Error ? err.message : String(err)}` });
          }
        }

        case "search_instagram": {
          const { handle } = args as { handle: string };
          const cleanHandle = handle.replace(/^@/, "").trim();
          try {
            // Try multiple endpoints for public Instagram data
            const results: Record<string, unknown> = { handle: cleanHandle };

            // 1. Try oEmbed (public, no auth)
            try {
              const oembedRes = await fetch(
                `https://www.instagram.com/api/v1/oembed/?url=https://www.instagram.com/${cleanHandle}/&format=json`,
                {
                  headers: { "User-Agent": "Mozilla/5.0 (compatible; bot/1.0)" },
                  signal: AbortSignal.timeout(8_000),
                }
              );
              if (oembedRes.ok) {
                const data = await oembedRes.json() as Record<string, unknown>;
                results.oembed = data;
              }
            } catch {}

            // 2. Try public profile page (some data visible without login)
            try {
              const profileRes = await fetch(`https://www.instagram.com/${cleanHandle}/`, {
                headers: {
                  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
                  "Accept": "text/html,application/xhtml+xml,*/*;q=0.9",
                  "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.7",
                },
                signal: AbortSignal.timeout(10_000),
              });
              const html = await profileRes.text();
              // Extract meta tags (og:description, og:title etc.)
              const ogTitle = html.match(/<meta property="og:title" content="([^"]+)"/)?.[1] ?? "";
              const ogDesc = html.match(/<meta property="og:description" content="([^"]+)"/)?.[1] ?? "";
              const ogImg = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1] ?? "";
              // Try to extract follower count from JSON-LD or page data
              const followerMatch = html.match(/"edge_followed_by":\{"count":(\d+)\}/) ??
                                    html.match(/(\d[\d,.]+)\s*(seguidores|followers)/i);
              const postMatch = html.match(/"edge_owner_to_timeline_media":\{"count":(\d+)\}/);
              results.profile = {
                url: `https://www.instagram.com/${cleanHandle}/`,
                title: ogTitle,
                description: ogDesc,
                image: ogImg,
                followers: followerMatch?.[1] ?? "não disponível (login wall)",
                posts: postMatch?.[1] ?? "não disponível",
                loginWall: html.includes("Log In") || html.includes("Fazer login"),
              };
            } catch (e) {
              results.profile_error = String(e);
            }

            // 3. DuckDuckGo search for more info
            try {
              const searchRes = await fetch(
                `https://html.duckduckgo.com/html/?q=${encodeURIComponent(`@${cleanHandle} instagram`)}`,
                { headers: { "User-Agent": "Mozilla/5.0 Chrome/120" }, signal: AbortSignal.timeout(8_000) }
              );
              const html = await searchRes.text();
              const snippet = html
                .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
                .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
                .replace(/<[^>]+>/g, " ")
                .replace(/\s+/g, " ")
                .slice(0, 1_500);
              results.web_search_snippet = snippet;
            } catch {}

            return JSON.stringify(results);
          } catch (err) {
            return JSON.stringify({ error: `Erro ao buscar Instagram @${cleanHandle}: ${err instanceof Error ? err.message : String(err)}` });
          }
        }

        case "search_google_maps": {
          const { businessName, city = "" } = args as { businessName: string; city?: string };
          try {
            const query = city ? `${businessName} ${city}` : businessName;
            const encoded = encodeURIComponent(query);
            const mapsUrl = `https://www.google.com/maps/search/${encoded}`;
            // Search DuckDuckGo for Google Maps presence
            const searchRes = await fetch(
              `https://html.duckduckgo.com/html/?q=${encodeURIComponent(`${query} site:google.com/maps OR "google meu negócio" OR "google business"`)}`,
              {
                headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0" },
                signal: AbortSignal.timeout(10_000),
              }
            );
            const html = await searchRes.text();
            const text = html
              .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
              .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
              .replace(/<[^>]+>/g, " ")
              .replace(/\s+/g, " ")
              .slice(0, 3_000);

            // Also search for reviews/avaliações
            const reviewSearch = await fetch(
              `https://html.duckduckgo.com/html/?q=${encodeURIComponent(`"${businessName}" avaliações google OR doctoralia OR boa consulta`)}`,
              {
                headers: { "User-Agent": "Mozilla/5.0 Chrome/120" },
                signal: AbortSignal.timeout(8_000),
              }
            );
            const reviewHtml = await reviewSearch.text();
            const reviewText = reviewHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 1_500);

            return JSON.stringify({
              businessName,
              city,
              maps_url: mapsUrl,
              search_results: text,
              review_search: reviewText,
              note: `Busca por presença no Google Maps de "${query}". Verifique também: ${mapsUrl}`,
            });
          } catch (err) {
            return JSON.stringify({ error: `Erro ao buscar no Google Maps: ${err instanceof Error ? err.message : String(err)}` });
          }
        }

        case "get_agents_available": {
          const { department, onlyIdle = false } = args as { department?: string; onlyIdle?: boolean };
          const whereClause: Record<string, unknown> = { isActive: true };
          if (department) whereClause.department = { contains: department };
          if (onlyIdle) whereClause.status = "IDLE";
          const agents = await prisma.agent.findMany({
            where: whereClause,
            orderBy: [{ status: "asc" }, { name: "asc" }],
            select: { id: true, name: true, title: true, department: true, specialty: true, status: true, tasksCompleted: true },
          });
          return JSON.stringify({
            total: agents.length,
            agents: agents.map((a) => ({
              id: a.id,
              name: a.name,
              title: a.title,
              department: a.department,
              specialty: a.specialty,
              status: a.status,
              tasksCompleted: a.tasksCompleted,
            })),
          });
        }

        case "create_task": {
          const {
            agentId,
            agentName,
            missionId,
            missionName,
            title,
            description,
            instructions,
            input,
            autoExecute = true,
          } = args as {
            agentId?: string;
            agentName?: string;
            missionId?: string;
            missionName?: string;
            title: string;
            description: string;
            instructions: string;
            input?: Record<string, unknown>;
            autoExecute?: boolean;
          };

          // Resolve agent
          let resolvedAgentId = agentId;
          if (!resolvedAgentId && agentName) {
            const agent = await prisma.agent.findFirst({
              where: { name: { contains: agentName }, isActive: true },
              select: { id: true, name: true },
            });
            if (!agent) return JSON.stringify({ error: `Agente "${agentName}" não encontrado` });
            resolvedAgentId = agent.id;
          }
          if (!resolvedAgentId) return JSON.stringify({ error: "Informe agentId ou agentName" });

          // Resolve mission (optional)
          let resolvedMissionId = missionId;
          if (!resolvedMissionId && missionName) {
            const mission = await prisma.mission.findFirst({
              where: { title: { contains: missionName } },
              select: { id: true },
            });
            resolvedMissionId = mission?.id;
          }
          // If no mission, use or create a default system mission
          if (!resolvedMissionId) {
            const systemClient = await prisma.client.findFirst({ where: { slug: "lotus-internal" } })
              ?? await prisma.client.create({
                data: { name: "LOTUS Internal", slug: "lotus-internal", status: "ACTIVE" },
              });
            const mission = await prisma.mission.create({
              data: {
                title: `Tarefa: ${title}`,
                description: description,
                objective: description,
                status: "IN_PROGRESS",
                clientId: systemClient.id,
              },
            });
            resolvedMissionId = mission.id;
          }

          // Create the task
          const task = await prisma.task.create({
            data: {
              title,
              description,
              instructions,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              input: (input ?? {}) as any,
              status: "PENDING",
              missionId: resolvedMissionId,
              agentId: resolvedAgentId,
            },
          });

          // Resolve final agent display name
          const resolvedAgentName = agentName
            ?? (resolvedAgentId
              ? (await prisma.agent.findUnique({ where: { id: resolvedAgentId }, select: { name: true } }))?.name
              : undefined);

          // Auto-execute — call executeTask directly (no HTTP round-trip, no auth needed)
          if (autoExecute) {
            const agentForExec = resolvedAgentId
              ? await prisma.agent.findUnique({ where: { id: resolvedAgentId }, select: { id: true, name: true } })
              : null;
            if (agentForExec) {
              updateAgentStatus(agentForExec.id, "working", title).catch(() => {});
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const _db = { ...(prisma as any), runtime: createRuntimeClient() };
              executeTask(task.id, _db)
                .then(() => updateAgentStatus(agentForExec.id, "idle"))
                .catch((err) => {
                  console.error(`[create_task auto-execute] Task ${task.id} failed:`, err);
                  updateAgentStatus(agentForExec.id, "idle").catch(() => {});
                });
            }
          }

          return JSON.stringify({
            success: true,
            taskId: task.id,
            missionId: resolvedMissionId,
            agentName: resolvedAgentName,
            status: autoExecute ? "executing" : "created",
            message: autoExecute
              ? `Tarefa criada e ${resolvedAgentName ?? "agente"} já está executando!`
              : `Tarefa criada. Para executar: POST /api/agents/execute { taskId: "${task.id}" }`,
          });
        }

        default:
          return JSON.stringify({ error: `Ferramenta desconhecida: ${toolName}` });
      }
    } catch (err) {
      return JSON.stringify({ error: `Erro ao executar ${toolName}: ${err instanceof Error ? err.message : String(err)}` });
    }
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, history = [], clientId } = body;

    if (!message || typeof message !== "string") {
      return new Response(JSON.stringify({ error: "message is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Persist user message
    await prisma.chatMessage.create({
      data: {
        role: "USER",
        content: message,
        clientId: clientId || null,
        metadata: { source: "chat-ui" },
      },
    });

    // Look up client name if clientId provided
    let clientName: string | undefined;
    if (clientId) {
      const client = await prisma.client.findUnique({ where: { id: clientId }, select: { name: true } });
      clientName = client?.name;
    }

    const encoder = new TextEncoder();
    let fullResponse = "";

    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of streamRootMaster(message, {
            conversationHistory: history,
            clientId,
            clientName,
            dbToolDefs: DB_TOOL_DEFS,
            dbToolExecutor: createDbToolExecutor(),
          })) {
            if (chunk.delta) {
              fullResponse += chunk.delta;
              const data = `data: ${JSON.stringify({ delta: chunk.delta })}\n\n`;
              controller.enqueue(encoder.encode(data));
            }
          }

          // Persist assistant response after stream completes
          // If Root Master only called tools (no text), generate a summary from recent DB activity
          if (!fullResponse) {
            const since = new Date(Date.now() - 30000);
            const [recentClients, recentMissions, recentTasks] = await Promise.all([
              prisma.client.findMany({ where: { createdAt: { gte: since } }, select: { name: true }, orderBy: { createdAt: "desc" }, take: 3 }),
              prisma.mission.findMany({ where: { createdAt: { gte: since } }, select: { title: true }, orderBy: { createdAt: "desc" }, take: 3 }),
              prisma.task.findMany({ where: { createdAt: { gte: since } }, select: { title: true, agentId: true }, orderBy: { createdAt: "desc" }, take: 5 }),
            ]);
            const parts: string[] = [];
            if (recentClients.length) parts.push(`Cliente criado: ${recentClients.map((c) => c.name).join(", ")}`);
            if (recentMissions.length) parts.push(`Missão criada: ${recentMissions.map((m) => m.title).join(", ")}`);
            if (recentTasks.length) parts.push(`${recentTasks.length} tarefa(s) criada(s) e iniciada(s): ${recentTasks.map((t) => t.title).join(" | ")}`);
            if (parts.length) fullResponse = `Pronto! ${parts.join(". ")}. Os agentes já estão trabalhando.`;
          }
          if (fullResponse) {
            await prisma.chatMessage.create({
              data: {
                role: "ASSISTANT",
                content: fullResponse,
                clientId: clientId || null,
                metadata: { model: "root-master" },
              },
            });
          }

          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch {
          const errorData = `data: ${JSON.stringify({ error: "Stream error" })}\n\n`;
          controller.enqueue(encoder.encode(errorData));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch {
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get("limit") || "50");
  const clientId = searchParams.get("clientId");

  const messages = await prisma.chatMessage.findMany({
    where: clientId ? { clientId } : {},
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  return Response.json({ messages });
}
