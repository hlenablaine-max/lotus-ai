// Agenda real de cada clínica, para a IA não marcar em cima de outro paciente.
// Dois jeitos de conectar:
//  1) Link secreto iCal da Google Agenda (só leitura): a clínica copia e cola; a IA passa a ver os horários ocupados.
//  2) Conexão Google (OAuth): a LOTUS manda um link, a clínica clica em "Permitir"; a IA vê os ocupados e
//     também marca a consulta na agenda. O Google devolve a autorização para o recebedor público na Vercel
//     (assinada com um segredo só nosso), e o app troca pelo acesso aqui no PC.
import * as crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/manychat";
import { notify } from "@/lib/notify";
import { integrationValue } from "@lotus/ai-engine";

const SCOPES = ["openid", "email", "https://www.googleapis.com/auth/calendar.events", "https://www.googleapis.com/auth/calendar.freebusy"];
const STATE_TTL_MS = 7 * 86_400_000; // o link vale 7 dias

export type Busy = { start: number; end: number };

function googleCreds(): { clientId: string; clientSecret: string } | null {
  const clientId = integrationValue("google-calendar", "clientId", "GOOGLE_OAUTH_CLIENT_ID");
  const clientSecret = integrationValue("google-calendar", "clientSecret", "GOOGLE_OAUTH_CLIENT_SECRET");
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}
function relayBase(): string | null {
  const u = process.env.LOTUS_PUBLIC_URL?.trim().replace(/\/+$/, "");
  return u || null;
}
export function googleRedirectUri(): string | null {
  const base = relayBase();
  return base ? `${base}/api/google/callback` : null;
}
function relaySecret(): string {
  const s = process.env.LOTUS_RELAY_SECRET;
  if (!s || s.length < 32) throw new Error("Falta o segredo do recebedor (LOTUS_RELAY_SECRET) no .env.local.");
  return s;
}
const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");
function sign(payload: string): string {
  return crypto.createHmac("sha256", relaySecret()).update(payload).digest("base64url");
}
function makeState(clientId: string): string {
  const payload = b64url(JSON.stringify({ c: clientId, n: crypto.randomBytes(9).toString("base64url"), e: Date.now() + STATE_TTL_MS }));
  return `${payload}.${sign(payload)}`;
}
function readState(state: string): { c: string } {
  const [payload, sig] = String(state).split(".");
  if (!payload || !sig) throw new Error("Autorização sem assinatura");
  const expected = sign(payload);
  if (expected.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) throw new Error("Assinatura inválida");
  const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8")) as { c: string; e: number };
  if (!data.e || data.e < Date.now()) throw new Error("O link de conexão expirou: gere outro");
  return data;
}

export interface CalendarStatus {
  kind: "ics" | "google" | null;
  status: string;
  googleEmail: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  canWrite: boolean;
  googleReady: boolean; // a LOTUS já tem as credenciais do Google configuradas
  redirectUri: string | null;
}

export async function calendarStatus(clientId: string): Promise<CalendarStatus> {
  const cal = await prisma.clientCalendar.findUnique({ where: { clientId } });
  return {
    kind: (cal?.kind as "ics" | "google" | undefined) ?? null,
    status: cal?.status ?? "desconectado",
    googleEmail: cal?.googleEmail ?? null,
    lastSyncAt: cal?.lastSyncAt?.toISOString() ?? null,
    lastError: cal?.lastError ?? null,
    canWrite: cal?.kind === "google" && cal.status === "conectado",
    googleReady: !!googleCreds() && !!googleRedirectUri() && !!process.env.LOTUS_RELAY_SECRET,
    redirectUri: googleRedirectUri(),
  };
}

// === 1) Link secreto iCal ===

async function fetchIcs(url: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000), headers: { "User-Agent": "LOTUS-Agenda/1.0" } });
  if (!res.ok) throw new Error(`A agenda respondeu ${res.status}. Confira se copiou o "endereço secreto no formato iCal".`);
  const text = await res.text();
  if (!text.includes("BEGIN:VCALENDAR")) throw new Error("Esse link não é de uma agenda (iCal).");
  return text;
}

export async function connectIcs(clientId: string, rawUrl: string): Promise<{ events: number }> {
  const url = rawUrl.trim().replace(/^webcal:\/\//i, "https://");
  if (!/^https:\/\//i.test(url)) throw new Error("Cole o link completo, começando com https://");
  const text = await fetchIcs(url);
  const busy = busyFromIcs(text, Date.now(), Date.now() + 30 * 86_400_000);
  await prisma.clientCalendar.upsert({
    where: { clientId },
    update: { kind: "ics", icsUrlEnc: encrypt(url), refreshTokenEnc: null, googleEmail: null, status: "conectado", lastSyncAt: new Date(), lastError: null },
    create: { clientId, kind: "ics", icsUrlEnc: encrypt(url), status: "conectado", lastSyncAt: new Date() },
  });
  cache.delete(clientId);
  return { events: busy.length };
}

export function busyFromIcs(text: string, from: number, to: number): Busy[] {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ical = require("node-ical") as typeof import("node-ical");
  const data = ical.sync.parseICS(text);
  const out: Busy[] = [];
  for (const k of Object.keys(data)) {
    const ev = data[k] as import("node-ical").VEvent;
    if (ev.type !== "VEVENT" || !ev.start) continue;
    if (ev.status === "CANCELLED" || ev.transparency === "TRANSPARENT") continue;
    const start = new Date(ev.start).getTime();
    const end = ev.end ? new Date(ev.end).getTime() : start + 3600_000;
    const dur = Math.max(5 * 60_000, end - start);
    const allDay = ev.datetype === "date";
    if (allDay) continue; // dia inteiro (feriado, aniversário) não bloqueia horário de consulta
    if (ev.rrule) {
      const ex = new Set(Object.values((ev.exdate ?? {}) as Record<string, Date>).map((d) => new Date(d).getTime()));
      // A regra de repetição devolve o "horário de parede" como se fosse UTC: corrige pelo deslocamento do 1º evento
      const ruleStart = (ev.rrule.options?.dtstart as Date | undefined)?.getTime() ?? start;
      const shift = start - ruleStart;
      for (const d of ev.rrule.between(new Date(from - dur - Math.abs(shift)), new Date(to + Math.abs(shift)), true)) {
        const t = d.getTime() + shift;
        if (t + dur <= from || t >= to) continue;
        if (ex.has(t)) continue;
        out.push({ start: t, end: t + dur });
      }
      for (const r of Object.values(ev.recurrences ?? {})) {
        if (!r.start || r.status === "CANCELLED") continue;
        const s = new Date(r.start).getTime();
        const e = r.end ? new Date(r.end).getTime() : s + dur;
        if (e > from && s < to) out.push({ start: s, end: e });
      }
    } else if (end > from && start < to) {
      out.push({ start, end });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

// === 2) Conexão Google ===

export async function googleConnectLink(clientId: string): Promise<string> {
  const creds = googleCreds();
  const redirect = googleRedirectUri();
  if (!creds) throw new Error("Configure a Google Agenda em Integrações (ID e segredo do cliente OAuth) antes de gerar o link.");
  if (!redirect) throw new Error("Falta o endereço público do recebedor (LOTUS_PUBLIC_URL).");
  const p = new URLSearchParams({
    client_id: creds.clientId,
    redirect_uri: redirect,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: makeState(clientId),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p.toString()}`;
}

// Chega pelo recebedor (fila inbound_events, origem google_oauth)
export async function handleGoogleOAuth(payload: Record<string, unknown>): Promise<{ ok: boolean; reason?: string }> {
  const creds = googleCreds();
  const redirect = googleRedirectUri();
  if (!creds || !redirect) return { ok: false, reason: "Google Agenda não configurada em Integrações" };
  const { c: clientId } = readState(String(payload.state ?? ""));
  if (payload.error) {
    await prisma.clientCalendar.upsert({ where: { clientId }, update: { status: "erro", lastError: `A clínica não autorizou (${String(payload.error)})` }, create: { clientId, kind: "google", status: "erro", lastError: `A clínica não autorizou (${String(payload.error)})` } });
    return { ok: false, reason: String(payload.error) };
  }
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code: String(payload.code ?? ""), client_id: creds.clientId, client_secret: creds.clientSecret, redirect_uri: redirect, grant_type: "authorization_code" }),
    signal: AbortSignal.timeout(20_000),
  });
  const tok = (await res.json().catch(() => ({}))) as { refresh_token?: string; access_token?: string; expires_in?: number; id_token?: string; error_description?: string; error?: string };
  if (!res.ok || !tok.refresh_token) {
    const why = tok.error_description ?? tok.error ?? `HTTP ${res.status}`;
    await prisma.clientCalendar.upsert({ where: { clientId }, update: { status: "erro", lastError: `Google recusou: ${why}` }, create: { clientId, kind: "google", status: "erro", lastError: `Google recusou: ${why}` } });
    return { ok: false, reason: why };
  }
  let email: string | null = null;
  try {
    email = (JSON.parse(Buffer.from(String(tok.id_token).split(".")[1], "base64url").toString("utf-8")) as { email?: string }).email ?? null;
  } catch {
    /* sem e-mail */
  }
  await prisma.clientCalendar.upsert({
    where: { clientId },
    update: { kind: "google", refreshTokenEnc: encrypt(tok.refresh_token), icsUrlEnc: null, googleEmail: email, calendarId: "primary", status: "conectado", lastSyncAt: new Date(), lastError: null },
    create: { clientId, kind: "google", refreshTokenEnc: encrypt(tok.refresh_token), googleEmail: email, status: "conectado", lastSyncAt: new Date() },
  });
  tokens.set(clientId, { token: tok.access_token!, until: Date.now() + (tok.expires_in ?? 3600) * 1000 - 60_000 });
  cache.delete(clientId);
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { name: true } });
  await notify({ kind: "sistema", title: `Agenda conectada: ${client?.name.split("|")[0].trim() ?? "clínica"}`, body: `A Google Agenda${email ? ` de ${email}` : ""} foi conectada. A IA agora vê os horários ocupados e marca as consultas nela.`, href: `/clients/${clientId}?tab=attendance`, clientId });
  return { ok: true };
}

const tokens = new Map<string, { token: string; until: number }>();
async function googleAccess(clientId: string): Promise<{ token: string; calendarId: string }> {
  const cal = await prisma.clientCalendar.findUnique({ where: { clientId } });
  if (!cal?.refreshTokenEnc) throw new Error("Agenda Google não conectada");
  const hit = tokens.get(clientId);
  if (hit && hit.until > Date.now()) return { token: hit.token, calendarId: cal.calendarId };
  const creds = googleCreds();
  if (!creds) throw new Error("Google Agenda não configurada em Integrações");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ refresh_token: decrypt(cal.refreshTokenEnc), client_id: creds.clientId, client_secret: creds.clientSecret, grant_type: "refresh_token" }),
    signal: AbortSignal.timeout(20_000),
  });
  const tok = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!res.ok || !tok.access_token) {
    const why = tok.error === "invalid_grant" ? "A clínica tirou a permissão ou trocou a senha: mande o link de conexão de novo." : tok.error_description ?? tok.error ?? `HTTP ${res.status}`;
    await prisma.clientCalendar.update({ where: { clientId }, data: { status: "erro", lastError: why } });
    throw new Error(why);
  }
  tokens.set(clientId, { token: tok.access_token, until: Date.now() + (tok.expires_in ?? 3600) * 1000 - 60_000 });
  return { token: tok.access_token, calendarId: cal.calendarId };
}

// === Uso pela IA ===

const cache = new Map<string, { at: number; from: number; to: number; busy: Busy[] }>();

// Horários ocupados na agenda real da clínica (cache de 5 minutos). Sem agenda conectada: lista vazia.
export async function calendarBusy(clientId: string, from: number, to: number): Promise<Busy[]> {
  const hit = cache.get(clientId);
  if (hit && Date.now() - hit.at < 5 * 60_000 && hit.from <= from && hit.to >= to) return hit.busy;
  const cal = await prisma.clientCalendar.findUnique({ where: { clientId } });
  if (!cal || cal.status === "desconectado") return [];
  try {
    let busy: Busy[] = [];
    if (cal.kind === "ics" && cal.icsUrlEnc) {
      busy = busyFromIcs(await fetchIcs(decrypt(cal.icsUrlEnc)), from, to);
    } else if (cal.kind === "google") {
      const { token, calendarId } = await googleAccess(clientId);
      const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ timeMin: new Date(from).toISOString(), timeMax: new Date(to).toISOString(), items: [{ id: calendarId }] }),
        signal: AbortSignal.timeout(20_000),
      });
      const d = (await res.json().catch(() => ({}))) as { calendars?: Record<string, { busy?: Array<{ start: string; end: string }> }>; error?: { message?: string } };
      if (!res.ok) throw new Error(d.error?.message ?? `HTTP ${res.status}`);
      busy = (d.calendars?.[calendarId]?.busy ?? []).map((b) => ({ start: new Date(b.start).getTime(), end: new Date(b.end).getTime() }));
    }
    cache.set(clientId, { at: Date.now(), from, to, busy });
    await prisma.clientCalendar.update({ where: { clientId }, data: { status: "conectado", lastSyncAt: new Date(), lastError: null } }).catch(() => undefined);
    return busy;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await prisma.clientCalendar.update({ where: { clientId }, data: { status: "erro", lastError: msg.slice(0, 300) } }).catch(() => undefined);
    console.warn(`[agenda] ${clientId}: ${msg}`);
    return hit?.busy ?? [];
  }
}

// Marca a consulta na Google Agenda da clínica (só na conexão Google; o link iCal é só leitura)
export async function createCalendarEvent(clientId: string, ev: { start: Date; minutes: number; title: string; description: string }): Promise<{ created: boolean; reason?: string; link?: string }> {
  const cal = await prisma.clientCalendar.findUnique({ where: { clientId }, select: { kind: true, status: true } });
  if (!cal || cal.kind !== "google") return { created: false, reason: cal ? "agenda conectada só para leitura (link iCal)" : "sem agenda conectada" };
  try {
    const { token, calendarId } = await googleAccess(clientId);
    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        summary: ev.title.slice(0, 200),
        description: ev.description.slice(0, 4000),
        start: { dateTime: ev.start.toISOString(), timeZone: "America/Sao_Paulo" },
        end: { dateTime: new Date(ev.start.getTime() + ev.minutes * 60_000).toISOString(), timeZone: "America/Sao_Paulo" },
        reminders: { useDefault: true },
      }),
      signal: AbortSignal.timeout(20_000),
    });
    const d = (await res.json().catch(() => ({}))) as { htmlLink?: string; error?: { message?: string } };
    if (!res.ok) throw new Error(d.error?.message ?? `HTTP ${res.status}`);
    cache.delete(clientId);
    return { created: true, link: d.htmlLink };
  } catch (err) {
    return { created: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

export async function disconnectCalendar(clientId: string): Promise<void> {
  await prisma.clientCalendar.deleteMany({ where: { clientId } });
  cache.delete(clientId);
  tokens.delete(clientId);
}

// Consulta marcada pela IA (ou pelo rascunho aprovado): entra na Google Agenda da clínica quando ela estiver conectada
export async function bookAppointment(clientId: string, conv: { name: string | null; phone: string | null; id: string }, whenIso: string): Promise<void> {
  if (!clientId || !whenIso) return;
  const start = new Date(whenIso);
  if (Number.isNaN(start.getTime())) return;
  const ch = await prisma.whatsappChannel.findUnique({ where: { clientId }, select: { settings: true } });
  const minutes = Number(((ch?.settings ?? {}) as { ia?: { agenda?: { duracaoMin?: number } } }).ia?.agenda?.duracaoMin ?? 60) || 60;
  const who = conv.name ?? (conv.phone ? `+${conv.phone}` : "Paciente");
  const r = await createCalendarEvent(clientId, {
    start,
    minutes,
    title: `${who} (marcado pela LOTUS)`,
    description: `Consulta marcada pela IA da LOTUS no WhatsApp.${conv.phone ? `\nTelefone: +${conv.phone}` : ""}`,
  });
  if (!r.created && r.reason && !/sem agenda conectada|só para leitura/.test(r.reason)) {
    await notify({ kind: "sistema", title: `Não marquei ${who} na agenda da clínica`, body: `A consulta ficou na LOTUS, mas a Google Agenda recusou: ${r.reason}`, href: `/clients/${clientId}?tab=attendance`, clientId });
  }
}
