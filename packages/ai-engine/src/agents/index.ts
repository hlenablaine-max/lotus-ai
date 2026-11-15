// Agent Registry — All LOTUS agents

export * from "./root-master";

// Department agents (implemented progressively)
// Each agent follows the same pattern: system prompt + run function

export const AGENT_REGISTRY: AgentDefinition[] = [
  {
    slug: "root-master",
    name: "Root Master",
    title: "CEO & Chief Orchestrator",
    department: "EXECUTIVE",
    specialty: "Coordenação, estratégia e orquestração de missões",
    model: "claude-sonnet-4-5",
    provider: "anthropic",
    autonomyLevel: 2,
  },
  {
    slug: "bi-director",
    name: "Marcus",
    title: "Business Intelligence Director",
    department: "BUSINESS_INTELLIGENCE",
    specialty: "Pesquisa empresarial, análise de mercado, inteligência competitiva",
    model: "claude-sonnet-4-5",
    provider: "anthropic",
    autonomyLevel: 1,
  },
  {
    slug: "chief-copy",
    name: "Sophia",
    title: "Chief Copy Officer",
    department: "COPYWRITING",
    specialty: "Direct response, VSL, landing pages, scripts, conversão",
    model: "claude-sonnet-4-5",
    provider: "anthropic",
    autonomyLevel: 1,
  },
  {
    slug: "creative-director",
    name: "Luca",
    title: "Creative Director",
    department: "CREATIVE_STUDIO",
    specialty: "Conceito criativo, identidade visual, campanhas",
    model: "claude-sonnet-4-5",
    provider: "anthropic",
    autonomyLevel: 1,
  },
  {
    slug: "chief-media-buyer",
    name: "Alex",
    title: "Chief Media Buyer",
    department: "PERFORMANCE_MARKETING",
    specialty: "Meta Ads, Google Ads, TikTok Ads, otimização de campanhas",
    model: "claude-sonnet-4-5",
    provider: "anthropic",
    autonomyLevel: 1,
  },
  {
    slug: "healthcare-strategist",
    name: "Dr. Elena",
    title: "Healthcare Growth Strategist",
    department: "HEALTHCARE_GROWTH",
    specialty: "Marketing médico, captação de pacientes, clínicas, compliance",
    model: "claude-sonnet-4-5",
    provider: "anthropic",
    autonomyLevel: 1,
  },
  {
    slug: "assurance-director",
    name: "Victor",
    title: "Independent Assurance Director",
    department: "ASSURANCE",
    specialty: "Auditoria de qualidade, verificação de evidências, compliance",
    model: "claude-sonnet-4-5",
    provider: "anthropic",
    autonomyLevel: 1,
  },
];

export interface AgentDefinition {
  slug: string;
  name: string;
  title: string;
  department: string;
  specialty: string;
  model: string;
  provider: string;
  autonomyLevel: number;
}
