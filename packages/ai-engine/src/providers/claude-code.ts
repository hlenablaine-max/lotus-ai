// Provedor "Claude (sua assinatura)": usa o Claude Code instalado e logado neste computador,
// em modo não interativo (claude -p). Não precisa de chave de API: consome a assinatura do dono.
// As chaves da Anthropic são retiradas do ambiente ao chamar, para nunca cobrar por chave sem querer.

import { spawn } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { AICompletionOptions, AICompletionResult, AIProvider, AIStreamChunk, ToolExecutor } from "./types";

export function claudeCodeExecutable(): string | null {
  const candidates = [
    process.env.CLAUDE_CODE_EXE,
    process.platform === "win32" ? path.join(process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"), "npm", "node_modules", "@anthropic-ai", "claude-code", "bin", "claude.exe") : null,
    path.join(os.homedir(), ".local", "bin", process.platform === "win32" ? "claude.exe" : "claude"),
    "/usr/local/bin/claude",
    "/opt/homebrew/bin/claude",
  ].filter(Boolean) as string[];
  return candidates.find((c) => fs.existsSync(c)) ?? null;
}

export interface ClaudeCodeEvent {
  type: "text" | "tool" | "tool_result" | "session" | "result";
  text?: string;
  tool?: { id: string; name: string; input: Record<string, unknown> };
  toolResult?: { id: string; isError: boolean; content: string };
  sessionId?: string;
  isError?: boolean;
}

export interface ClaudeCodeRunOptions {
  prompt: string;
  systemPrompt?: string;
  cwd?: string;
  model?: string;
  /** Ferramentas do Claude Code liberadas ("" = nenhuma, só texto) */
  tools?: string[];
  /** Ferramentas permitidas sem pedir confirmação (ex.: "Bash(git status:*)") */
  allowedTools?: string[];
  permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan";
  resume?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  onEvent?: (event: ClaudeCodeEvent) => void;
}

// Ambiente sem chave da Anthropic: o Claude Code usa o login da assinatura
function cleanEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  delete env.ANTHROPIC_AUTH_TOKEN;
  delete env.ANTHROPIC_BASE_URL;
  delete env.CLAUDE_CODE_USE_BEDROCK;
  delete env.CLAUDE_CODE_USE_VERTEX;
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}

export async function runClaudeCode(opts: ClaudeCodeRunOptions): Promise<{ text: string; sessionId: string | null; isError: boolean }> {
  const exe = claudeCodeExecutable();
  if (!exe) throw new Error("O Claude Code não está instalado neste computador (comando 'claude').");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lotus-claude-"));
  const args = ["-p", "--output-format", "stream-json", "--verbose"];
  if (opts.model) args.push("--model", opts.model);
  if (opts.systemPrompt) {
    const sysFile = path.join(tmp, "system.md");
    fs.writeFileSync(sysFile, opts.systemPrompt, "utf-8");
    args.push("--append-system-prompt-file", sysFile);
  }
  if (opts.tools) args.push("--tools", opts.tools.length ? opts.tools.join(",") : "");
  if (opts.allowedTools?.length) args.push("--allowedTools", ...opts.allowedTools);
  if (opts.permissionMode) args.push("--permission-mode", opts.permissionMode);
  if (opts.resume) args.push("--resume", opts.resume);

  return new Promise((resolve, reject) => {
    const child = spawn(exe, args, { cwd: opts.cwd ?? os.homedir(), env: cleanEnv(), windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let buffer = "";
    let text = "";
    let finalText: string | null = null;
    let sessionId: string | null = null;
    let isError = false;
    let stderr = "";
    const timer = setTimeout(() => child.kill(), opts.timeoutMs ?? 15 * 60_000);
    const onAbort = () => child.kill();
    opts.signal?.addEventListener("abort", onAbort);

    const handle = (line: string) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(line);
      } catch {
        return;
      }
      if (typeof msg.session_id === "string" && !sessionId) {
        sessionId = msg.session_id;
        opts.onEvent?.({ type: "session", sessionId });
      }
      if (msg.type === "assistant") {
        const content = ((msg.message as { content?: Array<Record<string, unknown>> } | undefined)?.content ?? []) as Array<Record<string, unknown>>;
        for (const block of content) {
          if (block.type === "text" && typeof block.text === "string") {
            text += (text ? "\n\n" : "") + block.text;
            opts.onEvent?.({ type: "text", text: block.text });
          } else if (block.type === "tool_use") {
            opts.onEvent?.({ type: "tool", tool: { id: String(block.id), name: String(block.name), input: (block.input ?? {}) as Record<string, unknown> } });
          }
        }
      } else if (msg.type === "user") {
        const content = ((msg.message as { content?: Array<Record<string, unknown>> } | undefined)?.content ?? []) as Array<Record<string, unknown>>;
        for (const block of content) {
          if (block.type === "tool_result") {
            const c = block.content;
            const body = typeof c === "string" ? c : Array.isArray(c) ? c.map((x) => (typeof x === "object" && x && "text" in x ? String((x as { text: unknown }).text) : "")).join("\n") : "";
            opts.onEvent?.({ type: "tool_result", toolResult: { id: String(block.tool_use_id), isError: !!block.is_error, content: body.slice(0, 4000) } });
          }
        }
      } else if (msg.type === "result") {
        isError = !!msg.is_error;
        if (typeof msg.result === "string") finalText = msg.result;
        opts.onEvent?.({ type: "result", isError, text: finalText ?? undefined });
      }
    };

    child.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf-8");
      let idx: number;
      while ((idx = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (line) handle(line);
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf-8");
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onAbort);
      if (buffer.trim()) handle(buffer.trim());
      fs.rmSync(tmp, { recursive: true, force: true });
      if (opts.signal?.aborted) return reject(new Error("Interrompido."));
      const out = (finalText ?? text).trim();
      if (!out && code !== 0) return reject(new Error(`O Claude Code falhou (código ${code}): ${stderr.slice(-500) || "sem detalhes"}`));
      // Recusa por política de uso não é falta de limite: o pedido precisa mudar, esperar não resolve
      if (isError && /usage policy|violate|safeguard/i.test(out)) return reject(new Error(`O Claude recusou este pedido pela política de uso (o texto da tarefa precisa mudar): ${out.slice(0, 300)}`));
      if (isError && /rate limit|usage limit|limit reached|quota|5-hour|weekly limit/i.test(out)) return reject(new Error(`Limite da assinatura do Claude atingido: ${out.slice(0, 300)}`));
      resolve({ text: out, sessionId, isError });
    });
    child.stdin.write(opts.prompt, "utf-8");
    child.stdin.end();
  });
}

// Junta a conversa num único texto (o Claude Code recebe um prompt por chamada)
function flatten(options: AICompletionOptions, imageDir: string | null): { system: string; prompt: string } {
  const system = options.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const turns = options.messages.filter((m) => m.role !== "system");
  const last = turns[turns.length - 1];
  const history = turns.slice(0, -1).map((m) => `${m.role === "user" ? "PEDIDO" : "SUA RESPOSTA ANTERIOR"}:\n${m.content}`).join("\n\n---\n\n");
  const images: string[] = [];
  if (imageDir) {
    turns.forEach((m, mi) =>
      (m.images ?? []).forEach((img, ii) => {
        const ext = img.mediaType === "image/png" ? "png" : img.mediaType === "image/webp" ? "webp" : "jpg";
        const file = path.join(imageDir, `imagem-${mi + 1}-${ii + 1}.${ext}`);
        fs.writeFileSync(file, Buffer.from(img.data, "base64"));
        images.push(file);
      })
    );
  }
  const prompt = [
    history ? `CONTEXTO DA CONVERSA:\n\n${history}\n\n---\n` : "",
    last?.content ?? "",
    images.length ? `\n\nIMAGENS ANEXADAS (abra cada uma com a ferramenta Read antes de decidir):\n${images.map((f) => `- ${f}`).join("\n")}` : "",
    "\n\nObservação: aqui você não tem as ferramentas da LOTUS (save_document etc.). Entregue o trabalho COMPLETO direto na resposta: o sistema salva sozinho.",
  ].join("");
  return { system, prompt };
}

export class ClaudeCodeProvider implements AIProvider {
  name = "claude-code";
  constructor(private defaultModel = "opus") {}

  isAvailable(): boolean {
    return claudeCodeExecutable() !== null;
  }
  getDefaultModel(): string {
    return this.defaultModel;
  }
  async listModels(): Promise<string[]> {
    return ["opus", "sonnet"];
  }

  async complete(options: AICompletionOptions): Promise<AICompletionResult> {
    const hasImages = options.messages.some((m) => (m.images ?? []).length > 0);
    const imageDir = hasImages ? fs.mkdtempSync(path.join(os.tmpdir(), "lotus-claude-img-")) : null;
    try {
      const { system, prompt } = flatten(options, imageDir);
      const result = await runClaudeCode({
        prompt,
        systemPrompt: system || undefined,
        model: options.model || this.defaultModel,
        tools: hasImages ? ["Read"] : [],
        allowedTools: hasImages ? ["Read"] : undefined,
        cwd: imageDir ?? os.tmpdir(),
        signal: options.signal,
      });
      if (result.isError) throw new Error(result.text || "O Claude Code devolveu erro.");
      return { content: result.text, model: options.model || this.defaultModel, provider: this.name };
    } finally {
      if (imageDir) fs.rmSync(imageDir, { recursive: true, force: true });
    }
  }

  // As ferramentas da LOTUS não passam pelo Claude Code: ele entrega o texto e o sistema salva
  async completeWithLoop(options: AICompletionOptions, _toolExecutor: ToolExecutor): Promise<AICompletionResult> {
    return this.complete(options);
  }

  async *stream(options: AICompletionOptions): AsyncGenerator<AIStreamChunk> {
    const result = await this.complete(options);
    yield { delta: result.content, done: false };
    yield { delta: "", done: true };
  }

  async *streamWithTools(options: AICompletionOptions, _toolExecutor: ToolExecutor): AsyncGenerator<AIStreamChunk> {
    yield* this.stream(options);
  }
}
