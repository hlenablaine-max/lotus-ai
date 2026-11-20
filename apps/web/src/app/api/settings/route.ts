import { NextRequest } from "next/server";
import {
  registry,
  loadSettings,
  saveSettings,
  resolveProviderConfig,
  PROVIDER_DEFAULTS,
  claudeCodeExecutable,
  type AIProviderName,
} from "@lotus/ai-engine";
import { requireOwner } from "@/lib/require-owner";
import { createRuntimeClient } from "@/lib/runtime-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROVIDERS = Object.keys(PROVIDER_DEFAULTS) as AIProviderName[];

// As chaves nunca voltam para a interface: só informamos se existem e de onde vêm.
async function publicSettings() {
  const settings = loadSettings();
  let active: AIProviderName | null = null;
  try {
    active = registry.activeName();
  } catch {
    active = null;
  }
  return {
    ai: {
      provider: active,
      chatProvider: settings.ai.chatProvider ?? null,
      chosen: settings.ai.provider ?? null,
      creationProvider: settings.ai.creationProvider ?? "claude-code",
      providers: PROVIDERS.map((name) => {
        const resolved = resolveProviderConfig(name);
        const fromFile = !!settings.ai.keys[name];
        // Claude pela assinatura: não tem chave, depende do Claude Code instalado e logado neste PC
        if (name === "claude-code") {
          return {
            name,
            label: PROVIDER_DEFAULTS[name].label,
            configured: claudeCodeExecutable() !== null,
            keySource: claudeCodeExecutable() ? "assinatura" : null,
            keyHint: null,
            model: resolved.model,
            defaultModel: PROVIDER_DEFAULTS[name].model,
            baseUrl: "",
          };
        }
        return {
          name,
          label: PROVIDER_DEFAULTS[name].label,
          configured: !!resolved.apiKey,
          keySource: fromFile ? "app" : resolved.apiKey ? "env" : null,
          keyHint: resolved.apiKey ? `…${resolved.apiKey.slice(-4)}` : null,
          model: resolved.model,
          defaultModel: PROVIDER_DEFAULTS[name].model,
          baseUrl: resolved.baseUrl,
        };
      }),
    },
    agent: { permissionMode: settings.agent.permissionMode },
    desktop: await createRuntimeClient().available(),
  };
}

export async function GET() {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;
  return Response.json(await publicSettings());
}

export async function PUT(request: NextRequest) {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;

  const body = (await request.json()) as {
    provider?: string;
    models?: Record<string, string>;
    keys?: Record<string, string | null>;
    baseUrls?: Record<string, string | null>;
    permissionMode?: string;
    creationProvider?: string;
  };

  if (body.provider && !PROVIDERS.includes(body.provider as AIProviderName)) {
    return Response.json({ error: `Provedor inválido: ${body.provider}` }, { status: 400 });
  }

  try {
    saveSettings((current) => {
      // Claude pela assinatura vira a IA do chat (modo construtor); as outras viram a IA de tudo
      if (body.provider === "claude-code") current.ai.chatProvider = "claude-code";
      else if (body.provider) {
        current.ai.provider = body.provider as AIProviderName;
        delete current.ai.chatProvider;
      }
      if (body.creationProvider && PROVIDERS.includes(body.creationProvider as AIProviderName)) current.ai.creationProvider = body.creationProvider as AIProviderName;
      for (const name of PROVIDERS) {
        const model = body.models?.[name];
        if (typeof model === "string") {
          if (model.trim()) current.ai.models[name] = model.trim();
          else delete current.ai.models[name];
        }
        const key = body.keys?.[name];
        if (key === null || key === "") delete current.ai.keys[name];
        else if (typeof key === "string") current.ai.keys[name] = key.trim();

        const baseUrl = body.baseUrls?.[name];
        if (baseUrl === null || baseUrl === "") delete current.ai.baseUrls[name];
        else if (typeof baseUrl === "string" && /^https?:\/\//.test(baseUrl.trim())) current.ai.baseUrls[name] = baseUrl.trim();
      }
      if (body.permissionMode === "ask" || body.permissionMode === "auto") {
        current.agent.permissionMode = body.permissionMode;
      }
    });
  } catch (err) {
    return Response.json(
      { error: `Não foi possível salvar as configurações neste ambiente: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }

  // Se o dono escolheu um provedor sem chave, avisa em vez de falhar depois no chat.
  const result = await publicSettings();
  const chosen = result.ai.providers.find((p) => p.name === body.provider);
  if (body.provider && chosen && !chosen.configured) {
    return Response.json({ ...result, warning: `${chosen.label} está selecionado mas sem chave de API.` });
  }
  return Response.json(result);
}
