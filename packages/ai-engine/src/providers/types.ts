// LOTUS AI Engine — Provider Abstraction Layer
// Supports Anthropic, OpenAI, Google, Groq — swap without rebuilding

export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AITool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface AICompletionOptions {
  model?: string;
  messages: AIMessage[];
  tools?: AITool[];
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
}

export interface AICompletionResult {
  content: string;
  model: string;
  provider: string;
  toolCalls?: AIToolCall[];
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cost?: number;
  };
}

export interface AIToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface AIStreamChunk {
  delta: string;
  done: boolean;
  toolCall?: AIToolCall;
}

export interface AIProvider {
  name: string;
  complete(options: AICompletionOptions): Promise<AICompletionResult>;
  stream(options: AICompletionOptions): AsyncGenerator<AIStreamChunk>;
  isAvailable(): boolean;
}

export type AIProviderName = "anthropic" | "openai" | "google" | "groq" | "drael" | "custom";

export interface ProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
  maxConcurrency?: number;
}
