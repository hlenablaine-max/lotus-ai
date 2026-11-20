// Instagram da clínica pela conta do ManyChat (parceiro oficial da Meta).
// - Conectar: a LOTUS confere a chave da API e guarda criptografada.
// - Receber: o ManyChat repassa cada DM (ação "External Request") para o endereço da LOTUS com um token secreto;
//   a mensagem vira conversa no Atendimento com o canal "instagram".
// - Responder: a LOTUS manda pela API do ManyChat (só dentro de 24 h da última mensagem da pessoa, regra da Meta).
import * as crypto from "crypto";
import { prisma } from "@/lib/prisma";

const API = "https://api.manychat.com";

function keyBytes(): Buffer {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "lotus-local";
  return crypto.createHash("sha256").update(`manychat:${secret}`).digest();
}

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", keyBytes(), iv);
  const enc = Buffer.concat([c.update(text, "utf8"), c.final()]);
  return [iv.toString("base64"), c.getAuthTag().toString("base64"), enc.toString("base64")].join(".");
}

export function decrypt(blob: string): string {
  const [iv, tag, data] = blob.split(".").map((p) => Buffer.from(p, "base64"));
  const d = crypto.createDecipheriv("aes-256-gcm", keyBytes(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString("utf8");
}

async function call(apiKey: string, method: "GET" | "POST", pathname: string, body?: unknown) {
  const res = await fetch(`${API}${pathname}`, {
    method,
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const data = (await res.json().catch(() => ({}))) as { status?: string; data?: Record<string, unknown>; message?: string; details?: unknown };
  if (!res.ok || data.status === "error") throw new Error(`ManyChat: ${data.message ?? `erro ${res.status}`}${data.details ? ` (${JSON.stringify(data.details).slice(0, 200)})` : ""}`);
  return data;
}

// Confere a chave e liga o Instagram da clínica
export async function connectManychat(clientId: string, apiKey: string) {
  const key = apiKey.trim();
  if (key.length < 20) throw new Error("Essa chave parece incompleta. Copie de novo em ManyChat > Configurações > API.");
  const info = await call(key, "GET", "/fb/page/getInfo");
  const d = info.data ?? {};
  const pageName = String(d.name ?? "") || null;
  const igUsername = String(d.ig_username ?? d.instagram_username ?? "") || null;
  const existing = await prisma.manychatAccount.findUnique({ where: { clientId } });
  const token = existing?.inboundToken ?? crypto.randomBytes(18).toString("base64url");
  await prisma.manychatAccount.upsert({
    where: { clientId },
    create: { clientId, apiKeyEnc: encrypt(key), pageName, igUsername, inboundToken: token, status: "conectado" },
    update: { apiKeyEnc: encrypt(key), pageName, igUsername, status: "conectado" },
  });
  return { pageName, igUsername, inboundToken: token };
}

export async function sendInstagram(clientId: string, subscriberId: string, text: string) {
  const acc = await prisma.manychatAccount.findUnique({ where: { clientId } });
  if (!acc || acc.status !== "conectado") throw new Error("O Instagram (ManyChat) deste cliente não está conectado.");
  let apiKey: string;
  try {
    apiKey = decrypt(acc.apiKeyEnc);
  } catch {
    throw new Error("A chave do ManyChat deste cliente não pode ser lida. Conecte o Instagram de novo na aba Atendimento.");
  }
  await call(apiKey, "POST", "/fb/sending/sendContent", {
    subscriber_id: Number(subscriberId) || subscriberId,
    data: { version: "v2", content: { type: "instagram", messages: [{ type: "text", text }] } },
  });
}

// Lê o que o ManyChat mandou (com "Adicionar dados completos do contato" ligado ou com os campos do modelo da LOTUS)
export function parseManychatPayload(body: Record<string, unknown>) {
  const contact = (body.contact ?? body.subscriber ?? body) as Record<string, unknown>;
  const id = String(contact.id ?? body.subscriber_id ?? body.user_id ?? "").trim();
  const text = String(body.text ?? body.last_input_text ?? contact.last_input_text ?? body.message ?? "").trim();
  const first = String(contact.first_name ?? "").trim();
  const last = String(contact.last_name ?? "").trim();
  const name = String(contact.name ?? body.name ?? `${first} ${last}`).trim() || null;
  const ig = String(contact.ig_username ?? body.ig_username ?? "").replace(/^@/, "").trim() || null;
  const phone = String(contact.phone ?? contact.whatsapp_phone ?? "").replace(/\D/g, "") || null;
  return { id, text, name: name ?? (ig ? `@${ig}` : null), ig, phone };
}
