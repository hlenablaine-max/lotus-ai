// WhatsApp de cada clínica ligado à LOTUS como "aparelho conectado" (o dono lê um QR code, igual ao WhatsApp Web).
// O celular da clínica continua funcionando normalmente. Toda mensagem que chega ou sai é repassada ao servidor
// do LOTUS, que monta as conversas, os leads, a origem de cada contato e as métricas de atendimento.
// Se o servidor estiver reiniciando, os eventos esperam numa fila em disco e são reenviados depois.
import * as fs from 'fs'
import * as path from 'path'
import QRCode from 'qrcode'
import pino from 'pino'
import { WORKSPACE_DIR } from './paths'

// A biblioteca é ESM; o app de PC é CommonJS. Este import dinâmico não é reescrito pelo TypeScript.
const dynamicImport = new Function('s', 'return import(s)') as (s: string) => Promise<any>

const WA_DIR = path.join(WORKSPACE_DIR, 'whatsapp')
const QUEUE_FILE = path.join(WA_DIR, 'fila-eventos.json')
const PORT_FILE = path.join(WORKSPACE_DIR, '.runtime-port')
const WEB_PORT = Number(process.env.LOTUS_PORT || 3000)
const HISTORY_DAYS = 30
const HISTORY_CAP = 3000
const QUEUE_CAP = 20000

type State = 'desconectado' | 'conectando' | 'qr' | 'conectado'

interface Session {
  clientId: string
  sock: any
  state: State
  qrImage: string | null
  phone: string | null
  name: string | null
  lastError: string | null
  retries: number
  stopping: boolean
  historyCount: number
  names: Map<string, string>
  sent: Map<string, any>
}

export interface WaMessageEvent {
  type: 'message'
  clientId: string
  waId: string
  jid: string
  phone: string | null
  name: string | null
  fromMe: boolean
  text: string
  kind: string
  sentAt: string
  history: boolean
}
export interface WaStatusEvent {
  type: 'status'
  clientId: string
  state: State
  phone: string | null
  name: string | null
  at: string
}
type WaEvent = WaMessageEvent | WaStatusEvent

const safeId = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, '')
const digits = (s: string) => s.replace(/\D/g, '')

// Tira os "envelopes" (mensagem temporária, visualização única, legenda de documento, edição)
function unwrap(message: any): any {
  let m = message
  for (let i = 0; i < 5 && m; i++) {
    const inner =
      m.ephemeralMessage?.message ||
      m.viewOnceMessage?.message ||
      m.viewOnceMessageV2?.message ||
      m.viewOnceMessageV2Extension?.message ||
      m.documentWithCaptionMessage?.message ||
      m.editedMessage?.message
    if (!inner) break
    m = inner
  }
  return m
}

// Texto legível de cada tipo de mensagem; null para o que não é conversa (reação, aviso interno, chave)
function describe(message: any): { text: string; kind: string } | null {
  const m = unwrap(message)
  if (!m) return null
  if (typeof m.conversation === 'string' && m.conversation) return { text: m.conversation, kind: 'texto' }
  if (m.extendedTextMessage?.text) return { text: m.extendedTextMessage.text, kind: 'texto' }
  if (m.imageMessage) return { text: m.imageMessage.caption || '[foto]', kind: 'foto' }
  if (m.videoMessage) return { text: m.videoMessage.caption || '[vídeo]', kind: 'video' }
  if (m.audioMessage) return { text: m.audioMessage.ptt ? '[áudio de voz]' : '[áudio]', kind: 'audio' }
  if (m.documentMessage) return { text: `[documento] ${m.documentMessage.fileName ?? ''}`.trim(), kind: 'documento' }
  if (m.stickerMessage) return { text: '[figurinha]', kind: 'figurinha' }
  if (m.locationMessage || m.liveLocationMessage) return { text: '[localização]', kind: 'localizacao' }
  if (m.contactMessage) return { text: `[contato] ${m.contactMessage.displayName ?? ''}`.trim(), kind: 'contato' }
  if (m.contactsArrayMessage) return { text: '[contatos]', kind: 'contato' }
  if (m.buttonsResponseMessage?.selectedDisplayText) return { text: m.buttonsResponseMessage.selectedDisplayText, kind: 'texto' }
  if (m.listResponseMessage?.title) return { text: m.listResponseMessage.title, kind: 'texto' }
  if (m.templateButtonReplyMessage?.selectedDisplayText) return { text: m.templateButtonReplyMessage.selectedDisplayText, kind: 'texto' }
  if (m.pollCreationMessage || m.pollCreationMessageV3) return { text: `[enquete] ${(m.pollCreationMessage ?? m.pollCreationMessageV3).name ?? ''}`.trim(), kind: 'texto' }
  return null
}

export class WhatsAppHub {
  private sessions = new Map<string, Session>()
  private lib: any = null
  private queue: WaEvent[] = []
  private flushing = false
  private saveTimer: NodeJS.Timeout | null = null
  private flushTimer: NodeJS.Timeout

  constructor(private log: (level: 'info' | 'warn' | 'error' | 'success', message: string) => void) {
    fs.mkdirSync(WA_DIR, { recursive: true })
    try {
      if (fs.existsSync(QUEUE_FILE)) this.queue = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf-8'))
    } catch {
      this.queue = []
    }
    this.flushTimer = setInterval(() => void this.flush(), 3000)
  }

  private async load(): Promise<any> {
    if (!this.lib) this.lib = await dynamicImport('baileys')
    return this.lib
  }

  // Reconecta sozinho todo WhatsApp que já foi conectado antes (a sessão fica salva no computador)
  async resumeAll(): Promise<void> {
    let dirs: string[] = []
    try {
      dirs = fs.readdirSync(WA_DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
    } catch {
      return
    }
    for (const id of dirs) {
      try {
        const creds = JSON.parse(fs.readFileSync(path.join(WA_DIR, id, 'creds.json'), 'utf-8'))
        if (creds?.me?.id) await this.connect(id)
      } catch {
        // sem sessão salva: fica desconectado até o dono ler o QR code
      }
    }
  }

  status(clientId: string) {
    const s = this.sessions.get(safeId(clientId))
    if (!s) {
      const saved = fs.existsSync(path.join(WA_DIR, safeId(clientId), 'creds.json'))
      return { state: 'desconectado' as State, qrImage: null, phone: null, name: null, lastError: null, savedSession: saved }
    }
    return { state: s.state, qrImage: s.state === 'qr' ? s.qrImage : null, phone: s.phone, name: s.name, lastError: s.lastError, savedSession: true }
  }

  list() {
    return [...this.sessions.values()].map((s) => ({ clientId: s.clientId, state: s.state, phone: s.phone, name: s.name }))
  }

  async connect(clientIdRaw: string) {
    const clientId = safeId(clientIdRaw)
    if (!clientId) throw new Error('Cliente inválido')
    const existing = this.sessions.get(clientId)
    if (existing && existing.state !== 'desconectado') return this.status(clientId)
    const session: Session = existing ?? {
      clientId,
      sock: null,
      state: 'conectando',
      qrImage: null,
      phone: null,
      name: null,
      lastError: null,
      retries: 0,
      stopping: false,
      historyCount: 0,
      names: new Map(),
      sent: new Map(),
    }
    session.state = 'conectando'
    session.stopping = false
    session.lastError = null
    this.sessions.set(clientId, session)
    await this.open(session)
    return this.status(clientId)
  }

  private async open(session: Session) {
    const B = await this.load()
    const dir = path.join(WA_DIR, session.clientId)
    const { state, saveCreds } = await B.useMultiFileAuthState(dir)
    let version: number[] | undefined
    try {
      version = (await B.fetchLatestBaileysVersion()).version
    } catch {
      version = undefined
    }
    const sock = B.makeWASocket({
      auth: state,
      version,
      logger: pino({ level: 'silent' }),
      browser: B.Browsers.windows('LOTUS'),
      markOnlineOnConnect: false,
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
      getMessage: async (key: any) => session.sent.get(key.id)?.message ?? undefined,
    })
    session.sock = sock
    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', async (u: any) => {
      if (u.qr) {
        session.state = 'qr'
        session.qrImage = await QRCode.toDataURL(u.qr, { margin: 1, width: 320 }).catch(() => null)
      }
      if (u.connection === 'open') {
        session.state = 'conectado'
        session.retries = 0
        session.lastError = null
        session.phone = sock.user?.id ? digits(String(sock.user.id).split(':')[0].split('@')[0]) : null
        session.name = sock.user?.name ?? sock.user?.verifiedName ?? null
        this.log('success', `WhatsApp do cliente conectado (${session.phone ?? 'número'})`)
        this.push({ type: 'status', clientId: session.clientId, state: 'conectado', phone: session.phone, name: session.name, at: new Date().toISOString() })
      }
      if (u.connection === 'close') {
        const code = u.lastDisconnect?.error?.output?.statusCode
        const loggedOut = code === B.DisconnectReason.loggedOut
        const registered = !!state.creds?.registered || !!state.creds?.me?.id
        session.sock = null
        if (session.stopping) {
          session.state = 'desconectado'
          return
        }
        if (loggedOut) {
          // O dono desconectou o aparelho pelo celular: apaga a sessão salva
          fs.rmSync(dir, { recursive: true, force: true })
          session.state = 'desconectado'
          session.phone = null
          session.lastError = 'O WhatsApp foi desconectado pelo celular. Leia o QR code de novo para religar.'
          this.log('warn', 'WhatsApp do cliente desconectado pelo celular')
          this.push({ type: 'status', clientId: session.clientId, state: 'desconectado', phone: null, name: null, at: new Date().toISOString() })
          return
        }
        if (!registered && session.state === 'qr') {
          // Ninguém leu o QR code a tempo: para de gerar códigos até o dono pedir de novo
          session.state = 'desconectado'
          session.lastError = 'O QR code expirou. Clique em conectar para gerar outro.'
          return
        }
        session.retries += 1
        session.state = 'conectando'
        const wait = code === B.DisconnectReason.restartRequired ? 500 : Math.min(60_000, 2000 * 2 ** Math.min(session.retries, 5))
        setTimeout(() => {
          if (!session.stopping) void this.open(session).catch((err) => (session.lastError = String(err?.message ?? err)))
        }, wait)
      }
    })

    sock.ev.on('contacts.upsert', (contacts: any[]) => {
      for (const c of contacts) if (c.id && (c.name || c.notify)) session.names.set(c.id, c.name || c.notify)
    })

    sock.ev.on('messages.upsert', async ({ messages, type }: any) => {
      for (const msg of messages) await this.handleMessage(session, msg, type !== 'notify')
    })

    // Conversas dos últimos dias que o celular manda ao conectar: entram como histórico (não viram lead novo)
    sock.ev.on('messaging-history.set', async ({ messages, contacts }: any) => {
      for (const c of contacts ?? []) if (c.id && (c.name || c.notify)) session.names.set(c.id, c.name || c.notify)
      const since = Date.now() - HISTORY_DAYS * 86_400_000
      for (const msg of messages ?? []) {
        if (session.historyCount >= HISTORY_CAP) break
        const ts = Number(msg.messageTimestamp ?? 0) * 1000
        if (!ts || ts < since) continue
        if (await this.handleMessage(session, msg, true)) session.historyCount += 1
      }
    })
  }

  // Descobre o número de telefone real do contato (o WhatsApp às vezes manda só um identificador "lid")
  private async resolve(session: Session, key: any): Promise<{ jid: string; phone: string | null } | null> {
    const B = this.lib
    const jid: string = key.remoteJid ?? ''
    if (!jid || jid.endsWith('@g.us') || jid.endsWith('@broadcast') || jid.endsWith('@newsletter') || jid === 'status@broadcast') return null
    if (jid.endsWith('@s.whatsapp.net')) {
      const n = B.jidNormalizedUser(jid)
      return { jid: n, phone: digits(n.split('@')[0]) }
    }
    if (jid.endsWith('@lid')) {
      const alt: string | undefined = key.remoteJidAlt
      if (alt && alt.endsWith('@s.whatsapp.net')) {
        const n = B.jidNormalizedUser(alt)
        return { jid: n, phone: digits(n.split('@')[0]) }
      }
      try {
        const pn = await session.sock?.signalRepository?.lidMapping?.getPNForLID(jid)
        if (pn) {
          const n = B.jidNormalizedUser(pn)
          return { jid: n, phone: digits(n.split('@')[0]) }
        }
      } catch {
        // sem mapeamento ainda
      }
      return { jid: B.jidNormalizedUser(jid), phone: null }
    }
    return null
  }

  private async handleMessage(session: Session, msg: any, history: boolean): Promise<boolean> {
    if (!msg?.message || !msg.key?.id) return false
    const info = describe(msg.message)
    if (!info) return false
    const who = await this.resolve(session, msg.key)
    if (!who) return false
    const fromMe = !!msg.key.fromMe
    const ts = Number(msg.messageTimestamp ?? 0) * 1000 || Date.now()
    const name = fromMe ? session.names.get(who.jid) ?? null : msg.pushName || session.names.get(who.jid) || null
    this.push({
      type: 'message',
      clientId: session.clientId,
      waId: msg.key.id,
      jid: who.jid,
      phone: who.phone,
      name,
      fromMe,
      text: info.text.slice(0, 8000),
      kind: info.kind,
      sentAt: new Date(ts).toISOString(),
      history,
    })
    return true
  }

  // Confere se o número tem WhatsApp e devolve o endereço certo (resolve o 9º dígito dos celulares)
  async checkNumber(clientIdRaw: string, phone: string): Promise<{ exists: boolean; jid: string | null }> {
    const s = this.sessions.get(safeId(clientIdRaw))
    if (!s?.sock || s.state !== 'conectado') throw new Error('O WhatsApp deste cliente não está conectado.')
    let n = digits(phone)
    if (n.length === 10 || n.length === 11) n = `55${n}`
    const res = await s.sock.onWhatsApp(n)
    const hit = Array.isArray(res) ? res.find((r: any) => r?.exists) : null
    return { exists: !!hit, jid: hit?.jid ?? null }
  }

  async send(clientIdRaw: string, to: string, text: string): Promise<{ waId: string; jid: string; phone: string | null; sentAt: string }> {
    const s = this.sessions.get(safeId(clientIdRaw))
    if (!s?.sock || s.state !== 'conectado') throw new Error('O WhatsApp deste cliente não está conectado.')
    const body = String(text ?? '').trim()
    if (!body) throw new Error('Mensagem vazia')
    let jid = to.includes('@') ? to : ''
    if (!jid) {
      const check = await this.checkNumber(clientIdRaw, to)
      if (!check.exists || !check.jid) throw new Error('Esse número não tem WhatsApp.')
      jid = check.jid
    }
    const sent = await s.sock.sendMessage(jid, { text: body })
    if (sent?.key?.id) {
      s.sent.set(sent.key.id, sent)
      if (s.sent.size > 300) s.sent.delete(s.sent.keys().next().value as string)
    }
    const phone = jid.endsWith('@s.whatsapp.net') ? digits(jid.split('@')[0]) : null
    return { waId: sent?.key?.id ?? '', jid, phone, sentAt: new Date().toISOString() }
  }

  async disconnect(clientIdRaw: string, logout: boolean) {
    const clientId = safeId(clientIdRaw)
    const s = this.sessions.get(clientId)
    if (s) {
      s.stopping = true
      try {
        if (logout) await s.sock?.logout()
        else s.sock?.end(undefined)
      } catch {
        // já estava fechado
      }
      s.state = 'desconectado'
      s.sock = null
    }
    if (logout) {
      fs.rmSync(path.join(WA_DIR, clientId), { recursive: true, force: true })
      this.push({ type: 'status', clientId, state: 'desconectado', phone: null, name: null, at: new Date().toISOString() })
    }
    return { ok: true }
  }

  private push(ev: WaEvent) {
    this.queue.push(ev)
    if (this.queue.length > QUEUE_CAP) this.queue.splice(0, this.queue.length - QUEUE_CAP)
    this.scheduleSave()
  }

  private scheduleSave() {
    if (this.saveTimer) return
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      try {
        fs.writeFileSync(QUEUE_FILE, JSON.stringify(this.queue))
      } catch {
        // disco cheio ou travado: a fila continua na memória
      }
    }, 1000)
  }

  // Entrega os eventos ao servidor do LOTUS; se ele não responder, tenta de novo em 3 s
  private async flush() {
    if (this.flushing || this.queue.length === 0) return
    this.flushing = true
    try {
      const cfg = JSON.parse(fs.readFileSync(PORT_FILE, 'utf-8')) as { token: string }
      const batch = this.queue.slice(0, 200)
      const res = await fetch(`http://127.0.0.1:${WEB_PORT}/api/internal/whatsapp/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Runtime-Token': cfg.token },
        body: JSON.stringify({ events: batch }),
        signal: AbortSignal.timeout(60_000),
      })
      if (res.ok) {
        this.queue.splice(0, batch.length)
        this.scheduleSave()
      }
    } catch {
      // servidor reiniciando: os eventos ficam na fila
    } finally {
      this.flushing = false
    }
  }

  async close() {
    clearInterval(this.flushTimer)
    for (const s of this.sessions.values()) {
      s.stopping = true
      try {
        s.sock?.end(undefined)
      } catch {
        // ignora
      }
    }
    try {
      fs.writeFileSync(QUEUE_FILE, JSON.stringify(this.queue))
    } catch {
      // ignora
    }
  }
}

export async function qrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, { margin: 1, width: 480 })
}
