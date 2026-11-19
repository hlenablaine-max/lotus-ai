// Registro de provedores de IA. O provedor ativo vem das configurações locais
// (~/LOTUS_Workspace/settings.json) e pode ser trocado em tempo de execução.

import { AnthropicProvider } from "./anthropic";
import { OpenAICompatibleProvider } from "./openai-compatible";
import type { AIProvider, AIProviderName } from "./types";
import { loadSettings, resolveProviderConfig, settingsVersion } from "../settings";

const PRIORITY: AIProviderName[] = ["drael", "anthropic", "openai"];

class ProviderRegistry {
  private providers = new Map<AIProviderName, AIProvider>();
  private builtFor: string | null = null;

  // Recria os provedores quando as configurações ou as chaves de ambiente mudam.
  refresh(): void {
    const signature = [
      settingsVersion(),
      process.env.DRAEL_API_KEY ? 1 : 0,
      process.env.OPENAI_API_KEY ? 1 : 0,
      process.env.ANTHROPIC_API_KEY ? 1 : 0,
    ].join(":");
    if (this.builtFor === signature) return;

    const drael = resolveProviderConfig("drael");
    this.providers.set(
      "drael",
      new OpenAICompatibleProvider({ name: "drael", apiKey: drael.apiKey, baseUrl: drael.baseUrl, defaultModel: drael.model })
    );

    const openai = resolveProviderConfig("openai");
    this.providers.set(
      "openai",
      new OpenAICompatibleProvider({
        name: "openai",
        apiKey: openai.apiKey,
        baseUrl: openai.baseUrl,
        defaultModel: openai.model,
        tokenParam: "max_completion_tokens",
        sendTemperature: false,
      })
    );

    const anthropic = resolveProviderConfig("anthropic");
    this.providers.set("anthropic", new AnthropicProvider({ apiKey: anthropic.apiKey, defaultModel: anthropic.model }));

    this.builtFor = signature;
  }

  get(name: AIProviderName): AIProvider {
    this.refresh();
    const provider = this.providers.get(name);
    if (!provider) {
      throw new Error(`Provedor de IA '${name}' não existe. Disponíveis: ${PRIORITY.join(", ")}`);
    }
    if (!provider.isAvailable()) {
      throw new Error(`Provedor de IA '${name}' está sem chave de API. Configure em Configurações > Inteligência Artificial.`);
    }
    return provider;
  }

  activeName(): AIProviderName {
    this.refresh();
    const chosen = loadSettings().ai.provider;
    if (chosen && this.providers.get(chosen)?.isAvailable()) return chosen;
    for (const name of PRIORITY) {
      if (this.providers.get(name)?.isAvailable()) return name;
    }
    throw new Error("No AI provider is available. Configure uma chave de API em Configurações > Inteligência Artificial.");
  }

  getDefault(): AIProvider {
    return this.providers.get(this.activeName())!;
  }

  listAvailable(): AIProviderName[] {
    this.refresh();
    return PRIORITY.filter((name) => this.providers.get(name)?.isAvailable());
  }
}

// Singleton global: sobrevive a hot-reload e a bundles separados do Next.
const globalRef = globalThis as unknown as { __lotusProviderRegistryV2?: ProviderRegistry };
const registry = (globalRef.__lotusProviderRegistryV2 ??= new ProviderRegistry());

export function initializeProviders(): void {
  registry.refresh();
}

export { registry };
