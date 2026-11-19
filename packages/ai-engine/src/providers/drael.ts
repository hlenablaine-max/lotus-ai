// Drael provider — OpenAI-compatible API (https://drael.sh/v1)

import type {
  AIProvider,
  AICompletionOptions,
  AICompletionResult,
  AIStreamChunk,
  AITool,
  ProviderConfig,
  ToolExecutor,
} from "./types";

interface OpenAIChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
}

interface OpenAIToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface OpenAIChatChoice {
  message: { content: string | null; tool_calls?: OpenAIToolCall[] };
  delta?: { content?: string | null; tool_calls?: Array<{ index: number; id?: string; type?: string; function?: { name?: string; arguments?: string } }> };
  finish_reason?: string | null;
}

interface OpenAIChatResponse {
  choices: OpenAIChatChoice[];
  model: string;
  usage?: { prompt_tokens: number; completion_tokens: number };
}

function toOpenAITools(tools: AITool[]) {
  return tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

// Retry a fetch with exponential backoff on 429 turns_in_flight
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  maxRetries = 5
): Promise<Response> {
  let delay = 3000; // start at 3s
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, init);
    if (response.status !== 429) return response;
    if (attempt === maxRetries) return response;
    // Clone/drain the body before retrying to avoid "body used" errors
    await response.text();
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 2, 30000); // cap at 30s
  }
  return fetch(url, init); // unreachable but satisfies TS
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

    const response = await fetchWithRetry(`${this.baseUrl}/chat/completions`, {
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

  async completeWithLoop(options: AICompletionOptions, toolExecutor: ToolExecutor): Promise<AICompletionResult> {
    const model = options.model || this.defaultModel;
    const messages: OpenAIChatMessage[] = options.messages as OpenAIChatMessage[];
    const tools = options.tools && options.tools.length > 0 ? toOpenAITools(options.tools) : undefined;

    let totalInput = 0;
    let totalOutput = 0;
    let finalContent = "";

    // Agentic loop — keep going until no more tool calls
    for (let iteration = 0; iteration < 10; iteration++) {
      const body: Record<string, unknown> = {
        model,
        messages,
        max_tokens: options.maxTokens || 4096,
        temperature: options.temperature ?? 0.7,
        stream: false,
      };
      if (tools) body.tools = tools;

      const response = await fetchWithRetry(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${this.apiKey}` },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Drael API error ${response.status}: ${error}`);
      }

      const data = (await response.json()) as OpenAIChatResponse;
      const choice = data.choices[0];
      if (!choice) break;

      if (data.usage) {
        totalInput += data.usage.prompt_tokens;
        totalOutput += data.usage.completion_tokens;
      }

      const assistantMsg = choice.message;
      if (assistantMsg.content) finalContent = assistantMsg.content;

      // No tool calls — done
      if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) break;

      // Add assistant turn with tool calls
      messages.push({ role: "assistant", content: assistantMsg.content ?? null, tool_calls: assistantMsg.tool_calls });

      // Execute each tool call and add results
      for (const tc of assistantMsg.tool_calls) {
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(tc.function.arguments); } catch { args = {}; }
        const result = await toolExecutor(tc.function.name, args);
        messages.push({ role: "tool", content: result, tool_call_id: tc.id });
      }
    }

    return {
      content: finalContent,
      model,
      provider: this.name,
      usage: totalInput > 0 ? { inputTokens: totalInput, outputTokens: totalOutput } : undefined,
    };
  }

  async *streamWithTools(options: AICompletionOptions, toolExecutor: ToolExecutor): AsyncGenerator<AIStreamChunk> {
    const model = options.model || this.defaultModel;
    const messages: OpenAIChatMessage[] = [...(options.messages as OpenAIChatMessage[])];
    const tools = options.tools && options.tools.length > 0 ? toOpenAITools(options.tools) : undefined;

    // Agentic loop
    for (let iteration = 0; iteration < 10; iteration++) {
      const body: Record<string, unknown> = {
        model,
        messages,
        max_tokens: options.maxTokens || 4096,
        temperature: options.temperature ?? 0.7,
        stream: true,
      };
      if (tools) body.tools = tools;

      const response = await fetchWithRetry(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${this.apiKey}` },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Drael API error ${response.status}: ${error}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body from Drael API");

      const decoder = new TextDecoder();
      let buffer = "";

      // Accumulate the full response so we can detect tool calls
      let assistantContent = "";
      const pendingToolCalls: Map<number, { id: string; name: string; arguments: string }> = new Map();
      let finishReason: string | null = null;

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
          if (data === "[DONE]") break;

          try {
            const parsed = JSON.parse(data) as { choices: Array<{ delta?: { content?: string | null; tool_calls?: Array<{ index: number; id?: string; type?: string; function?: { name?: string; arguments?: string } }>  }; finish_reason?: string | null }> };
            const delta = parsed.choices[0]?.delta;
            if (!delta) continue;

            if (parsed.choices[0]?.finish_reason) finishReason = parsed.choices[0].finish_reason ?? null;

            if (delta.content) {
              assistantContent += delta.content;
              yield { delta: delta.content, done: false };
            }

            if (delta.tool_calls) {
              for (const tc of delta.tool_calls) {
                const existing = pendingToolCalls.get(tc.index) ?? { id: "", name: "", arguments: "" };
                if (tc.id) existing.id = tc.id;
                if (tc.function?.name) existing.name += tc.function.name;
                if (tc.function?.arguments) existing.arguments += tc.function.arguments;
                pendingToolCalls.set(tc.index, existing);
              }
            }
          } catch {
            // skip malformed SSE lines
          }
        }
      }

      // No tool calls — stream is done
      if (pendingToolCalls.size === 0) {
        yield { delta: "", done: true };
        return;
      }

      // Build the assistant message with tool calls and add to history
      const toolCallsArr: OpenAIToolCall[] = Array.from(pendingToolCalls.values()).map((tc) => ({
        id: tc.id || `call_${tc.name}_${Date.now()}`,
        type: "function" as const,
        function: { name: tc.name, arguments: tc.arguments },
      }));
      messages.push({ role: "assistant", content: assistantContent || null, tool_calls: toolCallsArr });

      // Execute tool calls
      for (const tc of toolCallsArr) {
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(tc.function.arguments); } catch { args = {}; }
        const result = await toolExecutor(tc.function.name, args);
        messages.push({ role: "tool", content: result, tool_call_id: tc.id });
      }
      // Continue loop to get the next response
    }

    yield { delta: "", done: true };
  }

  async *stream(options: AICompletionOptions): AsyncGenerator<AIStreamChunk> {
    const model = options.model || this.defaultModel;

    const response = await fetchWithRetry(`${this.baseUrl}/chat/completions`, {
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
