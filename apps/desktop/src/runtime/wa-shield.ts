// Escudo anti-ban do WhatsApp: tudo que sai de um número passa por aqui.
// Comportamento de gente: uma mensagem por vez, "digitando…" proporcional ao texto, intervalos variados,
// limites por hora/dia, poucos contatos novos por dia e nada de texto repetido em massa.
// Quando um limite bate, a mensagem NÃO falha: o escudo devolve quanto tempo esperar e a fila tenta depois.
import * as crypto from 'crypto'
import * as fs from 'fs'
import * as path from 'path'

export interface ShieldLimits {
  perHour: number // mensagens por hora (todas)
  coldPerHour: number // para quem não falou com o número nas últimas 24 h
  coldPerDay: number
  newContactsPerDay: number // contatos com quem o número nunca conversou
  sameTextMax: number // mesmo texto para no máximo N pessoas em 24 h
}

export const DEFAULT_LIMITS: ShieldLimits = { perHour: 40, coldPerHour: 12, coldPerDay: 60, newContactsPerDay: 15, sameTextMax: 3 }

interface ShieldState {
  sent: Array<{ at: number; jid: string; cold: boolean; textHash: string; isNew?: boolean }>
  known: Record<string, number> // jid -> último contato (qualquer direção)
  lastInbound: Record<string, number> // jid -> última mensagem recebida
  lastSendAt: number
}

export class ShieldWait extends Error {
  constructor(public waitMs: number, reason: string) {
    super(`Escudo anti-ban: ${reason}. Tenta de novo em ${Math.ceil(waitMs / 1000)} s.`)
  }
}

const HOUR = 3_600_000
const DAY = 86_400_000
const rand = (a: number, b: number) => a + Math.random() * (b - a)
const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()

export class WaShield {
  private state: ShieldState
  private file: string
  private chain: Promise<unknown> = Promise.resolve()
  limits: ShieldLimits

  constructor(dir: string, limits?: Partial<ShieldLimits>) {
    this.file = path.join(dir, 'escudo.json')
    this.limits = { ...DEFAULT_LIMITS, ...(limits ?? {}) }
    try {
      this.state = JSON.parse(fs.readFileSync(this.file, 'utf-8')) as ShieldState
    } catch {
      this.state = { sent: [], known: {}, lastInbound: {}, lastSendAt: 0 }
    }
  }

  private save() {
    const cut = Date.now() - 2 * DAY
    this.state.sent = this.state.sent.filter((s) => s.at > cut)
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true })
      fs.writeFileSync(this.file, JSON.stringify(this.state))
    } catch {
      // disco travado: o estado fica na memória
    }
  }

  // Mensagem recebida ou enviada pelo celular: o contato passa a ser conhecido
  seen(jid: string, inbound: boolean, at = Date.now()) {
    this.state.known[jid] = Math.max(this.state.known[jid] ?? 0, at)
    if (inbound) this.state.lastInbound[jid] = Math.max(this.state.lastInbound[jid] ?? 0, at)
  }

  status() {
    const now = Date.now()
    const lastHour = this.state.sent.filter((s) => now - s.at < HOUR)
    const lastDay = this.state.sent.filter((s) => now - s.at < DAY)
    return {
      limits: this.limits,
      lastHour: lastHour.length,
      coldLastHour: lastHour.filter((s) => s.cold).length,
      coldToday: lastDay.filter((s) => s.cold).length,
      newContactsToday: lastDay.filter((s) => s.isNew).length,
      sentToday: lastDay.length,
    }
  }

  // Confere os limites; devolve quanto esperar (0 = pode mandar)
  private check(jid: string, text: string): { wait: number; reason: string; cold: boolean; isNew: boolean; hash: string } {
    const now = Date.now()
    const cold = now - (this.state.lastInbound[jid] ?? 0) > DAY
    const isNew = !this.state.known[jid]
    const hash = crypto.createHash('sha1').update(norm(text)).digest('hex')
    const lastHour = this.state.sent.filter((s) => now - s.at < HOUR)
    const lastDay = this.state.sent.filter((s) => now - s.at < DAY)
    const oldestIn = (list: typeof lastHour, span: number) => (list.length ? list[0].at + span - now + 1000 : 60_000)
    if (lastHour.length >= this.limits.perHour) return { wait: oldestIn(lastHour, HOUR), reason: `limite de ${this.limits.perHour} mensagens por hora`, cold, isNew, hash }
    if (cold) {
      const coldHour = lastHour.filter((s) => s.cold)
      const coldDay = lastDay.filter((s) => s.cold)
      if (coldHour.length >= this.limits.coldPerHour) return { wait: oldestIn(coldHour, HOUR), reason: `limite de ${this.limits.coldPerHour} mensagens por hora para quem não falou antes`, cold, isNew, hash }
      if (coldDay.length >= this.limits.coldPerDay) return { wait: oldestIn(coldDay, DAY), reason: `limite de ${this.limits.coldPerDay} mensagens por dia para quem não falou antes`, cold, isNew, hash }
    }
    if (isNew) {
      const newDay = lastDay.filter((s) => s.isNew)
      if (newDay.length >= this.limits.newContactsPerDay) return { wait: oldestIn(newDay, DAY), reason: `limite de ${this.limits.newContactsPerDay} contatos novos por dia`, cold, isNew, hash }
    }
    if (norm(text).length > 25) {
      const same = new Set(lastDay.filter((s) => s.textHash === hash && s.jid !== jid).map((s) => s.jid))
      if (same.size >= this.limits.sameTextMax) return { wait: -1, reason: `o mesmo texto já foi para ${same.size} pessoas hoje (personalize a mensagem)`, cold, isNew, hash }
    }
    // Intervalo mínimo entre mensagens do número: conversa ativa é rápido; fria, devagar
    const gap = cold ? rand(45_000, 90_000) : rand(6_000, 14_000)
    const since = now - this.state.lastSendAt
    return { wait: since >= gap ? 0 : gap - since, reason: 'intervalo entre mensagens', cold, isNew, hash }
  }

  // Manda pelo escudo: espera o intervalo (até maxWaitMs), mostra "digitando…" e envia.
  // Se precisar esperar mais que maxWaitMs, lança ShieldWait para a fila tentar depois.
  run<T>(jid: string, text: string, typing: (state: 'composing' | 'paused') => Promise<void>, send: () => Promise<T>, maxWaitMs = 120_000): Promise<T> {
    const job = this.chain.then(async () => {
      const c = this.check(jid, text)
      if (c.wait < 0) throw new Error(`Escudo anti-ban: ${c.reason}.`)
      if (c.wait > maxWaitMs) throw new ShieldWait(c.wait, c.reason)
      if (c.wait > 0) await new Promise((r) => setTimeout(r, c.wait))
      // "digitando…" proporcional ao tamanho, com variação
      const typeMs = Math.min(12_000, Math.max(2_000, 1_200 + text.length * rand(35, 55)))
      await typing('composing').catch(() => undefined)
      await new Promise((r) => setTimeout(r, typeMs))
      await typing('paused').catch(() => undefined)
      const result = await send()
      const at = Date.now()
      this.state.sent.push({ at, jid, cold: c.cold, textHash: c.hash, isNew: c.isNew })
      this.state.lastSendAt = at
      this.state.known[jid] = at
      this.save()
      return result
    })
    // A fila segue mesmo se esta mensagem falhar
    this.chain = job.catch(() => undefined)
    return job
  }

  flush() {
    this.save()
  }
}
