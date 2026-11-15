// Drael provider — OpenAI-compatible API (https://drael.sh/v1)

import type {
  AIProvider,
  AICompletionOptions,
  AICompletionResult,
  AIStreamChunk,
  ProviderConfig,
} from "./types";

interface OpenAIChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface OpenAIChatChoice {
  message: { content: string };
  delta?: { content?: string };
}

interface OpenAIChatResponse {
  choices: OpenAIChatChoice[];
  model: string;
  usage?: { prompt_tokens: number; completion_tokens: number };
}

export class DraelProvider implements AIProvider {
  name = "drael";
  private apiKey: string;
  private baseUrl: string;
  private defaultModel: string;

  constructor(config: ProviderConfig) {
    this.apiKey = config.apiKey || process.env.DRAEL_API_KEY || "";
    this.baseUrl = config.baseUrl || process.env.DRAEL_BASE_URL || "https://drael.sh/v1";
    this.defaultModel = config.defaultModel || "drael-v1";
  }

  isAvailable(): boolean {
    return !!(this.apiKey);
  }

  async complete(options: AICompletionOptions): Promise<AICompletionResult> {
    const model = options.model || this.defaultModel;

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: options.messages as OpenAIChatMessage[],
        max_tokens: options.maxTokens || 4096,
        temperature: options.temperature ?? 0.7,
        stream: false,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Drael API error ${response.status}: ${error}`);
    }

    const data = (await response.json()) as OpenAIChatResponse;
    const content = data.choices[0]?.message?.content || "";

    return {
      content,
      model,
      provider: this.name,
      usage: data.usage
        ? { inputTokens: data.usage.prompt_tokens, outputTokens: data.usage.completion_tokens }
        : undefined,
    };
  }

  async *stream(options: AICompletionOptions): AsyncGenerator<AIStreamChunk> {
    const model = options.model || this.defaultModel;

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: options.messages as OpenAIChatMessage[],
        max_tokens: options.maxTokens || 4096,
        temperature: options.temperature ?? 0.7,
        stream: true,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Drael API error ${response.status}: ${error}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body from Drael API");

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;
        const data = trimmed.slice(6);
        if (data === "[DONE]") {
          yield { delta: "", done: true };
          return;
        }
        try {
          const parsed = JSON.parse(data) as { choices: Array<{ delta?: { content?: string } }> };
          const delta = parsed.choices[0]?.delta?.content || "";
          if (delta) yield { delta, done: false };
        } catch {
          // skip malformed SSE lines
        }
      }
    }

    yield { delta: "", done: true };
  }
}
