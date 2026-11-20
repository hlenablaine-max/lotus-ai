import * as http from 'http'
import * as crypto from 'crypto'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { spawn } from 'child_process'
import { WebSocketServer, WebSocket } from 'ws'
import { LocalRuntime } from './local-runtime'
import { htmlFileToPdf } from './pdf'
import { toJpeg } from './image'
import { qrDataUrl } from './whatsapp'

const PORT_START = 3777
const PORT_FILE = path.join(os.homedir(), 'LOTUS_Workspace', '.runtime-port')
const MAX_BODY_BYTES = 20 * 1024 * 1024

// Servidor local (somente 127.0.0.1 + token) que o backend do LOTUS usa para agir no computador.
export class RuntimeHttpServer {
  private server: http.Server
  private wss: WebSocketServer
  private runtime: LocalRuntime
  private port: number = PORT_START
  private token: string

  constructor(runtime: LocalRuntime) {
    this.runtime = runtime
    this.token = crypto.randomBytes(32).toString('hex')
    this.server = this.createServer()
    this.wss = new WebSocketServer({ server: this.server })
    this.setupWebSocket()
  }

  private isLocal(req: http.IncomingMessage): boolean {
    const addr = req.socket.remoteAddress || ''
    return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1'
  }

  private createServer(): http.Server {
    return http.createServer(async (req, res) => {
      if (!this.isLocal(req)) {
        res.writeHead(403)
        res.end('Forbidden')
        return
      }

      // Sem CORS: só o backend do LOTUS (server-side) fala com este servidor, nunca uma página web.
      const provided = String(req.headers['x-runtime-token'] || '')
      const valid =
        provided.length === this.token.length &&
        crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(this.token))
      if (!valid) {
        res.writeHead(401)
        res.end('Unauthorized')
        return
      }

      try {
        const body = await readBody(req)
        const data = body ? JSON.parse(body) : {}
        const result = await this.handleRequest((req.url || '/').split('?')[0], data)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(result))
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: err?.message ?? String(err) }))
      }
    })
  }

  private async handleRequest(url: string, data: any): Promise<unknown> {
    const rt = this.runtime
    switch (url) {
      case '/ping':
        return { ok: true, version: '2.0', repoDir: rt.getRepoDir() }
      case '/runtime/status':
        return rt.getStatus()
      case '/runtime/device-info':
        return rt.getDeviceInfo()

      case '/runtime/exec':
        return rt.execCommand(data.cmd, data.cwd, data.timeoutMs)
      case '/runtime/exec-python':
        return rt.execPython(data.script, data.cwd)
      case '/runtime/exec-node':
        return rt.execNode(data.script, data.cwd)

      case '/runtime/fs/read':
        return rt.readFile(data.path, data.offset, data.limit)
      case '/runtime/fs/write':
        return rt.writeFile(data.path, data.content ?? '')
      case '/runtime/fs/edit':
        return rt.editFile(data.path, data.oldString, data.newString, !!data.replaceAll)
      case '/runtime/fs/mkdir':
        await rt.createDir(data.path)
        return { ok: true }
      case '/runtime/fs/list':
        return rt.listDir(data.path)
      case '/runtime/fs/exists':
        return { exists: await rt.fileExists(data.path) }
      case '/runtime/fs/search':
        return rt.searchFiles(data.pattern, data.path, data.glob, data.maxResults)

      case '/runtime/backups/list':
        return { backups: rt.listBackups(data.limit) }
      case '/runtime/backups/restore':
        return rt.restoreBackups({ id: data.id, count: data.count })

      case '/runtime/browser/open':
      case '/runtime/browser/navigate':
        await rt.browserOpen(data.url)
        return { ok: true }
      case '/runtime/browser/click':
        await rt.browserClick(data.selector)
        return { ok: true }
      case '/runtime/browser/type':
        await rt.browserType(data.selector, data.text)
        return { ok: true }
      case '/runtime/browser/get-text':
        return { text: await rt.browserGetText(data.selector) }
      case '/runtime/browser/screenshot':
        return rt.browserScreenshot()
      case '/runtime/browser/close':
        await rt.browserClose()
        return { ok: true }

      case '/runtime/research/status':
        return rt.research.status()
      case '/runtime/research/connect':
        return rt.research.connect(data.service === 'whatsapp' ? 'whatsapp' : data.service === 'google' ? 'google' : 'instagram')
      case '/runtime/research/close':
        await rt.research.close()
        return { ok: true }
      case '/runtime/research/instagram':
        return rt.research.instagramProfile(String(data.handle ?? ''), data.maxPosts)
      case '/runtime/research/release':
        return rt.research.release()
      case '/runtime/research/reel':
        return rt.research.reelMedia(String(data.url ?? ''), String(data.name ?? 'negocio'))
      case '/runtime/research/reel-download':
        return rt.research.reelDownload(String(data.url ?? ''), String(data.name ?? 'negocio'))
      case '/runtime/research/reel-analyze':
        return rt.research.reelAnalyze(String(data.url ?? ''), String(data.name ?? 'negocio'), Array.isArray(data.files) ? data.files.map(String) : [])
      case '/runtime/research/ads':
        return rt.research.metaAds(String(data.query ?? ''))
      case '/runtime/research/site':
        return rt.research.site(String(data.url ?? ''), String(data.name ?? 'negocio'))
      case '/runtime/research/shots':
        return rt.research.pageShots(String(data.url ?? ''), String(data.name ?? 'site'))
      case '/runtime/research/brand':
        return rt.research.brandKit(String(data.handle ?? ''), data.site ? String(data.site) : null)
      case '/runtime/research/place':
        return rt.research.googlePlace(String(data.query ?? ''), String(data.name ?? ''))
      case '/runtime/research/maps':
        return rt.research.googleMaps(String(data.query ?? ''))
      // WhatsApp das clínicas (atendimento)
      case '/runtime/wa/connect':
        return rt.whatsapp.connect(String(data.clientId ?? ''))
      case '/runtime/wa/status':
        return rt.whatsapp.status(String(data.clientId ?? ''))
      case '/runtime/wa/list':
        return { sessions: rt.whatsapp.list() }
      case '/runtime/wa/disconnect':
        return rt.whatsapp.disconnect(String(data.clientId ?? ''), !!data.logout)
      case '/runtime/wa/send':
        return rt.whatsapp.send(String(data.clientId ?? ''), String(data.to ?? ''), String(data.text ?? ''), Number(data.maxWaitMs) || 120_000)
      case '/runtime/wa/shield':
        return { shield: rt.whatsapp.shieldStatus(String(data.clientId ?? '')) }
      case '/runtime/wa/check':
        return rt.whatsapp.checkNumber(String(data.clientId ?? ''), String(data.phone ?? ''))
      case '/runtime/qr':
        return { image: await qrDataUrl(String(data.text ?? '')) }

      case '/runtime/research/whatsapp-qr':
        return rt.research.whatsappQr()
      case '/runtime/research/whatsapp-qr-stop':
        return rt.research.whatsappQrStop()
      case '/runtime/research/avatar':
        return rt.research.instagramAvatar(String(data.handle ?? ''), String(data.outFile ?? ''))
      case '/runtime/image/jpeg':
        return toJpeg(String(data.input ?? ''), String(data.output ?? ''), Number(data.maxWidth ?? 1800), Number(data.quality ?? 82))
      case '/runtime/pdf':
        return htmlFileToPdf(String(data.htmlPath ?? ''), String(data.outPath ?? ''))
      case '/runtime/research/whatsapp-send':
        return rt.research.whatsappSend(String(data.phone ?? ''), String(data.message ?? ''))
      case '/runtime/research/whatsapp-read':
        return rt.research.whatsappRead(String(data.phone ?? ''))

      default:
        throw new Error(`Endpoint desconhecido: ${url}`)
    }
  }

  // === WebSocket (terminal com saída em tempo real) ===

  private setupWebSocket(): void {
    this.wss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
      if (!this.isLocal(req)) {
        ws.close(1008, 'Forbidden')
        return
      }

      ws.once('message', (raw: Buffer) => {
        try {
          const msg = JSON.parse(raw.toString())
          if (msg.token !== this.token) {
            ws.close(1008, 'Unauthorized')
            return
          }
          const { cmd, cwd } = msg
          if (!cmd) {
            ws.close(1003, 'Missing cmd')
            return
          }

          const workDir = cwd ? this.runtime.resolvePath(cwd) : path.join(os.homedir(), 'LOTUS_Workspace')
          const proc = spawn(cmd, { shell: true, cwd: workDir })
          const sendOut = (text: string) => {
            if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'output', data: text }))
          }
          proc.stdout.on('data', (data: Buffer) => sendOut(data.toString()))
          proc.stderr.on('data', (data: Buffer) => sendOut(`[stderr] ${data.toString()}`))
          proc.on('close', (code: number) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'exit', code }))
              ws.close()
            }
          })
          ws.on('close', () => proc.kill())
        } catch {
          ws.close(1003, 'Invalid message')
        }
      })

      ws.on('error', () => ws.close())
    })
  }

  // === Lifecycle ===

  async start(): Promise<{ port: number; token: string }> {
    return new Promise((resolve, reject) => {
      const tryListen = () => {
        this.server.listen(this.port, '127.0.0.1', () => {
          this.writePortFile()
          console.log(`[RuntimeServer] http://127.0.0.1:${this.port}`)
          resolve({ port: this.port, token: this.token })
        })
      }

      this.server.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          this.port++
          if (this.port > PORT_START + 20) {
            reject(new Error('Nenhuma porta disponível'))
            return
          }
          tryListen()
        } else {
          reject(err)
        }
      })

      tryListen()
    })
  }

  private writePortFile(): void {
    const dir = path.dirname(PORT_FILE)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(
      PORT_FILE,
      JSON.stringify({ port: this.port, token: this.token, repoDir: this.runtime.getRepoDir(), pid: process.pid }),
      { encoding: 'utf-8', mode: 0o600 }
    )
  }

  stop(): void {
    this.wss.close()
    this.server.close()
    if (fs.existsSync(PORT_FILE)) fs.unlinkSync(PORT_FILE)
  }

  getPort(): number { return this.port }
  getToken(): string { return this.token }
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Corpo da requisição grande demais'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
    req.on('error', reject)
  })
}
