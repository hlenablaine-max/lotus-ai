import { app, BrowserWindow, ipcMain, shell, Menu, dialog, Tray, nativeImage } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import * as http from 'http'
import * as net from 'net'
import { spawn, exec, ChildProcess } from 'child_process'
import { LocalRuntime, WORKSPACE_DIR } from '../runtime/local-runtime'
import { RuntimeHttpServer } from '../runtime/http-server'

// Habilita Web Speech API e garante que flags de media estão ativos
app.commandLine.appendSwitch('enable-features', 'WebSpeechAPI,MediaStream')
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

// O app é auto-hospedado: sobe o servidor do LOTUS a partir do código-fonte neste computador.
// É isso que permite aos agentes controlar o PC e modificar o próprio código do app.
const SERVER_PORT = Number(process.env.LOTUS_PORT || 3000)
const LOTUS_URL = process.env.LOTUS_URL || `http://localhost:${SERVER_PORT}`
const APP_CONFIG_FILE = path.join(WORKSPACE_DIR, 'app-config.json')

let mainWindow: BrowserWindow | null = null
let runtime: LocalRuntime | null = null
let httpServer: RuntimeHttpServer | null = null
let serverProcess: ChildProcess | null = null
let serverLog: string[] = []
let tray: Tray | null = null
// Fechar a janela NÃO encerra o LOTUS: os agentes continuam trabalhando em segundo plano.
// Só "Sair" (menu ou ícone perto do relógio) encerra de verdade.
let quitting = false
let trayHintShown = false

function showWindow(): void {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function createTray(): void {
  if (tray) return
  const icon = nativeImage.createFromPath(path.join(__dirname, '../../assets/icon.png'))
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon.resize({ width: 16, height: 16 }))
  tray.setToolTip('LOTUS — agentes ativos')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Abrir LOTUS', click: showWindow },
      { type: 'separator' },
      {
        label: 'Sair e encerrar os agentes',
        click: () => {
          quitting = true
          app.quit()
        },
      },
    ])
  )
  tray.on('click', showWindow)
}

function isRepoDir(dir: string | undefined | null): dir is string {
  return !!dir && fs.existsSync(path.join(dir, 'apps', 'web', 'package.json'))
}

// Localiza o código-fonte do LOTUS: variável de ambiente, pasta do próprio app ou configuração salva.
function resolveRepoDir(): string | null {
  const candidates = [
    process.env.LOTUS_REPO_DIR,
    path.resolve(__dirname, '../../../..'),
    (() => {
      try {
        return JSON.parse(fs.readFileSync(APP_CONFIG_FILE, 'utf-8')).repoDir as string
      } catch {
        return null
      }
    })(),
  ]
  const found = candidates.find(isRepoDir) ?? null
  if (found) {
    fs.mkdirSync(WORKSPACE_DIR, { recursive: true })
    fs.writeFileSync(APP_CONFIG_FILE, JSON.stringify({ repoDir: found }, null, 2), 'utf-8')
  }
  return found
}

// O servidor responde HTTP? (a primeira página pode demorar para compilar, então o timeout é longo)
function pingServer(timeoutMs = 30_000): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port: SERVER_PORT, path: '/login', timeout: timeoutMs }, (res) => {
      res.resume()
      resolve((res.statusCode ?? 500) < 500)
    })
    req.on('error', () => resolve(false))
    req.on('timeout', () => {
      req.destroy()
      resolve(false)
    })
  })
}

// Já existe algum processo escutando na porta? Se sim, NUNCA subimos um segundo servidor:
// dois "next dev" na mesma pasta corrompem o build um do outro.
function portInUse(): Promise<boolean> {
  const tryHost = (host: string) =>
    new Promise<boolean>((resolve) => {
      const socket = net.connect({ host, port: SERVER_PORT })
      socket.setTimeout(1500)
      socket.once('connect', () => {
        socket.destroy()
        resolve(true)
      })
      socket.once('error', () => resolve(false))
      socket.once('timeout', () => {
        socket.destroy()
        resolve(false)
      })
    })
  return Promise.all([tryHost('127.0.0.1'), tryHost('::1')]).then((r) => r.some(Boolean))
}

// ---------------------------------------------------------------------------
// Velocidade: o modo desenvolvedor ("next dev") compila cada tela na primeira visita, o que deixa
// tudo lento. Sempre que existe uma versão compilada atualizada (.next-prod), o app usa ela ("next start"),
// que abre as telas na hora. Quando o código muda (automodificação pela IA ou atualização), o app
// recompila em segundo plano e troca o servidor quando nenhum agente estiver trabalhando.
// ---------------------------------------------------------------------------
// Duas pastas alternadas: uma servindo, a outra recebendo a compilação nova (não dá para recompilar por cima da que está no ar)
const PROD_DISTS = ['.next-prod-a', '.next-prod-b']
type ServerMode = 'dev' | 'prod'
let servingDist: string | null = null
let building = false
let failedStamp: string | null = null
let swapping = false

function newestMtime(target: string): number {
  let newest = 0
  let stat: fs.Stats
  try {
    stat = fs.statSync(target)
  } catch {
    return 0
  }
  if (!stat.isDirectory()) return stat.mtimeMs
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.next')) continue
    newest = Math.max(newest, newestMtime(path.join(target, entry.name)))
  }
  return newest
}

// "Carimbo" do código-fonte: muda sempre que algum arquivo que entra no site muda
function sourceStamp(repoDir: string): string {
  const web = path.join(repoDir, 'apps', 'web')
  const targets = [
    path.join(web, 'src'),
    path.join(web, 'prisma', 'schema.prisma'),
    path.join(web, 'next.config.ts'),
    path.join(web, 'tailwind.config.ts'),
    path.join(web, 'package.json'),
    path.join(web, '.env.local'),
    path.join(repoDir, 'packages', 'ai-engine', 'src'),
  ]
  return String(Math.round(Math.max(...targets.map(newestMtime))))
}

function stampFile(repoDir: string, dist: string): string {
  return path.join(repoDir, 'apps', 'web', dist, 'lotus-source-stamp')
}

// Pasta compilada que corresponde ao código atual (ou null se nenhuma está em dia)
function freshDist(repoDir: string): string | null {
  const stamp = sourceStamp(repoDir)
  return (
    PROD_DISTS.find((dist) => {
      try {
        return fs.existsSync(path.join(repoDir, 'apps', 'web', dist, 'BUILD_ID')) && fs.readFileSync(stampFile(repoDir, dist), 'utf-8').trim() === stamp
      } catch {
        return false
      }
    }) ?? null
  )
}

function prodIsFresh(repoDir: string): boolean {
  return freshDist(repoDir) !== null
}

function startFastBuild(repoDir: string): void {
  if (building) return
  const stamp = sourceStamp(repoDir)
  if (stamp === failedStamp) return
  building = true
  const webDir = path.join(repoDir, 'apps', 'web')
  const logFile = path.join(WORKSPACE_DIR, 'logs', 'build.log')
  fs.mkdirSync(path.dirname(logFile), { recursive: true })
  const log = fs.createWriteStream(logFile, { flags: 'w' })
  log.write(`===== compilação rápida iniciada em ${new Date().toISOString()} =====\n`)
  const target = PROD_DISTS.find((d) => d !== servingDist) ?? PROD_DISTS[0]
  const child = spawn('pnpm', ['exec', 'next', 'build'], {
    cwd: webDir,
    shell: true,
    windowsHide: true,
    env: { ...process.env, LOTUS_DIST_DIR: target, NEXT_TELEMETRY_DISABLED: '1', ELECTRON_RUN_AS_NODE: undefined },
  })
  // Prioridade baixa: o computador continua respondendo enquanto compila
  try {
    if (child.pid) require('os').setPriority(child.pid, require('os').constants.priority.PRIORITY_BELOW_NORMAL)
  } catch {
    /* ignore */
  }
  child.stdout?.on('data', (d) => log.write(d))
  child.stderr?.on('data', (d) => log.write(d))
  child.on('exit', (code) => {
    building = false
    log.end(`\n===== terminou com código ${code} =====\n`)
    if (code === 0) {
      fs.writeFileSync(stampFile(repoDir, target), stamp, 'utf-8')
      failedStamp = null
      void swapToProdWhenIdle(repoDir)
    } else {
      failedStamp = stamp // não tenta de novo o mesmo código quebrado; continua no modo desenvolvedor
    }
  })
}

async function agentsBusy(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port: SERVER_PORT, path: '/api/internal/busy', timeout: 10_000 }, (res) => {
      let body = ''
      res.on('data', (c) => (body += c))
      res.on('end', () => {
        try {
          resolve(!!JSON.parse(body).busy)
        } catch {
          resolve(true)
        }
      })
    })
    req.on('error', () => resolve(false))
    req.on('timeout', () => {
      req.destroy()
      resolve(true)
    })
  })
}

// Troca para a versão compilada assim que nenhum agente estiver no meio de uma tarefa
async function swapToProdWhenIdle(repoDir: string): Promise<void> {
  if (swapping || !serverProcess) return
  swapping = true
  try {
    while (await agentsBusy()) await new Promise((r) => setTimeout(r, 20_000))
    if (!prodIsFresh(repoDir)) return
    const currentUrl = mainWindow?.webContents.getURL()
    stopServer()
    for (let i = 0; i < 20 && (await portInUse()); i++) await new Promise((r) => setTimeout(r, 500))
    startServer(repoDir, 'prod')
    const deadline = Date.now() + 120_000
    while (Date.now() < deadline && !(await pingServer(5_000))) await new Promise((r) => setTimeout(r, 1000))
    if (mainWindow && currentUrl?.startsWith('http')) mainWindow.loadURL(currentUrl)
  } finally {
    swapping = false
  }
}

// De minuto em minuto: código mudou desde a última compilação? recompila em segundo plano
function watchForCodeChanges(repoDir: string): void {
  setInterval(() => {
    if (!serverProcess || building || swapping) return
    if (!prodIsFresh(repoDir)) startFastBuild(repoDir)
  }, 60_000)
}

function startServer(repoDir: string, mode: ServerMode = prodIsFresh(repoDir) ? 'prod' : 'dev'): void {
  const webDir = path.join(repoDir, 'apps', 'web')
  serverLog = []
  const dist = mode === 'prod' ? freshDist(repoDir) : null
  if (mode === 'prod' && !dist) mode = 'dev'
  servingDist = mode === 'prod' ? dist : null
  const args = mode === 'prod' ? ['exec', 'next', 'start', '--port', String(SERVER_PORT), '-H', '127.0.0.1'] : ['exec', 'next', 'dev', '--port', String(SERVER_PORT), '-H', '127.0.0.1']
  serverProcess = spawn('pnpm', args, {
    cwd: webDir,
    shell: true,
    windowsHide: true,
    env: {
      ...process.env,
      LOTUS_DESKTOP: '1',
      LOTUS_REPO_DIR: repoDir,
      ELECTRON_RUN_AS_NODE: undefined,
      ...(mode === 'prod' && dist ? { LOTUS_DIST_DIR: dist, NODE_ENV: 'production' } : {}),
    },
  })
  // A saída do servidor também vai para um arquivo, para o dono (ou a própria IA) diagnosticar erros
  const logDir = path.join(WORKSPACE_DIR, 'logs')
  fs.mkdirSync(logDir, { recursive: true })
  const logFile = path.join(logDir, 'server.log')
  try {
    if (fs.existsSync(logFile) && fs.statSync(logFile).size > 5_000_000) fs.renameSync(logFile, `${logFile}.old`)
  } catch {
    /* ignore */
  }
  const logStream = fs.createWriteStream(logFile, { flags: 'a' })
  logStream.write(`\n===== servidor iniciado em ${new Date().toISOString()} (${mode === 'prod' ? 'versão rápida' : 'modo desenvolvedor'}) =====\n`)
  const capture = (data: Buffer) => {
    serverLog.push(data.toString())
    if (serverLog.length > 200) serverLog.shift()
    logStream.write(data)
  }
  serverProcess.stdout?.on('data', capture)
  serverProcess.stderr?.on('data', capture)
  serverProcess.on('exit', () => {
    serverProcess = null
  })
}

function stopServer(): void {
  if (!serverProcess?.pid) return
  if (process.platform === 'win32') {
    exec(`taskkill /pid ${serverProcess.pid} /T /F`)
  } else {
    serverProcess.kill('SIGTERM')
  }
  serverProcess = null
}

let watching = false
async function ensureServer(repoDir: string): Promise<boolean> {
  const alreadyRunning = await portInUse()
  if (!alreadyRunning) startServer(repoDir)
  if (!watching) {
    watching = true
    // Primeira verificação depois de 90 s, para não competir com a abertura do app
    setTimeout(() => {
      if (serverProcess && !prodIsFresh(repoDir)) startFastBuild(repoDir)
      watchForCodeChanges(repoDir)
    }, 90_000)
  }
  const deadline = Date.now() + 240_000
  while (Date.now() < deadline) {
    if (await pingServer()) return true
    // Só desiste cedo se o servidor que NÓS subimos morreu
    if (!alreadyRunning && !serverProcess) return false
    await new Promise((r) => setTimeout(r, 1500))
  }
  return false
}

function statusPage(title: string, detail: string): string {
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#07070f;color:#e8e8f0;font-family:Segoe UI,system-ui,sans-serif}
    .box{max-width:720px;padding:32px;text-align:center}
    h1{font-size:20px;margin:0 0 12px} p{color:#9a9ab0;font-size:14px;line-height:1.6;white-space:pre-wrap;text-align:left}
    .dot{width:10px;height:10px;border-radius:50%;background:#a855f7;display:inline-block;margin-right:8px;animation:p 1.2s infinite}
    @keyframes p{50%{opacity:.25}}
  </style></head><body><div class="box"><h1><span class="dot"></span>${title}</h1><p>${detail}</p></div></body></html>`
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
}

function buildMenu(repoDir: string | null) {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'LOTUS',
      submenu: [
        { label: 'Recarregar', accelerator: 'CmdOrCtrl+R', click: () => mainWindow?.webContents.reload() },
        {
          label: 'Desfazer última alteração de código feita pela IA',
          click: async () => {
            const result = runtime?.restoreBackups({ count: 1 })
            await dialog.showMessageBox({
              message: result?.restored.length
                ? `Arquivo restaurado:\n${result.restored.join('\n')}`
                : 'Nenhuma alteração para desfazer.',
            })
            mainWindow?.webContents.reload()
          },
        },
        {
          label: 'Reiniciar servidor do LOTUS',
          enabled: !!repoDir,
          click: async () => {
            if (!repoDir) return
            stopServer()
            mainWindow?.loadURL(statusPage('Reiniciando o LOTUS…', 'Subindo o servidor local.'))
            await new Promise((r) => setTimeout(r, 2500))
            const ok = await ensureServer(repoDir)
            mainWindow?.loadURL(ok ? LOTUS_URL : statusPage('O servidor não iniciou', serverLog.join('').slice(-3000)))
          },
        },
        { type: 'separator' },
        { label: 'Abrir pasta de trabalho', click: () => shell.openPath(WORKSPACE_DIR) },
        { label: 'Abrir código-fonte do LOTUS', enabled: !!repoDir, click: () => repoDir && shell.openPath(repoDir) },
        { label: 'Ferramentas de desenvolvedor', accelerator: 'F12', click: () => mainWindow?.webContents.toggleDevTools() },
        { type: 'separator' },
        { role: 'quit', label: 'Sair' },
      ],
    },
    { role: 'editMenu', label: 'Editar' },
    { role: 'viewMenu', label: 'Exibir' },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

async function createWindow() {
  const repoDir = resolveRepoDir()

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'LOTUS',
    backgroundColor: '#0a0a0a',
    autoHideMenuBar: true,
    icon: process.platform === 'win32' ? ICON_ICO : path.join(__dirname, '../../assets/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // preload usa IPC
      webSecurity: true,
    },
    show: false,
  })

  buildMenu(repoDir)

  mainWindow.webContents.session.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'media' || permission === 'display-capture')
  })

  // Links externos abrem no navegador do sistema
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())

  mainWindow.on('close', (event) => {
    if (quitting) return
    event.preventDefault()
    mainWindow?.hide()
    if (!trayHintShown && tray) {
      trayHintShown = true
      tray.displayBalloon({
        title: 'O LOTUS continua trabalhando',
        content: 'Os agentes seguem ativos em segundo plano. Para encerrar de vez, use o ícone do LOTUS perto do relógio > Sair.',
      })
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
    httpServer?.stop()
    httpServer = null
    runtime?.destroy()
    runtime = null
  })

  if (!repoDir) {
    mainWindow.loadURL(
      statusPage(
        'Código-fonte do LOTUS não encontrado',
        'Defina a variável LOTUS_REPO_DIR com a pasta do projeto (a que contém apps/web) e abra o app novamente.'
      )
    )
    return
  }

  // Runtime local: é por ele que os agentes executam comandos, editam arquivos e controlam o navegador.
  runtime = new LocalRuntime(mainWindow, repoDir)
  httpServer = new RuntimeHttpServer(runtime)
  httpServer
    .start()
    .then(({ port }) => console.log(`[LOTUS] Runtime local na porta ${port}`))
    .catch((err: Error) => console.error('[LOTUS] Falha ao iniciar o runtime local:', err))

  mainWindow.loadURL(statusPage('Iniciando o LOTUS…', 'Subindo o servidor local. Na primeira vez pode levar até um minuto.'))
  const ok = await ensureServer(repoDir)
  if (!mainWindow) return
  if (ok) {
    mainWindow.loadURL(LOTUS_URL)
  } else {
    mainWindow.loadURL(
      statusPage('O servidor do LOTUS não iniciou', serverLog.join('').slice(-3000) || 'Sem saída do servidor. Verifique se o pnpm está instalado.')
    )
  }
}

// === IPC — usado pela interface para saber se está dentro do app desktop ===

ipcMain.handle('runtime:device-info', async () => runtime?.getDeviceInfo())
ipcMain.handle('runtime:status', () => runtime?.getStatus())
ipcMain.handle('runtime:backups', () => runtime?.listBackups(30) ?? [])
ipcMain.handle('runtime:restore-backup', (_event, id?: string) => runtime?.restoreBackups(id ? { id } : { count: 1 }))
ipcMain.handle('runtime:terminal-open', (_event, cmd: string, cwd?: string) => {
  runtime?.openTerminalStream(cmd, cwd)
  return { started: true }
})

// === APP LIFECYCLE ===

// Para o Windows, este processo é "LOTUS" (nome e ícone roxo na barra de tarefas), não "Electron".
const APP_ID = 'ai.lotus.desktop'
const ICON_ICO = path.join(__dirname, '../../assets/icon.ico')
if (process.platform === 'win32') app.setAppUserModelId(APP_ID)

// Atalhos "LOTUS" na Área de Trabalho e no Menu Iniciar, sempre apontando para este app
function ensureShortcuts(): void {
  if (process.platform !== 'win32' || app.isPackaged) return
  const appDir = app.getAppPath()
  const places = [
    path.join(app.getPath('desktop'), 'LOTUS.lnk'),
    path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'LOTUS.lnk'),
  ]
  for (const lnk of places) {
    try {
      shell.writeShortcutLink(lnk, fs.existsSync(lnk) ? 'replace' : 'create', {
        target: process.execPath,
        args: `"${appDir}"`,
        cwd: appDir,
        icon: ICON_ICO,
        iconIndex: 0,
        appUserModelId: APP_ID,
        description: 'LOTUS — agência autônoma',
      })
    } catch (err) {
      console.error('[LOTUS] Não consegui criar o atalho', lnk, err)
    }
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', showWindow)

  app.whenReady().then(() => {
    ensureShortcuts()
    createTray()
    createWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  quitting = true
  stopServer()
  httpServer?.stop()
  runtime?.destroy()
})

// Evita que um erro isolado do runtime derrube o app inteiro
process.on('uncaughtException', (err) => console.error('[LOTUS] Erro não tratado:', err))
