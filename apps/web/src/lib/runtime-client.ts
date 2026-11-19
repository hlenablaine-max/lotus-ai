// Cliente do runtime local do app desktop LOTUS.
// O app grava porta + token em ~/LOTUS_Workspace/.runtime-port; sem o app aberto, nada aqui funciona.

import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const PORT_FILE = path.join(os.homedir(), "LOTUS_Workspace", ".runtime-port");

interface RuntimeConfig {
  port: number;
  token: string;
  repoDir?: string;
}

function readConfig(): RuntimeConfig | null {
  try {
    if (!fs.existsSync(PORT_FILE)) return null;
    return JSON.parse(fs.readFileSync(PORT_FILE, "utf-8"));
  } catch {
    return null;
  }
}

export interface RuntimeClient {
  call(endpoint: string, data?: Record<string, unknown>, timeoutMs?: number): Promise<unknown>;
  available(): Promise<boolean>;
}

export function createRuntimeClient(): RuntimeClient {
  return {
    async call(endpoint: string, data?: Record<string, unknown>, timeoutMs = 630_000): Promise<unknown> {
      const cfg = readConfig();
      if (!cfg) throw new Error("O aplicativo LOTUS desktop não está aberto (runtime local indisponível)");
      const res = await fetch(`http://127.0.0.1:${cfg.port}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Runtime-Token": cfg.token,
        },
        body: JSON.stringify(data ?? {}),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        const text = await res.text();
        let message = text;
        try {
          message = (JSON.parse(text) as { error?: string }).error ?? text;
        } catch {
          // resposta não-JSON
        }
        throw new Error(message || `Runtime error ${res.status}`);
      }
      return res.json();
    },
    async available(): Promise<boolean> {
      const cfg = readConfig();
      if (!cfg) return false;
      try {
        const res = await fetch(`http://127.0.0.1:${cfg.port}/ping`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Runtime-Token": cfg.token },
          body: "{}",
          signal: AbortSignal.timeout(2500),
        });
        return res.ok;
      } catch {
        return false;
      }
    },
  };
}
