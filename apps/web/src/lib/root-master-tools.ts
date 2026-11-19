// Ferramentas de dados e delegação do Root Master (CRM, missões, tarefas, pesquisa web).
import type { AITool, ToolExecutor } from "@lotus/ai-engine";
import { prisma } from "@/lib/prisma";
import { runTask } from "@/lib/task-runner";

// DB tools the Root Master can call to query real company data
export const DB_TOOL_DEFS: AITool[] = [
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
        priority: { type: "string", enum: ["LOW", "MEDIUM", "HIGH", "URGENT"], description: "Prioridade (padrão MEDIUM)" },
        type: { type: "string", enum: ["GROWTH", "TRANSFORMATION", "INTELLIGENCE", "HYBRID", "INTERNAL"], description: "Tipo da missão: GROWTH (marketing), TRANSFORMATION (BTO: CRM, automações, sistemas), INTELLIGENCE (pesquisa), HYBRID" },
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
    name: "start_diagnosis",
    description:
      "Inicia o DIAGNÓSTICO 360 de um lead a partir do Instagram: o app coleta perfil, posts, vídeos (com transcrição), link da bio/site, anúncios na Meta e Google Maps, e a equipe inteira analisa (conteúdo, copy, vídeos, tráfego, site, reputação, funil, operação, conformidade), fecha o diagnóstico consolidado e o roteiro da reunião, e em seguida PRODUZ as soluções prontas para instalar no cliente (IA de atendimento no WhatsApp, campanhas de tráfego, copies dos anúncios, criativos e roteiros de vídeo, calendário de conteúdo, página de agendamento, funil no CRM e pacote de entrega). Use SEMPRE que o dono enviar o Instagram de um lead/prospect para diagnosticar. Cria o cliente e a missão sozinho — não use create_client/create_mission antes.",
    parameters: {
      properties: {
        instagram: { type: "string", description: "Link ou @ do Instagram do lead" },
        website: { type: "string", description: "Site do lead, se o dono informou (opcional)" },
        city: { type: "string", description: "Cidade do negócio, se conhecida (melhora a busca no Google Maps)" },
        produce: { type: "boolean", description: "Produzir as soluções depois do diagnóstico (padrão: true). Use false só se o dono pedir apenas o diagnóstico." },
      },
      required: ["instagram"],
    },
  },
  {
    name: "get_diagnosis",
    description: "Consulta o andamento e o resultado de um Diagnóstico 360 (tarefas dos agentes, relatório final, aprovações pendentes).",
    parameters: {
      properties: { missionId: { type: "string", description: "ID da missão do diagnóstico" } },
      required: ["missionId"],
    },
  },
  {
    name: "get_solutions",
    description: "Consulta o Solution Intelligence Catalog: soluções que a LOTUS implementa (problema resolvido, escopo, horas, preço base de setup e mensalidade, prazo). Use SEMPRE ao planejar missões de transformação (BTO) ou montar propostas.",
    parameters: {
      properties: {
        category: { type: "string", description: "Filtrar por categoria (opcional)" },
        search: { type: "string", description: "Texto para buscar no nome/descrição/problema (opcional)" },
      },
    },
  },
  {
    name: "get_mission_documents",
    description: "Lê os entregáveis (documentos) produzidos pelos agentes em uma missão, com o conteúdo. Use para consolidar resultados e reportar ao dono.",
    parameters: {
      properties: {
        missionId: { type: "string", description: "ID da missão" },
        maxCharsPerDoc: { type: "number", description: "Limite de caracteres por documento (padrão 3000)" },
      },
      required: ["missionId"],
    },
  },
  {
    name: "get_approvals",
    description: "Lista aprovações pendentes (ações de agentes aguardando decisão do dono) ou já decididas.",
    parameters: {
      properties: {
        status: { type: "string", enum: ["PENDING", "APPROVED", "REJECTED", "ALL"], description: "Padrão PENDING" },
      },
    },
  },
  {
    name: "save_client_assessment",
    description: "Registra um Client Value Assessment (avaliação de valor e precificação) para um cliente/prospect: scores, horas, custos, preço recomendado de setup e mensalidade, ROI e justificativa. Baseie-se em dados coletados e no catálogo de soluções; marque premissas na justificativa.",
    parameters: {
      properties: {
        clientId: { type: "string", description: "ID do cliente" },
        complexityScore: { type: "number", description: "1-100" },
        valueScore: { type: "number", description: "1-100" },
        effortScore: { type: "number", description: "1-100" },
        riskScore: { type: "number", description: "1-100" },
        estimatedTotalHours: { type: "number" },
        estimatedToolsCost: { type: "number", description: "Custo mensal de ferramentas de terceiros (R$)" },
        recommendedSetupPrice: { type: "number", description: "R$" },
        recommendedMonthlyPrice: { type: "number", description: "R$" },
        estimatedMonthlyROI: { type: "number", description: "Retorno mensal estimado para o cliente (R$)" },
        paybackMonths: { type: "number" },
        pricingRationale: { type: "string", description: "Justificativa do preço em linguagem natural" },
        reasoning: { type: "string", description: "Raciocínio completo, com premissas e o que é hipótese" },
        factors: { type: "object", description: "Fatores usados (porte, leads/mês, ticket, soluções selecionadas, etc.)" },
      },
      required: ["clientId", "recommendedSetupPrice", "recommendedMonthlyPrice", "pricingRationale", "reasoning"],
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
        dependsOn: { type: "array", items: { type: "string" }, description: "IDs (taskId) de tarefas da mesma missão que precisam terminar antes desta. A tarefa espera e inicia sozinha quando as dependências concluírem. Tarefas sem dependência rodam em paralelo." },
        autoExecute: { type: "boolean", description: "Se true (padrão), inicia execução imediatamente após criar a tarefa" },
      },
      required: ["title", "description", "instructions"],
    },
  },
];

export function createDbToolExecutor(): ToolExecutor {
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
          // Dedup pelo nome normalizado (sem acento, sem palavras genéricas, sem ordem).
          // Palavra em comum NÃO basta: "Clínica A" e "Clínica B" são clientes diferentes.
          const GENERIC = new Set(["clinica", "clinic", "centro", "instituto", "consultorio", "dr", "dra", "ltda", "me", "sa", "de", "da", "do", "e"]);
          const fingerprint = (value: string) =>
            value
              .toLowerCase()
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .split(/[^a-z0-9]+/)
              .filter((w) => w && !GENERIC.has(w))
              .sort()
              .join(" ");
          const target = fingerprint(name);
          const allClients = await prisma.client.findMany({ select: { id: true, name: true } });
          const existing = target ? allClients.find((c) => fingerprint(c.name) === target) ?? null : null;
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
          const { clientId, clientName, title, description, objective, priority = "MEDIUM", type = "GROWTH" } = args as {
            clientId?: string; clientName?: string; title: string; description?: string;
            objective?: string; priority?: string; type?: string;
          };
          const validPriority = (["LOW", "MEDIUM", "HIGH", "URGENT"] as const).find((p) => p === priority)
            ?? (priority === "CRITICAL" ? "URGENT" : "MEDIUM");
          const validType = (["GROWTH", "TRANSFORMATION", "INTELLIGENCE", "HYBRID", "INTERNAL"] as const).find((t) => t === type) ?? "GROWTH";
          if (!title?.trim()) return JSON.stringify({ error: "title é obrigatório" });
          // Resolve client
          let resolvedClientId = clientId;
          if (!resolvedClientId && clientName) {
            const client = await prisma.client.findFirst({
              where: { name: { contains: clientName, mode: "insensitive" } },
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
              priority: validPriority,
              type: validType,
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
          const where = clientId ? { id: clientId } : clientName ? { name: { contains: clientName, mode: "insensitive" as const } } : null;
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

        case "start_diagnosis": {
          const { startDiagnosis } = await import("@/lib/diagnosis-360");
          const { instagram, website, city, produce } = args as { instagram: string; website?: string; city?: string; produce?: boolean };
          const started = await startDiagnosis({ instagram, website, city, produce: produce !== false });
          return JSON.stringify({
            success: true,
            ...started,
            message: `Diagnóstico 360 de @${started.handle} iniciado (missão ${started.missionId}). A coleta leva de 2 a 5 minutos e as análises dos agentes mais alguns minutos. Acompanhe em Diagnóstico ou Missões; use get_diagnosis para ver o resultado. Se houver WhatsApp do lead, o teste de atendimento aparece em Aprovações.`,
          });
        }

        case "get_diagnosis": {
          const { diagnosisProgress } = await import("@/lib/diagnosis-360");
          const progress = await diagnosisProgress(String((args as { missionId: string }).missionId));
          if (!progress) return JSON.stringify({ error: "Diagnóstico não encontrado" });
          return JSON.stringify({
            mission: progress.mission.title,
            status: progress.mission.status,
            done: progress.done,
            tasks: progress.tasks.map((t) => `${t.status} — ${t.title} (${t.agent})${t.error ? ` — erro: ${t.error}` : ""}`),
            pendingApprovals: progress.approvals.filter((a) => a.status === "PENDING").map((a) => a.title),
            report: progress.report?.content.slice(0, 9000) ?? null,
          });
        }

        case "get_solutions": {
          const { category, search } = args as { category?: string; search?: string };
          const solutions = await prisma.solution.findMany({
            where: {
              isActive: true,
              ...(category ? { category: { contains: category, mode: "insensitive" } } : {}),
              ...(search
                ? {
                    OR: [
                      { name: { contains: search, mode: "insensitive" } },
                      { description: { contains: search, mode: "insensitive" } },
                      { problemSolved: { contains: search, mode: "insensitive" } },
                    ],
                  }
                : {}),
            },
            orderBy: [{ category: "asc" }, { baseSetupPrice: "asc" }],
          });
          return JSON.stringify({
            total: solutions.length,
            solutions: solutions.map((sol) => ({
              id: sol.id,
              name: sol.name,
              category: sol.category,
              problemSolved: sol.problemSolved,
              complexity: sol.complexity,
              features: sol.features,
              requiredDepartments: sol.requiredDepartments,
              hours: `${sol.minHours}-${sol.maxHours}`,
              baseSetupPrice: sol.baseSetupPrice,
              baseMonthlyPrice: sol.baseMonthlyPrice,
              deliveryWeeks: sol.deliveryWeeks,
              implementationModel: sol.implementationModel,
            })),
          });
        }

        case "get_mission_documents": {
          const { missionId, maxCharsPerDoc = 3000 } = args as { missionId: string; maxCharsPerDoc?: number };
          const documents = await prisma.document.findMany({
            where: { missionId },
            orderBy: { createdAt: "asc" },
            select: { id: true, title: true, type: true, content: true, createdAt: true, task: { select: { title: true, agent: { select: { name: true } } } } },
          });
          return JSON.stringify({
            total: documents.length,
            documents: documents.map((d) => ({
              id: d.id,
              title: d.title,
              type: d.type,
              agent: d.task?.agent?.name ?? null,
              task: d.task?.title ?? null,
              createdAt: d.createdAt,
              content: d.content.slice(0, Number(maxCharsPerDoc)),
              truncated: d.content.length > Number(maxCharsPerDoc),
            })),
          });
        }

        case "get_approvals": {
          const { status = "PENDING" } = args as { status?: string };
          const approvals = await prisma.approval.findMany({
            where: status === "ALL" ? {} : { status: status as "PENDING" | "APPROVED" | "REJECTED" },
            orderBy: { createdAt: "desc" },
            take: 30,
            include: { mission: { select: { title: true, client: { select: { name: true } } } } },
          });
          return JSON.stringify({
            total: approvals.length,
            approvals: approvals.map((a) => ({
              id: a.id,
              type: a.type,
              title: a.title,
              description: a.description,
              status: a.status,
              mission: a.mission?.title ?? null,
              client: a.mission?.client.name ?? null,
              createdAt: a.createdAt,
            })),
          });
        }

        case "save_client_assessment": {
          const a = args as Record<string, unknown>;
          const clientId = String(a.clientId ?? "");
          const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true, name: true } });
          if (!client) return JSON.stringify({ error: "Cliente não encontrado. Use get_clients para obter o ID." });
          const score = (v: unknown) => Math.max(0, Math.min(100, Math.round(Number(v) || 0)));
          const money = (v: unknown) => Math.max(0, Number(v) || 0);
          const ceo = await prisma.agent.findFirst({ where: { slug: "lotus-ai-ceo" }, select: { id: true } });
          const assessment = await prisma.clientAssessment.create({
            data: {
              clientId: client.id,
              createdByAgentId: ceo?.id ?? null,
              complexityScore: score(a.complexityScore),
              valueScore: score(a.valueScore),
              effortScore: score(a.effortScore),
              riskScore: score(a.riskScore),
              estimatedTotalHours: Math.round(money(a.estimatedTotalHours)),
              estimatedToolsCost: money(a.estimatedToolsCost),
              recommendedSetupPrice: money(a.recommendedSetupPrice),
              recommendedMonthlyPrice: money(a.recommendedMonthlyPrice),
              estimatedMonthlyROI: money(a.estimatedMonthlyROI),
              paybackMonths: Math.round(money(a.paybackMonths)),
              pricingRationale: String(a.pricingRationale ?? ""),
              reasoning: String(a.reasoning ?? ""),
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              factors: (a.factors ?? {}) as any,
            },
          });
          await prisma.activityLog.create({
            data: {
              clientId: client.id,
              agentId: ceo?.id ?? null,
              action: "CLIENT_ASSESSMENT_CREATED",
              details: { assessmentId: assessment.id, setup: assessment.recommendedSetupPrice, monthly: assessment.recommendedMonthlyPrice },
              level: "INFO",
            },
          });
          return JSON.stringify({
            success: true,
            assessmentId: assessment.id,
            message: `Assessment registrado para ${client.name}: setup R$ ${assessment.recommendedSetupPrice}, mensalidade R$ ${assessment.recommendedMonthlyPrice}.`,
          });
        }

        case "get_agents_available": {
          const { department, onlyIdle = false } = args as { department?: string; onlyIdle?: boolean };
          const whereClause: Record<string, unknown> = { isActive: true };
          if (department) whereClause.department = { contains: department, mode: "insensitive" };
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
            dependsOn,
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
            dependsOn?: string[];
            autoExecute?: boolean;
          };

          // Resolve agent
          let resolvedAgentId = agentId;
          if (!resolvedAgentId && agentName) {
            const agent = await prisma.agent.findFirst({
              where: { name: { contains: agentName, mode: "insensitive" }, isActive: true },
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
              where: { title: { contains: missionName, mode: "insensitive" } },
              orderBy: { createdAt: "desc" },
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

          // Dependências: só IDs reais de tarefas da mesma missão
          let validDeps: string[] = [];
          if (Array.isArray(dependsOn) && dependsOn.length > 0) {
            const found = await prisma.task.findMany({
              where: { id: { in: dependsOn.map(String) }, missionId: resolvedMissionId },
              select: { id: true },
            });
            validDeps = found.map((t) => t.id);
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
              dependsOn: validDeps,
            },
          });
          await prisma.activityLog.create({
            data: {
              agentId: resolvedAgentId,
              missionId: resolvedMissionId,
              taskId: task.id,
              action: "TASK_CREATED",
              details: { title, dependsOn: validDeps, by: "root-master" },
              level: "INFO",
            },
          });

          // Resolve final agent display name
          const resolvedAgentName = agentName
            ?? (resolvedAgentId
              ? (await prisma.agent.findUnique({ where: { id: resolvedAgentId }, select: { name: true } }))?.name
              : undefined);

          if (autoExecute) runTask(task.id);

          return JSON.stringify({
            success: true,
            taskId: task.id,
            missionId: resolvedMissionId,
            agentName: resolvedAgentName,
            dependsOn: validDeps,
            status: !autoExecute ? "created" : validDeps.length > 0 ? "waiting_dependencies" : "executing",
            message: !autoExecute
              ? `Tarefa criada (não iniciada).`
              : validDeps.length > 0
                ? `Tarefa criada. ${resolvedAgentName ?? "O agente"} inicia automaticamente quando as ${validDeps.length} dependência(s) terminarem.`
                : `Tarefa criada e ${resolvedAgentName ?? "agente"} já está executando!`,
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
