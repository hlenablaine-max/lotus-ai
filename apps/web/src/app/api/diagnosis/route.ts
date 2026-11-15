import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const dynamic = "force-dynamic";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Fetch real data from the target URL with timeout
async function fetchWithTimeout(url: string, timeoutMs = 8000): Promise<{ ok: boolean; status: number; text: string; finalUrl: string }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; LOTUSBot/1.0; +https://lotus.ai)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
    });
    clearTimeout(timer);
    const text = await response.text();
    return { ok: response.ok, status: response.status, text: text.slice(0, 15000), finalUrl: response.url };
  } catch (err) {
    return { ok: false, status: 0, text: "", finalUrl: url };
  }
}

// Extract meta tags and visible text from HTML
function extractHtmlInfo(html: string): { title?: string; description?: string; keywords?: string; ogTitle?: string; ogDescription?: string; bodyText: string } {
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();
  const description = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1]?.trim()
    ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i)?.[1]?.trim();
  const keywords = html.match(/<meta[^>]+name=["']keywords["'][^>]+content=["']([^"']+)["']/i)?.[1]?.trim();
  const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1]?.trim();
  const ogDescription = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)?.[1]?.trim();

  // Strip tags and get some body text
  const bodyText = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 3000);

  return { title, description, keywords, ogTitle, ogDescription, bodyText };
}

// Try to get Instagram public data via their oembed API
async function fetchInstagramInfo(handle: string): Promise<{ found: boolean; data: string }> {
  try {
    const oembed = await fetchWithTimeout(
      `https://www.instagram.com/api/v1/users/web_profile_info/?username=${handle}`,
      5000
    );
    if (oembed.ok && oembed.text.includes("biography")) {
      const data = JSON.parse(oembed.text);
      const user = data?.data?.user;
      if (user) {
        return {
          found: true,
          data: JSON.stringify({
            username: user.username,
            fullName: user.full_name,
            bio: user.biography,
            followers: user.edge_followed_by?.count,
            following: user.edge_follow?.count,
            posts: user.edge_owner_to_timeline_media?.count,
            isVerified: user.is_verified,
            isBusinessAccount: user.is_business_account,
            category: user.category_name,
          }),
        };
      }
    }
  } catch { /* Instagram may block */ }

  // Fallback: try the oEmbed endpoint
  try {
    const oembed = await fetchWithTimeout(
      `https://www.instagram.com/oembed/?url=https://www.instagram.com/${handle}/`,
      5000
    );
    if (oembed.ok) {
      return { found: true, data: oembed.text.slice(0, 500) };
    }
  } catch { /* ignore */ }

  return { found: false, data: "Instagram não acessível (login necessário)" };
}

// Try to get Facebook Ads Library data (public search)
async function checkFacebookAds(companyName: string): Promise<{ found: boolean; data: string }> {
  try {
    const url = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=BR&q=${encodeURIComponent(companyName)}&search_type=keyword_unordered`;
    const result = await fetchWithTimeout(url, 6000);
    if (result.ok && result.text.length > 100) {
      const hasAds = result.text.includes("ad_archive") || result.text.includes("resultado") || result.text.includes("result");
      return {
        found: true,
        data: `Página acessível. ${hasAds ? "Possíveis anúncios encontrados na pesquisa" : "Sem anúncios visíveis no preview"}.`,
      };
    }
  } catch { /* ignore */ }
  return { found: false, data: "Facebook Ads Library não acessível nesta verificação" };
}

const SYSTEM_PROMPT = `Você é o Diagnóstico de Empresa da LOTUS AI — especialista em marketing digital que analisa empresas com base em DADOS REAIS coletados.

Você receberá dados coletados automaticamente de:
- O site principal (HTML, meta tags, estrutura)
- Instagram (quando disponível)
- Facebook Ads Library (quando disponível)

Baseado nesses dados REAIS, produza uma análise específica.

IMPORTANTE:
- Separe SEMPRE o que é CONFIRMADO (baseado nos dados coletados) do que é HIPÓTESE (inferido/estimado)
- Marque cada finding como "confirmed" ou "hypothesis" no campo "confidence"
- Nunca invente dados como se fossem confirmados quando não foram coletados
- Se um dado não foi coletado, diga "Não verificado — requer análise manual"

Retorne APENAS JSON válido (sem markdown) com esta estrutura:
{
  "companyName": "Nome da empresa",
  "segment": "Segmento de mercado",
  "overallScore": 72,
  "dataQuality": "high|medium|low",
  "confirmedData": ["Lista do que foi realmente verificado"],
  "scores": { "instagram": 65, "website": 80, "ads": 55, "positioning": 70 },
  "strengths": ["Ponto forte 1 (fonte: site/instagram/ads)"],
  "gaps": ["Gap crítico 1 (fonte: ...)"],
  "opportunities": [
    { "title": "...", "impact": "Alto", "effort": "Baixo", "description": "...", "confidence": "confirmed|hypothesis" }
  ],
  "instagramFindings": {
    "followers": "confirmado: X / hipótese: Y",
    "postFrequency": "...",
    "engagementRate": "...",
    "contentQuality": "...",
    "cta": "...",
    "reels": "...",
    "confidence": "confirmed|hypothesis|not_checked"
  },
  "websiteFindings": {
    "speed": "...",
    "headline": "Texto real do headline (ou 'não identificado')",
    "cta": "...",
    "socialProof": "...",
    "whatsapp": "...",
    "tracking": "...",
    "confidence": "confirmed|hypothesis"
  },
  "adsFindings": {
    "active": true,
    "estimatedBudget": "...",
    "creativeTypes": "...",
    "topPerformers": "...",
    "confidence": "confirmed|hypothesis|not_checked"
  },
  "suggestedSolutions": ["Solução LOTUS A", "Solução LOTUS B"],
  "estimatedROI": "3-5x em 6 meses com estratégia completa",
  "urgency": "Alta — concorrentes já estão investindo em tráfego pago"
}`;

export async function POST(req: NextRequest) {
  try {
    const { url } = (await req.json()) as { url: string };

    if (!url?.trim()) {
      return NextResponse.json({ error: "url required" }, { status: 400 });
    }

    // Normalize the URL
    let targetUrl = url.trim();
    if (!targetUrl.startsWith("http")) targetUrl = `https://${targetUrl}`;

    // Collect real data in parallel
    const [websiteResult, igHandle] = await Promise.all([
      fetchWithTimeout(targetUrl),
      Promise.resolve(null), // placeholder
    ]);

    const websiteInfo = websiteResult.ok ? extractHtmlInfo(websiteResult.text) : null;

    // Try to find Instagram handle from the website HTML
    let instagramResult = { found: false, data: "Instagram não verificado" };
    const igMatch = websiteResult.text.match(/instagram\.com\/([a-zA-Z0-9_.]+)/);
    if (igMatch?.[1]) {
      instagramResult = await fetchInstagramInfo(igMatch[1]);
    }

    // Try Facebook Ads for the company name from title or URL
    const companyNameGuess = websiteInfo?.title ?? websiteInfo?.ogTitle ?? new URL(targetUrl).hostname.replace("www.", "");
    const facebookAdsResult = await checkFacebookAds(companyNameGuess);

    // Build context for Claude with real data
    const realDataContext = [
      `URL analisada: ${targetUrl}`,
      `URL final (após redirecionamentos): ${websiteResult.finalUrl}`,
      `Status HTTP: ${websiteResult.status} (${websiteResult.ok ? "acessível" : "inacessível"})`,
      ``,
      `=== DADOS DO SITE (CONFIRMADOS) ===`,
      websiteInfo
        ? [
            `Título: ${websiteInfo.title ?? "não encontrado"}`,
            `Meta Description: ${websiteInfo.description ?? "não encontrada"}`,
            `OG Title: ${websiteInfo.ogTitle ?? "não encontrado"}`,
            `OG Description: ${websiteInfo.ogDescription ?? "não encontrada"}`,
            `Keywords: ${websiteInfo.keywords ?? "não encontradas"}`,
            `Texto visível (primeiros 2000 chars): ${websiteInfo.bodyText.slice(0, 2000)}`,
          ].join("\n")
        : "Site inacessível — não foi possível coletar dados",
      ``,
      `=== INSTAGRAM ===`,
      instagramResult.found ? `Dados coletados (confirmados): ${instagramResult.data}` : `Não acessível: ${instagramResult.data}`,
      `Handle encontrado no site: ${igMatch?.[1] ?? "não encontrado"}`,
      ``,
      `=== FACEBOOK ADS LIBRARY ===`,
      facebookAdsResult.found ? `Verificado: ${facebookAdsResult.data}` : `Não verificado: ${facebookAdsResult.data}`,
    ].join("\n");

    const message = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 2500,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Analise esta empresa com base nos dados reais coletados abaixo:\n\n${realDataContext}`,
        },
      ],
    });

    const raw = (message.content[0] as { type: string; text: string }).text.trim();
    const clean = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    const parsed = JSON.parse(clean);

    return NextResponse.json({
      diagnosis: parsed,
      meta: {
        websiteReachable: websiteResult.ok,
        instagramFound: instagramResult.found,
        facebookAdsChecked: facebookAdsResult.found,
        dataCollectedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error("[API /diagnosis POST]", err);
    return NextResponse.json({ error: "Failed to generate diagnosis" }, { status: 500 });
  }
}
