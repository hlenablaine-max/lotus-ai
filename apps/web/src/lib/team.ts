// Equipe da LOTUS: além do dono (definido no .env.local), pessoas com login próprio e um papel:
//  ADMIN  → usa tudo, menos gerenciar a equipe e as chaves de integração
//  VIEWER → só olha (não envia, não aprova, não altera nada)
// A senha é guardada só como hash scrypt (não dá para ler de volta). A senha provisória aparece uma única vez.
import * as crypto from "crypto";
import { prisma } from "@/lib/prisma";

export type TeamRole = "OWNER" | "ADMIN" | "VIEWER";
export const ROLE_LABEL: Record<TeamRole, string> = { OWNER: "Dono", ADMIN: "Administrador", VIEWER: "Só visualiza" };

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored?.startsWith("scrypt$")) return false;
  const [, saltB64, hashB64] = stored.split("$");
  const expected = Buffer.from(hashB64, "base64");
  const got = crypto.scryptSync(password, Buffer.from(saltB64, "base64"), expected.length);
  return crypto.timingSafeEqual(expected, got);
}

// Senha provisória legível (sem letras parecidas), para o dono passar para a pessoa
function tempPassword(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(12);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("").replace(/(.{4})(?=.)/g, "$1-");
}

export function isEnvOwner(email: string): boolean {
  const e = email.trim().toLowerCase();
  return [process.env.OWNER_EMAIL, process.env.PARTNER_EMAIL].some((x) => x && x.trim().toLowerCase() === e);
}

export async function listTeam() {
  const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, name: true, email: true, role: true, active: true, lastLoginAt: true, createdAt: true, passwordHash: true } });
  return users.map(({ passwordHash, ...u }) => ({ ...u, envOwner: isEnvOwner(u.email), hasPassword: !!passwordHash }));
}

export async function addMember(input: { name: string; email: string; role: TeamRole }): Promise<{ id: string; tempPassword: string }> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("E-mail inválido");
  if (isEnvOwner(email)) throw new Error("Esse e-mail já é o dono do sistema");
  if (input.role === "OWNER") throw new Error("Só existe um dono; escolha Administrador ou Só visualiza");
  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists?.passwordHash) throw new Error("Já existe alguém com esse e-mail na equipe");
  const pwd = tempPassword();
  const u = await prisma.user.upsert({
    where: { email },
    update: { name: input.name.trim() || null, role: input.role, passwordHash: hashPassword(pwd), active: true },
    create: { email, name: input.name.trim() || null, role: input.role, passwordHash: hashPassword(pwd), active: true },
  });
  return { id: u.id, tempPassword: pwd };
}

export async function updateMember(id: string, data: { role?: TeamRole; active?: boolean; resetPassword?: boolean }): Promise<{ tempPassword?: string }> {
  const u = await prisma.user.findUnique({ where: { id } });
  if (!u) throw new Error("Pessoa não encontrada");
  if (isEnvOwner(u.email)) throw new Error("O dono é configurado no próprio computador e não pode ser alterado aqui");
  if (data.role === "OWNER") throw new Error("Só existe um dono");
  let pwd: string | undefined;
  if (data.resetPassword) pwd = tempPassword();
  await prisma.user.update({
    where: { id },
    data: { ...(data.role ? { role: data.role } : {}), ...(typeof data.active === "boolean" ? { active: data.active } : {}), ...(pwd ? { passwordHash: hashPassword(pwd) } : {}) },
  });
  return pwd ? { tempPassword: pwd } : {};
}

// Login de quem é da equipe (o dono continua entrando pelas credenciais do .env.local)
export async function authenticateMember(email: string, password: string): Promise<{ id: string; email: string; name: string; role: TeamRole } | null> {
  const u = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!u || !u.active || !verifyPassword(password, u.passwordHash)) return null;
  await prisma.user.update({ where: { id: u.id }, data: { lastLoginAt: new Date() } }).catch(() => undefined);
  return { id: u.id, email: u.email, name: u.name ?? u.email, role: u.role as TeamRole };
}

// Antes de cada pedido: a pessoa ainda está ativa e com o mesmo papel? (desativar tira o acesso na hora)
export async function currentRole(email: string): Promise<TeamRole | null> {
  if (isEnvOwner(email)) return "OWNER";
  const u = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() }, select: { role: true, active: true, passwordHash: true } });
  if (!u || !u.active || !u.passwordHash) return null;
  return u.role as TeamRole;
}
