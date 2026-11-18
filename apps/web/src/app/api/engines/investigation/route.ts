import { NextRequest, NextResponse } from "next/server";
import { initializeProviders, registry } from "@lotus/ai-engine";
import { updateAgentStatus } from "@/lib/agent-service";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

initializeProviders();

const SYSTEM_PROMPT = `Você é o Motor de Investigation da LOTUS AI — especializado em auditoria digital 360° de PMEs de saúde brasileiras.

Sua função: investigar profundamente a presença digital do cliente, incluindo site, redes sociais, anúncios, funil e posicionamento atual.

RETORNE SEMPRE JSON VÁLIDO com esta estrutura exata:
{
  "digital_presence": {
    "website": {
      "exists": true,
      "quality_score": 7,
      "issues": ["lista de problemas encontrados"],
      "positives": ["pontos positivos"],
      "seo_score": 5,
      "mobile_friendly": true,
      "load_speed": "rápido|médio|lento",
      "has_booking": false,
      "has_whatsapp_button": false
    },
    "instagram": {
      "followers_estimate": "1k-10k",
      "posting_frequency": "diário|semanal|mensal|irregular",
      "content_quality": "alto|médio|baixo",
      "engagement_rate": "alto|médio|baixo",
      "bio_optimized": false,
      "has_stories_highlights": false,
      "ad_running": false
    },
    "google_my_business": {
      "claimed": false,
      "reviews_count": 0,
      "average_rating": 0,
      "photos_count": 0,
      "responds_to_reviews": false
    },
    "whatsapp_business": {
      "has_catalog": false,
      "automated_messages": false,
      "business_profile_complete": false
    }
  },
  "funnel_analysis": {
    "awareness": {
      "score": 5,
      "current_channels": ["lista de canais ativos"],
      "missing_channels": ["canais não utilizados"],
      "assessment": "avaliação do topo de funil"
    },
    "consideration": {
      "score": 5,
      "social_proof_quality": "alto|médio|baixo",
      "content_educativo": false,
      "before_after_content": false,
      "assessment": "avaliação da consideração"
    },
    "conversion": {
      "score": 5,
      "cta_clarity": "claro|confuso|ausente",
      "booking_friction": "baixo|médio|alto",
      "response_time_estimate": "imediato|horas|dias",
      "assessment": "avaliação da conversão"
    }
  },
  "competitive_gaps": [
    {
      "gap": "nome do gap competitivo",
      "severity": "crítico|alto|médio|baixo",
      "opportunity": "oportunidade de melhoria",
      "quick_win": true
    }
  ],
  "ad_intelligence": {
    "running_ads": false,
    "estimated_ad_spend": "não investe|R$500-R$2k|R$2k-R$5k|R$5k+",
    "ad_quality": "alto|médio|baixo|não aplicável",
    "ad_types_used": ["tipos de anúncios"],
    "ad_recommendations": ["recomendações para anúncios"]
  },
  "reputation_analysis": {
    "overall_sentiment": "positivo|neutro|negativo|sem dados",
    "main_complaints": ["reclamações frequentes se houver"],
    "main_compliments": ["elogios frequentes se houver"],
    "crisis_risk": "baixo|médio|alto"
  },
  "scores": {
    "overall_digital_score": 5,
    "website_score": 5,
    "social_media_score": 5,
    "conversion_score": 5,
    "reputation_score": 5
  },
  "quick_wins": [
    {
      "action": "ação específica para implementar",
      "impact": "alto|médio|baixo",
      "effort": "fácil|médio|difícil",
      "timeframe": "1 dia|1 semana|1 mês",
      "expected_result": "resultado esperado"
    }
  ],
  "summary": "resumo executivo da investigação digital em 3-4 frases destacando os principais achados e oportunidades"
}`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { clientName, niche, city, instagram, website, whatsapp } = body;

    if (!clientName) {
      return NextResponse.json({ error: "clientName é obrigatório" }, { status: 400 });
    }

    await updateAgentStatus("agent-creative", "RESEARCHING", `Auditando presença digital de ${clientName}`);

    const contextData = `
CLIENTE: ${clientName}
NICHO: ${niche || "Saúde"}
CIDADE: ${city || "Brasil"}
${instagram ? `INSTAGRAM: @${instagram}` : "Instagram: não informado"}
${website ? `WEBSITE: ${website}` : "Website: não informado"}
${whatsapp ? `WHATSAPP: ${whatsapp}` : "WhatsApp: não informado"}

Faça uma auditoria digital completa deste negócio de saúde.
Analise a presença digital, qualidade do funil, gaps competitivos e reputação online.
Para ${city || "interior do Brasil"}, considere o contexto local e as práticas típicas do setor.
Baseie-se no que é comum em negócios de ${niche || "saúde"} nesta região.
Seja específico nas recomendações de quick wins.
    `.trim();

    const result = await registry.getDefault().complete({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: contextData },
      ],
      maxTokens: 4000,
    });

    let investigation;
    try {
      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      investigation = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(result.content);
    } catch {
      investigation = { summary: result.content, error: "parsing_error" };
    }

    await updateAgentStatus("agent-creative", "COMPLETED", `Investigação de ${clientName} concluída`);

    return NextResponse.json({ success: true, engine: "investigation", investigation, clientName });
  } catch (error) {
    console.error("Engine Investigation error:", error);
    return NextResponse.json({ error: "Erro ao executar motor de investigação" }, { status: 500 });
  }
}
