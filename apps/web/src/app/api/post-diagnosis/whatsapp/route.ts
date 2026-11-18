import { NextRequest, NextResponse } from "next/server";
import { initializeProviders, registry } from "@lotus/ai-engine";

export const dynamic = "force-dynamic";

initializeProviders();

export async function POST(req: NextRequest) {
  try {
    const { report, waNumber } = (await req.json()) as {
      report: Record<string, unknown>;
      waNumber?: string | null;
    };

    if (!report) return NextResponse.json({ error: "report required" }, { status: 400 });

    const companyName = (report.companyName as string) ?? "Empresa";
    const segment = (report.segment as string) ?? "negócio";
    const gaps = ((report.gaps as string[]) ?? []).slice(0, 3).join("; ");
    const solutions = ((report.suggestedSolutions as string[]) ?? []).slice(0, 2).join(", ");

    const result = await registry.getDefault().complete({
      messages: [
        {
          role: "system",
          content: `Você é um especialista em automação de WhatsApp para pequenas e médias empresas no Brasil.
Gere um plano completo de automação de WhatsApp em formato JSON para uma empresa específica.
Inclua mensagens de boas-vindas, scripts de qualificação de leads, templates de follow-up, e configuração do bot.
Retorne APENAS JSON válido (sem markdown).`,
        },
        {
          role: "user",
          content: `Empresa: ${companyName}
Segmento: ${segment}
Número WhatsApp: ${waNumber ?? "não identificado"}
Gaps principais: ${gaps}
Soluções recomendadas: ${solutions}

Crie um plano de automação WhatsApp completo com:
1. Mensagem de boas-vindas personalizada
2. Menu de opções (1-4)
3. Script de qualificação de leads (3 perguntas)
4. Template de follow-up (24h e 72h)
5. Configuração recomendada (horário, delays, tags)
6. Plataformas recomendadas (Typebot, ManyChat, Z-API, Evolution API)

Formato JSON:
{
  "welcomeMessage": "...",
  "menu": [{"option": "1", "label": "...", "response": "..."}],
  "leadQualification": [{"question": "...", "field": "...", "options": ["..."]}],
  "followUpTemplates": [{"delay": "24h", "message": "..."}, {"delay": "72h", "message": "..."}],
  "config": {"businessHours": "...", "responseDelay": "...", "tags": ["..."], "autoReply": true},
  "platforms": [{"name": "...", "pros": "...", "setup": "...", "cost": "..."}],
  "quickStartGuide": ["Passo 1: ...", "Passo 2: ..."]
}`,
        },
      ],
      maxTokens: 2000,
    });

    const raw = result.content.trim().replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    const setup = JSON.parse(raw);

    return NextResponse.json({ setup, waNumber: waNumber ?? null, companyName });
  } catch (err) {
    console.error("[POST /api/post-diagnosis/whatsapp]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
