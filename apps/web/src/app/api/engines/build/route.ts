import { NextRequest, NextResponse } from "next/server";
import { initializeProviders, registry } from "@lotus/ai-engine";
import { logEngineRun } from "@/lib/engine-log";
import { demoBuild } from "@/lib/engine-demos";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

initializeProviders();

const LANDING_PAGE_PROMPT = `Você é o Motor de Build da LOTUS AI — gera landing pages HTML completas e funcionais para clínicas e profissionais de saúde brasileiros.

Gere uma landing page HTML completa com:
- Design profissional dark/gradiente com cores adequadas à saúde
- Hero section com título impactante e CTA para WhatsApp
- Seção de benefícios/diferenciais (3-5 itens)
- Seção de prova social: use SOMENTE a prova social fornecida nos dados do cliente. Se não houver, insira placeholders explícitos "[INSERIR DEPOIMENTO REAL]" e "[NÚMERO REAL]" — NUNCA invente depoimentos, nomes de pacientes, avaliações ou números
- Seção de serviços com preços ou CTA
- FAQ com 4-6 perguntas
- Footer com contato
- Botão flutuante de WhatsApp
- CSS inline completo, sem dependências externas
- JavaScript mínimo para interações
- Responsivo (mobile-first)

RETORNE APENAS O HTML COMPLETO, começando com <!DOCTYPE html>`;

const COPY_PROMPT = `Você é o Motor de Copywriting da LOTUS AI — especialista em copy de alto impacto para clínicas e profissionais de saúde brasileiros.

Gere copy completo para campanhas de marketing. RETORNE JSON VÁLIDO:
{
  "headline_principal": "headline principal",
  "subheadline": "subheadline",
  "ad_copies": [
    {
      "format": "carrossel|feed|stories|reels",
      "headline": "headline",
      "body": "texto do anúncio",
      "cta": "call to action",
      "emoji_hook": "gancho com emoji"
    }
  ],
  "whatsapp_scripts": [
    {
      "type": "boas_vindas|follow_up|oferta|reativacao",
      "message": "mensagem completa",
      "timing": "quando enviar"
    }
  ],
  "email_sequences": [
    {
      "sequence_name": "nome",
      "emails": [
        {
          "day": 1,
          "subject": "assunto",
          "body": "corpo do email"
        }
      ]
    }
  ],
  "content_ideas": [
    {
      "format": "reels|carrossel|stories",
      "hook": "gancho inicial",
      "script": "roteiro/script",
      "caption": "legenda"
    }
  ],
  "usp": "proposta de valor única formatada para comunicação"
}`;

const WHATSAPP_PROMPT = `Você é o Motor de Automação WhatsApp da LOTUS AI — especialista em fluxos de atendimento e conversão via WhatsApp para clínicas e saúde.

Gere um fluxo completo de automação WhatsApp. RETORNE JSON VÁLIDO:
{
  "welcome_flow": {
    "trigger": "palavra que ativa",
    "messages": [
      {
        "step": 1,
        "message": "mensagem",
        "options": ["opção 1", "opção 2"],
        "delay_seconds": 1
      }
    ]
  },
  "qualification_flow": {
    "questions": [
      {
        "question": "pergunta",
        "type": "aberta|múltipla_escolha",
        "options": [],
        "purpose": "para que serve"
      }
    ],
    "scoring_criteria": "como qualificar o lead"
  },
  "appointment_flow": {
    "steps": ["passo 1", "passo 2"],
    "confirmation_message": "mensagem de confirmação",
    "reminder_messages": ["lembrete 1", "lembrete 2"]
  },
  "follow_up_sequences": [
    {
      "name": "nome da sequência",
      "messages": [
        {
          "day": 1,
          "time": "10:00",
          "message": "mensagem"
        }
      ]
    }
  ],
  "objection_handlers": [
    {
      "objection": "objeção comum",
      "response": "resposta ideal"
    }
  ],
  "setup_instructions": "instruções de configuração no ManyChat/Z-API"
}`;

export async function POST(req: NextRequest) {
  let body: any = {};
  try {
    body = await req.json();
    const { type, clientName, niche, city, whatsapp, services, priceRange, instagram, tagline, proof_social } = body;

    if (!clientName || !type) {
      return NextResponse.json({ error: "clientName e type são obrigatórios" }, { status: 400 });
    }

    const validTypes = ["landing_page", "copy", "whatsapp_automation", "content_calendar"];
    if (!validTypes.includes(type)) {
      return NextResponse.json({ error: `type deve ser um de: ${validTypes.join(", ")}` }, { status: 400 });
    }

    await logEngineRun("build", clientName, "started");

    const clientContext = `
CLIENTE: ${clientName}
NICHO: ${niche || "Saúde"}
CIDADE: ${city || "Brasil"}
${whatsapp ? `WHATSAPP: ${whatsapp}` : ""}
${services ? `SERVIÇOS: ${Array.isArray(services) ? services.join(", ") : services}` : ""}
${priceRange ? `FAIXA DE PREÇO: ${priceRange}` : ""}
${instagram ? `INSTAGRAM: ${instagram}` : ""}
${tagline ? `SLOGAN/TAGLINE: ${tagline}` : ""}
${proof_social ? `PROVA SOCIAL: ${proof_social}` : ""}
    `.trim();

    let systemPrompt: string;
    switch (type) {
      case "landing_page":
        systemPrompt = LANDING_PAGE_PROMPT;
        break;
      case "copy":
        systemPrompt = COPY_PROMPT;
        break;
      case "whatsapp_automation":
        systemPrompt = WHATSAPP_PROMPT;
        break;
      default:
        systemPrompt = COPY_PROMPT;
    }

    const result = await registry.getDefault().complete({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Gere ${type} para: ${clientContext}` },
      ],
      maxTokens: 6000,
    });

    let deliverable;
    if (type === "landing_page") {
      deliverable = { html: result.content, type: "landing_page" };
    } else {
      try {
        const jsonMatch = result.content.match(/\{[\s\S]*\}/);
        deliverable = jsonMatch ? JSON.parse(jsonMatch[0]) : { content: result.content };
      } catch {
        deliverable = { content: result.content };
      }
    }

    await logEngineRun("build", clientName, "completed");

    return NextResponse.json({ success: true, engine: "build", type, deliverable, clientName });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const aiDown = errorMsg.includes('503') || errorMsg.includes('instabilidade') ||
                   errorMsg.includes('No AI provider') || errorMsg.includes('502') || errorMsg.includes('504');
    if (aiDown) {
      const cn = body?.clientName || "";
      const t = body?.type || "copy";
      await logEngineRun("build", cn, "demo");
      return NextResponse.json({
        success: true, engine: "build", type: t,
        deliverable: demoBuild(cn, t, body?.niche || "", body?.whatsapp || ""),
        clientName: cn, _demo: true,
      });
    }
    await logEngineRun("build", body?.clientName || "", "failed", { error: errorMsg });
    console.error("Engine Build error:", error);
    return NextResponse.json({ error: `Erro ao executar motor de build: ${errorMsg}` }, { status: 500 });
  }
}
