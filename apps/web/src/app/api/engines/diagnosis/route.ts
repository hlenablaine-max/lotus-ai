import { NextRequest, NextResponse } from "next/server";
import { initializeProviders, registry } from "@lotus/ai-engine";
import { logEngineRun } from "@/lib/engine-log";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

initializeProviders();

const SYSTEM_PROMPT = `Você é o Motor de Diagnosis da LOTUS AI — especializado em diagnóstico estratégico e score de oportunidade para PMEs de saúde brasileiras.

Sua função: calcular o score de oportunidade, identificar pontos críticos e estimar o ROI potencial com marketing digital.

RETORNE SEMPRE JSON VÁLIDO com esta estrutura exata:
{
  "opportunity_score": {
    "total": 75,
    "breakdown": {
      "market_potential": 80,
      "digital_gap": 70,
      "competition_weakness": 65,
      "client_readiness": 85,
      "roi_potential": 90
    },
    "classification": "ALTO|MÉDIO|BAIXO",
    "urgency": "imediato|curto prazo|médio prazo"
  },
  "critical_findings": [
    {
      "finding": "problema ou oportunidade específica",
      "severity": "crítico|alto|médio|baixo",
      "category": "conversão|visibilidade|reputação|diferenciação|tecnologia",
      "business_impact": "impacto quantificado no negócio",
      "recommended_action": "ação recomendada"
    }
  ],
  "roi_projection": {
    "current_state": {
      "estimated_monthly_revenue": 20000,
      "estimated_new_clients": 5,
      "digital_acquisition_rate": "10%"
    },
    "with_lotus_basic": {
      "investment_monthly": 2000,
      "projected_revenue_6m": 35000,
      "new_clients_monthly": 15,
      "roi_6m": "2.5x",
      "payback_months": 3
    },
    "with_lotus_premium": {
      "investment_monthly": 5000,
      "projected_revenue_6m": 60000,
      "new_clients_monthly": 30,
      "roi_6m": "4x",
      "payback_months": 2
    },
    "assumptions": ["lista de premissas usadas nas projeções"]
  },
  "market_position": {
    "current_position": "líder|challenger|seguidor|nicho",
    "differentiation_gaps": ["diferenciais que o cliente não tem mas deveria ter"],
    "unique_strengths": ["pontos fortes únicos do cliente"],
    "threat_level": "baixo|médio|alto",
    "main_threats": ["principais ameaças competitivas"]
  },
  "digital_maturity": {
    "level": "iniciante|em desenvolvimento|maduro|avançado",
    "score": 4,
    "bottlenecks": ["principais gargalos digitais"],
    "next_level_requirements": ["o que precisa para avançar de nível"]
  },
  "priority_actions": [
    {
      "priority": 1,
      "action": "ação específica prioritária",
      "why": "por que esta ação é prioritária",
      "expected_impact": "impacto esperado",
      "timeframe": "30|60|90 dias",
      "investment_required": "R$ valor estimado"
    }
  ],
  "lotus_fit_score": {
    "score": 85,
    "ideal_package": "básico|profissional|premium",
    "fit_reasons": ["por que a LOTUS é ideal para este cliente"],
    "potential_objections": ["objeções prováveis e como responder"]
  },
  "summary": "diagnóstico executivo em 3-4 frases com score de oportunidade, principais achados e recomendação de ação imediata"
}`;

export async function POST(req: NextRequest) {
  let body: any = {};
  try {
    body = await req.json();
    const { clientName, niche, city, instagram, investigationData } = body;

    if (!clientName) {
      return NextResponse.json({ error: "clientName é obrigatório" }, { status: 400 });
    }

    await logEngineRun("diagnosis", clientName, "started");

    const contextData = `
CLIENTE: ${clientName}
NICHO: ${niche || "Saúde"}
CIDADE: ${city || "Brasil"}
${instagram ? `INSTAGRAM: @${instagram}` : ""}

${investigationData ? `DADOS DA INVESTIGAÇÃO DIGITAL:
${JSON.stringify(investigationData, null, 2)}` : ""}

Realize um diagnóstico estratégico completo deste negócio de ${niche || "saúde"}.
Calcule o score de oportunidade (0-100) considerando o mercado de ${city || "interior do Brasil"}.
Identifique os pontos críticos que mais impactam o crescimento.
Projete ROI realista para investimento em marketing digital.
Seja específico e quantitativo nas recomendações.
O diagnóstico deve ser orientado a venda da LOTUS como solução.
    `.trim();

    const result = await registry.getDefault().complete({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: contextData },
      ],
      maxTokens: 4000,
    });

    let diagnosis;
    try {
      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      diagnosis = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(result.content);
    } catch {
      diagnosis = { summary: result.content, error: "parsing_error" };
    }

    await logEngineRun("diagnosis", clientName, "completed");

    return NextResponse.json({ success: true, engine: "diagnosis", diagnosis, clientName });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const aiDown = errorMsg.includes('503') || errorMsg.includes('instabilidade') ||
                   errorMsg.includes('No AI provider') || errorMsg.includes('502') || errorMsg.includes('504');
    if (aiDown) {
      // Sem dado inventado: se a IA está fora do ar, o motor diz isso (regra: nada simulado como real)
      await logEngineRun("diagnosis", body?.clientName || "", "failed", { error: errorMsg, aiUnavailable: true });
      return NextResponse.json(
        { error: "A IA está fora do ar agora (o provedor não respondeu). Nada foi gerado. Tente de novo em alguns minutos ou troque o provedor em Configurações." },
        { status: 503 }
      );
    }
    await logEngineRun("diagnosis", body?.clientName || "", "failed", { error: errorMsg });
    console.error("Engine Diagnosis error:", error);
    return NextResponse.json({ error: `Erro ao executar motor de diagnóstico: ${errorMsg}` }, { status: 500 });
  }
}
