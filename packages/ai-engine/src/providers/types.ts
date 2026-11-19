// LOTUS AI Engine — Provider Abstraction Layer
// Supports Anthropic, OpenAI, Google, Groq — swap without rebuilding

export interface AIImage {
  mediaType: "image/jpeg" | "image/png" | "image/webp";
  // conteúdo em base64, sem o prefixo data:
  data: string;
}

export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
  // Imagens anexadas à mensagem (prints de perfil, site, quadros de vídeo)
  images?: AIImage[];
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
  // Máximo de rodadas modelo -> ferramentas -> modelo no loop agêntico.
  maxIterations?: number;
  signal?: AbortSignal;
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

export type ToolExecutor = (name: string, args: Record<string, unknown>) => Promise<string>;

export interface AIProvider {
  name: string;
  complete(options: AICompletionOptions): Promise<AICompletionResult>;
  completeWithLoop(options: AICompletionOptions, toolExecutor: ToolExecutor): Promise<AICompletionResult>;
  stream(options: AICompletionOptions): AsyncGenerator<AIStreamChunk>;
  streamWithTools(options: AICompletionOptions, toolExecutor: ToolExecutor): AsyncGenerator<AIStreamChunk>;
  isAvailable(): boolean;
  getDefaultModel(): string;
  listModels(): Promise<string[]>;
}

export type AIProviderName = "drael" | "openai" | "anthropic";

export interface ProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
  maxConcurrency?: number;
}
