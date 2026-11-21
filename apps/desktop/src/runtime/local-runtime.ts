import { Transcriber } from './transcriber'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { exec, spawn } from 'child_process'
import { promisify } from 'util'
import { BrowserWindow } from 'electron'
import type { Browser, Page } from 'playwright'
import { ResearchBrowser } from './research'
import { WhatsAppHub } from './whatsapp'
import { WORKSPACE_DIR } from './paths'

export { WORKSPACE_DIR }

const execAsync = promisify(exec)

const BACKUP_DIR = path.join(WORKSPACE_DIR, '.backups')
const BACKUP_INDEX = path.join(BACKUP_DIR, 'index.jsonl')

const SEARCH_SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'dist', '.turbo', '.vercel', '.backups'])
const MAX_READ_BYTES = 400_000

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
  repoDir: string
  shell: string
  nodeVersion: string
  pythonAvailable: boolean
  gitAvailable: boolean
}

export interface BackupEntry {
  id: string
  ts: string
  path: string
  backup: string | null // null = arquivo não existia antes (restaurar = apagar)
}

export interface DirEntry {
  name: string
  type: 'file' | 'dir'
  size: number
}

export interface SearchMatch {
  file: string
  line: number
  text: string
}

export class LocalRuntime {
  private mainWindow: BrowserWindow | null = null
  private browser: Browser | null = null
  private page: Page | null = null
  private status: 'idle' | 'busy' | 'error' = 'idle'
  private repoDir: string
  // Navegador de pesquisa (perfil persistente) usado nos diagnósticos
  readonly research: ResearchBrowser
  // WhatsApp de cada clínica (aparelho conectado por QR code)
  readonly whatsapp: WhatsAppHub
  readonly transcriber: Transcriber

  constructor(mainWindow: BrowserWindow, repoDir: string) {
    this.mainWindow = mainWindow
    this.repoDir = repoDir
    this.research = new ResearchBrowser((level, message) => this.log(level, message, 'pesquisa'))
    if (!fs.existsSync(WORKSPACE_DIR)) fs.mkdirSync(WORKSPACE_DIR, { recursive: true })
    this.transcriber = new Transcriber((level, message) => this.log(level, message, 'audio'))
    this.whatsapp = new WhatsAppHub((level, message) => this.log(level, message, 'whatsapp'), this.transcriber)
    // Religa os WhatsApps já conectados assim que o app abre
    setTimeout(() => void this.whatsapp.resumeAll().catch(() => undefined), 8000)
  }

  getRepoDir(): string {
    return this.repoDir
  }

  private log(level: 'info' | 'warn' | 'error' | 'success', message: string, source?: string) {
    const log = { level, message, timestamp: new Date().toISOString(), source }
    console.log(`[Runtime][${level}] ${message}`)
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('runtime:log', log)
    }
  }

  // Caminhos: absolutos valem como estão; "repo:..." aponta para o código do LOTUS;
  // relativos partem da pasta de trabalho.
  resolvePath(inputPath: string): string {
    const raw = (inputPath || '').trim()
    if (!raw) return WORKSPACE_DIR
    if (raw === 'repo:' || raw === 'repo') return this.repoDir
    if (raw.startsWith('repo:')) return path.resolve(this.repoDir, raw.slice(5).replace(/^[\\/]+/, ''))
    if (path.isAbsolute(raw)) return path.resolve(raw)
    return path.resolve(WORKSPACE_DIR, raw)
  }

  // Segredos nunca são lidos nem alterados pelos agentes.
  private assertNotSecret(resolved: string, operation: 'ler' | 'alterar'): void {
    const normalized = resolved.replace(/\\/g, '/').toLowerCase()
    const base = path.basename(normalized)
    const blocked =
      /^\.env(\..*)?$/.test(base) ||
      normalized.includes('/.ssh/') ||
      normalized.includes('/.aws/') ||
      normalized.endsWith('/lotus_workspace/settings.json') ||
      normalized.endsWith('/lotus_workspace/.runtime-port') ||
      /\.(pem|key|pfx|p12)$/.test(base) ||
      (operation === 'alterar' && normalized.includes('/.git/'))
    if (blocked) {
      throw new Error(`Acesso negado: não é permitido ${operation} "${resolved}" (arquivo de credenciais ou protegido).`)
    }
  }

  // === BACKUPS (toda alteração de arquivo existente é reversível) ===

  private backupBeforeWrite(resolved: string): void {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    let backup: string | null = null
    if (fs.existsSync(resolved)) {
      const safeName = resolved.replace(/[:\\/]+/g, '__').slice(-180)
      backup = path.join(BACKUP_DIR, `${id}__${safeName}`)
      fs.mkdirSync(BACKUP_DIR, { recursive: true })
      fs.copyFileSync(resolved, backup)
    } else {
      fs.mkdirSync(BACKUP_DIR, { recursive: true })
    }
    const entry: BackupEntry = { id, ts: new Date().toISOString(), path: resolved, backup }
    fs.appendFileSync(BACKUP_INDEX, JSON.stringify(entry) + '\n', 'utf-8')
  }

  listBackups(limit = 30): BackupEntry[] {
    if (!fs.existsSync(BACKUP_INDEX)) return []
    const lines = fs.readFileSync(BACKUP_INDEX, 'utf-8').split('\n').filter(Boolean)
    return lines
      .slice(-limit)
      .map((l) => JSON.parse(l) as BackupEntry)
      .reverse()
  }

  // Desfaz as últimas `count` alterações de arquivo (ou uma específica por id).
  restoreBackups(opts: { id?: string; count?: number }): { restored: string[] } {
    if (!fs.existsSync(BACKUP_INDEX)) return { restored: [] }
    const all = fs.readFileSync(BACKUP_INDEX, 'utf-8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as BackupEntry)
    const targets = opts.id ? all.filter((e) => e.id === opts.id) : all.slice(-(opts.count ?? 1)).reverse()
    const restored: string[] = []
    for (const entry of targets) {
      if (entry.backup === null) {
        if (fs.existsSync(entry.path)) fs.unlinkSync(entry.path)
      } else if (fs.existsSync(entry.backup)) {
        fs.copyFileSync(entry.backup, entry.path)
      } else {
        continue
      }
      restored.push(entry.path)
    }
    const restoredIds = new Set(targets.map((t) => t.id))
    const remaining = all.filter((e) => !restoredIds.has(e.id))
    fs.writeFileSync(BACKUP_INDEX, remaining.map((e) => JSON.stringify(e)).join('\n') + (remaining.length ? '\n' : ''), 'utf-8')
    this.log('warn', `Backups restaurados: ${restored.join(', ') || 'nenhum'}`, 'backup')
    return { restored }
  }

  // === FILESYSTEM ===

  async readFile(filePath: string, offset?: number, limit?: number): Promise<{ content: string; totalLines: number; truncated: boolean }> {
    const resolved = this.resolvePath(filePath)
    this.assertNotSecret(resolved, 'ler')
    const stat = fs.statSync(resolved)
    if (stat.isDirectory()) throw new Error(`"${resolved}" é uma pasta. Use list_dir.`)
    if (stat.size > 5_000_000) throw new Error(`Arquivo muito grande (${stat.size} bytes). Use search_files ou leia por trechos via comando.`)
    const lines = fs.readFileSync(resolved, 'utf-8').split('\n')
    const start = Math.max(0, (offset ?? 1) - 1)
    const end = limit ? start + limit : lines.length
    let content = lines
      .slice(start, end)
      .map((l, i) => `${start + i + 1}\t${l}`)
      .join('\n')
    let truncated = end < lines.length
    if (content.length > MAX_READ_BYTES) {
      content = content.slice(0, MAX_READ_BYTES)
      truncated = true
    }
    this.log('info', `Lendo arquivo: ${resolved}`, 'filesystem')
    return { content, totalLines: lines.length, truncated }
  }

  async writeFile(filePath: string, content: string): Promise<{ path: string; created: boolean }> {
    const resolved = this.resolvePath(filePath)
    this.assertNotSecret(resolved, 'alterar')
    const created = !fs.existsSync(resolved)
    this.backupBeforeWrite(resolved)
    fs.mkdirSync(path.dirname(resolved), { recursive: true })
    fs.writeFileSync(resolved, content, 'utf-8')
    this.log('success', `Arquivo ${created ? 'criado' : 'atualizado'}: ${resolved}`, 'filesystem')
    return { path: resolved, created }
  }

  async editFile(filePath: string, oldString: string, newString: string, replaceAll = false): Promise<{ path: string; replacements: number }> {
    const resolved = this.resolvePath(filePath)
    this.assertNotSecret(resolved, 'alterar')
    if (!fs.existsSync(resolved)) throw new Error(`Arquivo não encontrado: ${resolved}`)
    const original = fs.readFileSync(resolved, 'utf-8')
    // Tolera diferença de quebra de linha (CRLF x LF) entre o que o modelo enviou e o arquivo
    const usesCRLF = original.includes('\r\n')
    const norm = (s: string) => s.replace(/\r\n/g, '\n')
    const source = norm(original)
    const needle = norm(oldString)
    if (!needle) throw new Error('old_string não pode ser vazio.')
    const occurrences = source.split(needle).length - 1
    if (occurrences === 0) throw new Error('old_string não encontrado no arquivo. Leia o arquivo e copie o trecho exato.')
    if (occurrences > 1 && !replaceAll) {
      throw new Error(`old_string aparece ${occurrences} vezes. Inclua mais contexto para torná-lo único ou use replace_all.`)
    }
    let updated = replaceAll ? source.split(needle).join(norm(newString)) : source.replace(needle, () => norm(newString))
    if (usesCRLF) updated = updated.replace(/\n/g, '\r\n')
    this.backupBeforeWrite(resolved)
    fs.writeFileSync(resolved, updated, 'utf-8')
    this.log('success', `Arquivo editado (${replaceAll ? occurrences : 1}x): ${resolved}`, 'filesystem')
    return { path: resolved, replacements: replaceAll ? occurrences : 1 }
  }

  async createDir(dirPath: string): Promise<void> {
    const resolved = this.resolvePath(dirPath)
    fs.mkdirSync(resolved, { recursive: true })
    this.log('success', `Pasta criada: ${resolved}`, 'filesystem')
  }

  async listDir(dirPath: string): Promise<{ path: string; entries: DirEntry[] }> {
    const resolved = this.resolvePath(dirPath)
    if (!fs.existsSync(resolved)) throw new Error(`Pasta não encontrada: ${resolved}`)
    const entries: DirEntry[] = fs
      .readdirSync(resolved, { withFileTypes: true })
      .slice(0, 500)
      .map((d) => {
        let size = 0
        if (d.isFile()) {
          try {
            size = fs.statSync(path.join(resolved, d.name)).size
          } catch {
            /* ignore */
          }
        }
        return { name: d.name, type: d.isDirectory() ? ('dir' as const) : ('file' as const), size }
      })
    return { path: resolved, entries }
  }

  async fileExists(filePath: string): Promise<boolean> {
    try {
      return fs.existsSync(this.resolvePath(filePath))
    } catch {
      return false
    }
  }

  // Busca por regex no conteúdo dos arquivos (ignora node_modules, .git, builds).
  async searchFiles(pattern: string, dirPath: string, glob?: string, maxResults = 80): Promise<{ matches: SearchMatch[]; truncated: boolean }> {
    const root = this.resolvePath(dirPath)
    let regex: RegExp
    try {
      regex = new RegExp(pattern, 'i')
    } catch {
      regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
    }
    const extFilter = glob ? glob.replace(/^\*\.?/, '.').toLowerCase() : null
    const matches: SearchMatch[] = []
    let truncated = false

    const walk = (dir: string) => {
      if (truncated) return
      let entries: fs.Dirent[]
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true })
      } catch {
        return
      }
      for (const entry of entries) {
        if (truncated) return
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          if (!SEARCH_SKIP_DIRS.has(entry.name)) walk(full)
          continue
        }
        if (extFilter && !entry.name.toLowerCase().endsWith(extFilter)) continue
        if (/^\.env/.test(entry.name) || /\.(png|jpe?g|gif|ico|webp|woff2?|ttf|pdf|zip|exe|dll|lock|tsbuildinfo)$/i.test(entry.name)) continue
        let text: string
        try {
          if (fs.statSync(full).size > 1_500_000) continue
          text = fs.readFileSync(full, 'utf-8')
        } catch {
          continue
        }
        const lines = text.split('\n')
        for (let i = 0; i < lines.length; i++) {
          if (regex.test(lines[i])) {
            matches.push({ file: full, line: i + 1, text: lines[i].trim().slice(0, 240) })
            if (matches.length >= maxResults) {
              truncated = true
              return
            }
          }
        }
      }
    }

    if (fs.statSync(root).isFile()) {
      const lines = fs.readFileSync(root, 'utf-8').split('\n')
      lines.forEach((l, i) => {
        if (matches.length < maxResults && regex.test(l)) matches.push({ file: root, line: i + 1, text: l.trim().slice(0, 240) })
      })
    } else {
      walk(root)
    }
    return { matches, truncated }
  }

  // === EXECUÇÃO DE COMANDOS ===

  private shellName(): string {
    return process.platform === 'win32' ? 'powershell.exe' : '/bin/bash'
  }

  async execCommand(cmd: string, cwd?: string, timeoutMs?: number): Promise<CommandResult> {
    const workDir = cwd ? this.resolvePath(cwd) : WORKSPACE_DIR
    const start = Date.now()
    this.log('info', `Executando: ${cmd}`, 'exec')
    this.status = 'busy'

    try {
      const { stdout, stderr } = await execAsync(cmd, {
        cwd: workDir,
        timeout: Math.min(Math.max(timeoutMs ?? 120_000, 1_000), 600_000),
        maxBuffer: 10 * 1024 * 1024,
        shell: this.shellName(),
        windowsHide: true,
      })
      const duration = Date.now() - start
      this.status = 'idle'
      this.log('success', `Concluído em ${duration}ms: ${cmd}`, 'exec')
      return { success: true, stdout: stdout || '', stderr: stderr || '', exitCode: 0, duration }
    } catch (err: any) {
      this.status = 'idle'
      this.log('error', `Erro ao executar: ${cmd} — ${err.message}`, 'exec')
      return {
        success: false,
        stdout: err.stdout || '',
        stderr: err.stderr || err.message,
        exitCode: typeof err.code === 'number' ? err.code : 1,
        duration: Date.now() - start,
      }
    }
  }

  private async execScript(script: string, extension: string, runner: string, cwd?: string): Promise<CommandResult> {
    const tmpFile = path.join(WORKSPACE_DIR, `.tmp_script_${Date.now()}.${extension}`)
    fs.writeFileSync(tmpFile, script, 'utf-8')
    try {
      return await this.execCommand(`${runner} "${tmpFile}"`, cwd)
    } finally {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile)
    }
  }

  async execPython(script: string, cwd?: string): Promise<CommandResult> {
    return this.execScript(script, 'py', 'python', cwd)
  }

  async execNode(script: string, cwd?: string): Promise<CommandResult> {
    return this.execScript(script, 'js', 'node', cwd)
  }

  openTerminalStream(cmd: string, cwd?: string): void {
    const workDir = cwd ? this.resolvePath(cwd) : WORKSPACE_DIR
    this.log('info', `Terminal: ${cmd}`, 'terminal')
    const proc = spawn(cmd, { shell: true, cwd: workDir })
    const send = (text: string) => {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) this.mainWindow.webContents.send('terminal:output', text)
    }
    proc.stdout.on('data', (data: Buffer) => send(data.toString()))
    proc.stderr.on('data', (data: Buffer) => send(`[stderr] ${data.toString()}`))
    proc.on('close', (code: number) => send(`\n[Processo encerrado com código ${code}]\n`))
  }

  // === BROWSER AUTOMATION (Playwright) ===

  private async ensureBrowser(): Promise<Page> {
    if (this.page && !this.page.isClosed()) return this.page
    const { chromium } = await import('playwright')
    // Usa o Chrome/Edge já instalado; cai para o Chromium do Playwright se existir.
    let lastError: unknown
    for (const channel of ['chrome', 'msedge', undefined] as const) {
      try {
        this.browser = await chromium.launch({ headless: false, ...(channel ? { channel } : {}) })
        break
      } catch (err) {
        lastError = err
      }
    }
    if (!this.browser) throw new Error(`Não foi possível abrir o navegador: ${String(lastError)}`)
    const ctx = await this.browser.newContext()
    this.page = await ctx.newPage()
    return this.page
  }

  async browserOpen(url: string): Promise<void> {
    const page = await this.ensureBrowser()
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 })
    this.log('info', `Browser aberto em: ${url}`, 'browser')
  }

  async browserNavigate(url: string): Promise<void> {
    await this.browserOpen(url)
  }

  private requirePage(): Page {
    if (!this.page || this.page.isClosed()) throw new Error('Browser não iniciado. Abra uma URL primeiro (action=open).')
    return this.page
  }

  async browserClick(selector: string): Promise<void> {
    await this.requirePage().click(selector, { timeout: 15_000 })
    this.log('info', `Clicou em: ${selector}`, 'browser')
  }

  async browserType(selector: string, text: string): Promise<void> {
    await this.requirePage().fill(selector, text, { timeout: 15_000 })
    this.log('info', `Digitou em ${selector}`, 'browser')
  }

  async browserGetText(selector?: string): Promise<string> {
    const page = this.requirePage()
    const text = selector ? (await page.textContent(selector, { timeout: 15_000 })) || '' : await page.innerText('body')
    return text.slice(0, 20_000)
  }

  async browserScreenshot(): Promise<{ file: string }> {
    const page = this.requirePage()
    const dir = path.join(WORKSPACE_DIR, 'screenshots')
    fs.mkdirSync(dir, { recursive: true })
    const file = path.join(dir, `screenshot-${Date.now()}.png`)
    await page.screenshot({ type: 'png', path: file })
    this.log('info', `Screenshot salvo: ${file}`, 'browser')
    return { file }
  }

  async browserClose(): Promise<void> {
    await this.browser?.close().catch(() => {})
    this.browser = null
    this.page = null
  }

  // === INFO E STATUS ===

  async getDeviceInfo(): Promise<DeviceInfo> {
    const has = async (cmd: string) => {
      try {
        await execAsync(cmd)
        return true
      } catch {
        return false
      }
    }
    return {
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      cpus: os.cpus().length,
      totalMemory: Math.round(os.totalmem() / 1024 / 1024 / 1024),
      freeMemory: Math.round(os.freemem() / 1024 / 1024 / 1024),
      workspaceDir: WORKSPACE_DIR,
      repoDir: this.repoDir,
      shell: this.shellName(),
      nodeVersion: process.version,
      pythonAvailable: (await has('python --version')) || (await has('python3 --version')),
      gitAvailable: await has('git --version'),
    }
  }

  getStatus() {
    return {
      status: this.status,
      workspaceDir: WORKSPACE_DIR,
      repoDir: this.repoDir,
      browserOpen: this.browser !== null,
    }
  }

  async destroy() {
    await this.browserClose()
    await this.research.close()
    await this.whatsapp.close()
    this.transcriber.stop()
  }
}
