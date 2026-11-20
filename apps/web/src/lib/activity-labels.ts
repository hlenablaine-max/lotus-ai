// Códigos do registro de atividade (ActivityLog) → frases em português. Usado em Atividade e Métricas.

const ACTION_LABELS: Record<string, string> = {
  TASK_CREATED: "Tarefa criada",
  TASK_STARTED: "Tarefa iniciada",
  TASK_COMPLETED: "Tarefa concluída",
  TASK_FAILED: "Tarefa falhou",
  TASK_RESUMED: "Tarefa retomada depois de interrupção",
  TASK_INTERRUPTED: "Tarefa interrompida",
  MISSION_CREATED: "Missão criada",
  CLIENT_CREATED: "Cliente criado",
  CLIENT_ASSESSMENT_CREATED: "Avaliação de preço registrada",
  APPROVAL_REQUESTED: "Aprovação pedida",
  APPROVAL_APPROVED: "Aprovação concedida",
  APPROVAL_REJECTED: "Aprovação recusada",
  APPROVED: "Aprovação concedida",
  APPROVED_ACTION_EXECUTED: "Ação aprovada executada",
  APPROVED_ACTION_SKIPPED: "Ação aprovada não executada",
  ADVISOR_CONSULTED: "Advisor consultado",
  DIAGNOSIS_STARTED: "Diagnóstico 360 iniciado",
  DIAGNOSIS_DATA_COLLECTED: "Dados públicos coletados",
  DIAGNOSIS_FAILED: "Diagnóstico falhou",
  DIAGNOSIS_RESUMED: "Diagnóstico retomado",
  SITE_PUBLISHED: "Site publicado na Vercel",
  SITE_REDO: "Site enviado para refazer",
  SITE_HTML_REDO: "Site refeito (página veio cortada)",
  WHATSAPP_PROBE_RESULT: "Teste de atendimento no WhatsApp concluído",
  WHATSAPP_PROBE_SKIPPED: "Teste de WhatsApp pulado",
  LOCAL_TOOL: "Ação no computador",
};

const ENGINE_NAMES: Record<string, string> = {
  INTELLIGENCE: "Inteligência",
  INVESTIGATION: "Investigação",
  DIAGNOSIS: "Diagnóstico",
  STRATEGY: "Estratégia",
  SOLUTION_ARCH: "Arquitetura de Soluções",
  BUILD: "Produção",
  IMPLEMENTATION: "Implementação",
  REVENUE: "Receita",
};

const ENGINE_OUTCOME: Record<string, string> = {
  STARTED: "iniciado",
  COMPLETED: "concluído",
  DEMO: "respondeu com dados de demonstração (antigo)",
  FAILED: "falhou",
};

export function describeAction(action: string, details?: Record<string, unknown> | null): string {
  const client = typeof details?.clientName === "string" && details.clientName ? ` — ${details.clientName}` : "";
  const m = action.match(/^ENGINE_(.+)_(STARTED|COMPLETED|DEMO|FAILED)$/);
  if (m) return `Motor de ${ENGINE_NAMES[m[1]] ?? m[1].toLowerCase().replace(/_/g, " ")} ${ENGINE_OUTCOME[m[2]]}${client}`;
  if (ACTION_LABELS[action]) return ACTION_LABELS[action];
  // Código desconhecido: vira frase legível ("SOME_THING" → "Some thing")
  const text = action.toLowerCase().replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// Resumo curto dos detalhes (em vez de JSON cru)
export function summarizeDetails(details: unknown): string {
  if (!details || typeof details !== "object") return "";
  const d = details as Record<string, unknown>;
  const pick = ["title", "taskTitle", "missionTitle", "clientName", "handle", "url", "siteUrl", "motivo", "reason", "error", "status", "agent", "agentName", "score"];
  const parts: string[] = [];
  for (const key of pick) {
    const v = d[key];
    if (v === undefined || v === null || v === "" || typeof v === "object") continue;
    const label: Record<string, string> = { title: "", taskTitle: "", missionTitle: "Missão", clientName: "Cliente", handle: "Perfil", url: "Link", siteUrl: "Site", motivo: "Motivo", reason: "Motivo", error: "Erro", status: "Situação", agent: "Agente", agentName: "Agente", score: "Nota" };
    parts.push(label[key] ? `${label[key]}: ${String(v)}` : String(v));
    if (parts.length >= 4) break;
  }
  return parts.join(" · ").slice(0, 300);
}
