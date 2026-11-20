// Configurações locais do LOTUS (provedor de IA ativo, chaves, modo de permissão).
// Ficam em ~/LOTUS_Workspace/settings.json no computador do dono; variáveis de ambiente são o fallback.

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { AIProviderName } from "./providers/types";

export type PermissionMode = "ask" | "auto";

export interface LotusSettings {
  ai: {
    provider?: AIProviderName;
    // Quem cria sites, ferramentas e produtos (o resto — texto e análise — fica com o provedor ativo)
    creationProvider?: AIProviderName;
    // IA só do chat do Root Master (ex.: Claude pela assinatura no modo construtor); os agentes não mudam
    chatProvider?: AIProviderName;
    models: Partial<Record<AIProviderName, string>>;
    keys: Partial<Record<AIProviderName, string>>;
    baseUrls: Partial<Record<AIProviderName, string>>;
  };
  agent: {
    permissionMode: PermissionMode;
  };
  // Chaves e IDs das integrações coladas na tela Integrações: { "meta-ads": { accessToken: "...", adAccountId: "..." } }
  integrations: Record<string, Record<string, string>>;
}

export const PROVIDER_DEFAULTS: Record<AIProviderName, { label: string; model: string; baseUrl: string; envKey: string }> = {
  drael: { label: "Drael", model: "drael-v1", baseUrl: "https://drael.sh/v1", envKey: "DRAEL_API_KEY" },
  openai: { label: "ChatGPT (OpenAI)", model: "gpt-4o", baseUrl: "https://api.openai.com/v1", envKey: "OPENAI_API_KEY" },
  anthropic: { label: "Claude (chave de API)", model: "claude-opus-5-5", baseUrl: "https://api.anthropic.com", envKey: "ANTHROPIC_API_KEY" },
  "claude-code": { label: "Claude (sua assinatura)", model: "opus", baseUrl: "", envKey: "" },
};

export function settingsFilePath(): string {
  return process.env.LOTUS_SETTINGS_FILE || path.join(os.homedir(), "LOTUS_Workspace", "settings.json");
}

function emptySettings(): LotusSettings {
  return { ai: { models: {}, keys: {}, baseUrls: {} }, agent: { permissionMode: "ask" }, integrations: {} };
}

let cache: { mtimeMs: number; settings: LotusSettings } | null = null;

export function loadSettings(): LotusSettings {
  const file = settingsFilePath();
  let mtimeMs = 0;
  try {
    mtimeMs = fs.statSync(file).mtimeMs;
  } catch {
    return emptySettings();
  }
  if (cache && cache.mtimeMs === mtimeMs) return cache.settings;

  const settings = emptySettings();
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf-8")) as Partial<LotusSettings>;
    settings.ai.provider = raw.ai?.provider;
    settings.ai.creationProvider = raw.ai?.creationProvider;
    settings.ai.chatProvider = raw.ai?.chatProvider;
    Object.assign(settings.ai.models, raw.ai?.models);
    Object.assign(settings.ai.keys, raw.ai?.keys);
    Object.assign(settings.ai.baseUrls, raw.ai?.baseUrls);
    if (raw.agent?.permissionMode === "auto") settings.agent.permissionMode = "auto";
    for (const [id, values] of Object.entries(raw.integrations ?? {})) {
      if (values && typeof values === "object") settings.integrations[id] = { ...(values as Record<string, string>) };
    }
  } catch {
    // arquivo corrompido: segue com env
  }
  cache = { mtimeMs, settings };
  return settings;
}

export function saveSettings(update: (current: LotusSettings) => void): LotusSettings {
  const file = settingsFilePath();
  const current = structuredClone(loadSettings());
  update(current);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(current, null, 2), { encoding: "utf-8", mode: 0o600 });
  cache = null;
  return loadSettings();
}

export function settingsVersion(): number {
  try {
    return fs.statSync(settingsFilePath()).mtimeMs;
  } catch {
    return 0;
  }
}

export function resolveProviderConfig(name: AIProviderName): { apiKey: string; baseUrl: string; model: string } {
  const settings = loadSettings();
  const defaults = PROVIDER_DEFAULTS[name];
  const envBase = name === "drael" ? process.env.DRAEL_BASE_URL : name === "openai" ? process.env.OPENAI_BASE_URL : undefined;
  return {
    apiKey: settings.ai.keys[name] || (defaults.envKey ? process.env[defaults.envKey] : "") || "",
    baseUrl: settings.ai.baseUrls[name] || envBase || defaults.baseUrl,
    model: settings.ai.models[name] || defaults.model,
  };
}

// Valor de uma integração: o que foi colado na tela Integrações vale mais que a variável de ambiente.
export function integrationValue(id: string, field: string, envKey?: string): string {
  const fromSettings = loadSettings().integrations[id]?.[field];
  if (fromSettings) return fromSettings;
  return envKey ? process.env[envKey] ?? "" : "";
}
