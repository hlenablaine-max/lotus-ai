import { NextRequest, NextResponse } from "next/server";
import { initializeProviders, registry } from "@lotus/ai-engine";
import { updateAgentStatus } from "@/lib/agent-service";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

initializeProviders();

const SYSTEM_PROMPT = `Você é o Motor de Inteligência de Mercado da LOTUS AI — uma agência de marketing especializada em saúde para PMEs brasileiras.

Sua função: analisar o mercado, concorrência e oportunidades para um cliente específico.

RETORNE SEMPRE JSON VÁLIDO com esta estrutura exata:
{
  "market": {
    "size_description": "descrição do tamanho do mercado local",
    "growth_rate": "taxa de crescimento estimada",
    "maturity": "emergente|crescimento|maduro|saturado",
    "digital_penetration": "% estimado de buscas online por este tipo de serviço"
  },
  "competitors": [
    {
      "name": "nome do concorrente",
      "type": "direto|indireto",
      "strengths": ["ponto forte 1", "ponto forte 2"],
      "weaknesses": ["fraqueza 1", "fraqueza 2"],
      "digital_presence": "forte|média|fraca",
      "estimated_market_share": "% estimado"
    }
  ],
  "trends": [
    {
      "trend": "nome da tendência",
      "impact": "alto|médio|baixo",
      "timeframe": "agora|6_meses|1_ano|2_anos",
      "opportunity": "descrição da oportunidade"
    }
  ],
  "opportunities": [
    {
      "title": "título da oportunidade",
      "description": "descrição detalhada",
      "effort": "baixo|médio|alto",
      "potential_roi": "estimativa de retorno",
      "priority": 1
    }
  ],
  "threats": [
    {
      "threat": "descrição da ameaça",
      "severity": "alta|média|baixa",
      "mitigation": "como mitigar"
    }
  ],
  "positioning_recommendation": "recomendação de posicionamento único para o cliente",
  "confidence_score": 85
}`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { clientName, niche, city, instagram, website, segment } = body;

    if (!clientName || !niche) {
      return NextResponse.json({ error: "clientName e niche são obrigatórios" }, { status: 400 });
    }

    // Update agents status
    await updateAgentStatus("agent-bi", "RESEARCHING", `Analisando mercado de ${niche} em ${city || "Brasil"}`);
    await updateAgentStatus("agent-strat", "PLANNING", `Mapeando concorrentes de ${clientName}`);

    const contextData = `
CLIENTE: ${clientName}
NICHO: ${niche}
CIDADE/REGIÃO: ${city || "Brasil"}
${instagram ? `INSTAGRAM: ${instagram}` : ""}
${website ? `WEBSITE: ${website}` : ""}
${segment ? `SEGMENTO: ${segment}` : ""}

Analise o mercado de ${niche} ${city ? `em ${city}` : "no Brasil"} para este cliente.
Foque em:
1. Tamanho e maturidade do mercado local
2. Principais concorrentes digitais no nicho
3. Tendências de consumo e comportamento digital
4. Oportunidades específicas para PMEs de saúde
5. Ameaças competitivas
6. Recomendação de posicionamento único

Use dados realistas baseados no contexto brasileiro de saúde/odontologia/estética.
    `.trim();

    const result = await registry.getDefault().complete({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: contextData },
      ],
      maxTokens: 3000,
    });

    // Parse JSON response
    let analysis;
    try {
      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(result.content);
    } catch {
      analysis = {
        market: { size_description: result.content, growth_rate: "N/A", maturity: "crescimento", digital_penetration: "45%" },
        competitors: [],
        trends: [],
        opportunities: [],
        threats: [],
        positioning_recommendation: "Análise disponível no texto acima",
        confidence_score: 60,
      };
    }

    await updateAgentStatus("agent-bi", "COMPLETED", `Análise de mercado de ${niche} concluída`);
    await updateAgentStatus("agent-strat", "IDLE", null);

    return NextResponse.json({ success: true, engine: "intelligence", analysis, clientName, niche, city });
  } catch (error) {
    console.error("Engine Intelligence error:", error);
    return NextResponse.json({ error: "Erro ao executar motor de inteligência" }, { status: 500 });
  }
}
