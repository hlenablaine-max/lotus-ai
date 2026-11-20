import { runningCount } from "@/lib/task-runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Só responde se algum agente está trabalhando agora neste servidor (sem nenhum outro dado).
// O app desktop consulta antes de trocar o servidor pela versão recompilada.
export async function GET() {
  return Response.json({ busy: runningCount() > 0 });
}
