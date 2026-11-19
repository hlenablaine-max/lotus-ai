import * as http from 'http'
import * as crypto from 'crypto'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { spawn } from 'child_process'
import { WebSocketServer, WebSocket } from 'ws'
import { LocalRuntime } from './local-runtime'

const PORT_START = 3777
const PORT_FILE = path.join(os.homedir(), 'LOTUS_Workspace', '.runtime-port')

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

  // ===  HTTP ===

  private createServer(): http.Server {
    return http.createServer(async (req, res) => {
      // Só aceita conexões do localhost
      const addr = req.socket.remoteAddress || ''
      if (!addr.includes('127.0.0.1') && !addr.includes('::1')) {
        res.writeHead(403)
        res.end('Forbidden')
        return
      }

      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Runtime-Token')

      if (req.method === 'OPTIONS') {
        res.writeHead(200)
        res.end()
        return
      }

      // Autenticação por token
      if (req.headers['x-runtime-token'] !== this.token) {
        res.writeHead(401)
        res.end('Unauthorized')
        return
      }

      try {
        const body = await readBody(req)
        const data = body ? JSON.parse(body) : {}
        const result = await this.handleRequest(req.url || '/', data)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(result))
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: err.message }))
      }
    })
  }

  private async handleRequest(url: string, data: any): Promise<unknown> {
    switch (url) {
      case '/ping':
        return { ok: true, version: '1.0' }
      case '/runtime/status':
        return this.runtime.getStatus()
      case '/runtime/device-info':
        return this.runtime.getDeviceInfo()
      case '/runtime/exec':
        return this.runtime.execCommand(data.cmd, data.cwd)
      case '/runtime/exec-python':
        return this.runtime.execPython(data.script, data.cwd)
      case '/runtime/exec-node':
        return this.runtime.execNode(data.script, data.cwd)
      case '/runtime/fs/read':
        return { content: await this.runtime.readFile(data.path) }
      case '/runtime/fs/write':
        await this.runtime.writeFile(data.path, data.content)
        return { ok: true }
      case '/runtime/fs/mkdir':
        await this.runtime.createDir(data.path)
        return { ok: true }
      case '/runtime/fs/list':
        return { files: await this.runtime.listDir(data.path) }
      case '/runtime/fs/exists':
        return { exists: await this.runtime.fileExists(data.path) }
      case '/runtime/browser/open':
        await this.runtime.browserOpen(data.url)
        return { ok: true }
      case '/runtime/browser/navigate':
        await this.runtime.browserNavigate(data.url)
        return { ok: true }
      case '/runtime/browser/click':
        await this.runtime.browserClick(data.selector)
        return { ok: true }
      case '/runtime/browser/type':
        await this.runtime.browserType(data.selector, data.text)
        return { ok: true }
      case '/runtime/browser/get-text':
        return { text: await this.runtime.browserGetText(data.selector) }
      case '/runtime/browser/screenshot':
        return { screenshot: await this.runtime.browserScreenshot() }
      case '/runtime/browser/close':
        await this.runtime.browserClose()
        return { ok: true }
      default:
        throw new Error(`Endpoint desconhecido: ${url}`)
    }
  }

  // === WebSocket (streaming terminal) ===

  private setupWebSocket(): void {
    this.wss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
      const addr = req.socket.remoteAddress || ''
      if (!addr.includes('127.0.0.1') && !addr.includes('::1')) {
        ws.close(1008, 'Forbidden')
        return
      }

      // Aguarda mensagem de auth antes de processar
      ws.once('message', (raw: Buffer) => {
        try {
          const msg = JSON.parse(raw.toString())
          if (msg.token !== this.token) {
            ws.close(1008, 'Unauthorized')
            return
          }

          // Autenenticado — inicia o terminal
          const { cmd, cwd } = msg
          if (!cmd) {
            ws.close(1003, 'Missing cmd')
            return
          }

          const workDir = cwd || path.join(os.homedir(), 'LOTUS_Workspace')
          const proc = spawn(cmd, { shell: true, cwd: workDir })

          const sendOut = (text: string) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'output', data: text }))
            }
          }

          proc.stdout.on('data', (data: Buffer) => sendOut(data.toString()))
          proc.stderr.on('data', (data: Buffer) => sendOut(`[stderr] ${data.toString()}`))
          proc.on('close', (code: number) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'exit', code }))
              ws.close()
            }
          })
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
    fs.writeFileSync(PORT_FILE, JSON.stringify({ port: this.port, token: this.token }), 'utf-8')
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
    let data = ''
    req.on('data', (chunk: Buffer) => { data += chunk.toString() })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}
