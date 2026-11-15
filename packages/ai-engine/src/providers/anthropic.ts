import Anthropic from "@anthropic-ai/sdk";
import type {
  AIProvider,
  AICompletionOptions,
  AICompletionResult,
  AIStreamChunk,
  ProviderConfig,
} from "./types";

export class AnthropicProvider implements AIProvider {
  name = "anthropic";
  private client: Anthropic;
  private config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
    this.client = new Anthropic({
      apiKey: config.apiKey || process.env.ANTHROPIC_API_KEY,
    });
  }

  isAvailable(): boolean {
    return !!(this.config.apiKey || process.env.ANTHROPIC_API_KEY);
  }

  async complete(options: AICompletionOptions): Promise<AICompletionResult> {
    const model = options.model || this.config.defaultModel || "claude-sonnet-4-5";

    const systemMessage = options.messages.find((m) => m.role === "system");
    const conversationMessages = options.messages.filter((m) => m.role !== "system");

    const tools = options.tools?.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: {
        type: "object" as const,
        ...tool.parameters,
      },
    }));

    const response = await this.client.messages.create({
      model,
      max_tokens: options.maxTokens || 8192,
      temperature: options.temperature,
      system: systemMessage?.content,
      messages: conversationMessages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      ...(tools && tools.length > 0 ? { tools } : {}),
    });

    const textContent = response.content
      .filter((c) => c.type === "text")
      .map((c) => (c as { type: "text"; text: string }).text)
      .join("");

    const toolUseBlocks = response.content.filter((c) => c.type === "tool_use");
    const toolCalls = toolUseBlocks.map((block) => {
      const tb = block as { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };
      return {
        id: tb.id,
        name: tb.name,
        arguments: tb.input,
      };
    });

    return {
      content: textContent,
      model,
      provider: this.name,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }

  async *stream(options: AICompletionOptions): AsyncGenerator<AIStreamChunk> {
    const model = options.model || this.config.defaultModel || "claude-sonnet-4-5";

    const systemMessage = options.messages.find((m) => m.role === "system");
    const conversationMessages = options.messages.filter((m) => m.role !== "system");

    const stream = this.client.messages.stream({
      model,
      max_tokens: options.maxTokens || 8192,
      system: systemMessage?.content,
      messages: conversationMessages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        yield { delta: event.delta.text, done: false };
      }
    }

    yield { delta: "", done: true };
  }
}
