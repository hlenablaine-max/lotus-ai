// Navegador de pesquisa do LOTUS: coleta dados públicos de um negócio (Instagram, site,
// biblioteca de anúncios, Google Maps), analisa vídeos e faz o teste de atendimento no WhatsApp.
// Usa um perfil persistente: o dono entra uma vez no Instagram/WhatsApp e a sessão fica salva.

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import type { BrowserContext, Page } from 'playwright'
import { WORKSPACE_DIR } from './paths'

const execFileAsync = promisify(execFile)

const PROFILE_DIR = path.join(WORKSPACE_DIR, 'browser-profile')
const OUTPUT_DIR = path.join(WORKSPACE_DIR, 'diagnosticos')
const TOOLS_DIR = path.join(WORKSPACE_DIR, '.tools')

const TRANSCRIBE_SCRIPT = `import sys, json
from faster_whisper import WhisperModel
sys.stdout.reconfigure(encoding="utf-8")
# A ordem dos modelos vem do LOTUS conforme a memória livre; cai para os menores se faltar memória
names = sys.argv[2].split(",") if len(sys.argv) > 2 else ["small", "base", "tiny"]
threads = int(sys.argv[3]) if len(sys.argv) > 3 else 2
last_error = None
for name in names:
    try:
        model = WhisperModel(name, device="cpu", compute_type="int8", cpu_threads=threads)
        segments, info = model.transcribe(sys.argv[1], language="pt", vad_filter=True)
        text = " ".join(s.text.strip() for s in segments)
        print(json.dumps({"duration": info.duration, "text": text, "model": name}, ensure_ascii=False))
        sys.exit(0)
    except Exception as error:
        last_error = error
print(json.dumps({"error": str(last_error)}, ensure_ascii=False))
sys.exit(1)
`

export interface InstagramPost {
  url: string
  type: 'reel' | 'post'
  likes: number | null
  comments: number | null
  publishedAt: string | null
  caption: string
  thumbnailAlt: string
}

export interface InstagramProfile {
  handle: string
  url: string
  found: boolean
  isPrivate: boolean
  loginWall: boolean
  loggedIn: boolean
  fullTitle: string
  followers: number | null
  following: number | null
  postsCount: number | null
  bio: string
  headerText: string
  externalLinks: string[]
  highlights: string[]
  posts: InstagramPost[]
  screenshot: string | null
  collectedAt: string
}

function parseCount(raw: string | undefined | null): number | null {
  if (!raw) return null
  const text = raw.trim().toLowerCase().replace(/\s+/g, ' ')
  const match = text.match(/^([\d.,]+)\s*(k|m|mil|mi|milhões|milhão)?/)
  if (!match) return null
  const suffix = match[2]
  if (suffix) {
    const value = parseFloat(match[1].replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'))
    const factor = suffix === 'k' || suffix === 'mil' ? 1_000 : 1_000_000
    return Math.round(value * factor)
  }
  const digits = match[1].replace(/[.,]/g, '')
  return digits ? parseInt(digits, 10) : null
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'negocio'
}

export interface ReelAnalysis {
  url: string
  durationSec: number | null
  transcript: string
  frames: string[]
  note: string
}

export class ResearchBrowser {
  private context: BrowserContext | null = null
  private headless = true

  constructor(private log: (level: 'info' | 'warn' | 'error' | 'success', message: string) => void) {}

  // Reaproveita o navegador aberto (inclusive a janela de login); só abre um novo se não houver.
  private async getContext(wantVisible = false): Promise<BrowserContext> {
    if (this.context) {
      if (!wantVisible || !this.headless) return this.context
      await this.close()
    }
    const { chromium } = await import('playwright')
    fs.mkdirSync(PROFILE_DIR, { recursive: true })
    let lastError: unknown
    for (const channel of ['chrome', 'msedge', undefined] as const) {
      try {
        this.context = await chromium.launchPersistentContext(PROFILE_DIR, {
          headless: !wantVisible,
          ...(channel ? { channel } : {}),
          locale: 'pt-BR',
          viewport: { width: 1280, height: 900 },
          // Poucos processos de página: o PC do dono tem pouca memória
          args: ['--disable-blink-features=AutomationControlled', '--renderer-process-limit=2', '--disable-extensions', '--disable-background-networking'],
        })
        break
      } catch (err) {
        lastError = err
      }
    }
    if (!this.context) throw new Error(`Não foi possível abrir o navegador de pesquisa: ${String(lastError)}`)
    this.headless = !wantVisible
    this.context.on('close', () => {
      this.context = null
    })
    return this.context
  }

  async close(): Promise<void> {
    const ctx = this.context
    this.context = null
    await ctx?.close().catch(() => {})
  }

  // Libera a memória do navegador invisível entre etapas. A janela visível (login do dono) nunca é fechada aqui.
  async release(): Promise<{ closed: boolean }> {
    if (!this.context || !this.headless) return { closed: false }
    await this.close()
    return { closed: true }
  }

  private outDir(name: string): string {
    const dir = path.join(OUTPUT_DIR, slug(name))
    fs.mkdirSync(dir, { recursive: true })
    return dir
  }

  private async withPage<T>(fn: (page: Page, ctx: BrowserContext) => Promise<T>): Promise<T> {
    const ctx = await this.getContext()
    const page = await ctx.newPage()
    try {
      return await fn(page, ctx)
    } finally {
      await page.close().catch(() => {})
    }
  }

  // === Contas conectadas ===

  async status(): Promise<{ instagram: boolean; google: boolean; whatsappProfile: boolean; browserOpen: boolean; visible: boolean }> {
    const ctx = await this.getContext()
    const cookies = await ctx.cookies(['https://www.instagram.com'])
    return {
      instagram: cookies.some((c) => c.name === 'sessionid' && c.value),
      google: (await ctx.cookies(['https://www.google.com'])).some((c) => c.name === 'SID' && c.value),
      // WhatsApp Web guarda a sessão no armazenamento do perfil; a existência dele é só um indício
      whatsappProfile: fs.existsSync(path.join(PROFILE_DIR, 'Default', 'IndexedDB')),
      browserOpen: !!this.context,
      visible: !this.headless,
    }
  }

  // Abre uma janela visível para o dono fazer login (a sessão fica salva no perfil).
  async connect(service: 'instagram' | 'whatsapp' | 'google'): Promise<{ opened: boolean }> {
    const ctx = await this.getContext(true)
    const page = ctx.pages()[0] ?? (await ctx.newPage())
    const target = { whatsapp: 'https://web.whatsapp.com/', google: 'https://accounts.google.com/ServiceLogin?continue=https://www.google.com/maps', instagram: 'https://www.instagram.com/accounts/login/' }[service]
    await page.goto(target, {
      waitUntil: 'domcontentloaded',
      timeout: 45_000,
    })
    await page.bringToFront().catch(() => {})
    this.log('info', `Janela aberta para conectar ${service}`)
    return { opened: true }
  }

  // === Instagram ===

  async instagramProfile(handleInput: string, maxPosts = 9): Promise<InstagramProfile> {
    const handle = handleInput.replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').split(/[/?#]/)[0].trim()
    const url = `https://www.instagram.com/${handle}/`
    this.log('info', `Instagram: lendo @${handle}`)

    return this.withPage(async (page, ctx) => {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 })
      await page.waitForTimeout(5000)

      const raw = await page.evaluate(() => {
        const meta = (selector: string) => document.querySelector(selector)?.getAttribute('content') ?? ''
        const header = document.querySelector('header') as HTMLElement | null
        const highlightTitles: string[] = []
        document.querySelectorAll('img[alt*="destaque"], img[alt*="highlight"]').forEach((img) => {
          let node: HTMLElement | null = img as HTMLElement
          for (let i = 0; i < 5 && node; i++) {
            node = node.parentElement
            const text = node?.innerText?.trim()
            if (text) {
              highlightTitles.push(text.split('\n')[0].slice(0, 60))
              break
            }
          }
        })
        const anchors = Array.from(document.querySelectorAll('a[href]')) as HTMLAnchorElement[]
        const posts: Array<{ href: string; alt: string }> = []
        const seen = new Set<string>()
        for (const a of anchors) {
          const href = a.getAttribute('href') ?? ''
          if (!/\/(p|reel)\/[^/]+\/?$/.test(href) || seen.has(href)) continue
          seen.add(href)
          posts.push({ href, alt: (a.querySelector('img')?.getAttribute('alt') ?? '').slice(0, 300) })
        }
        const external = anchors
          .map((a) => a.href)
          .filter((h) => h.includes('l.instagram.com/?u='))
          .map((h) => {
            try {
              return decodeURIComponent(new URL(h).searchParams.get('u') ?? '')
            } catch {
              return ''
            }
          })
          .filter(Boolean)
        const body = document.body.innerText
        return {
          title: document.title,
          description: meta('meta[name="description"]') || meta('meta[property="og:description"]'),
          headerText: header?.innerText ?? '',
          highlightTitles,
          posts,
          external,
          isPrivate: /conta é privada|account is private/i.test(body),
          notFound: /página não está disponível|page isn't available|Página não encontrada/i.test(body.slice(0, 2000)) || /Página não encontrada|Page not found/i.test(document.title),
          loginWall: location.pathname.includes('/accounts/login'),
        }
      })

      const cookies = await ctx.cookies(['https://www.instagram.com'])
      const loggedIn = cookies.some((c) => c.name === 'sessionid' && c.value)

      const desc = raw.description
      const followers = parseCount(desc.match(/([\d.,]+\s?(?:k|m|mil|mi)?)\s+(?:seguidores|followers)/i)?.[1])
      const following =
        parseCount(desc.match(/([\d.,]+\s?(?:k|m|mil|mi)?)\s+(?:seguindo|following)/i)?.[1]) ??
        parseCount(desc.match(/(?:seguindo|following)\s+([\d.,]+\s?(?:k|m|mil|mi)?)/i)?.[1])
      const postsCount = parseCount(desc.match(/([\d.,]+\s?(?:k|m|mil|mi)?)\s+(?:posts|publicações)/i)?.[1])
      const bio = desc.match(/:\s*["“]([\s\S]*)["”]\s*$/)?.[1]?.trim() ?? ''

      // Links escritos na bio quando o Instagram não expõe o href (ex.: "site.com.br e mais 2")
      const textLinks = (raw.headerText.match(/\b(?:[a-z0-9-]+\.)+(?:com\.br|com|net|org|me|ee|link|app|bio|site|io|br)(?:\/[^\s]*)?/gi) ?? [])
        .filter((l) => !/instagram\.com/i.test(l))
        .map((l) => (l.startsWith('http') ? l : `https://${l}`))
      const externalLinks = [...new Set([...raw.external, ...textLinks])].slice(0, 6)

      // Fecha o aviso de login que cobre o perfil antes do print
      await page.evaluate(() => document.querySelectorAll('div[role="dialog"], div[role="presentation"]').forEach((d) => d.remove())).catch(() => {})
      const dir = this.outDir(handle)
      const screenshot = path.join(dir, `instagram-perfil-${Date.now()}.jpg`)
      await page.screenshot({ path: screenshot, type: 'jpeg', quality: 60 }).catch(() => {})

      const posts: InstagramPost[] = []
      for (const item of raw.posts.slice(0, Math.max(0, Math.min(maxPosts, 18)))) {
        const postUrl = new URL(item.href, 'https://www.instagram.com').href
        try {
          await page.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 })
          await page.waitForTimeout(1800)
          const info = await page.evaluate(() => ({
            description:
              document.querySelector('meta[name="description"]')?.getAttribute('content') ??
              document.querySelector('meta[property="og:description"]')?.getAttribute('content') ??
              '',
            time: document.querySelector('time')?.getAttribute('datetime') ?? null,
            hasVideo: !!document.querySelector('video'),
          }))
          const d = info.description
          posts.push({
            url: postUrl,
            type: /\/reel\//.test(postUrl) || info.hasVideo ? 'reel' : 'post',
            likes: parseCount(d.match(/([\d.,]+\s?(?:k|m|mil|mi)?)\s+(?:likes?|curtidas?)/i)?.[1]),
            comments: parseCount(d.match(/([\d.,]+\s?(?:k|m|mil|mi)?)\s+(?:comments?|comentários?)/i)?.[1]),
            publishedAt: info.time,
            caption: (d.match(/:\s*["“]([\s\S]*)["”]\.?\s*$/)?.[1] ?? '').trim().slice(0, 1500),
            thumbnailAlt: item.alt,
          })
        } catch {
          posts.push({ url: postUrl, type: /\/reel\//.test(postUrl) ? 'reel' : 'post', likes: null, comments: null, publishedAt: null, caption: '', thumbnailAlt: item.alt })
        }
      }

      this.log('success', `Instagram @${handle}: ${followers ?? '?'} seguidores, ${posts.length} posts lidos`)
      return {
        handle,
        url,
        found: !raw.notFound && !raw.loginWall && (followers !== null || raw.headerText.length > 0),
        isPrivate: raw.isPrivate,
        loginWall: raw.loginWall,
        loggedIn,
        fullTitle: raw.title,
        followers,
        following,
        postsCount,
        bio,
        headerText: raw.headerText.slice(0, 1500),
        externalLinks,
        highlights: [...new Set(raw.highlightTitles)].slice(0, 20),
        posts,
        screenshot: fs.existsSync(screenshot) ? screenshot : null,
        collectedAt: new Date().toISOString(),
      }
    })
  }

  // Baixa o vídeo de um reel, transcreve a fala (faster-whisper local) e extrai quadros para análise visual.
  // São duas fases separadas (baixar com o navegador, analisar sem ele) para o pico de memória não somar.
  async reelMedia(postUrl: string, businessName: string): Promise<ReelAnalysis> {
    const { files } = await this.reelDownload(postUrl, businessName)
    return this.reelAnalyze(postUrl, businessName, files)
  }

  // Fase 1 (usa o navegador): baixa as faixas de vídeo/áudio do reel para o disco.
  async reelDownload(postUrl: string, businessName: string): Promise<{ url: string; files: string[] }> {
    const dir = path.join(this.outDir(businessName), 'videos')
    fs.mkdirSync(dir, { recursive: true })
    const id = slug(postUrl.split('/').filter(Boolean).pop() ?? `${Date.now()}`)

    const files = await this.withPage(async (page, ctx) => {
      const mediaUrls = new Map<string, string>()
      page.on('response', (res) => {
        const type = res.headers()['content-type'] ?? ''
        if (!type.startsWith('video/') && !type.startsWith('audio/')) return
        try {
          const u = new URL(res.url())
          u.searchParams.delete('bytestart')
          u.searchParams.delete('byteend')
          mediaUrls.set(u.origin + u.pathname, u.href)
        } catch {
          /* ignore */
        }
      })
      await page.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 })
      await page.waitForTimeout(6500)
      const saved: string[] = []
      let index = 0
      for (const mediaUrl of [...mediaUrls.values()].slice(0, 4)) {
        try {
          const res = await ctx.request.get(mediaUrl, { timeout: 60_000 })
          if (!res.ok()) continue
          const buffer = await res.body()
          if (buffer.length < 20_000 || buffer.length > 80_000_000) continue
          const file = path.join(dir, `${id}-${index++}.mp4`)
          fs.writeFileSync(file, buffer)
          saved.push(file)
        } catch {
          /* tenta a próxima faixa */
        }
      }
      return saved
    })
    this.log('info', `Vídeo baixado: ${postUrl} (${files.length} faixa(s))`)
    return { url: postUrl, files }
  }

  // Fase 2 (sem navegador): mede a duração, extrai quadros e transcreve a fala.
  async reelAnalyze(postUrl: string, businessName: string, filesInput: string[]): Promise<ReelAnalysis> {
    const dir = path.join(this.outDir(businessName), 'videos')
    const id = slug(postUrl.split('/').filter(Boolean).pop() ?? `${Date.now()}`)
    // Só aceita arquivos que o próprio LOTUS baixou para a pasta de vídeos deste negócio
    const files = filesInput.filter((file) => path.resolve(file).startsWith(path.resolve(dir) + path.sep) && fs.existsSync(file))

    if (files.length === 0) {
      return { url: postUrl, durationSec: null, transcript: '', frames: [], note: 'Não foi possível baixar o vídeo (o Instagram pode exigir login para este conteúdo).' }
    }

    // Descobre qual arquivo tem áudio e qual tem imagem (o Instagram entrega faixas separadas)
    let audioFile: string | null = null
    let videoFile: string | null = null
    let durationSec: number | null = null
    for (const file of files) {
      try {
        const { stdout } = await execFileAsync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type:format=duration', '-of', 'json', file], { timeout: 30_000 })
        const probe = JSON.parse(stdout) as { streams?: Array<{ codec_type: string }>; format?: { duration?: string } }
        const types = (probe.streams ?? []).map((s) => s.codec_type)
        if (types.includes('audio') && !audioFile) audioFile = file
        if (types.includes('video') && !videoFile) videoFile = file
        if (probe.format?.duration && !durationSec) durationSec = Math.round(parseFloat(probe.format.duration))
      } catch {
        /* arquivo inválido */
      }
    }

    const frames: string[] = []
    if (videoFile && durationSec) {
      for (const [i, fraction] of [0.08, 0.45, 0.85].entries()) {
        const frame = path.join(dir, `${id}-quadro${i + 1}.jpg`)
        try {
          await execFileAsync(
            'ffmpeg',
            ['-y', '-ss', String(Math.max(0, durationSec * fraction)), '-i', videoFile, '-frames:v', '1', '-vf', 'scale=480:-2', '-q:v', '6', frame],
            { timeout: 60_000 }
          )
          if (fs.existsSync(frame)) frames.push(frame)
        } catch {
          /* segue sem o quadro */
        }
      }
    }

    let transcript = ''
    let note = ''
    if (audioFile) {
      try {
        fs.mkdirSync(TOOLS_DIR, { recursive: true })
        const script = path.join(TOOLS_DIR, 'transcribe.py')
        fs.writeFileSync(script, TRANSCRIBE_SCRIPT, 'utf-8')
        // Modelo de transcrição conforme a memória livre agora (o maior precisa de ~2 GB)
        const freeGb = os.freemem() / 1024 ** 3
        const models = freeGb >= 3 ? 'small,base,tiny' : freeGb >= 1.6 ? 'base,tiny' : 'tiny'
        const threads = Math.max(1, Math.min(4, Math.floor(os.cpus().length / 2)))
        const { stdout } = await execFileAsync('python', [script, audioFile, models, String(threads)], {
          timeout: 600_000,
          maxBuffer: 10 * 1024 * 1024,
          env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
        })
        const lastLine = stdout.trim().split('\n').pop() ?? '{}'
        const parsed = JSON.parse(lastLine) as { text?: string; model?: string }
        transcript = parsed.text?.trim() ?? ''
        if (!transcript) note = 'Vídeo sem fala detectável (provavelmente só música ou texto na tela).'
        else if (parsed.model && parsed.model !== 'small') note = `Transcrição feita com o modelo "${parsed.model}" (memória livre baixa): pode ter erros de palavra.`
      } catch (err) {
        note = `Transcrição indisponível: ${String(err).slice(0, 200)}`
      }
    } else {
      note = 'Vídeo sem faixa de áudio.'
    }

    for (const file of files) fs.rmSync(file, { force: true })
    this.log('success', `Vídeo analisado: ${postUrl} (${transcript.length} caracteres de fala, ${frames.length} quadros)`)
    return { url: postUrl, durationSec, transcript: transcript.slice(0, 4000), frames, note }
  }

  // === Biblioteca de Anúncios da Meta ===

  async metaAds(query: string): Promise<{ query: string; url: string; totalText: string | null; ads: Array<{ libraryId: string; startedAt: string; advertiser: string; text: string }>; screenshot: string | null }> {
    const url = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=BR&q=${encodeURIComponent(query)}&search_type=keyword_unordered&media_type=all`
    this.log('info', `Meta Ad Library: buscando "${query}"`)
    return this.withPage(async (page) => {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 })
      await page.waitForTimeout(7000)
      await page.mouse.wheel(0, 2500).catch(() => {})
      await page.waitForTimeout(2000)
      const data = await page.evaluate(() => {
        const text = document.body.innerText
        const totalText = text.match(/~?\s*[\d.]+\s+resultados?/i)?.[0]?.trim() ?? (/(nenhum anúncio|no ads)/i.test(text) ? '0 resultados' : null)
        const blocks = text.split(/Identificação da biblioteca:\s*/).slice(1, 16)
        const ads = blocks.map((block) => {
          const lines = block.split('\n').map((l) => l.trim()).filter(Boolean)
          const sponsoredIndex = lines.findIndex((l) => /^Patrocinado$|^Sponsored$/i.test(l))
          return {
            libraryId: lines[0]?.match(/\d+/)?.[0] ?? '',
            startedAt: lines.find((l) => /Veiculação iniciada|Started running/i.test(l))?.replace(/Veiculação iniciada em\s*/i, '') ?? '',
            advertiser: sponsoredIndex > 0 ? lines[sponsoredIndex - 1] : '',
            text: sponsoredIndex >= 0 ? lines.slice(sponsoredIndex + 1, sponsoredIndex + 8).join(' ').replace(/\s+(Ativo|Inativo)$/i, '').slice(0, 500) : '',
          }
        })
        return { totalText, ads }
      })
      const screenshot = path.join(this.outDir(query), `anuncios-${Date.now()}.jpg`)
      await page.screenshot({ path: screenshot, type: 'jpeg', quality: 55 }).catch(() => {})
      this.log('success', `Meta Ad Library "${query}": ${data.totalText ?? 'sem contagem'}`)
      return { query, url, ...data, screenshot: fs.existsSync(screenshot) ? screenshot : null }
    })
  }

  // === Site (link da bio) ===

  async site(urlInput: string, businessName: string): Promise<Record<string, unknown>> {
    const url = /^https?:\/\//i.test(urlInput) ? urlInput : `https://${urlInput}`
    this.log('info', `Site: analisando ${url}`)
    return this.withPage(async (page) => {
      const trackers = new Set<string>()
      let requests = 0
      let bytes = 0
      page.on('request', (req) => {
        requests++
        const u = req.url()
        if (u.includes('connect.facebook.net') || u.includes('fbevents')) trackers.add('Meta Pixel')
        if (u.includes('googletagmanager.com/gtm.js')) trackers.add('Google Tag Manager')
        if (u.includes('googletagmanager.com/gtag/js') || u.includes('google-analytics.com')) trackers.add('Google Analytics 4')
        if (u.includes('googleadservices.com') || u.includes('doubleclick.net')) trackers.add('Google Ads')
        if (u.includes('analytics.tiktok.com')) trackers.add('TikTok Pixel')
        if (u.includes('clarity.ms')) trackers.add('Microsoft Clarity')
        if (u.includes('hotjar.com')) trackers.add('Hotjar')
        if (u.includes('rdstation') || u.includes('d335luupugsy2')) trackers.add('RD Station')
      })
      page.on('response', (res) => {
        bytes += Number(res.headers()['content-length'] ?? 0)
      })

      // Considera a página "no ar" quando o HTML chega (DOMContentLoaded). Esperar todos os recursos
      // terceiros faria um chat ou vídeo lento parecer "site fora do ar", o que seria um achado falso.
      const started = Date.now()
      let status = 0
      try {
        const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 })
        status = response?.status() ?? 0
      } catch (err) {
        return { url, reachable: false, error: `A página não respondeu em 45 segundos nesta tentativa: ${String(err).slice(0, 160)}` }
      }
      const domReadyMs = Date.now() - started
      const fullLoad = await page.waitForLoadState('load', { timeout: 20_000 }).then(() => true).catch(() => false)
      const loadMs = fullLoad ? Date.now() - started : null
      await page.waitForTimeout(2500)

      // O link apenas redireciona para uma conversa de WhatsApp: não há página para avaliar
      const landed = page.url()
      if (/^https?:\/\/(api|web|wa)\.?whatsapp\.com|^https?:\/\/wa\.me/i.test(landed)) {
        const number = decodeURIComponent(landed).match(/(?:phone=|wa\.me\/)\+?(\d{10,15})/)?.[1]
        const prefilled = (() => {
          try {
            return new URL(landed).searchParams.get('text') ?? ''
          } catch {
            return ''
          }
        })()
        this.log('success', `Link ${url}: redireciona para o WhatsApp ${number ?? ''}`)
        return {
          url,
          reachable: true,
          httpStatus: status,
          redirectsToWhatsApp: true,
          htmlProntoMs: domReadyMs,
          trackers: [...trackers],
          whatsappNumbers: number ? [number] : [],
          mensagemPreenchida: prefilled,
          finalUrl: landed,
          observacao: 'O link não abre uma página do negócio: ele leva direto para uma conversa no WhatsApp. Os rastreadores listados dispararam na página intermediária antes do redirecionamento.',
        }
      }

      const info = await page.evaluate(() => {
        const text = document.body.innerText
        const anchors = Array.from(document.querySelectorAll('a[href]')) as HTMLAnchorElement[]
        const whatsappLinks = anchors.map((a) => a.href).filter((h) => /wa\.me|api\.whatsapp\.com|web\.whatsapp\.com|whatsapp:\/\//i.test(h))
        const ctaWords = /agend|marc|whats|consulta|orçamento|avalia|contato|fale|compr|saiba|quero|reserv/i
        const ctas = Array.from(document.querySelectorAll('a, button'))
          .map((e) => (e as HTMLElement).innerText?.trim())
          .filter((t) => t && t.length < 60 && ctaWords.test(t))
        const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
        const schemaTypes: string[] = []
        document.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
          const types = s.textContent?.match(/"@type"\s*:\s*"([^"]+)"/g) ?? []
          types.forEach((t) => schemaTypes.push(t.replace(/.*"([^"]+)"$/, '$1')))
        })
        return {
          finalUrl: location.href,
          https: location.protocol === 'https:',
          title: document.title,
          metaDescription: document.querySelector('meta[name="description"]')?.getAttribute('content') ?? '',
          h1: Array.from(document.querySelectorAll('h1')).map((h) => h.innerText.trim()).filter(Boolean).slice(0, 5),
          h2: Array.from(document.querySelectorAll('h2')).map((h) => h.innerText.trim()).filter(Boolean).slice(0, 10),
          ctas: [...new Set(ctas)].slice(0, 15),
          whatsappLinks: [...new Set(whatsappLinks)].slice(0, 5),
          phoneLinks: [...new Set(anchors.map((a) => a.href).filter((h) => h.startsWith('tel:')))].slice(0, 5),
          forms: document.querySelectorAll('form').length,
          hasViewportMeta: !!document.querySelector('meta[name="viewport"]'),
          schemaTypes: [...new Set(schemaTypes)].slice(0, 10),
          mentionsTestimonials: /depoimento|avaliaç|o que dizem|nossos pacientes|review/i.test(text),
          mentionsBeforeAfter: /antes e depois|antes & depois|resultados reais/i.test(text),
          mentionsPrices: /R\$\s?\d/.test(text),
          socialLinks: [...new Set(anchors.map((a) => a.href).filter((h) => /instagram\.com|facebook\.com|tiktok\.com|youtube\.com|linkedin\.com/i.test(h)))].slice(0, 8),
          outboundLinks: [...new Set(anchors.map((a) => a.href).filter((h) => /^https?:/.test(h) && !h.includes(location.hostname)))].slice(0, 25),
          domContentLoadedMs: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
          textSample: text.replace(/\s+/g, ' ').slice(0, 3500),
          wordCount: text.split(/\s+/).length,
          cnpjs: [...new Set(text.match(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g) ?? [])].slice(0, 3),
          registrosProfissionais: [...new Set(text.match(/\b(?:CRO|CRM|COREN|CRBM|CRF)[\s\-/:]*[A-Z]{2}[\s\-/:]*\d{3,7}\b/gi) ?? [])].slice(0, 8),
          profissionaisCitados: [...new Set(text.match(/\b(?:Dr|Dra)\.?\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]+(?:\s+(?:de |da |do |dos |das )?[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]+){0,3}/g) ?? [])].slice(0, 10),
          instagramsCitados: [...new Set(anchors.map((a) => a.href).filter((h) => /instagram\.com\/[A-Za-z0-9._]+/i.test(h)).map((h) => h.replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').split(/[/?#]/)[0].toLowerCase()).filter((h) => h && !['p', 'reel', 'explore', 'accounts'].includes(h)))].slice(0, 8),
        }
      })

      const dir = this.outDir(businessName)
      const stamp = Date.now()
      const desktopShot = path.join(dir, `site-desktop-${stamp}.jpg`)
      await page.screenshot({ path: desktopShot, type: 'jpeg', quality: 60 }).catch(() => {})
      await page.setViewportSize({ width: 390, height: 844 })
      await page.waitForTimeout(1200)
      const mobileShot = path.join(dir, `site-celular-${stamp}.jpg`)
      await page.screenshot({ path: mobileShot, type: 'jpeg', quality: 60 }).catch(() => {})

      const whatsappNumbers = [...new Set(info.whatsappLinks.map((l) => decodeURIComponent(l).match(/(?:phone=|wa\.me\/)\+?(\d{10,15})/)?.[1]).filter(Boolean))]
      const host = new URL(info.finalUrl).hostname
      this.log('success', `Site ${host}: HTML em ${domReadyMs}ms, rastreadores: ${[...trackers].join(', ') || 'nenhum'}`)
      return {
        url,
        reachable: status > 0 && status < 400,
        httpStatus: status,
        htmlProntoMs: domReadyMs,
        carregamentoCompletoMs: loadMs,
        observacaoCarregamento: loadMs === null ? "O HTML chegou, mas algum recurso de terceiros não terminou de carregar em 20s (não significa site fora do ar)." : null,
        requests,
        approxKb: Math.round(bytes / 1024),
        trackers: [...trackers],
        isLinkAggregator: /linktr\.ee|bio\.link|beacons\.ai|linkme\.bio|bio\.site|lnk\.bio|taplink|linkin\.bio/i.test(host),
        whatsappNumbers,
        ...info,
        screenshots: [desktopShot, mobileShot].filter((f) => fs.existsSync(f)),
      }
    })
  }

  // === Google Maps (avaliações e presença local) ===

  async googleMaps(query: string): Promise<{ query: string; url: string; results: Array<{ name: string; rating: number | null; details: string }> }> {
    const url = `https://www.google.com/maps/search/${encodeURIComponent(query)}?hl=pt-BR`
    this.log('info', `Google Maps: buscando "${query}"`)
    return this.withPage(async (page) => {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 })
      await page.waitForTimeout(7000)
      const results = await page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll('a.hfpxzc')) as HTMLAnchorElement[]
        if (cards.length === 0) {
          // Busca caiu direto na ficha de um único estabelecimento
          const name = (document.querySelector('h1') as HTMLElement | null)?.innerText ?? ''
          const text = (document.querySelector('[role="main"]') as HTMLElement | null)?.innerText ?? ''
          return name ? [{ name, details: text.replace(/\s+/g, ' ').slice(0, 500) }] : []
        }
        return cards.slice(0, 6).map((a) => ({
          name: a.getAttribute('aria-label') ?? '',
          details: ((a.parentElement as HTMLElement | null)?.innerText ?? '').replace(/\s+/g, ' ').slice(0, 320),
        }))
      })
      return {
        query,
        url,
        results: results.map((r) => ({
          ...r,
          rating: parseFloat((r.details.match(/\b([1-5][.,]\d)\b/)?.[1] ?? '').replace(',', '.')) || null,
        })),
      }
    })
  }

  // === Prints de uma página em partes (para a revisão visual de um site) ===

  async pageShots(url: string, name: string): Promise<{ url: string; ok: boolean; status: number; loadMs: number | null; shots: string[]; brokenImages: number; consoleErrors: string[] }> {
    const dir = path.join(this.outDir(name), 'revisao-site')
    fs.mkdirSync(dir, { recursive: true })
    return this.withPage(async (page) => {
      const errors: string[] = []
      page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)))
      const started = Date.now()
      let status = 0
      try {
        const res = await page.goto(url, { waitUntil: 'load', timeout: 60_000 })
        status = res?.status() ?? 0
      } catch (err) {
        return { url, ok: false, status, loadMs: null, shots: [], brokenImages: 0, consoleErrors: [String(err).slice(0, 200)] }
      }
      const loadMs = Date.now() - started
      // Rola até o fim para disparar animações e imagens preguiçosas
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 700) {
          window.scrollTo(0, y)
          await new Promise((r) => setTimeout(r, 120))
        }
        window.scrollTo(0, 0)
      })
      await page.waitForTimeout(1500)
      const brokenImages = await page.evaluate(() => (Array.from(document.images) as HTMLImageElement[]).filter((i) => i.complete && i.naturalWidth === 0).length)
      const stamp = Date.now()
      const shots: string[] = []
      const height = await page.evaluate(() => document.body.scrollHeight)
      for (const [i, y] of [0, 1100, 2200].entries()) {
        if (y > 0 && y >= height) break
        const file = path.join(dir, `computador-${i + 1}-${stamp}.jpg`)
        await page.screenshot({ path: file, type: 'jpeg', quality: 55, fullPage: true, clip: { x: 0, y, width: 1280, height: Math.min(1100, height - y) } }).catch(() => {})
        if (fs.existsSync(file)) shots.push(file)
      }
      await page.setViewportSize({ width: 390, height: 844 })
      await page.waitForTimeout(1200)
      const mobile = path.join(dir, `celular-${stamp}.jpg`)
      await page.screenshot({ path: mobile, type: 'jpeg', quality: 55, fullPage: true, clip: { x: 0, y: 0, width: 390, height: 1700 } }).catch(() => {})
      if (fs.existsSync(mobile)) shots.push(mobile)
      this.log('success', `Prints de ${url}: ${shots.length} imagens, ${brokenImages} imagens quebradas`)
      return { url, ok: status > 0 && status < 400, status, loadMs, shots, brokenImages, consoleErrors: errors.slice(0, 5) }
    })
  }

  // === Kit da marca: logo, fotos e cores que o negócio realmente usa ===

  async brandKit(handleInput: string, siteUrl: string | null): Promise<Record<string, unknown>> {
    const handle = handleInput.replace(/^@/, '').trim()
    const dir = path.join(this.outDir(handle), 'marca')
    fs.mkdirSync(dir, { recursive: true })
    this.log('info', `Marca: coletando logo, fotos e cores de @${handle}`)

    const saveImage = async (ctx: BrowserContext, url: string, name: string): Promise<string | null> => {
      try {
        const res = await ctx.request.get(url, { timeout: 30_000 })
        if (!res.ok()) return null
        const type = res.headers()['content-type'] ?? ''
        if (!type.startsWith('image/')) return null
        const body = await res.body()
        if (body.length < 3_000 || body.length > 8_000_000) return null
        const ext = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : type.includes('svg') ? 'svg' : 'jpg'
        const file = path.join(dir, `${name}.${ext}`)
        fs.writeFileSync(file, body)
        return file
      } catch {
        return null
      }
    }

    return this.withPage(async (page, ctx) => {
      const files: { logoInstagram: string | null; logoSite: string | null; fotosInstagram: string[]; fotosSite: string[] } = {
        logoInstagram: null,
        logoSite: null,
        fotosInstagram: [],
        fotosSite: [],
      }
      const siteColors: string[] = []

      // Instagram: foto do perfil (quase sempre o logo) e as imagens do grid
      try {
        await page.goto(`https://www.instagram.com/${handle}/`, { waitUntil: 'domcontentloaded', timeout: 45_000 })
        await page.waitForTimeout(4500)
        const imgs = await page.evaluate(() => {
          const header = document.querySelector('header')
          const avatar = (header?.querySelector('img') as HTMLImageElement | null)?.src ?? ''
          const grid = (Array.from(document.querySelectorAll('a[href*="/p/"] img, a[href*="/reel/"] img')) as HTMLImageElement[])
            .map((i) => i.currentSrc || i.src)
            .filter(Boolean)
          return { avatar, grid: [...new Set(grid)].slice(0, 9) }
        })
        if (imgs.avatar) files.logoInstagram = await saveImage(ctx, imgs.avatar, 'logo-instagram')
        for (const [i, src] of imgs.grid.entries()) {
          const f = await saveImage(ctx, src, `foto-instagram-${i + 1}`)
          if (f) files.fotosInstagram.push(f)
        }
      } catch {
        /* segue com o site */
      }

      // Site: logo, fotos grandes e cores dos botões e cabeçalho
      if (siteUrl) {
        try {
          await page.goto(siteUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 })
          await page.waitForTimeout(3500)
          const found = await page.evaluate(() => {
            const abs = (u: string | null | undefined) => {
              try {
                return u ? new URL(u, location.href).href : ''
              } catch {
                return ''
              }
            }
            const imgs = Array.from(document.querySelectorAll('img')) as HTMLImageElement[]
            const logo =
              imgs.find((i) => /logo/i.test(`${i.src} ${i.alt} ${i.className} ${i.id}`))?.currentSrc ||
              abs(document.querySelector('link[rel*="apple-touch-icon"]')?.getAttribute('href')) ||
              abs(document.querySelector('meta[property="og:image"]')?.getAttribute('content'))
            const photos = imgs
              .filter((i) => i.naturalWidth >= 500 && i.naturalHeight >= 300 && !/logo|icon/i.test(`${i.src} ${i.alt}`))
              .sort((a, b) => b.naturalWidth * b.naturalHeight - a.naturalWidth * a.naturalHeight)
              .map((i) => i.currentSrc || i.src)
            const colors: string[] = []
            const pick = (el: Element | null) => {
              if (!el) return
              const st = getComputedStyle(el)
              for (const c of [st.backgroundColor, st.color]) if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) colors.push(c)
            }
            document.querySelectorAll('header, nav, footer, button, a[class*="btn"], a[class*="button"], .elementor-button').forEach((el, i) => {
              if (i < 40) pick(el)
            })
            const theme = document.querySelector('meta[name="theme-color"]')?.getAttribute('content')
            if (theme) colors.push(theme)
            return { logo: logo || '', photos: [...new Set(photos)].slice(0, 8), colors }
          })
          if (found.logo) files.logoSite = await saveImage(ctx, found.logo, 'logo-site')
          for (const [i, src] of found.photos.entries()) {
            const f = await saveImage(ctx, src, `foto-site-${i + 1}`)
            if (f) files.fotosSite.push(f)
          }
          siteColors.push(...found.colors)
        } catch {
          /* site indisponível: fica só o Instagram */
        }
      }

      // Paleta: lê as imagens num canvas e conta as cores dominantes (sem enviar nada para fora).
      // Cores da MARCA vêm dos logos e do CSS do site; os tons das FOTOS ficam à parte (pele e ambiente distorcem a marca).
      const toDataUrl = (f: string) => `data:image/${path.extname(f).slice(1).replace('jpg', 'jpeg')};base64,${fs.readFileSync(f).toString('base64')}`
      const notSvg = (f: string | null): f is string => !!f && !f.endsWith('.svg')
      const logoUrls = [files.logoInstagram, files.logoSite].filter(notSvg).map(toDataUrl)
      const photoUrls = [...files.fotosInstagram, ...files.fotosSite].filter(notSvg).map(toDataUrl)
      const images = [...logoUrls, ...photoUrls]
      await page.setContent('<html><body></body></html>')
      const computePalette = async ({ urls, cssColors }: { urls: string[]; cssColors: string[] }) => {
          const toHex = (r: number, g: number, b: number) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')
          const buckets = new Map<string, { r: number; g: number; b: number; n: number }>()
          const add = (r: number, g: number, b: number, weight: number) => {
            const key = `${r >> 5}-${g >> 5}-${b >> 5}`
            const cur = buckets.get(key) ?? { r: 0, g: 0, b: 0, n: 0 }
            cur.r += r * weight
            cur.g += g * weight
            cur.b += b * weight
            cur.n += weight
            buckets.set(key, cur)
          }
          for (const url of urls) {
            const img = new Image()
            img.src = url
            try {
              await img.decode()
            } catch {
              continue
            }
            const canvas = document.createElement('canvas')
            canvas.width = 48
            canvas.height = 48
            const ctx = canvas.getContext('2d')
            if (!ctx) continue
            ctx.drawImage(img, 0, 0, 48, 48)
            const data = ctx.getImageData(0, 0, 48, 48).data
            for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 200) add(data[i], data[i + 1], data[i + 2], 1)
          }
          // Cores do CSS do site pesam mais: são escolhas de marca, não de fotografia
          for (const c of cssColors) {
            const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/) ?? c.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)
            if (!m) continue
            const nums = c.startsWith('#') ? [1, 2, 3].map((i) => parseInt(m[i], 16)) : [1, 2, 3].map((i) => Number(m[i]))
            add(nums[0], nums[1], nums[2], 120)
          }
          const all = [...buckets.values()]
            .map((b) => ({ r: Math.round(b.r / b.n), g: Math.round(b.g / b.n), b: Math.round(b.b / b.n), n: b.n }))
            .sort((a, b) => b.n - a.n)
          const total = all.reduce((acc, c) => acc + c.n, 0) || 1
          const sat = (c: { r: number; g: number; b: number }) => {
            const max = Math.max(c.r, c.g, c.b)
            const min = Math.min(c.r, c.g, c.b)
            return max === 0 ? 0 : (max - min) / max
          }
          const describe = (c: { r: number; g: number; b: number; n: number }) => ({ hex: toHex(c.r, c.g, c.b), percentual: Math.round((c.n / total) * 1000) / 10 })
          return {
            coresDeDestaque: all.filter((c) => sat(c) > 0.28 && Math.max(c.r, c.g, c.b) > 60).slice(0, 6).map(describe),
            neutras: all.filter((c) => sat(c) <= 0.28).slice(0, 4).map(describe),
          }
        }
      const brand = await page.evaluate(computePalette, { urls: logoUrls, cssColors: siteColors })
      const photos = await page.evaluate(computePalette, { urls: photoUrls, cssColors: [] })
      const palette = {
        coresDaMarca: brand.coresDeDestaque,
        neutrasDaMarca: brand.neutras,
        tonsDasFotos: photos.coresDeDestaque.slice(0, 4),
        coresDeDestaque: brand.coresDeDestaque,
      }

      const result = { pasta: dir, ...files, paleta: palette, coresDoSite: [...new Set(siteColors)].slice(0, 12), coletadoEm: new Date().toISOString() }
      fs.writeFileSync(path.join(dir, 'marca.json'), JSON.stringify(result, null, 2), 'utf-8')
      this.log('success', `Marca de @${handle}: ${images.length} imagens, cores ${palette.coresDeDestaque.map((c) => c.hex).join(' ')}`)
      return result
    })
  }

  // === Ficha do negócio no Google: nota, contato, horário e o texto das avaliações ===

  async googlePlace(query: string, nameHint: string): Promise<Record<string, unknown>> {
    const url = `https://www.google.com/maps/search/${encodeURIComponent(query)}?hl=pt-BR`
    this.log('info', `Google: abrindo a ficha de "${nameHint}"`)
    return this.withPage(async (page) => {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 })
      await page.waitForTimeout(6000)
      // Se caiu numa lista, abre o resultado cujo nome mais parece com o do negócio
      const tokens = nameHint.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter((t) => t.length >= 4)
      const opened = await page.evaluate((toks) => {
        const cards = Array.from(document.querySelectorAll('a.hfpxzc')) as HTMLAnchorElement[]
        if (cards.length === 0) return 'ficha'
        const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
        const best = cards
          .map((a) => ({ a, score: toks.filter((t) => norm(a.getAttribute('aria-label') ?? '').includes(t)).length }))
          .sort((x, y) => y.score - x.score)[0]
        if (!best || best.score === 0) return 'nao-encontrado'
        best.a.click()
        return 'clicado'
      }, tokens)
      if (opened === 'nao-encontrado') return { query, encontrado: false, observacao: 'Nenhum resultado do Google Maps tem o nome do negócio.' }
      await page.waitForTimeout(5000)

      const ficha = await page.evaluate(() => {
        const main = (document.querySelector('div[role="main"][aria-label]') ?? document.querySelector('div[role="main"]')) as HTMLElement | null
        const text = main?.innerText ?? ''
        const byItem = (id: string) => (document.querySelector(`[data-item-id^="${id}"]`) as HTMLElement | null)?.innerText?.replace(/\s+/g, ' ').trim() ?? ''
        const ratingText = (main?.querySelector('div.F7nice') as HTMLElement | null)?.innerText ?? ''
        return {
          nome: (main?.querySelector('h1') as HTMLElement | null)?.innerText ?? main?.getAttribute('aria-label') ?? '',
          categoria: (main?.querySelector('button[jsaction*="category"]') as HTMLElement | null)?.innerText ?? '',
          notaETotal: ratingText.replace(/\s+/g, ' '),
          endereco: byItem('address'),
          telefone: byItem('phone'),
          site: byItem('authority'),
          horario: ((main?.querySelector('[aria-label*="Horário"], [aria-label*="horário"]') as HTMLElement | null)?.getAttribute('aria-label') ?? '').slice(0, 400),
          resumo: text.replace(/\s+/g, ' ').slice(0, 900),
        }
      })

      // Aba de avaliações: rola algumas vezes e lê os textos (sem guardar o nome de quem avaliou)
      const reviews: Array<{ estrelas: number | null; quando: string; texto: string; respostaDoDono: boolean }> = []
      try {
        const tab = page.locator('button[role="tab"]', { hasText: /Avalia/i }).first()
        if (await tab.count()) {
          await tab.click()
          await page.waitForTimeout(3500)
          for (let i = 0; i < 5; i++) {
            await page.evaluate(() => {
              const scroller = document.querySelector('div.m6QErb.DxyBCb') ?? document.querySelector('div[role="main"] div[tabindex="-1"]')
              scroller?.scrollBy(0, 2500)
            })
            await page.waitForTimeout(1500)
          }
          await page.evaluate(() => document.querySelectorAll('button.w8nwRe').forEach((b) => (b as HTMLButtonElement).click())).catch(() => {})
          const items = await page.evaluate(() =>
            (Array.from(document.querySelectorAll('div.jftiEf')) as HTMLElement[]).slice(0, 25).map((el) => ({
              estrelas: Number((el.querySelector('span.kvMYJc') as HTMLElement | null)?.getAttribute('aria-label')?.match(/\d/)?.[0] ?? '') || null,
              quando: (el.querySelector('span.rsqaWe') as HTMLElement | null)?.innerText ?? '',
              texto: ((el.querySelector('span.wiI7pd') as HTMLElement | null)?.innerText ?? '').replace(/\s+/g, ' ').slice(0, 700),
              respostaDoDono: !!el.querySelector('div.CDe7pd'),
            }))
          )
          reviews.push(...items.filter((r) => r.texto || r.estrelas))
        }
      } catch {
        /* sem avaliações legíveis */
      }

      const limitado = /visualização limitada do Google Maps|limited view of Google Maps/i.test(ficha.resumo)
      const nota = parseFloat((ficha.notaETotal.match(/([1-5][.,]\d)/)?.[1] ?? '').replace(',', '.')) || null
      const total = Number((ficha.notaETotal.match(/\(([\d.]+)\)/)?.[1] ?? '').replace(/\./g, '')) || null
      this.log('success', `Google: ${ficha.nome} nota ${nota ?? '?'} (${total ?? '?'} avaliações), ${reviews.length} avaliações lidas`)
      return {
        query,
        encontrado: true,
        ...ficha,
        nota,
        totalDeAvaliacoes: total,
        avaliacoesLidas: reviews,
        avaliacoesNegativas: reviews.filter((r) => r.estrelas !== null && r.estrelas <= 3).length,
        avaliacoesRespondidasPeloDono: reviews.filter((r) => r.respostaDoDono).length,
        observacao: limitado && reviews.length === 0 ? 'O Google mostrou a visualização limitada (sem login), então o texto das avaliações não pôde ser lido. Conecte uma conta Google em Diagnóstico > conectar Google.' : null,
        url: page.url(),
      }
    })
  }

  // === WhatsApp (teste de atendimento) ===

  private async openWhatsAppChat(page: Page, phone: string, text?: string): Promise<'ready' | 'not_connected' | 'invalid_number'> {
    const target = `https://web.whatsapp.com/send?phone=${phone.replace(/\D/g, '')}${text ? `&text=${encodeURIComponent(text)}` : ''}`
    await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    const deadline = Date.now() + 60_000
    while (Date.now() < deadline) {
      await page.waitForTimeout(1500)
      const state = await page.evaluate(() => {
        if (document.querySelector('footer [contenteditable="true"]')) return 'ready'
        if (document.querySelector('canvas[aria-label*="QR"], [data-ref] canvas, div[data-ref]')) return 'not_connected'
        if (/número de telefone compartilhado por url é inválido|phone number shared via url is invalid/i.test(document.body.innerText)) return 'invalid_number'
        return 'loading'
      })
      if (state !== 'loading') return state as 'ready' | 'not_connected' | 'invalid_number'
    }
    return 'not_connected'
  }

  async whatsappSend(phone: string, message: string): Promise<{ sent: boolean; sentAt: string | null; reason?: string }> {
    return this.withPage(async (page) => {
      const state = await this.openWhatsAppChat(page, phone, message)
      if (state === 'not_connected') return { sent: false, sentAt: null, reason: 'WhatsApp Web não está conectado neste computador. Conecte em Diagnóstico > Contas conectadas.' }
      if (state === 'invalid_number') return { sent: false, sentAt: null, reason: 'Número sem WhatsApp ou inválido.' }
      await page.locator('footer [contenteditable="true"]').first().press('Enter')
      await page.waitForTimeout(3000)
      this.log('success', `WhatsApp: mensagem de teste enviada para ${phone}`)
      return { sent: true, sentAt: new Date().toISOString() }
    })
  }

  async whatsappRead(phone: string): Promise<{ connected: boolean; incoming: Array<{ meta: string; text: string }> }> {
    return this.withPage(async (page) => {
      const state = await this.openWhatsAppChat(page, phone)
      if (state !== 'ready') return { connected: false, incoming: [] }
      await page.waitForTimeout(3000)
      const incoming = await page.evaluate(() =>
        Array.from(document.querySelectorAll('div.message-in'))
          .slice(-10)
          .map((el) => ({
            meta: el.querySelector('[data-pre-plain-text]')?.getAttribute('data-pre-plain-text') ?? '',
            text: (el as HTMLElement).innerText.replace(/\s+/g, ' ').slice(0, 600),
          }))
      )
      return { connected: true, incoming }
    })
  }
}
