import Anthropic from "@anthropic-ai/sdk";
import type {
  AIProvider,
  AICompletionOptions,
  AICompletionResult,
  AIStreamChunk,
  ProviderConfig,
  ToolExecutor,
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

  // Runs the full agentic tool-use loop until stop_reason is "end_turn".
  async completeWithLoop(
    options: AICompletionOptions,
    toolExecutor: ToolExecutor
  ): Promise<AICompletionResult> {
    const model = options.model || this.config.defaultModel || "claude-sonnet-4-5";
    const systemContent = options.messages.find((m) => m.role === "system")?.content;

    type MsgContent = string | Anthropic.ContentBlockParam[];
    type MsgParam = { role: "user" | "assistant"; content: MsgContent };

    let messages: MsgParam[] = options.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    const tools = options.tools?.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: { type: "object" as const, ...tool.parameters },
    }));

    let finalContent = "";
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    const MAX_LOOPS = 8;

    for (let i = 0; i < MAX_LOOPS; i++) {
      const response = await this.client.messages.create({
        model,
        max_tokens: options.maxTokens || 4096,
        system: systemContent,
        messages: messages as Parameters<typeof this.client.messages.create>[0]["messages"],
        ...(tools && tools.length > 0 ? { tools } : {}),
      });

      totalInputTokens += response.usage.input_tokens;
      totalOutputTokens += response.usage.output_tokens;

      const textBlocks = response.content.filter((b) => b.type === "text") as Anthropic.TextBlock[];
      const toolUseBlocks = response.content.filter((b) => b.type === "tool_use") as Anthropic.ToolUseBlock[];

      const responseText = textBlocks.map((b) => b.text).join("");
      if (responseText) finalContent = responseText;

      if (response.stop_reason !== "tool_use" || toolUseBlocks.length === 0) {
        break;
      }

      // Execute all tool calls
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const tb of toolUseBlocks) {
        let result: string;
        try {
          result = await toolExecutor(tb.name, tb.input as Record<string, unknown>);
        } catch (err) {
          result = `Erro ao executar ${tb.name}: ${err instanceof Error ? err.message : String(err)}`;
        }
        toolResults.push({ type: "tool_result", tool_use_id: tb.id, content: result });
      }

      messages = [
        ...messages,
        { role: "assistant", content: response.content },
        { role: "user", content: toolResults },
      ];
    }

    return {
      content: finalContent,
      model,
      provider: this.name,
      usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
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

  // Streams text to the caller while handling the tool-use loop transparently.
  async *streamWithTools(
    options: AICompletionOptions,
    toolExecutor: ToolExecutor
  ): AsyncGenerator<AIStreamChunk> {
    const model = options.model || this.config.defaultModel || "claude-sonnet-4-5";
    const systemContent = options.messages.find((m) => m.role === "system")?.content;

    type MsgContent = string | Anthropic.ContentBlockParam[];
    type MsgParam = { role: "user" | "assistant"; content: MsgContent };

    let messages: MsgParam[] = options.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    const tools = options.tools?.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: { type: "object" as const, ...tool.parameters },
    }));

    const MAX_LOOPS = 8;

    for (let iteration = 0; iteration < MAX_LOOPS; iteration++) {
      const sdkStream = this.client.messages.stream({
        model,
        max_tokens: options.maxTokens || 8192,
        system: systemContent,
        messages: messages as Parameters<typeof this.client.messages.stream>[0]["messages"],
        ...(tools && tools.length > 0 ? { tools } : {}),
      });

      let textAccumulated = "";
      const toolUseBlocks: Array<{ id: string; name: string; input: string }> = [];
      let currentBlock: { id: string; name: string; input: string } | null = null;

      for await (const event of sdkStream) {
        if (event.type === "content_block_start") {
          const cb = event.content_block as { type: string; id?: string; name?: string };
          if (cb.type === "tool_use") {
            currentBlock = { id: cb.id!, name: cb.name!, input: "" };
          }
        } else if (event.type === "content_block_delta") {
          const delta = event.delta as { type: string; text?: string; partial_json?: string };
          if (delta.type === "text_delta" && delta.text) {
            textAccumulated += delta.text;
            yield { delta: delta.text, done: false };
          } else if (delta.type === "input_json_delta" && delta.partial_json && currentBlock) {
            currentBlock.input += delta.partial_json;
          }
        } else if (event.type === "content_block_stop" && currentBlock) {
          toolUseBlocks.push({ ...currentBlock });
          currentBlock = null;
        }
      }

      const finalMsg = await sdkStream.finalMessage();

      if (finalMsg.stop_reason !== "tool_use" || toolUseBlocks.length === 0) {
        yield { delta: "", done: true };
        return;
      }

      // Build the assistant message content blocks
      const assistantBlocks: Anthropic.ContentBlockParam[] = [];
      if (textAccumulated) {
        assistantBlocks.push({ type: "text", text: textAccumulated });
      }
      for (const tb of toolUseBlocks) {
        let parsedInput: Record<string, unknown> = {};
        try { parsedInput = JSON.parse(tb.input || "{}"); } catch { /* ignore */ }
        assistantBlocks.push({ type: "tool_use", id: tb.id, name: tb.name, input: parsedInput });
      }

      // Execute tool calls
      const toolResultBlocks: Anthropic.ToolResultBlockParam[] = [];
      for (const tb of toolUseBlocks) {
        let inputParsed: Record<string, unknown> = {};
        try { inputParsed = JSON.parse(tb.input || "{}"); } catch { /* ignore */ }

        let resultContent: string;
        try {
          resultContent = await toolExecutor(tb.name, inputParsed);
        } catch (err) {
          resultContent = `Erro: ${err instanceof Error ? err.message : String(err)}`;
        }
        toolResultBlocks.push({ type: "tool_result", tool_use_id: tb.id, content: resultContent });
      }

      messages = [
        ...messages,
        { role: "assistant", content: assistantBlocks },
        { role: "user", content: toolResultBlocks },
      ];
    }

    yield { delta: "", done: true };
  }
}
