// Catálogo das integrações que o dono configura na tela Integrações: o que colar em cada uma,
// onde fica guardado e como testar. Valores ficam em ~/LOTUS_Workspace/settings.json (só neste PC).

import { integrationValue, loadSettings, saveSettings, type AIProviderName } from "@lotus/ai-engine";

export interface IntegrationField {
  key: string;
  label: string;
  secret: boolean;
  placeholder: string;
  env?: string;
  help?: string;
}

export interface IntegrationDef {
  id: string;
  name: string;
  category: "ai" | "ads" | "analytics" | "communication" | "infrastructure";
  description: string;
  usedBy: string;
  fields: IntegrationField[];
  // Integrações de IA guardam a chave junto com as configurações do provedor
  aiProvider?: AIProviderName;
  whereToGet: string;
}

export const INTEGRATIONS: IntegrationDef[] = [
  {
    id: "drael",
    name: "Drael",
    category: "ai",
    aiProvider: "drael",
    description: "Provedor de IA padrão dos agentes e do Root Master.",
    usedBy: "Todos os agentes",
    fields: [{ key: "apiKey", label: "Chave da API", secret: true, placeholder: "sk-...", env: "DRAEL_API_KEY" }],
    whereToGet: "Painel da Drael > API Keys",
  },
  {
    id: "openai",
    name: "ChatGPT (OpenAI)",
    category: "ai",
    aiProvider: "openai",
    description: "Use o ChatGPT no lugar da Drael (escolha em Configurações > Inteligência Artificial).",
    usedBy: "Agentes e chat, quando escolhido",
    fields: [{ key: "apiKey", label: "Chave da API", secret: true, placeholder: "sk-...", env: "OPENAI_API_KEY" }],
    whereToGet: "platform.openai.com > API keys",
  },
  {
    id: "anthropic",
    name: "Claude (Anthropic)",
    category: "ai",
    aiProvider: "anthropic",
    description: "Use o Claude no lugar da Drael (escolha em Configurações > Inteligência Artificial).",
    usedBy: "Agentes e chat, quando escolhido",
    fields: [{ key: "apiKey", label: "Chave da API", secret: true, placeholder: "sk-ant-...", env: "ANTHROPIC_API_KEY" }],
    whereToGet: "console.anthropic.com > API Keys",
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    category: "communication",
    description: "Número da agência. O teste de atendimento usa o WhatsApp conectado pelo QR code; a API oficial (Cloud API) é opcional, para envios automáticos em escala.",
    usedBy: "Teste de atendimento do diagnóstico",
    fields: [
      { key: "agencyNumber", label: "Número da agência (com DDD)", secret: false, placeholder: "75 99999-9999" },
      { key: "cloudToken", label: "Token da API oficial (opcional)", secret: true, placeholder: "EAAG...", env: "WHATSAPP_TOKEN" },
      { key: "phoneNumberId", label: "ID do número na API oficial (opcional)", secret: false, placeholder: "1234567890" },
    ],
    whereToGet: "QR code: botão abaixo. API oficial: developers.facebook.com > WhatsApp",
  },
  {
    id: "meta-ads",
    name: "Meta Ads (Facebook e Instagram)",
    category: "ads",
    description: "Conta de anúncios para subir as campanhas que a equipe produz.",
    usedBy: "Ainda nenhum agente sobe campanhas sozinho: hoje a equipe entrega a estrutura pronta",
    fields: [
      { key: "accessToken", label: "Token de acesso", secret: true, placeholder: "EAAG...", env: "META_ACCESS_TOKEN" },
      { key: "adAccountId", label: "ID da conta de anúncios", secret: false, placeholder: "act_1234567890" },
      { key: "pixelId", label: "ID do Pixel (opcional)", secret: false, placeholder: "1234567890" },
    ],
    whereToGet: "business.facebook.com > Configurações do negócio > Usuários do sistema > Gerar token",
  },
  {
    id: "google-ads",
    name: "Google Ads",
    category: "ads",
    description: "Conta do Google Ads para campanhas de pesquisa.",
    usedBy: "Ainda nenhum agente usa",
    fields: [
      { key: "developerToken", label: "Developer token", secret: true, placeholder: "xxxxxxxx", env: "GOOGLE_ADS_API_KEY" },
      { key: "customerId", label: "ID do cliente (conta)", secret: false, placeholder: "123-456-7890" },
    ],
    whereToGet: "ads.google.com > Ferramentas > Centro de API",
  },
  {
    id: "tiktok-ads",
    name: "TikTok Ads",
    category: "ads",
    description: "Conta de anúncios do TikTok.",
    usedBy: "Ainda nenhum agente usa",
    fields: [
      { key: "accessToken", label: "Token de acesso", secret: true, placeholder: "xxxxxxxx", env: "TIKTOK_ACCESS_TOKEN" },
      { key: "advertiserId", label: "ID do anunciante", secret: false, placeholder: "1234567890" },
    ],
    whereToGet: "ads.tiktok.com > TikTok for Business > Developers",
  },
  {
    id: "ga4",
    name: "Google Analytics 4",
    category: "analytics",
    description: "Propriedade do GA4 para acompanhar visitas e conversões.",
    usedBy: "Ainda nenhum agente lê o GA4",
    fields: [{ key: "propertyId", label: "ID da propriedade", secret: false, placeholder: "123456789", env: "GA4_PROPERTY_ID" }],
    whereToGet: "analytics.google.com > Administrador > Detalhes da propriedade",
  },
  {
    id: "google-calendar",
    name: "Google Agenda das clínicas",
    category: "communication",
    description:
      "Credencial da LOTUS no Google para as clínicas conectarem a agenda com um clique (a IA vê os horários ocupados e marca as consultas). Sem ela, a clínica ainda pode colar o link secreto iCal da agenda (só leitura).",
    usedBy: "IA de atendimento (horários livres e marcação)",
    fields: [
      { key: "clientId", label: "ID do cliente OAuth", secret: false, placeholder: "123456-abc.apps.googleusercontent.com", env: "GOOGLE_OAUTH_CLIENT_ID" },
      { key: "clientSecret", label: "Segredo do cliente OAuth", secret: true, placeholder: "GOCSPX-...", env: "GOOGLE_OAUTH_CLIENT_SECRET" },
    ],
    whereToGet:
      "console.cloud.google.com > crie um projeto > APIs e serviços > ative a Google Calendar API > Tela de consentimento OAuth (Externo) > Credenciais > Criar ID do cliente OAuth (Aplicativo da Web) com o URI de redirecionamento https://lotus-recebedor.vercel.app/api/google/callback",
  },
  {
    id: "vercel",
    name: "Vercel (sites)",
    category: "infrastructure",
    description: "Onde os sites das clínicas são publicados. Se o comando vercel já está logado neste PC, não precisa colar nada.",
    usedBy: "Publicação do site novo de cada clínica",
    fields: [{ key: "token", label: "Token (opcional)", secret: true, placeholder: "xxxxxxxx", env: "VERCEL_TOKEN" }],
    whereToGet: "vercel.com > Account Settings > Tokens",
  },
  {
    id: "pexels",
    name: "Pexels (fotos profissionais)",
    category: "infrastructure",
    description: "Banco de fotos profissionais gratuito (uso comercial liberado, sem precisar dar crédito). Os sites das clínicas usam essas fotos no topo e nos serviços quando o cliente não tem fotos boas.",
    usedBy: "Fotos dos sites criados pela LOTUS",
    fields: [{ key: "apiKey", label: "Chave da API", secret: true, placeholder: "cole a chave do Pexels", env: "PEXELS_API_KEY" }],
    whereToGet: "pexels.com/api > crie a conta grátis > Your API Key",
  },
];

function rawValue(def: IntegrationDef, field: IntegrationField): string {
  if (def.aiProvider && field.key === "apiKey") return loadSettings().ai.keys[def.aiProvider] || (field.env ? process.env[field.env] ?? "" : "");
  return integrationValue(def.id, field.key, field.env);
}

export function maskValue(value: string, secret: boolean): string {
  if (!value) return "";
  if (!secret) return value;
  return value.length <= 8 ? "••••" : `••••${value.slice(-4)}`;
}

export function integrationsView() {
  return INTEGRATIONS.map((def) => {
    const values = Object.fromEntries(def.fields.map((f) => [f.key, maskValue(rawValue(def, f), f.secret)]));
    const sources = Object.fromEntries(
      def.fields.map((f) => {
        const saved = def.aiProvider && f.key === "apiKey" ? !!loadSettings().ai.keys[def.aiProvider] : !!loadSettings().integrations[def.id]?.[f.key];
        return [f.key, saved ? "app" : f.env && process.env[f.env] ? "env" : null];
      })
    );
    const required = def.fields.filter((f) => !/opcional/i.test(f.label));
    const configured = required.length > 0 ? required.every((f) => !!rawValue(def, f)) : def.fields.some((f) => !!rawValue(def, f));
    return { ...def, values, sources, configured };
  });
}

// Salva o que foi colado. Campo vazio = não mexe; o texto "__apagar__" remove o valor salvo no app.
export function saveIntegration(id: string, input: Record<string, string>): void {
  const def = INTEGRATIONS.find((d) => d.id === id);
  if (!def) throw new Error("Integração desconhecida.");
  saveSettings((s) => {
    for (const field of def.fields) {
      const value = (input[field.key] ?? "").trim();
      if (!value || value.startsWith("••••")) continue;
      const clear = value === "__apagar__";
      if (def.aiProvider && field.key === "apiKey") {
        if (clear) delete s.ai.keys[def.aiProvider];
        else s.ai.keys[def.aiProvider] = value;
        continue;
      }
      s.integrations[def.id] ??= {};
      if (clear) delete s.integrations[def.id][field.key];
      else s.integrations[def.id][field.key] = value;
    }
  });
}

// Teste real quando é possível testar sem gastar nada.
export async function testIntegration(id: string): Promise<{ ok: boolean; message: string }> {
  const def = INTEGRATIONS.find((d) => d.id === id);
  if (!def) return { ok: false, message: "Integração desconhecida." };
  const value = (key: string) => rawValue(def, def.fields.find((f) => f.key === key)!);
  try {
    if (def.aiProvider) {
      const { registry } = await import("@lotus/ai-engine");
      if (!value("apiKey")) return { ok: false, message: "Nenhuma chave colada." };
      const models = await registry.get(def.aiProvider).listModels();
      return { ok: true, message: models.length ? `Chave válida: ${models.length} modelos disponíveis.` : "Chave aceita." };
    }
    if (id === "meta-ads") {
      const token = value("accessToken");
      if (!token) return { ok: false, message: "Cole o token de acesso." };
      const res = await fetch(`https://graph.facebook.com/v21.0/me?fields=id,name&access_token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(15_000) });
      const data = (await res.json()) as { name?: string; error?: { message?: string } };
      if (!res.ok) return { ok: false, message: `A Meta recusou o token: ${data.error?.message ?? res.status}` };
      const account = value("adAccountId");
      if (account) {
        const acc = await fetch(`https://graph.facebook.com/v21.0/${account.startsWith("act_") ? account : `act_${account}`}?fields=name,account_status&access_token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(15_000) });
        const accData = (await acc.json()) as { name?: string; error?: { message?: string } };
        if (!acc.ok) return { ok: false, message: `Token válido (${data.name}), mas a conta de anúncios não abriu: ${accData.error?.message ?? acc.status}` };
        return { ok: true, message: `Conectado como ${data.name}; conta de anúncios "${accData.name}".` };
      }
      return { ok: true, message: `Token válido (${data.name}). Falta o ID da conta de anúncios.` };
    }
    if (id === "pexels") {
      const key = value("apiKey");
      if (!key) return { ok: false, message: "Cole a chave do Pexels." };
      const { testPexels } = await import("@/lib/stock-photos");
      return testPexels(key);
    }
    if (id === "vercel") {
      const { exec } = await import("child_process");
      const { promisify } = await import("util");
      const token = value("token");
      const { stdout } = await promisify(exec)(`vercel whoami${token ? ` --token ${token}` : ""}`, { timeout: 30_000, windowsHide: true });
      return { ok: true, message: `Conta da Vercel: ${stdout.trim().split(/\r?\n/).pop()}` };
    }
    return { ok: true, message: "Valores salvos. Esta integração ainda não tem teste automático." };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message.slice(0, 300) : String(err) };
  }
}
