// Runtime client — reads ~/LOTUS_Workspace/.runtime-port and calls RuntimeHttpServer
// Only works when the LOTUS desktop app is running.

import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const PORT_FILE = path.join(os.homedir(), "LOTUS_Workspace", ".runtime-port");

function readConfig(): { port: number; token: string } | null {
  try {
    if (!fs.existsSync(PORT_FILE)) return null;
    return JSON.parse(fs.readFileSync(PORT_FILE, "utf-8"));
  } catch {
    return null;
  }
}

export interface RuntimeClient {
  call(endpoint: string, data?: Record<string, unknown>): Promise<unknown>;
  available(): Promise<boolean>;
}

export function createRuntimeClient(): RuntimeClient {
  return {
    async call(endpoint: string, data?: Record<string, unknown>): Promise<unknown> {
      const cfg = readConfig();
      if (!cfg) throw new Error("LOTUS desktop app não está rodando (runtime indisponível)");
      const res = await fetch(`http://127.0.0.1:${cfg.port}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Runtime-Token": cfg.token,
        },
        body: JSON.stringify(data ?? {}),
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Runtime error ${res.status}: ${err}`);
      }
      return res.json();
    },
    async available(): Promise<boolean> {
      const cfg = readConfig();
      if (!cfg) return false;
      try {
        const res = await fetch(`http://127.0.0.1:${cfg.port}/ping`, {
          method: "GET",
          headers: { "X-Runtime-Token": cfg.token },
        });
        return res.ok;
      } catch {
        return false;
      }
    },
  };
}
