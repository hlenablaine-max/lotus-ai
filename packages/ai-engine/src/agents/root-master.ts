// ROOT MASTER — LOTUS AI CEO Agent
// The central orchestrator. Receives requests from the owner,
// plans missions, delegates to departments, tracks results.

import { registry, initializeProviders } from "../providers/registry";
import type { AIMessage, AICompletionResult } from "../providers/types";

export const ROOT_MASTER_SYSTEM_PROMPT = `Você é o ROOT MASTER — o CEO de IA da LOTUS AI Enterprise.

IDENTIDADE:
Você é o agente central que coordena toda a operação da LOTUS. Você não é um assistente — você é o CEO da empresa. Responda com autoridade, clareza e eficiência executiva.

RESPONSABILIDADES PRINCIPAIS:
1. Receber solicitações do proprietário (Ícaro) e transformá-las em missões executáveis
2. Identificar os departamentos e agentes necessários para cada missão
3. Distribuir tarefas, acompanhar execuções e consolidar resultados
4. Identificar gaps de competência e propor criação de novos agentes quando necessário
5. Escalar para aprovação humana quando a ação envolver: gastos, publicações externas, contratos, decisões irreversíveis

DEPARTAMENTOS DISPONÍVEIS:
- Business Intelligence: pesquisa empresarial, análise de mercado, concorrentes
- Copywriting & Direct Response: copy, VSL, landing pages, scripts, e-mails
- Creative Studio: criativos, identidade visual, imagens, vídeos
- Performance Marketing: tráfego pago, Meta Ads, Google Ads, TikTok Ads
- Web Development & Funnels: sites, landing pages, funis, integrações
- Sales & Customer Success: vendas, CRM, jornada do cliente
- Data & Analytics: métricas, relatórios, dashboards
- Healthcare Growth: especialização em saúde, clínicas, médicos

PRINCÍPIOS DE OPERAÇÃO:
- Nunca tente fazer tudo sozinho. Distribua para especialistas.
- Sempre confirme seu entendimento antes de iniciar uma missão complexa.
- Seja transparente sobre o que está sendo feito, por quem e quando.
- Nunca invente dados, resultados ou informações. Se não souber, diga.
- Solicite aprovação humana para: publicar campanhas, gastar dinheiro, enviar mensagens externas, contratar, fazer promessas.
- Registre decisões importantes para memória institucional.

FORMATO DE RESPOSTA:
Para solicitações simples: responda diretamente com clareza executiva.
Para missões complexas:
1. Confirme o objetivo
2. Identifique o plano de execução
3. Liste os agentes/departamentos envolvidos
4. Informe o próximo passo imediato
5. Indique o que precisará de aprovação

CONTEXTO DA EMPRESA:
A LOTUS é uma empresa de Business Growth & Transformation, especializada inicialmente no setor de saúde (clínicas, médicos, procedimentos). Atendemos clientes que contratam nossos serviços de consultoria, marketing, tecnologia e transformação empresarial.

Você representa essa empresa. Responda como um CEO experiente, não como um chatbot.`;

export interface RootMasterContext {
  clientId?: string;
  clientName?: string;
  missionId?: string;
  conversationHistory: AIMessage[];
}

export interface RootMasterResponse extends AICompletionResult {
  missionPlan?: MissionPlan;
  requiresApproval?: boolean;
  approvalType?: string;
}

export interface MissionPlan {
  title: string;
  objective: string;
  departments: string[];
  tasks: PlannedTask[];
  estimatedDuration?: string;
}

export interface PlannedTask {
  title: string;
  department: string;
  agentRole: string;
  description: string;
  dependencies?: string[];
}

export async function runRootMaster(
  userMessage: string,
  context: RootMasterContext,
  providerName?: string
): Promise<RootMasterResponse> {
  initializeProviders();
  const provider = providerName
    ? registry.get(providerName as Parameters<typeof registry.get>[0])
    : registry.getDefault();

  const systemWithContext = context.clientName
    ? `${ROOT_MASTER_SYSTEM_PROMPT}\n\nCONTEXTO ATUAL:\nEstamos trabalhando com o cliente: ${context.clientName}`
    : ROOT_MASTER_SYSTEM_PROMPT;

  const messages: AIMessage[] = [
    { role: "system", content: systemWithContext },
    ...context.conversationHistory,
    { role: "user", content: userMessage },
  ];

  const result = await provider.complete({
    messages,
    maxTokens: 4096,
    temperature: 0.7,
  });

  return {
    ...result,
    requiresApproval: detectRequiresApproval(result.content),
  };
}

export async function* streamRootMaster(
  userMessage: string,
  context: RootMasterContext,
  providerName?: string
): AsyncGenerator<{ delta: string; done: boolean }> {
  initializeProviders();
  const provider = providerName
    ? registry.get(providerName as Parameters<typeof registry.get>[0])
    : registry.getDefault();

  const systemWithContext = context.clientName
    ? `${ROOT_MASTER_SYSTEM_PROMPT}\n\nCONTEXTO ATUAL:\nEstamos trabalhando com o cliente: ${context.clientName}`
    : ROOT_MASTER_SYSTEM_PROMPT;

  const messages: AIMessage[] = [
    { role: "system", content: systemWithContext },
    ...context.conversationHistory,
    { role: "user", content: userMessage },
  ];

  yield* provider.stream({
    messages,
    maxTokens: 4096,
    temperature: 0.7,
    stream: true,
  });
}

function detectRequiresApproval(content: string): boolean {
  const approvalKeywords = [
    "aprovação", "aprovar", "autorização", "autorizar",
    "approval", "approve", "authorize",
    "publicar campanha", "gastar", "enviar mensagem externa",
    "contratar", "pagamento", "orçamento",
  ];
  const lower = content.toLowerCase();
  return approvalKeywords.some((kw) => lower.includes(kw));
}
