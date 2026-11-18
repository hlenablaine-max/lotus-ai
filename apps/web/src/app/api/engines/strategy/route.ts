import { NextRequest, NextResponse } from "next/server";
import { initializeProviders, registry } from "@lotus/ai-engine";
import { updateAgentStatus } from "@/lib/agent-service";
import { demoStrategy } from "@/lib/engine-demos";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

initializeProviders();

const SYSTEM_PROMPT = `Você é o Motor de Estratégia da LOTUS AI — especializado em criar planos estratégicos de marketing digital para PMEs do setor de saúde brasileiro.

Sua função: criar um plano estratégico completo e acionável com base nos dados do cliente.

RETORNE SEMPRE JSON VÁLIDO com esta estrutura exata:
{
  "executive_summary": "resumo executivo em 2-3 frases",
  "main_objective": "objetivo principal da estratégia",
  "target_audience": {
    "primary": "descrição do público primário",
    "secondary": "descrição do público secundário",
    "pain_points": ["dor 1", "dor 2", "dor 3"],
    "buying_triggers": ["gatilho 1", "gatilho 2"]
  },
  "positioning": {
    "unique_value_proposition": "proposta de valor única",
    "differentiators": ["diferencial 1", "diferencial 2", "diferencial 3"],
    "brand_voice": "descrição do tom de comunicação"
  },
  "channels": [
    {
      "channel": "nome do canal",
      "priority": "primário|secundário",
      "objective": "objetivo neste canal",
      "tactics": ["tática 1", "tática 2"],
      "budget_percentage": 30
    }
  ],
  "content_pillars": [
    {
      "pillar": "nome do pilar",
      "description": "descrição",
      "content_types": ["tipo 1", "tipo 2"],
      "frequency": "diário|semanal|quinzenal"
    }
  ],
  "quarterly_plan": {
    "q1": {
      "focus": "foco principal",
      "goals": ["meta 1", "meta 2"],
      "actions": ["ação 1", "ação 2", "ação 3"]
    },
    "q2": {
      "focus": "foco principal",
      "goals": ["meta 1", "meta 2"],
      "actions": ["ação 1", "ação 2", "ação 3"]
    },
    "q3": {
      "focus": "foco principal",
      "goals": ["meta 1", "meta 2"],
      "actions": ["ação 1", "ação 2", "ação 3"]
    },
    "q4": {
      "focus": "foco principal",
      "goals": ["meta 1", "meta 2"],
      "actions": ["ação 1", "ação 2", "ação 3"]
    }
  },
  "kpis": [
    {
      "metric": "nome da métrica",
      "current": "valor atual (se conhecido)",
      "target_90d": "meta em 90 dias",
      "target_180d": "meta em 180 dias",
      "how_to_measure": "como medir"
    }
  ],
  "quick_wins": [
    {
      "action": "ação rápida",
      "impact": "alto|médio|baixo",
      "effort": "baixo|médio|alto",
      "timeframe": "1 semana|2 semanas|1 mês"
    }
  ],
  "investment_recommendation": {
    "monthly_minimum": 2000,
    "monthly_recommended": 5000,
    "allocation": {
      "ads": 40,
      "content": 30,
      "tools": 15,
      "management": 15
    }
  }
}`;

export async function POST(req: NextRequest) {
  let body: any = {};
  try {
    body = await req.json();
    const { clientName, niche, city, diagnosisData, investigationData, goals, currentRevenue } = body;

    if (!clientName) {
      return NextResponse.json({ error: "clientName é obrigatório" }, { status: 400 });
    }

    await updateAgentStatus("agent-strat", "PLANNING", `Criando estratégia para ${clientName}`);
    await updateAgentStatus("agent-mc", "REVIEWING", `Revisando plano estratégico`);

    const contextData = `
CLIENTE: ${clientName}
NICHO: ${niche || "Saúde"}
CIDADE: ${city || "Brasil"}
${goals ? `OBJETIVOS: ${goals}` : ""}
${currentRevenue ? `FATURAMENTO ATUAL: R$ ${currentRevenue}` : ""}

${diagnosisData ? `DIAGNÓSTICO DIGITAL:
${JSON.stringify(diagnosisData, null, 2)}` : ""}

${investigationData ? `DADOS DA INVESTIGAÇÃO:
${JSON.stringify(investigationData, null, 2)}` : ""}

Crie um plano estratégico de marketing digital completo e acionável para este cliente.
Foque em crescimento de pacientes/clientes, presença digital e conversão.
Use benchmarks reais do setor de saúde brasileiro.
    `.trim();

    const result = await registry.getDefault().complete({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: contextData },
      ],
      maxTokens: 4000,
    });

    let strategy;
    try {
      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      strategy = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(result.content);
    } catch {
      strategy = { executive_summary: result.content, error: "parsing_error" };
    }

    await updateAgentStatus("agent-strat", "COMPLETED", `Estratégia de ${clientName} pronta`);
    await updateAgentStatus("agent-mc", "IDLE", null);

    return NextResponse.json({ success: true, engine: "strategy", strategy, clientName });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const aiDown = errorMsg.includes('503') || errorMsg.includes('instabilidade') ||
                   errorMsg.includes('No AI provider') || errorMsg.includes('502') || errorMsg.includes('504');
    if (aiDown) {
      const cn = body?.clientName || "";
      await updateAgentStatus("agent-strat", "COMPLETED", `Demo: Estratégia de ${cn}`);
      await updateAgentStatus("agent-mc", "IDLE", null);
      return NextResponse.json({
        success: true, engine: "strategy",
        strategy: demoStrategy(cn, body?.niche || "", body?.city || ""),
        clientName: cn, _demo: true,
      });
    }
    console.error("Engine Strategy error:", error);
    return NextResponse.json({ error: `Erro ao executar motor de estratégia: ${errorMsg}` }, { status: 500 });
  }
}
