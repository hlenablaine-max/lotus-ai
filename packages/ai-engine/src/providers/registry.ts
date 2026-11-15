// Provider Registry — Add new providers here without touching agent code

import { AnthropicProvider } from "./anthropic";
import { DraelProvider } from "./drael";
import type { AIProvider, AIProviderName, ProviderConfig } from "./types";

class ProviderRegistry {
  private providers = new Map<AIProviderName, AIProvider>();

  register(name: AIProviderName, provider: AIProvider): void {
    this.providers.set(name, provider);
  }

  get(name: AIProviderName): AIProvider {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new Error(`AI provider '${name}' is not registered. Available: ${Array.from(this.providers.keys()).join(", ")}`);
    }
    if (!provider.isAvailable()) {
      throw new Error(`AI provider '${name}' is registered but not available. Check API key configuration.`);
    }
    return provider;
  }

  getDefault(): AIProvider {
    // Priority order: drael > anthropic > openai > google > groq
    const priority: AIProviderName[] = ["drael", "anthropic", "openai", "google", "groq"];
    for (const name of priority) {
      const provider = this.providers.get(name);
      if (provider?.isAvailable()) return provider;
    }
    throw new Error("No AI provider is available. Configure at least one API key.");
  }

  listAvailable(): AIProviderName[] {
    return Array.from(this.providers.entries())
      .filter(([, p]) => p.isAvailable())
      .map(([name]) => name);
  }
}

// Singleton registry
const registry = new ProviderRegistry();

// Initialize with available providers
export function initializeProviders(config?: Partial<Record<AIProviderName, ProviderConfig>>): void {
  // Drael (default provider)
  registry.register("drael", new DraelProvider(
    config?.drael || { apiKey: process.env.DRAEL_API_KEY, baseUrl: process.env.DRAEL_BASE_URL }
  ));

  // Anthropic (fallback)
  registry.register("anthropic", new AnthropicProvider(
    config?.anthropic || { apiKey: process.env.ANTHROPIC_API_KEY }
  ));
}

export { registry };
