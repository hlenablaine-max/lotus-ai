import { NextRequest, NextResponse } from "next/server";
import { initializeProviders, registry } from "@lotus/ai-engine";
import { logEngineRun } from "@/lib/engine-log";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

initializeProviders();

const SYSTEM_PROMPT = `Você é o Motor de Arquitetura de Soluções da LOTUS AI — especializado em desenhar soluções digitais concretas para PMEs de saúde no Brasil.

Sua função: projetar o conjunto exato de ferramentas, automações e sistemas que o cliente precisa.

RETORNE SEMPRE JSON VÁLIDO com esta estrutura exata:
{
  "solution_name": "nome da solução completa",
  "overview": "descrição em 2-3 frases do que será construído",
  "components": [
    {
      "component": "nome do componente",
      "type": "landing_page|automação|anúncio|funil|crm|conteúdo|chatbot",
      "description": "o que é e para que serve",
      "tools": ["ferramenta 1", "ferramenta 2"],
      "priority": "crítico|alta|média|baixa",
      "estimated_hours": 8,
      "dependencies": []
    }
  ],
  "tech_stack": {
    "website": ["ferramenta"],
    "ads": ["ferramenta"],
    "crm": ["ferramenta"],
    "automation": ["ferramenta"],
    "analytics": ["ferramenta"],
    "communication": ["ferramenta"]
  },
  "funnel": {
    "awareness": {
      "channels": ["canal 1", "canal 2"],
      "content_types": ["tipo 1"],
      "cta": "call to action"
    },
    "consideration": {
      "assets": ["landing page", "depoimentos"],
      "nurturing": "descrição da nutrição"
    },
    "conversion": {
      "mechanism": "como converte",
      "offer": "oferta de conversão"
    },
    "retention": {
      "strategy": "estratégia de retenção"
    }
  },
  "automations": [
    {
      "name": "nome da automação",
      "trigger": "gatilho",
      "action": "ação executada",
      "tool": "ferramenta usada",
      "impact": "impacto esperado"
    }
  ],
  "implementation_phases": [
    {
      "phase": 1,
      "name": "nome da fase",
      "duration": "2 semanas",
      "deliverables": ["entregável 1", "entregável 2"],
      "resources_needed": ["recurso 1"]
    }
  ],
  "total_implementation_time": "X semanas",
  "monthly_cost_estimate": {
    "tools": 500,
    "ads": 2000,
    "management": 1500,
    "total": 4000
  },
  "expected_outcomes": {
    "leads_per_month": 50,
    "conversion_rate": "15%",
    "new_clients_per_month": 7,
    "roi_estimate": "3x em 6 meses"
  }
}`;

export async function POST(req: NextRequest) {
  let body: any = {};
  try {
    body = await req.json();
    const { clientName, niche, city, needs, budget, strategyData } = body;

    if (!clientName) {
      return NextResponse.json({ error: "clientName é obrigatório" }, { status: 400 });
    }

    await logEngineRun("solution-arch", clientName, "started");

    const contextData = `
CLIENTE: ${clientName}
NICHO: ${niche || "Saúde"}
CIDADE: ${city || "Brasil"}
${budget ? `ORÇAMENTO MENSAL: R$ ${budget}` : ""}
${needs ? `NECESSIDADES IDENTIFICADAS: ${Array.isArray(needs) ? needs.join(", ") : needs}` : ""}

${strategyData ? `DADOS DA ESTRATÉGIA:
${JSON.stringify(strategyData, null, 2)}` : ""}

Projete a arquitetura completa de solução digital para este cliente de saúde.
Inclua: landing pages, funis, automações WhatsApp, campanhas Meta/Google, CRM, chatbot.
Foque em ferramentas acessíveis para PMEs brasileiras (RD Station, ManyChat, Hotmart, etc.).
    `.trim();

    const result = await registry.getDefault().complete({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: contextData },
      ],
      maxTokens: 4000,
    });

    let architecture;
    try {
      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      architecture = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(result.content);
    } catch {
      architecture = { overview: result.content, error: "parsing_error" };
    }

    await logEngineRun("solution-arch", clientName, "completed");

    return NextResponse.json({ success: true, engine: "solution-arch", architecture, clientName });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const aiDown = errorMsg.includes('503') || errorMsg.includes('instabilidade') ||
                   errorMsg.includes('No AI provider') || errorMsg.includes('502') || errorMsg.includes('504');
    if (aiDown) {
      // Sem dado inventado: se a IA está fora do ar, o motor diz isso (regra: nada simulado como real)
      await logEngineRun("solution-arch", body?.clientName || "", "failed", { error: errorMsg, aiUnavailable: true });
      return NextResponse.json(
        { error: "A IA está fora do ar agora (o provedor não respondeu). Nada foi gerado. Tente de novo em alguns minutos ou troque o provedor em Configurações." },
        { status: 503 }
      );
    }
    await logEngineRun("solution-arch", body?.clientName || "", "failed", { error: errorMsg });
    console.error("Engine Solution-Arch error:", error);
    return NextResponse.json({ error: `Erro ao executar motor de arquitetura: ${errorMsg}` }, { status: 500 });
  }
}
