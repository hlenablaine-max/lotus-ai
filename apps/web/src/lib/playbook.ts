// Bloco de dados do Playbook de Faturamento: o estrategista coloca um ```json no fim do relatório
// com notas, gargalos e próximos passos. Usado na tela (report-view) e no PDF do cliente.

export interface Gargalo {
  titulo: string;
  problema?: string;
  prova?: string;
  porQueCusta?: string;
  oQueFazer?: string;
  impacto?: string;
  gravidade?: string;
}

export interface Placar {
  notaGeral?: number;
  notas?: Array<{ area: string; nota: number; motivo?: string }>;
  gargalos?: Gargalo[];
  ganhoPotencial?: string;
  proximosPassos?: string[];
}

export function parseReport(content: string): { placar: Placar | null; text: string } {
  const blocks = [...content.matchAll(/```json\s*\n([\s\S]*?)```/gi)];
  for (const block of blocks.reverse()) {
    try {
      const data = JSON.parse(block[1]) as Placar;
      if (data && (data.notas || data.gargalos)) return { placar: data, text: content.replace(block[0], "").trim() };
    } catch {
      /* bloco inválido: tenta o anterior */
    }
  }
  return { placar: null, text: content };
}
