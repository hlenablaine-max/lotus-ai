import { NextRequest, NextResponse } from "next/server";
import { initializeProviders, registry } from "@lotus/ai-engine";
import { updateAgentStatus } from "@/lib/agent-service";
import { demoImplementation } from "@/lib/engine-demos";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

initializeProviders();

const SYSTEM_PROMPT = `Você é o Motor de Implementação da LOTUS AI — especializado em criar guias de setup técnico detalhados e passo-a-passo para PMEs de saúde brasileiras.

Sua função: transformar uma arquitetura de solução em guias de implementação concretos e executáveis.

RETORNE SEMPRE JSON VÁLIDO com esta estrutura exata:
{
  "implementation_plan": {
    "title": "título do plano",
    "overview": "visão geral",
    "total_duration": "X semanas",
    "prerequisites": ["pré-requisito 1", "pré-requisito 2"]
  },
  "setup_guides": [
    {
      "tool": "nome da ferramenta",
      "category": "ads|crm|automation|analytics|website|communication",
      "purpose": "para que serve",
      "steps": [
        {
          "step": 1,
          "action": "ação a executar",
          "url_or_location": "onde fazer",
          "details": "detalhes específicos",
          "screenshot_tip": "o que procurar na tela"
        }
      ],
      "estimated_time": "X horas",
      "cost": "gratuito|R$ XX/mês",
      "difficulty": "fácil|médio|avançado"
    }
  ],
  "meta_ads_setup": {
    "pixel_installation": {
      "steps": ["passo 1", "passo 2"],
      "verification": "como verificar"
    },
    "first_campaign": {
      "objective": "conversão|tráfego|engajamento",
      "audience": "descrição do público",
      "budget": "R$ XXX/dia",
      "creative_specs": "especificações de criativo",
      "ad_copy_template": "template de copy"
    },
    "tracking_setup": "setup de rastreamento"
  },
  "whatsapp_integration": {
    "tool": "ManyChat|Z-API|Typebot",
    "setup_steps": ["passo 1", "passo 2"],
    "first_automation": "primeira automação a criar",
    "api_config": "configurações de API necessárias"
  },
  "analytics_setup": {
    "google_analytics": {
      "property_creation": "como criar",
      "key_events": ["evento 1", "evento 2"],
      "dashboard_setup": "setup do dashboard"
    },
    "meta_analytics": {
      "metrics_to_track": ["métrica 1", "métrica 2"]
    }
  },
  "week_by_week": [
    {
      "week": 1,
      "tasks": [
        {
          "day": "segunda",
          "task": "tarefa",
          "time_needed": "X horas",
          "responsible": "cliente|agência",
          "deliverable": "entregável"
        }
      ]
    }
  ],
  "checkpoints": [
    {
      "week": 2,
      "milestone": "marco",
      "success_criteria": ["critério 1", "critério 2"],
      "metrics_to_check": ["métrica 1"]
    }
  ],
  "troubleshooting": [
    {
      "problem": "problema comum",
      "cause": "causa provável",
      "solution": "solução step-by-step"
    }
  ]
}`;

export async function POST(req: NextRequest) {
  let body: any = {};
  try {
    body = await req.json();
    const { clientName, niche, architectureData, selectedComponents, timeline } = body;

    if (!clientName) {
      return NextResponse.json({ error: "clientName é obrigatório" }, { status: 400 });
    }

    await updateAgentStatus("agent-web", "EXECUTING", `Criando plano de implementação para ${clientName}`);
    await updateAgentStatus("agent-mc", "PLANNING", `Organizando cronograma de ${clientName}`);

    const contextData = `
CLIENTE: ${clientName}
NICHO: ${niche || "Saúde"}
${timeline ? `PRAZO: ${timeline}` : ""}
${selectedComponents ? `COMPONENTES SELECIONADOS: ${Array.isArray(selectedComponents) ? selectedComponents.join(", ") : selectedComponents}` : ""}

${architectureData ? `ARQUITETURA DE SOLUÇÃO:
${JSON.stringify(architectureData, null, 2)}` : ""}

Crie um plano de implementação detalhado e executável.
Inclua guias passo-a-passo para: Meta Business Suite, Google Analytics, ManyChat/Z-API, configuração de pixel, primeira campanha.
Foque em ferramentas que PMEs brasileiras de saúde realmente usam.
Seja específico com URLs, nomes de campos, e configurações exatas.
    `.trim();

    const result = await registry.getDefault().complete({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: contextData },
      ],
      maxTokens: 5000,
    });

    let implementation;
    try {
      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      implementation = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(result.content);
    } catch {
      implementation = { overview: result.content, error: "parsing_error" };
    }

    await updateAgentStatus("agent-web", "COMPLETED", `Plano de implementação de ${clientName} pronto`);
    await updateAgentStatus("agent-mc", "IDLE", null);

    return NextResponse.json({ success: true, engine: "implementation", implementation, clientName });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const aiDown = errorMsg.includes('503') || errorMsg.includes('instabilidade') ||
                   errorMsg.includes('No AI provider') || errorMsg.includes('502') || errorMsg.includes('504');
    if (aiDown) {
      const cn = body?.clientName || "";
      await updateAgentStatus("agent-web", "COMPLETED", `Demo: Implementação de ${cn}`);
      await updateAgentStatus("agent-mc", "IDLE", null);
      return NextResponse.json({
        success: true, engine: "implementation",
        implementation: demoImplementation(cn, body?.niche || ""),
        clientName: cn, _demo: true,
      });
    }
    console.error("Engine Implementation error:", error);
    return NextResponse.json({ error: `Erro ao executar motor de implementação: ${errorMsg}` }, { status: 500 });
  }
}
