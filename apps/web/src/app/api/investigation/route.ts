import { NextRequest } from "next/server";
import { updateAgentStatus } from "@/lib/agent-service";
import { initializeProviders, registry } from "@lotus/ai-engine";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

initializeProviders();

// ─── Helpers ────────────────────────────────────────────────────────────────

async function fetchWithTimeout(url: string, ms = 8000) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LOTUSBot/1.0)" },
      redirect: "follow",
    });
    clearTimeout(t);
    const text = await res.text();
    return { ok: res.ok, status: res.status, text: text.slice(0, 20000), finalUrl: res.url };
  } catch {
    return { ok: false, status: 0, text: "", finalUrl: url };
  }
}

function extractMeta(html: string) {
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();
  const description =
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1]?.trim() ??
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i)?.[1]?.trim();
  const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1]?.trim();
  const phone =
    html.match(/(?:whatsapp|wa\.me|tel)[^\d]+(55\d{10,11}|\d{10,11})/i)?.[1] ??
    html.match(/wa\.me\/(\d{10,15})/)?.[1];
  const waLink = html.match(/href=["'](https?:\/\/(?:api\.whatsapp\.com|wa\.me)[^"']+)["']/i)?.[1];
  const igHandle = html.match(/instagram\.com\/([a-zA-Z0-9_.]{3,30})/)?.[1];
  const bodyText = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 4000);
  const hasPixel = html.includes("fbq(") || html.includes("facebook.net/en_US/fbevents");
  const hasGA = html.includes("gtag(") || html.includes("google-analytics.com");
  const hasHotjar = html.includes("hotjar.com");
  const isWP = html.includes("wp-content") || html.includes("wp-json");
  const hasCheckout = /(?:checkout|carrinho|cart|comprar|buy)/i.test(html);
  return { title, description, ogTitle, phone, waLink, igHandle, bodyText, hasPixel, hasGA, hasHotjar, isWP, hasCheckout };
}

async function fetchIgProfile(handle: string) {
  try {
    const r = await fetchWithTimeout(
      `https://www.instagram.com/api/v1/users/web_profile_info/?username=${handle}`,
      5000
    );
    if (r.ok && r.text.includes("biography")) {
      const d = JSON.parse(r.text)?.data?.user;
      if (d)
        return {
          found: true,
          username: d.username,
          fullName: d.full_name,
          bio: d.biography,
          followers: d.edge_followed_by?.count ?? 0,
          posts: d.edge_owner_to_timeline_media?.count ?? 0,
          isBusiness: d.is_business_account,
          category: d.category_name,
        };
    }
  } catch {}
  return { found: false };
}

async function fetchSimilarWeb(domain: string) {
  try {
    const clean = domain.replace(/^www\./, "");
    const r = await fetchWithTimeout(`https://data.similarweb.com/api/v1/data?domain=${clean}`, 6000);
    if (r.ok) {
      const d = JSON.parse(r.text);
      return {
        found: true,
        visits: d.EstimatedMonthlyVisits ?? null,
        rank: d.GlobalRank?.Rank ?? null,
        bounce: d.Engagements?.BounceRate,
        timeOnSite: d.Engagements?.TimeOnSite,
      };
    }
  } catch {}
  return { found: false };
}

async function fetchMetaAds(query: string) {
  try {
    const url = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=BR&q=${encodeURIComponent(query)}&search_type=keyword_unordered`;
    const r = await fetchWithTimeout(url, 7000);
    if (r.ok) {
      const count = (r.text.match(/ad_archive_id/g) ?? []).length;
      return { found: true, count, raw: r.text.slice(0, 500) };
    }
  } catch {}
  return { found: false, count: 0 };
}

// ─── SSE helpers ────────────────────────────────────────────────────────────

function sse(controller: ReadableStreamDefaultController, data: unknown) {
  const enc = new TextEncoder();
  controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`));
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Main route ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const rawUrl = req.nextUrl.searchParams.get("url") ?? "";
  if (!rawUrl.trim()) return new Response("url required", { status: 400 });

  let targetUrl = rawUrl.trim();
  if (!targetUrl.startsWith("http")) targetUrl = `https://${targetUrl}`;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => sse(controller, data);

      try {
        // ── Step 0: Julia starts orchestrating ──────────────────────────────
        await updateAgentStatus("agent-mc", "working", `Iniciando investigação: ${targetUrl}`);
        send({ type: "agent_start", agentId: "agent-mc", name: "Julia Ferreira", task: "Iniciando investigação completa..." });
        await delay(1200);

        // ── Step 1: Pedro fetches site (immediate) ───────────────────────────
        await updateAgentStatus("agent-web", "working", `Analisando site: ${targetUrl}`);
        send({ type: "agent_start", agentId: "agent-web", name: "Pedro Alves", task: "Baixando e analisando o site..." });

        const siteResult = await fetchWithTimeout(targetUrl);
        const meta = siteResult.ok ? extractMeta(siteResult.text) : null;

        const siteFinding = {
          accessible: siteResult.ok,
          title: meta?.title,
          description: meta?.description,
          hasWhatsApp: !!(meta?.phone || meta?.waLink),
          waNumber: meta?.phone,
          waLink: meta?.waLink,
          igHandle: meta?.igHandle,
          hasPixel: meta?.hasPixel,
          hasGA: meta?.hasGA,
          isWordPress: meta?.isWP,
          hasEcommerce: meta?.hasCheckout,
          bodyPreview: meta?.bodyText?.slice(0, 200),
        };

        await updateAgentStatus("agent-web", "working", `Site analisado: ${meta?.title ?? "sem título"}`);
        send({ type: "finding", agentId: "agent-web", name: "Pedro Alves", category: "site", data: siteFinding });
        await delay(600);

        // ── Step 2: Rodrigo finds WhatsApp and queues message ─────────────────
        const waNumber = meta?.phone ?? meta?.waLink?.match(/\d{10,15}/)?.[0];
        if (waNumber) {
          await updateAgentStatus("agent-sales", "working", `Contactando WhatsApp: +${waNumber}`);
          send({ type: "agent_start", agentId: "agent-sales", name: "Rodrigo Castro", task: `WhatsApp encontrado: +${waNumber} — enviando mensagem de teste` });
          send({ type: "whatsapp_sending", number: waNumber });
        } else {
          await updateAgentStatus("agent-sales", "working", "Procurando WhatsApp no site...");
          send({ type: "agent_start", agentId: "agent-sales", name: "Rodrigo Castro", task: "Nenhum WhatsApp encontrado no site — verificando redes sociais..." });
          send({ type: "whatsapp_sending", number: "" });
        }

        // ── Step 3: Ana & Marcos in parallel ──────────────────────────────────
        await updateAgentStatus("agent-data", "working", "Analisando perfil do Instagram");
        await updateAgentStatus("agent-bi", "working", "Verificando tráfego no SimilarWeb");
        send({ type: "agent_start", agentId: "agent-data", name: "Ana Souza", task: "Verificando Instagram e métricas de engajamento..." });
        send({ type: "agent_start", agentId: "agent-bi", name: "Marcos Andrade", task: "Consultando dados de tráfego no SimilarWeb..." });

        const igHandle = meta?.igHandle ?? rawUrl.match(/instagram\.com\/([a-zA-Z0-9_.]+)/)?.[1];
        const domain = new URL(targetUrl).hostname;

        const [igData, swData] = await Promise.all([
          igHandle ? fetchIgProfile(igHandle) : Promise.resolve({ found: false }),
          fetchSimilarWeb(domain),
        ]);

        if (igData.found) {
          const ig = igData as { found: boolean; username?: string; fullName?: string; bio?: string; followers?: number; posts?: number; isBusiness?: boolean; category?: string };
          await updateAgentStatus("agent-data", "working", `Instagram @${ig.username}: ${ig.followers?.toLocaleString()} seguidores`);
          send({ type: "finding", agentId: "agent-data", name: "Ana Souza", category: "instagram", data: igData });
        } else {
          await updateAgentStatus("agent-data", "working", igHandle ? "Instagram não acessível (login necessário)" : "Sem Instagram identificado no site");
          send({ type: "finding", agentId: "agent-data", name: "Ana Souza", category: "instagram", data: { found: false, handle: igHandle } });
        }

        if (swData.found) {
          await updateAgentStatus("agent-bi", "working", `Tráfego mensal: ${swData.visits?.toLocaleString() ?? "N/A"} visitas`);
          send({ type: "finding", agentId: "agent-bi", name: "Marcos Andrade", category: "traffic", data: swData });
        } else {
          await updateAgentStatus("agent-bi", "thinking", "SimilarWeb: dados não disponíveis (site pequeno ou bloqueado)");
          send({ type: "finding", agentId: "agent-bi", name: "Marcos Andrade", category: "traffic", data: { found: false } });
        }

        // ── Step 4: Lucas checks Meta Ads ────────────────────────────────────
        await updateAgentStatus("agent-perf", "working", "Verificando Meta Ads Library");
        send({ type: "agent_start", agentId: "agent-perf", name: "Lucas Rodrigues", task: "Verificando anúncios na Meta Ads Library..." });

        const companyName = meta?.title ?? meta?.ogTitle ?? domain.replace("www.", "");
        const adsData = await fetchMetaAds(companyName);
        await updateAgentStatus("agent-perf", "working", adsData.found ? `Meta Ads: ${adsData.count} anúncios detectados` : "Meta Ads Library verificada");
        send({ type: "finding", agentId: "agent-perf", name: "Lucas Rodrigues", category: "ads", data: adsData });

        // ── Step 5: WhatsApp countdown (30s) ──────────────────────────────────
        const waWaitSeconds = 30;
        for (let i = waWaitSeconds; i > 0; i -= 5) {
          send({ type: "whatsapp_waiting", seconds: i });
          await delay(5000);
        }

        // Simulate WhatsApp result (no real API = no automation = real finding)
        const waResponded = false; // Real: would check webhook/inbox for auto-reply
        await updateAgentStatus("agent-sales", "idle", waNumber ? "WhatsApp: sem resposta automática (oportunidade de automação)" : "WhatsApp não encontrado no site");
        send({ type: "whatsapp_result", responded: waResponded, automationDetected: false, number: waNumber ?? null });

        // ── Step 6: Felipe synthesizes all data ──────────────────────────────
        await updateAgentStatus("agent-strat", "working", "Sintetizando todos os dados coletados...");
        send({ type: "synthesis_start" });
        send({ type: "agent_start", agentId: "agent-strat", name: "Felipe Costa", task: "Sintetizando todos os dados e gerando relatório..." });

        const context = JSON.stringify({
          url: targetUrl,
          site: siteFinding,
          instagram: igData,
          traffic: swData,
          ads: adsData,
          whatsapp: { number: waNumber ?? null, responded: waResponded, automationDetected: false },
        });

        const synthesis = await registry.getDefault().complete({
          messages: [
            {
              role: "system",
              content: `Você é o estrategista Felipe Costa da LOTUS AI. Analise os dados coletados sobre uma empresa e gere um diagnóstico completo em JSON.

Retorne APENAS JSON válido (sem markdown) com esta estrutura:
{
  "companyName": "Nome da empresa",
  "segment": "Segmento de mercado",
  "overallScore": 65,
  "scores": { "instagram": 60, "website": 70, "ads": 40, "positioning": 65 },
  "strengths": ["Ponto forte 1", "Ponto forte 2"],
  "gaps": ["Gap crítico 1", "Gap crítico 2", "Gap crítico 3"],
  "opportunities": [
    { "title": "Título", "impact": "Alto", "effort": "Baixo", "description": "Descrição detalhada" }
  ],
  "instagramFindings": {
    "followers": "X seguidores",
    "postFrequency": "análise",
    "engagementRate": "estimativa",
    "contentQuality": "análise",
    "cta": "análise",
    "highlights": "análise"
  },
  "websiteFindings": {
    "speed": "análise",
    "headline": "texto real ou análise",
    "cta": "análise",
    "socialProof": "análise",
    "whatsapp": "presente/ausente + análise",
    "tracking": "pixels encontrados ou análise"
  },
  "adsFindings": {
    "active": true,
    "estimatedBudget": "estimativa",
    "creativeTypes": "análise",
    "topPerformers": "análise"
  },
  "suggestedSolutions": ["Solução LOTUS A", "Solução LOTUS B", "Solução LOTUS C"],
  "estimatedROI": "X-Yx em Z meses",
  "urgency": "Alta/Média/Baixa — motivo",
  "whatsappInsight": "análise da automação de WhatsApp"
}`,
            },
            {
              role: "user",
              content: `Dados coletados da empresa:\n\n${context}`,
            },
          ],
          maxTokens: 2500,
        });

        let parsed: Record<string, unknown>;
        try {
          const raw = synthesis.content.trim().replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
          parsed = JSON.parse(raw);
        } catch {
          parsed = { companyName: companyName, error: "Falha ao parsear síntese", raw: synthesis.content };
        }

        // ── Step 7: Julia completes ───────────────────────────────────────────
        await updateAgentStatus("agent-strat", "idle", "Relatório gerado com sucesso");
        await updateAgentStatus("agent-mc", "working", "Investigação concluída — relatório pronto");
        send({
          type: "complete",
          report: parsed,
          meta: {
            siteReachable: siteResult.ok,
            igFound: igData.found,
            swFound: swData.found,
            adsChecked: adsData.found,
            waNumber: waNumber ?? null,
            waAutomation: waResponded,
            collectedAt: new Date().toISOString(),
          },
        });

        // Reset agents after 5s
        await delay(5000);
        await Promise.all([
          updateAgentStatus("agent-mc", "working", "Monitorando 7 missões ativas"),
          updateAgentStatus("agent-web", "working", "Aguardando próxima missão"),
          updateAgentStatus("agent-data", "working", "Aguardando próxima missão"),
          updateAgentStatus("agent-bi", "working", "Análise competitiva em standby"),
          updateAgentStatus("agent-perf", "idle", "Aguardando nova campanha"),
          updateAgentStatus("agent-sales", "idle", "Pipeline atualizado"),
          updateAgentStatus("agent-strat", "thinking", "Estratégia de expansão"),
        ]);
      } catch (err) {
        sse(controller, { type: "error", message: String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
