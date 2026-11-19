// Informa à interface se o aplicativo desktop (runtime local) está aberto.
// De propósito NÃO existe um proxy genérico para o runtime: ações locais só passam
// pelas ferramentas do chat e das tarefas, com permissão e registro de auditoria.

import { createRuntimeClient } from "@/lib/runtime-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const available = await createRuntimeClient().available();
  return Response.json({ available });
}
