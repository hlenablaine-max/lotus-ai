import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { exec, spawn } from 'child_process'
import { promisify } from 'util'
import { BrowserWindow } from 'electron'
import type { Browser, Page } from 'playwright'

const execAsync = promisify(exec)

// Diretório de trabalho autorizado para os agentes
const WORKSPACE_DIR = path.join(os.homedir(), 'LOTUS_Workspace')

export interface CommandResult {
  success: boolean
  stdout: string
  stderr: string
  exitCode: number
  duration: number
}

export interface DeviceInfo {
  hostname: string
  platform: string
  arch: string
  cpus: number
  totalMemory: number
  freeMemory: number
  workspaceDir: string
  nodeVersion: string
  pythonAvailable: boolean
  gitAvailable: boolean
}

export class LocalRuntime {
  private mainWindow: BrowserWindow | null = null
  private browser: Browser | null = null
  private page: Page | null = null
  private status: 'idle' | 'busy' | 'error' = 'idle'

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow
    this.ensureWorkspace()
  }

  private ensureWorkspace() {
    if (!fs.existsSync(WORKSPACE_DIR)) {
      fs.mkdirSync(WORKSPACE_DIR, { recursive: true })
    }
  }

  private log(level: 'info' | 'warn' | 'error' | 'success', message: string, source?: string) {
    const log = { level, message, timestamp: new Date().toISOString(), source }
    console.log(`[Runtime][${level}] ${message}`)
    this.mainWindow?.webContents.send('runtime:log', log)
  }

  private resolvePath(inputPath: string): string {
    // Segurança: só permite caminhos dentro do workspace
    const resolved = path.resolve(WORKSPACE_DIR, inputPath)
    if (!resolved.startsWith(WORKSPACE_DIR)) {
      throw new Error(`Acesso negado: caminho fora do workspace autorizado`)
    }
    return resolved
  }

  // === FILESYSTEM ===

  async readFile(filePath: string): Promise<string> {
    const resolved = this.resolvePath(filePath)
    this.log('info', `Lendo arquivo: ${resolved}`, 'filesystem')
    return fs.readFileSync(resolved, 'utf-8')
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    const resolved = this.resolvePath(filePath)
    const dir = path.dirname(resolved)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(resolved, content, 'utf-8')
    this.log('success', `Arquivo criado/atualizado: ${resolved}`, 'filesystem')
  }

  async createDir(dirPath: string): Promise<void> {
    const resolved = this.resolvePath(dirPath)
    fs.mkdirSync(resolved, { recursive: true })
    this.log('success', `Pasta criada: ${resolved}`, 'filesystem')
  }

  async listDir(dirPath: string): Promise<string[]> {
    const resolved = this.resolvePath(dirPath)
    if (!fs.existsSync(resolved)) return []
    return fs.readdirSync(resolved)
  }

  async fileExists(filePath: string): Promise<boolean> {
    try {
      const resolved = this.resolvePath(filePath)
      return fs.existsSync(resolved)
    } catch {
      return false
    }
  }

  // === EXECUÇÃO DE COMANDOS ===

  async execCommand(cmd: string, cwd?: string): Promise<CommandResult> {
    const workDir = cwd ? this.resolvePath(cwd) : WORKSPACE_DIR
    const start = Date.now()
    this.log('info', `Executando: ${cmd}`, 'exec')
    this.status = 'busy'

    try {
      const { stdout, stderr } = await execAsync(cmd, {
        cwd: workDir,
        timeout: 60000,
        maxBuffer: 10 * 1024 * 1024, // 10MB
      })
      const duration = Date.now() - start
      this.status = 'idle'
      this.log('success', `Concluído em ${duration}ms: ${cmd}`, 'exec')
      return { success: true, stdout: stdout || '', stderr: stderr || '', exitCode: 0, duration }
    } catch (err: any) {
      this.status = 'error'
      this.log('error', `Erro ao executar: ${cmd} — ${err.message}`, 'exec')
      return {
        success: false,
        stdout: err.stdout || '',
        stderr: err.stderr || err.message,
        exitCode: err.code || 1,
        duration: Date.now() - start,
      }
    }
  }

  async execPython(script: string, cwd?: string): Promise<CommandResult> {
    const workDir = cwd ? this.resolvePath(cwd) : WORKSPACE_DIR
    // Salva o script temporariamente e executa
    const tmpFile = path.join(WORKSPACE_DIR, `.tmp_script_${Date.now()}.py`)
    fs.writeFileSync(tmpFile, script, 'utf-8')
    try {
      const result = await this.execCommand(`python "${tmpFile}"`, workDir)
      return result
    } finally {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile)
    }
  }

  async execNode(script: string, cwd?: string): Promise<CommandResult> {
    const workDir = cwd ? this.resolvePath(cwd) : WORKSPACE_DIR
    const tmpFile = path.join(WORKSPACE_DIR, `.tmp_script_${Date.now()}.js`)
    fs.writeFileSync(tmpFile, script, 'utf-8')
    try {
      const result = await this.execCommand(`node "${tmpFile}"`, workDir)
      return result
    } finally {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile)
    }
  }

  openTerminalStream(cmd: string, cwd?: string): void {
    const workDir = cwd ? this.resolvePath(cwd) : WORKSPACE_DIR
    this.log('info', `Terminal: ${cmd}`, 'terminal')

    const proc = spawn(cmd, { shell: true, cwd: workDir })

    proc.stdout.on('data', (data: Buffer) => {
      this.mainWindow?.webContents.send('terminal:output', data.toString())
    })
    proc.stderr.on('data', (data: Buffer) => {
      this.mainWindow?.webContents.send('terminal:output', `[stderr] ${data.toString()}`)
    })
    proc.on('close', (code: number) => {
      this.mainWindow?.webContents.send('terminal:output', `\n[Processo encerrado com código ${code}]\n`)
    })
  }

  // === BROWSER AUTOMATION (Playwright) ===

  async browserOpen(url: string): Promise<void> {
    if (!this.browser) {
      const { chromium } = await import('playwright')
      this.browser = await chromium.launch({ headless: false })
      const ctx = await this.browser.newContext()
      this.page = await ctx.newPage()
    }
    await this.page!.goto(url, { waitUntil: 'networkidle' })
    this.log('info', `Browser aberto em: ${url}`, 'browser')
  }

  async browserNavigate(url: string): Promise<void> {
    if (!this.page) throw new Error('Browser não iniciado. Chame browserOpen primeiro.')
    await this.page.goto(url, { waitUntil: 'networkidle' })
    this.log('info', `Navegando para: ${url}`, 'browser')
  }

  async browserClick(selector: string): Promise<void> {
    if (!this.page) throw new Error('Browser não iniciado.')
    await this.page.click(selector)
    this.log('info', `Clicou em: ${selector}`, 'browser')
  }

  async browserType(selector: string, text: string): Promise<void> {
    if (!this.page) throw new Error('Browser não iniciado.')
    await this.page.fill(selector, text)
    this.log('info', `Digitou em ${selector}: ${text.substring(0, 50)}...`, 'browser')
  }

  async browserGetText(selector: string): Promise<string> {
    if (!this.page) throw new Error('Browser não iniciado.')
    return await this.page.textContent(selector) || ''
  }

  async browserScreenshot(): Promise<string> {
    if (!this.page) throw new Error('Browser não iniciado.')
    const screenshot = await this.page.screenshot({ type: 'png' })
    const base64 = screenshot.toString('base64')
    this.log('info', 'Screenshot capturado', 'browser')
    return `data:image/png;base64,${base64}`
  }

  async browserClose(): Promise<void> {
    await this.browser?.close()
    this.browser = null
    this.page = null
    this.log('info', 'Browser fechado', 'browser')
  }

  // === INFO E STATUS ===

  async getDeviceInfo(): Promise<DeviceInfo> {
    let pythonAvailable = false
    let gitAvailable = false

    try {
      await execAsync('python --version')
      pythonAvailable = true
    } catch {
      try {
        await execAsync('python3 --version')
        pythonAvailable = true
      } catch { /* não disponível */ }
    }

    try {
      await execAsync('git --version')
      gitAvailable = true
    } catch { /* não disponível */ }

    return {
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      cpus: os.cpus().length,
      totalMemory: Math.round(os.totalmem() / 1024 / 1024 / 1024),
      freeMemory: Math.round(os.freemem() / 1024 / 1024 / 1024),
      workspaceDir: WORKSPACE_DIR,
      nodeVersion: process.version,
      pythonAvailable,
      gitAvailable,
    }
  }

  getStatus() {
    return {
      status: this.status,
      workspaceDir: WORKSPACE_DIR,
      browserOpen: this.browser !== null,
    }
  }

  async destroy() {
    await this.browserClose()
  }
}
