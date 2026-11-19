import { auth } from "@/auth";

// Segunda barreira (além do middleware) para rotas que executam ações sensíveis.
export async function requireOwner(): Promise<{ email: string } | Response> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return Response.json({ error: "Não autenticado" }, { status: 401 });
  return { email };
}
