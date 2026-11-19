// Ferramentas locais do chat (modo CLI): comandos, arquivos, navegador e automodificação.
// Só funcionam com o aplicativo desktop aberto — é ele que executa as ações neste computador.

import type { AITool } from "@lotus/ai-engine";
import { createRuntimeClient } from "@/lib/runtime-client";

export const LOCAL_TOOL_DEFS: AITool[] = [
  {
    name: "run_command",
    description:
      "Executa um comando no terminal do computador do dono (PowerShell no Windows). Use para automações, git, instalar pacotes, rodar scripts, abrir programas. cwd aceita caminho absoluto ou 'repo:' (código do LOTUS).",
    parameters: {
      properties: {
        command: { type: "string", description: "Comando a executar" },
        cwd: { type: "string", description: "Pasta de execução. Padrão: pasta de trabalho do LOTUS. Use 'repo:' para o código-fonte do app." },
        timeout_seconds: { type: "number", description: "Tempo máximo (padrão 120, máx 600)" },
      },
      required: ["command"],
    },
  },
  {
    name: "read_file",
    description: "Lê um arquivo de texto (com números de linha). Caminho absoluto, 'repo:caminho' (código do LOTUS) ou relativo à pasta de trabalho.",
    parameters: {
      properties: {
        path: { type: "string" },
        offset: { type: "number", description: "Linha inicial (1 = primeira)" },
        limit: { type: "number", description: "Quantidade de linhas" },
      },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description: "Cria ou sobrescreve um arquivo inteiro. Para alterar um arquivo existente prefira edit_file. Um backup é feito automaticamente.",
    parameters: {
      properties: {
        path: { type: "string" },
        content: { type: "string", description: "Conteúdo completo do arquivo" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "edit_file",
    description:
      "Substitui um trecho exato de um arquivo existente. old_string deve ser copiado do arquivo (sem os números de linha) e ser único, ou use replace_all. Um backup é feito automaticamente.",
    parameters: {
      properties: {
        path: { type: "string" },
        old_string: { type: "string", description: "Trecho exato a substituir" },
        new_string: { type: "string", description: "Novo trecho" },
        replace_all: { type: "boolean", description: "Substituir todas as ocorrências" },
      },
      required: ["path", "old_string", "new_string"],
    },
  },
  {
    name: "list_dir",
    description: "Lista arquivos e pastas de um diretório.",
    parameters: { properties: { path: { type: "string", description: "Ex.: 'repo:apps/web/src' ou C:\\\\Users\\\\..." } }, required: ["path"] },
  },
  {
    name: "search_files",
    description: "Busca um texto/regex dentro dos arquivos de uma pasta (ignora node_modules e builds). Use para achar onde algo está definido no código.",
    parameters: {
      properties: {
        pattern: { type: "string", description: "Texto ou expressão regular" },
        path: { type: "string", description: "Pasta ou arquivo. Padrão: 'repo:'" },
        glob: { type: "string", description: "Filtro de extensão, ex.: '*.tsx'" },
      },
      required: ["pattern"],
    },
  },
  {
    name: "browser",
    description:
      "Controla um navegador real no computador (Chrome/Edge via Playwright): abre URL, lê o texto da página, clica, digita, tira screenshot.",
    parameters: {
      properties: {
        action: { type: "string", enum: ["open", "get_text", "click", "type", "screenshot", "close"] },
        url: { type: "string", description: "URL (action=open)" },
        selector: { type: "string", description: "Seletor CSS (click, type; opcional em get_text)" },
        text: { type: "string", description: "Texto a digitar (action=type)" },
      },
      required: ["action"],
    },
  },
  {
    name: "self_check",
    description: "Valida o código do próprio LOTUS após uma automodificação (checagem de tipos do app). Rode sempre depois de editar arquivos em 'repo:'.",
    parameters: { properties: {} },
  },
  {
    name: "undo_changes",
    description: "Desfaz as últimas alterações de arquivo feitas por write_file/edit_file, restaurando os backups.",
    parameters: {
      properties: { count: { type: "number", description: "Quantas alterações desfazer (padrão 1)" } },
    },
  },
];

const LOCAL_TOOL_NAMES = new Set(LOCAL_TOOL_DEFS.map((t) => t.name));
export const isLocalTool = (name: string) => LOCAL_TOOL_NAMES.has(name);

// Comandos que SEMPRE pedem confirmação, mesmo no modo autônomo.
const DESTRUCTIVE_PATTERNS: RegExp[] = [
  /\brm\s+(-\w*\s+)*-\w*[rf]/i,
  /\bremove-item\b[^|;]*-recurse/i,
  /\b(rd|rmdir)\s+\/s/i,
  /\bdel\s+(\/\w\s+)*\/[sq]/i,
  /\bformat(-volume)?\b/i,
  /\b(shutdown|restart-computer|stop-computer)\b/i,
  /\breg(\.exe)?\s+(delete|add)\b/i,
  /\bgit\s+(push\b.*(--force|-f\b)|reset\s+--hard|clean\s+-\w*[fd]|checkout\s+--\s|branch\s+-D)/i,
  /\bprisma\s+(migrate\s+reset|db\s+push\b.*--(force-reset|accept-data-loss))/i,
  /\bdrop\s+(table|database|schema)\b/i,
  /\btruncate\s+table\b/i,
  /\b(vercel|npm\s+publish|pnpm\s+publish)\b/i,
  /\b(net\s+user|set-executionpolicy|bcdedit|diskpart|cipher\s+\/w)\b/i,
  /\b(invoke-webrequest|iwr|curl|wget)\b[^|;]*\|\s*(iex|invoke-expression|sh|bash|powershell)/i,
];

export type ToolRisk = "safe" | "mutating" | "destructive";

export function classifyLocalTool(name: string, args: Record<string, unknown>): ToolRisk {
  switch (name) {
    case "read_file":
    case "list_dir":
    case "search_files":
    case "self_check":
      return "safe";
    case "browser": {
      const action = String(args.action ?? "");
      return action === "click" || action === "type" ? "mutating" : "safe";
    }
    case "run_command": {
      const command = String(args.command ?? "");
      return DESTRUCTIVE_PATTERNS.some((re) => re.test(command)) ? "destructive" : "mutating";
    }
    default:
      return "mutating";
  }
}

export function describeLocalTool(name: string, args: Record<string, unknown>): { title: string; detail: string } {
  const str = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v ?? ""));
  switch (name) {
    case "run_command":
      return { title: "Executar comando", detail: `${str(args.command)}${args.cwd ? `\n(em ${str(args.cwd)})` : ""}` };
    case "write_file":
      return { title: `Gravar arquivo ${str(args.path)}`, detail: str(args.content).slice(0, 1500) };
    case "edit_file":
      return {
        title: `Editar arquivo ${str(args.path)}`,
        detail: `- ${str(args.old_string).slice(0, 700)}\n+ ${str(args.new_string).slice(0, 700)}`,
      };
    case "read_file":
      return { title: `Ler ${str(args.path)}`, detail: "" };
    case "list_dir":
      return { title: `Listar ${str(args.path)}`, detail: "" };
    case "search_files":
      return { title: `Buscar "${str(args.pattern)}"`, detail: str(args.path ?? "repo:") };
    case "browser":
      return {
        title: `Navegador: ${str(args.action)}`,
        detail: [args.url, args.selector, args.text].filter(Boolean).map(str).join(" · "),
      };
    case "self_check":
      return { title: "Validar código do app", detail: "" };
    case "undo_changes":
      return { title: `Desfazer ${Number(args.count ?? 1)} alteração(ões)`, detail: "" };
    default:
      return { title: name, detail: JSON.stringify(args).slice(0, 500) };
  }
}

function clip(text: string, max = 12_000): string {
  if (text.length <= max) return text;
  const half = Math.floor(max / 2);
  return `${text.slice(0, half)}\n… [${text.length - max} caracteres omitidos] …\n${text.slice(-half)}`;
}

interface ExecResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  duration: number;
}

function formatExec(result: ExecResult): string {
  return clip(
    [
      `exit ${result.exitCode} (${result.duration}ms)`,
      result.stdout ? `--- saída ---\n${result.stdout.trimEnd()}` : "",
      result.stderr ? `--- erros ---\n${result.stderr.trimEnd()}` : "",
    ]
      .filter(Boolean)
      .join("\n")
  );
}

export async function executeLocalTool(name: string, args: Record<string, unknown>): Promise<string> {
  const runtime = createRuntimeClient();
  if (!(await runtime.available())) {
    return "Ferramenta local indisponível: o aplicativo LOTUS desktop não está aberto neste computador. Peça ao dono para abrir o app (pnpm app).";
  }

  switch (name) {
    case "run_command": {
      const timeoutMs = Math.min(Math.max(Number(args.timeout_seconds ?? 120), 1), 600) * 1000;
      const result = (await runtime.call(
        "/runtime/exec",
        { cmd: String(args.command ?? ""), cwd: args.cwd ? String(args.cwd) : undefined, timeoutMs },
        timeoutMs + 15_000
      )) as ExecResult;
      return formatExec(result);
    }
    case "read_file": {
      const result = (await runtime.call("/runtime/fs/read", {
        path: String(args.path ?? ""),
        offset: args.offset ? Number(args.offset) : undefined,
        limit: args.limit ? Number(args.limit) : undefined,
      })) as { content: string; totalLines: number; truncated: boolean };
      return clip(`${result.content}\n\n(${result.totalLines} linhas no total${result.truncated ? "; trecho parcial — use offset/limit" : ""})`, 60_000);
    }
    case "write_file": {
      const result = (await runtime.call("/runtime/fs/write", {
        path: String(args.path ?? ""),
        content: String(args.content ?? ""),
      })) as { path: string; created: boolean };
      return `Arquivo ${result.created ? "criado" : "sobrescrito (backup salvo)"}: ${result.path}`;
    }
    case "edit_file": {
      const result = (await runtime.call("/runtime/fs/edit", {
        path: String(args.path ?? ""),
        oldString: String(args.old_string ?? ""),
        newString: String(args.new_string ?? ""),
        replaceAll: !!args.replace_all,
      })) as { path: string; replacements: number };
      return `Editado ${result.path} (${result.replacements} substituição(ões); backup salvo).`;
    }
    case "list_dir": {
      const result = (await runtime.call("/runtime/fs/list", { path: String(args.path ?? "") })) as {
        path: string;
        entries: Array<{ name: string; type: string; size: number }>;
      };
      const lines = result.entries.map((e) => (e.type === "dir" ? `[pasta] ${e.name}/` : `${e.name} (${e.size} bytes)`));
      return `${result.path}\n${lines.join("\n") || "(vazio)"}`;
    }
    case "search_files": {
      const result = (await runtime.call("/runtime/fs/search", {
        pattern: String(args.pattern ?? ""),
        path: String(args.path ?? "repo:"),
        glob: args.glob ? String(args.glob) : undefined,
      })) as { matches: Array<{ file: string; line: number; text: string }>; truncated: boolean };
      if (result.matches.length === 0) return "Nenhuma ocorrência encontrada.";
      return clip(
        result.matches.map((m) => `${m.file}:${m.line}: ${m.text}`).join("\n") +
          (result.truncated ? "\n(resultado truncado — refine a busca)" : "")
      );
    }
    case "browser": {
      const action = String(args.action ?? "");
      const endpoint: Record<string, string> = {
        open: "/runtime/browser/open",
        get_text: "/runtime/browser/get-text",
        click: "/runtime/browser/click",
        type: "/runtime/browser/type",
        screenshot: "/runtime/browser/screenshot",
        close: "/runtime/browser/close",
      };
      if (!endpoint[action]) return `Ação de navegador desconhecida: ${action}`;
      const result = (await runtime.call(endpoint[action], {
        url: args.url ? String(args.url) : undefined,
        selector: args.selector ? String(args.selector) : undefined,
        text: args.text ? String(args.text) : undefined,
      })) as { text?: string; file?: string };
      if (action === "get_text") return clip(result.text ?? "", 20_000);
      if (action === "screenshot") return `Screenshot salvo em ${result.file}`;
      return `Navegador: "${action}" executado.`;
    }
    case "self_check": {
      const result = (await runtime.call(
        "/runtime/exec",
        {
          cmd: "pnpm exec tsc --noEmit --incremental false -p apps/web; pnpm exec tsc --noEmit -p packages/ai-engine",
          cwd: "repo:",
          timeoutMs: 300_000,
        },
        320_000
      )) as ExecResult;
      const output = `${result.stdout}\n${result.stderr}`.trim();
      // TS6053 = arquivo de tipos gerado pelo Next ainda não existe; não é erro do código
      const errors = output.split("\n").filter((l) => /error TS\d+/.test(l) && !l.includes("TS6053"));
      if (errors.length === 0) return "Código validado: nenhum erro de tipos.";
      return clip(`${errors.length} erro(s) de tipos:\n${errors.slice(0, 40).join("\n")}`);
    }
    case "undo_changes": {
      const result = (await runtime.call("/runtime/backups/restore", { count: Number(args.count ?? 1) })) as { restored: string[] };
      return result.restored.length ? `Restaurado: ${result.restored.join(", ")}` : "Nenhuma alteração para desfazer.";
    }
    default:
      return `Ferramenta local desconhecida: ${name}`;
  }
}

// Bloco de system prompt que descreve as capacidades locais (só quando o app desktop está aberto).
export async function buildLocalSystemPrompt(): Promise<string | null> {
  const runtime = createRuntimeClient();
  if (!(await runtime.available())) return null;
  let info: { platform?: string; shell?: string; workspaceDir?: string; repoDir?: string; hostname?: string } = {};
  try {
    info = (await runtime.call("/runtime/device-info", {}, 8000)) as typeof info;
  } catch {
    // segue com o que tiver
  }

  return `MODO APLICATIVO DESKTOP — VOCÊ É UMA CLI NO COMPUTADOR DO DONO
Você roda dentro do aplicativo LOTUS no computador de Ícaro e pode agir nele com as ferramentas: run_command, read_file, write_file, edit_file, list_dir, search_files, browser, self_check, undo_changes.
- Sistema: ${info.platform ?? "win32"} · shell: ${info.shell ?? "powershell.exe"} · máquina: ${info.hostname ?? "local"}
- Pasta de trabalho (arquivos gerados): ${info.workspaceDir ?? "~/LOTUS_Workspace"}
- Caminhos: absolutos valem como estão; "repo:..." aponta para o código-fonte do próprio LOTUS (${info.repoDir ?? "repositório do app"}); caminhos relativos partem da pasta de trabalho.
- Aja, não descreva: quando o dono pedir algo que as ferramentas resolvem, execute e relate o resultado com caminhos de arquivo.

AUTOMODIFICAÇÃO — O CÓDIGO DESTE APLICATIVO É SEU PARA ALTERAR
Quando o dono pedir para mudar a aparência, o comportamento ou a infraestrutura do LOTUS, altere o código em "repo:". Mapa:
- repo:apps/web/src/app/globals.css — tema e cores (variáveis CSS em HSL: --primary, --ring, --lotus-*, --chart-*)
- repo:apps/web/tailwind.config.ts — tokens de design
- repo:apps/web/src/app/(dashboard)/** — telas (uma pasta por menu) · repo:apps/web/src/components/** — componentes (sidebar, chat, HQ 3D)
- repo:apps/web/src/app/api/** — rotas do backend · repo:apps/web/src/lib/** — serviços (tarefas, ferramentas, runtime)
- repo:packages/ai-engine/src/** — motor de IA (provedores, executor de agentes, Root Master)
- repo:apps/desktop/src/** — aplicativo Electron e runtime local (mudanças exigem reiniciar o app)
- repo:apps/web/prisma/schema.prisma — banco de dados (migrações só com pedido explícito do dono)
Muitas telas usam classes de cor fixas do Tailwind (violet-*, purple-*, pink-*): para trocar a cor do app use search_files para achar todas e edite cada arquivo.
Regras de automodificação:
1. Leia o arquivo antes de editar; prefira edit_file a reescrever o arquivo inteiro.
2. Depois de alterar código, rode self_check e corrija qualquer erro antes de dizer que terminou.
3. Toda alteração gera backup: se algo quebrar, use undo_changes (o dono também tem "Desfazer última alteração" no menu do app).
4. Nunca leia nem altere arquivos .env, chaves ou credenciais (o runtime bloqueia).
5. Nada de comandos destrutivos (apagar em massa, reset de git ou banco, deploy, push forçado) sem pedido explícito do dono.
6. A interface recarrega sozinha após salvar (hot reload).
7. Ao final, liste os arquivos alterados.`;
}
