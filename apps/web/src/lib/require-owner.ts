import { headers } from "next/headers";
import { auth } from "@/auth";
import { currentRole, type TeamRole } from "@/lib/team";

// Segunda barreira (além do middleware) para as rotas da API. Confere no banco, a cada pedido, se a pessoa
// ainda está ativa e qual é o papel dela (desativar alguém corta o acesso na hora):
//  VIEWER → só leitura (GET); ADMIN → tudo, menos equipe e chaves de integração; OWNER → tudo.
export async function requireOwner(): Promise<{ email: string; role: TeamRole } | Response> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return Response.json({ error: "Não autenticado" }, { status: 401 });
  const role = await currentRole(email).catch(() => null);
  if (!role) return Response.json({ error: "Seu acesso foi desativado. Fale com o dono da LOTUS." }, { status: 401 });
  const h = await headers();
  const method = (h.get("x-lotus-method") ?? "GET").toUpperCase();
  const path = h.get("x-lotus-path") ?? "";
  if (role === "VIEWER" && method !== "GET" && method !== "HEAD") {
    return Response.json({ error: "Seu acesso é só de visualização." }, { status: 403 });
  }
  if (role === "ADMIN" && method !== "GET" && /^\/api\/(team|integrations|settings)(\/|$)/.test(path)) {
    return Response.json({ error: "Só o dono altera a equipe e as chaves de integração." }, { status: 403 });
  }
  return { email, role };
}

// Rotas que só o dono pode usar (equipe)
export async function requireRole(roles: TeamRole[]): Promise<{ email: string; role: TeamRole } | Response> {
  const r = await requireOwner();
  if (r instanceof Response) return r;
  if (!roles.includes(r.role)) return Response.json({ error: "Só o dono pode fazer isso." }, { status: 403 });
  return r;
}
