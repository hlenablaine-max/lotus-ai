import { NextRequest, NextResponse } from "next/server";
import { initializeProviders, registry } from "@lotus/ai-engine";
import { updateAgentStatus } from "@/lib/agent-service";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

initializeProviders();

const SYSTEM_PROMPT = `Você é o Motor de Revenue Intelligence da LOTUS AI — especializado em análise de receita, projeções e ROI para PMEs de saúde brasileiras.

Sua função: analisar o potencial de receita, criar projeções realistas e identificar oportunidades de crescimento.

RETORNE SEMPRE JSON VÁLIDO com esta estrutura exata:
{
  "current_state": {
    "estimated_monthly_revenue": 15000,
    "estimated_new_clients_per_month": 5,
    "average_ticket": 3000,
    "digital_revenue_percentage": 20,
    "top_service_by_revenue": "nome do serviço",
    "churn_rate_estimate": "10% ao mês"
  },
  "benchmarks": {
    "industry": "setor",
    "city_tier": "capital|interior_grande|interior_medio|interior_pequeno",
    "average_revenue_similar_business": 25000,
    "top_quartile_revenue": 80000,
    "digital_acquisition_cost": 150,
    "lifetime_value_estimate": 8000,
    "conversion_rate_benchmark": "15%"
  },
  "revenue_projections": {
    "without_marketing": {
      "month_3": 15000,
      "month_6": 16000,
      "month_12": 18000,
      "growth_rate": "5% ao ano (orgânico)"
    },
    "with_lotus_basic": {
      "investment": 2000,
      "month_3": 22000,
      "month_6": 32000,
      "month_12": 55000,
      "new_clients_per_month": 12,
      "roi": "3.5x"
    },
    "with_lotus_full": {
      "investment": 5000,
      "month_3": 30000,
      "month_6": 55000,
      "month_12": 100000,
      "new_clients_per_month": 25,
      "roi": "5x"
    }
  },
  "revenue_opportunities": [
    {
      "opportunity": "descrição da oportunidade",
      "current_revenue": 0,
      "potential_additional_revenue": 5000,
      "implementation_difficulty": "fácil|médio|difícil",
      "timeframe": "30|60|90 dias",
      "strategy": "como capturar"
    }
  ],
  "pricing_analysis": {
    "current_pricing_assessment": "abaixo|na_média|acima do mercado",
    "recommended_adjustments": [
      {
        "service": "nome do serviço",
        "current_price_estimate": 2500,
        "recommended_price": 3200,
        "justification": "por que aumentar"
      }
    ],
    "upsell_opportunities": [
      {
        "trigger": "quando oferecer",
        "upsell": "o que oferecer",
        "additional_revenue": 800
      }
    ]
  },
  "kpis_to_track": [
    {
      "kpi": "nome do KPI",
      "current": "valor atual estimado",
      "target_90d": "meta",
      "target_180d": "meta",
      "how_to_track": "como rastrear",
      "action_if_below": "o que fazer se abaixo da meta"
    }
  ],
  "monthly_dashboard": {
    "must_track_metrics": ["métrica 1", "métrica 2", "métrica 3"],
    "review_frequency": "semanal|quinzenal|mensal",
    "decision_points": ["quando escalar investimento", "quando revisar estratégia"]
  },
  "summary": "resumo executivo de oportunidade de receita em 3 frases"
}`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { clientName, niche, city, currentRevenue, averageTicket, currentClients, goals, diagnosisData } = body;

    if (!clientName) {
      return NextResponse.json({ error: "clientName é obrigatório" }, { status: 400 });
    }

    await updateAgentStatus("agent-bi", "RESEARCHING", `Analisando revenue de ${clientName}`);
    await updateAgentStatus("agent-data", "RESEARCHING", `Calculando projeções financeiras`);

    const contextData = `
CLIENTE: ${clientName}
NICHO: ${niche || "Saúde"}
CIDADE: ${city || "Brasil"}
${currentRevenue ? `FATURAMENTO MENSAL ATUAL: R$ ${currentRevenue}` : ""}
${averageTicket ? `TICKET MÉDIO: R$ ${averageTicket}` : ""}
${currentClients ? `CLIENTES ATIVOS: ${currentClients}` : ""}
${goals ? `METAS: ${goals}` : ""}

${diagnosisData ? `DIAGNÓSTICO DIGITAL:
${JSON.stringify(diagnosisData, null, 2)}` : ""}

Analise o potencial de revenue e crie projeções realistas.
Use benchmarks reais do setor de saúde brasileiro (odontologia, implantes, estética).
Para ${city || "interior do Brasil"}, considere o poder aquisitivo local.
Seja conservador nas projeções mas ambicioso nas oportunidades.
    `.trim();

    const result = await registry.getDefault().complete({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: contextData },
      ],
      maxTokens: 4000,
    });

    let revenueAnalysis;
    try {
      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      revenueAnalysis = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(result.content);
    } catch {
      revenueAnalysis = { summary: result.content, error: "parsing_error" };
    }

    await updateAgentStatus("agent-bi", "COMPLETED", `Revenue Intelligence de ${clientName} pronto`);
    await updateAgentStatus("agent-data", "IDLE", null);

    return NextResponse.json({ success: true, engine: "revenue", revenueAnalysis, clientName });
  } catch (error) {
    console.error("Engine Revenue error:", error);
    return NextResponse.json({ error: "Erro ao executar motor de revenue" }, { status: 500 });
  }
}
