import { NextRequest, NextResponse } from "next/server";
import { initializeProviders, registry } from "@lotus/ai-engine";

export const dynamic = "force-dynamic";

initializeProviders();

export async function POST(req: NextRequest) {
  try {
    const { report, targetUrl } = (await req.json()) as {
      report: Record<string, unknown>;
      targetUrl?: string;
    };

    if (!report) return NextResponse.json({ error: "report required" }, { status: 400 });

    const companyName = (report.companyName as string) ?? "Empresa";
    const segment = (report.segment as string) ?? "negócio";
    const strengths = ((report.strengths as string[]) ?? []).slice(0, 3).join("; ");
    const solutions = ((report.suggestedSolutions as string[]) ?? []).slice(0, 3);
    const urgency = (report.urgency as string) ?? "Alta";
    const roi = (report.estimatedROI as string) ?? "3-5x em 6 meses";
    const headline = (report.websiteFindings as Record<string, string>)?.headline ?? "";

    const result = await registry.getDefault().complete({
      messages: [
        {
          role: "system",
          content: `Você é um expert em criação de landing pages de alta conversão para o mercado brasileiro.
Crie uma landing page HTML completa, moderna e profissional para uma empresa específica.
A página deve ser auto-contida (CSS inline), responsiva, com dark theme elegante, e focada em conversão.
Inclua: hero com headline forte, problemas/dores, solução LOTUS, prova social, CTA claro.
Retorne APENAS o HTML completo (sem markdown, sem explicação).`,
        },
        {
          role: "user",
          content: `Crie uma landing page de alta conversão para:

Empresa: ${companyName}
Segmento: ${segment}
Pontos fortes: ${strengths}
Headline atual do site: ${headline || "não identificada"}
Soluções recomendadas: ${solutions.join(", ")}
Urgência: ${urgency}
ROI estimado com LOTUS: ${roi}
URL original: ${targetUrl ?? ""}

Requisitos da landing page:
- Headline impactante focada na DOR do cliente
- Subheadline com a SOLUÇÃO
- Seção "O problema que você enfrenta" (3 dores baseadas no diagnóstico)
- Seção "Nossa solução" com as 3 soluções recomendadas
- Seção de prova social com números fictícios mas realistas
- CTA principal: "Quero meu diagnóstico gratuito" (WhatsApp link)
- Design: dark theme, gradiente roxo/rosa (como a LOTUS), fonte Inter
- CSS totalmente inline, sem dependências externas
- Mobile-first, responsivo
- Incluir botão flutuante WhatsApp

Retorne APENAS o HTML (<!DOCTYPE html>...).`,
        },
      ],
      maxTokens: 4000,
    });

    const html = result.content.trim().replace(/^```(?:html)?\n?/, "").replace(/\n?```$/, "");

    return NextResponse.json({ html, companyName, segment });
  } catch (err) {
    console.error("[POST /api/post-diagnosis/site]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
