import { runningCount } from "@/lib/task-runner";
import { backgroundCount } from "@/lib/background-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Só responde se algum agente ou trabalho de fundo (busca de clínicas, site grátis) está rodando agora (sem nenhum outro dado).
// O app desktop consulta antes de trocar o servidor pela versão recompilada.
export async function GET() {
  return Response.json({ busy: runningCount() > 0 || backgroundCount() > 0 });
}
