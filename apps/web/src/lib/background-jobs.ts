// Trabalhos de fundo que não podem ser cortados no meio (busca de clínicas, site grátis...).
// Enquanto houver algum, o servidor diz "ocupado" e o app de PC não troca de versão.
const g = globalThis as unknown as { __lotusBgJobs?: Map<string, number> };
const jobs = (g.__lotusBgJobs ??= new Map());

export function beginJob(name: string): string {
  const id = `${name}:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  jobs.set(id, Date.now());
  return id;
}

export function endJob(id: string): void {
  jobs.delete(id);
}

// Trabalho esquecido há mais de 1 hora não segura o servidor para sempre
export function backgroundCount(): number {
  const now = Date.now();
  for (const [id, at] of jobs) if (now - at > 3_600_000) jobs.delete(id);
  return jobs.size;
}

export async function asJob<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const id = beginJob(name);
  try {
    return await fn();
  } finally {
    endJob(id);
  }
}
