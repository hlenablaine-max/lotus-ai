// Transforma dados estruturados vindos da IA (chaves em inglês, snake_case) em texto legível em português.

const WORDS: Record<string, string> = {
  executive: "executivo", summary: "resumo", market: "mercado", analysis: "análise", competitors: "concorrentes",
  competitor: "concorrente", trends: "tendências", trend: "tendência", opportunities: "oportunidades", opportunity: "oportunidade",
  threats: "ameaças", strengths: "pontos fortes", weaknesses: "pontos fracos", score: "nota", scores: "notas",
  findings: "achados", critical: "críticos", recommendations: "recomendações", recommendation: "recomendação",
  roi: "retorno", projection: "projeção", projections: "projeções", revenue: "receita", growth: "crescimento",
  plan: "plano", strategy: "estratégia", channels: "canais", channel: "canal", target: "público", audience: "público",
  positioning: "posicionamento", okrs: "OKRs", quick: "rápidos", wins: "ganhos", budget: "orçamento", estimated: "estimado",
  monthly: "mensal", weekly: "semanal", timeline: "cronograma", phases: "fases", phase: "fase", steps: "passos", step: "passo",
  components: "componentes", tech: "tecnologia", stack: "ferramentas", automations: "automações", automation: "automação",
  expected: "esperado", setup: "configuração", guides: "guias", guide: "guia", week: "semana", kpis: "indicadores",
  kpi: "indicador", benchmarks: "referências de mercado", pricing: "preço", scenarios: "cenários", scenario: "cenário",
  conservative: "conservador", realistic: "realista", optimistic: "otimista", post: "posts", frequency: "frequência",
  social: "social", proof: "prova", engagement: "engajamento", followers: "seguidores", website: "site", site: "site",
  ads: "anúncios", instagram: "Instagram", whatsapp: "WhatsApp", content: "conteúdo", calendar: "calendário", copy: "texto",
  headline: "título", headlines: "títulos", cta: "chamada para ação", offer: "oferta", issues: "problemas", issue: "problema",
  risks: "riscos", risk: "risco", priority: "prioridade", priorities: "prioridades", actions: "ações", action: "ação",
  next: "próximos", impact: "impacto", effort: "esforço", cost: "custo", costs: "custos", investment: "investimento",
  name: "nome", description: "descrição", title: "título", status: "situação", notes: "observações", total: "total",
  current: "atual", potential: "potencial", gap: "lacuna", gaps: "lacunas", value: "valor", level: "nível", type: "tipo",
  overall: "geral", digital: "digital", presence: "presença", local: "local", reviews: "avaliações", rating: "nota",
  funnel: "funil", conversion: "conversão", leads: "leads", lead: "lead", clients: "clientes", client: "cliente",
  niche: "nicho", city: "cidade", details: "detalhes", metrics: "métricas", goal: "meta", goals: "metas", owner: "responsável",
  tools: "ferramentas", tool: "ferramenta", messages: "mensagens", message: "mensagem", scripts: "roteiros", script: "roteiro",
  flow: "fluxo", flows: "fluxos", objections: "objeções", answers: "respostas", day: "dia", days: "dias", months: "meses",
  month: "mês", first: "primeiro", second: "segundo", third: "terceiro", has: "tem", is: "é", and: "e", of: "de", per: "por",
};

export function humanizeKey(key: string): string {
  const parts = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return key;
  const text = parts.map((p) => WORDS[p] ?? p).join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function humanizeValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (typeof value === "number") return value.toLocaleString("pt-BR");
  return String(value);
}

const HIDDEN_KEYS = /^(_demo|_raw|raw|error|success|engine)$/i;

// Dados → markdown (para salvar como documento, copiar e gerar PDF)
export function dataToMarkdown(data: unknown, depth = 2): string {
  if (data === null || data === undefined) return "";
  if (typeof data !== "object") return humanizeValue(data);
  if (Array.isArray(data)) {
    return data
      .map((item) => {
        if (item && typeof item === "object") {
          const entries = Object.entries(item as Record<string, unknown>).filter(([k]) => !HIDDEN_KEYS.test(k));
          const [firstKey, firstVal] = entries[0] ?? [];
          const head = typeof firstVal === "string" ? `**${firstVal}**` : firstKey ? `**${humanizeKey(firstKey)}**` : "";
          const rest = entries.slice(typeof firstVal === "string" ? 1 : 0)
            .map(([k, v]) => (v && typeof v === "object" ? `  - ${humanizeKey(k)}:\n${indent(dataToMarkdown(v, depth + 1), 4)}` : `  - ${humanizeKey(k)}: ${humanizeValue(v)}`))
            .join("\n");
          return `- ${head}${rest ? "\n" + rest : ""}`;
        }
        return `- ${humanizeValue(item)}`;
      })
      .join("\n");
  }
  const heading = "#".repeat(Math.min(depth, 6));
  return Object.entries(data as Record<string, unknown>)
    .filter(([k]) => !HIDDEN_KEYS.test(k))
    .map(([k, v]) => {
      if (v && typeof v === "object") return `${heading} ${humanizeKey(k)}\n\n${dataToMarkdown(v, depth + 1)}`;
      const text = humanizeValue(v);
      return text.length > 80 ? `${heading} ${humanizeKey(k)}\n\n${text}` : `**${humanizeKey(k)}:** ${text}`;
    })
    .join("\n\n");
}

function indent(text: string, spaces: number): string {
  const pad = " ".repeat(spaces);
  return text.split("\n").map((l) => pad + l).join("\n");
}
