// Provedor genérico para APIs compatíveis com OpenAI Chat Completions.
// Usado por Drael (https://drael.sh/v1) e OpenAI/ChatGPT (https://api.openai.com/v1).

import type {
  AIProvider,
  AICompletionOptions,
  AICompletionResult,
  AIImage,
  AIStreamChunk,
  AITool,
  ProviderConfig,
  ToolExecutor,
} from "./types";

type OpenAIContent = string | null | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;

interface OpenAIChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: OpenAIContent;
  images?: AIImage[];
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
}

interface OpenAIToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface OpenAIChatResponse {
  choices: Array<{ message: { content: string | null; tool_calls?: OpenAIToolCall[] }; finish_reason?: string | null }>;
  model: string;
  usage?: { prompt_tokens: number; completion_tokens: number };
}

interface OpenAIStreamEvent {
  choices: Array<{
    delta?: {
      content?: string | null;
      tool_calls?: Array<{ index: number; id?: string; function?: { name?: string; arguments?: string } }>;
    };
    finish_reason?: string | null;
  }>;
}

export interface OpenAICompatibleConfig extends ProviderConfig {
  name: string;
  // Modelos novos da OpenAI rejeitam max_tokens e temperature customizada.
  tokenParam?: "max_tokens" | "max_completion_tokens";
  sendTemperature?: boolean;
}

const DEFAULT_MAX_ITERATIONS = 10;

// Mensagens com imagens viram conteúdo em partes (texto + image_url em data URL)
function toWire(message: OpenAIChatMessage): Omit<OpenAIChatMessage, "images"> {
  const { images, ...rest } = message;
  if (!images || images.length === 0 || typeof rest.content !== "string") return rest;
  return {
    ...rest,
    content: [
      { type: "text", text: rest.content },
      ...images.map((img) => ({
        type: "image_url" as const,
        image_url: { url: `data:${img.mediaType};base64,${img.data}` },
      })),
    ],
  };
}

function toOpenAITools(tools: AITool[]) {
  return tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: { type: "object", ...t.parameters },
    },
  }));
}

async function runTool(toolExecutor: ToolExecutor, name: string, rawArgs: string): Promise<string> {
  let args: Record<string, unknown> = {};
  if (rawArgs && rawArgs.trim()) {
    try {
      const parsed = JSON.parse(rawArgs);
      if (parsed && typeof parsed === "object") args = parsed as Record<string, unknown>;
    } catch {
      return "Argumentos da ferramenta não são JSON válido. Reenvie a chamada com JSON correto.";
    }
  }
  try {
    return await toolExecutor(name, args);
  } catch (err) {
    return `Erro ao executar ${name}: ${err instanceof Error ? err.message : String(err)}`;
  }
}

// Retry com backoff exponencial em 429 (limite de turnos simultâneos).
async function fetchWithRetry(url: string, init: RequestInit, maxRetries = 5): Promise<Response> {
  let delay = 3000;
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url, init);
    if (response.status !== 429 || attempt === maxRetries) return response;
    await response.text();
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 2, 30000);
  }
}

export class OpenAICompatibleProvider implements AIProvider {
  name: string;
  private apiKey: string;
  private baseUrl: string;
  private defaultModel: string;
  private tokenParam: "max_tokens" | "max_completion_tokens";
  private sendTemperature: boolean;

  constructor(config: OpenAICompatibleConfig) {
    this.name = config.name;
    this.apiKey = config.apiKey || "";
    this.baseUrl = (config.baseUrl || "").replace(/\/+$/, "");
    this.defaultModel = config.defaultModel || "";
    this.tokenParam = config.tokenParam ?? "max_tokens";
    this.sendTemperature = config.sendTemperature ?? true;
  }

  isAvailable(): boolean {
    return !!(this.apiKey && this.baseUrl);
  }

  getDefaultModel(): string {
    return this.defaultModel;
  }

  async listModels(): Promise<string[]> {
    const res = await fetch(`${this.baseUrl}/models`, { headers: this.headers() });
    if (!res.ok) throw new Error(`${this.name} API error ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = (await res.json()) as { data?: Array<{ id: string }> };
    return (data.data ?? []).map((m) => m.id).sort();
  }

  private headers(): Record<string, string> {
    return { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` };
  }

  private async request(
    options: AICompletionOptions,
    messages: OpenAIChatMessage[],
    stream: boolean
  ): Promise<Response> {
    const body: Record<string, unknown> = {
      model: options.model || this.defaultModel,
      messages: messages.map(toWire),
      stream,
    };
    body[this.tokenParam] = options.maxTokens || 4096;
    if (this.sendTemperature) body.temperature = options.temperature ?? 0.7;
    if (options.tools && options.tools.length > 0) body.tools = toOpenAITools(options.tools);

    const response = await fetchWithRetry(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
      signal: options.signal,
    });
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`${this.name} API error ${response.status}: ${error.slice(0, 500)}`);
    }
    return response;
  }

  async complete(options: AICompletionOptions): Promise<AICompletionResult> {
    const response = await this.request({ ...options, tools: undefined }, options.messages as OpenAIChatMessage[], false);
    const data = (await response.json()) as OpenAIChatResponse;
    return {
      content: data.choices[0]?.message?.content || "",
      model: options.model || this.defaultModel,
      provider: this.name,
      usage: data.usage
        ? { inputTokens: data.usage.prompt_tokens, outputTokens: data.usage.completion_tokens }
        : undefined,
    };
  }

  async completeWithLoop(options: AICompletionOptions, toolExecutor: ToolExecutor): Promise<AICompletionResult> {
    const messages: OpenAIChatMessage[] = [...(options.messages as OpenAIChatMessage[])];
    const maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;
    let totalInput = 0;
    let totalOutput = 0;
    let finalContent = "";

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      const response = await this.request(options, messages, false);
      const data = (await response.json()) as OpenAIChatResponse;
      const choice = data.choices[0];
      if (!choice) break;

      if (data.usage) {
        totalInput += data.usage.prompt_tokens;
        totalOutput += data.usage.completion_tokens;
      }

      const assistantMsg = choice.message;
      if (assistantMsg.content) finalContent = assistantMsg.content;
      if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) break;

      messages.push({ role: "assistant", content: assistantMsg.content ?? null, tool_calls: assistantMsg.tool_calls });
      for (const tc of assistantMsg.tool_calls) {
        const result = await runTool(toolExecutor, tc.function.name, tc.function.arguments);
        messages.push({ role: "tool", content: result, tool_call_id: tc.id });
      }
    }

    return {
      content: finalContent,
      model: options.model || this.defaultModel,
      provider: this.name,
      usage: totalInput > 0 ? { inputTokens: totalInput, outputTokens: totalOutput } : undefined,
    };
  }

  // Lê um stream SSE, repassa o texto e devolve as tool calls acumuladas.
  private async *readStream(
    response: Response,
    onToolCalls: (calls: OpenAIToolCall[], text: string) => void
  ): AsyncGenerator<AIStreamChunk> {
    const reader = response.body?.getReader();
    if (!reader) throw new Error(`Resposta sem corpo da API ${this.name}`);

    const decoder = new TextDecoder();
    let buffer = "";
    let text = "";
    const pending = new Map<number, { id: string; name: string; arguments: string }>();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ")) continue;
        const data = trimmed.slice(6);
        if (data === "[DONE]") continue;
        let parsed: OpenAIStreamEvent;
        try {
          parsed = JSON.parse(data) as OpenAIStreamEvent;
        } catch {
          continue;
        }
        const delta = parsed.choices?.[0]?.delta;
        if (!delta) continue;
        if (delta.content) {
          text += delta.content;
          yield { delta: delta.content, done: false };
        }
        for (const tc of delta.tool_calls ?? []) {
          const existing = pending.get(tc.index) ?? { id: "", name: "", arguments: "" };
          if (tc.id) existing.id = tc.id;
          if (tc.function?.name) existing.name += tc.function.name;
          if (tc.function?.arguments) existing.arguments += tc.function.arguments;
          pending.set(tc.index, existing);
        }
      }
    }

    onToolCalls(
      Array.from(pending.values()).map((tc, i) => ({
        id: tc.id || `call_${i}_${Date.now()}`,
        type: "function" as const,
        function: { name: tc.name, arguments: tc.arguments },
      })),
      text
    );
  }

  async *streamWithTools(options: AICompletionOptions, toolExecutor: ToolExecutor): AsyncGenerator<AIStreamChunk> {
    const messages: OpenAIChatMessage[] = [...(options.messages as OpenAIChatMessage[])];
    const maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      const response = await this.request(options, messages, true);

      let toolCalls: OpenAIToolCall[] = [];
      let assistantText = "";
      yield* this.readStream(response, (calls, text) => {
        toolCalls = calls;
        assistantText = text;
      });

      if (toolCalls.length === 0) {
        yield { delta: "", done: true };
        return;
      }

      messages.push({ role: "assistant", content: assistantText || null, tool_calls: toolCalls });
      for (const tc of toolCalls) {
        const result = await runTool(toolExecutor, tc.function.name, tc.function.arguments);
        messages.push({ role: "tool", content: result, tool_call_id: tc.id });
      }
    }

    yield {
      delta: `\n\n_(Limite de ${maxIterations} etapas atingido nesta resposta. Diga "continue" para eu seguir de onde parei.)_`,
      done: false,
    };
    yield { delta: "", done: true };
  }

  async *stream(options: AICompletionOptions): AsyncGenerator<AIStreamChunk> {
    const response = await this.request({ ...options, tools: undefined }, options.messages as OpenAIChatMessage[], true);
    yield* this.readStream(response, () => {});
    yield { delta: "", done: true };
  }
}
