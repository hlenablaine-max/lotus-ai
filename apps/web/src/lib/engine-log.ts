import { prisma } from "@/lib/prisma";

export type EngineOutcome = "started" | "completed" | "demo" | "failed";

// Audit trail for engine runs. Never throws: logging must not break an engine.
export async function logEngineRun(
  engine: string,
  clientName: string,
  outcome: EngineOutcome,
  extra?: Record<string, unknown>
): Promise<void> {
  try {
    const slug = engine.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
    await prisma.activityLog.create({
      data: {
        action: `ENGINE_${slug}_${outcome.toUpperCase()}`,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        details: { engine, clientName, ...(extra ?? {}) } as any,
        level: outcome === "failed" ? "ERROR" : outcome === "demo" ? "WARN" : "INFO",
      },
    });
  } catch (err) {
    console.warn("[engine-log] falha ao registrar execução de motor:", err);
  }
}
