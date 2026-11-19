import { app, BrowserWindow, ipcMain, shell, Menu, session } from 'electron'

// Habilita Web Speech API e garante que flags de media estão ativos
app.commandLine.appendSwitch('enable-features', 'WebSpeechAPI,MediaStream')
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
import * as path from 'path'
import { LocalRuntime } from '../runtime/local-runtime'
import { RuntimeHttpServer } from '../runtime/http-server'

const isDev = process.env.NODE_ENV === 'development'
// URL do backend LOTUS (Vercel em prod, localhost em dev)
const LOTUS_URL = isDev
  ? 'http://localhost:3000'
  : 'https://lotus-ai-morfeussend.vercel.app'

let mainWindow: BrowserWindow | null = null
let runtime: LocalRuntime | null = null
let httpServer: RuntimeHttpServer | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'LOTUS AI',
    backgroundColor: '#0a0a0a',
    titleBarStyle: 'hiddenInset',
    icon: path.join(__dirname, '../../assets/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,       // Segurança: renderer não acessa Node diretamente
      nodeIntegration: false,        // Segurança
      sandbox: false,                // Precisa false para o preload funcionar com IPC
      webSecurity: true,
    },
    show: false, // Espera ready-to-show
  })

  // Remove menu padrão do Electron
  Menu.setApplicationMenu(null)

  // Inicializa o Local Runtime
  runtime = new LocalRuntime(mainWindow)

  // Inicia o servidor HTTP para agentes server-side do Next.js
  httpServer = new RuntimeHttpServer(runtime)
  httpServer.start().then(({ port, token }) => {
    console.log(`[LOTUS] Runtime HTTP server on port ${port}`)
  }).catch((err: Error) => {
    console.error('[LOTUS] Falha ao iniciar RuntimeHttpServer:', err)
  })

  // Carrega a aplicação LOTUS
  // Libera permissão de microfone/câmera para a Web Speech API funcionar
  mainWindow.webContents.session.setPermissionRequestHandler((_webContents, permission, callback) => {
    if (permission === 'media' || permission === 'display-capture') {
      callback(true)
    } else {
      callback(false)
    }
  })

  mainWindow.loadURL(LOTUS_URL)

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
    if (isDev) {
      mainWindow?.webContents.openDevTools({ mode: 'detach' })
    }
  })

  // Links externos abrem no browser do sistema, não no Electron
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
    httpServer?.stop()
    httpServer = null
    runtime?.destroy()
    runtime = null
  })
}

// === IPC HANDLERS — RuntimeHttpServer ===

ipcMain.handle('runtime:server-port', () => {
  if (!httpServer) return null
  return { port: httpServer.getPort(), token: httpServer.getToken() }
})

// === IPC HANDLERS — Runtime ===

ipcMain.handle('runtime:device-info', async () => {
  return runtime?.getDeviceInfo()
})

ipcMain.handle('runtime:status', () => {
  return runtime?.getStatus()
})

ipcMain.handle('runtime:fs-read', async (_event, filePath: string) => {
  return runtime?.readFile(filePath)
})

ipcMain.handle('runtime:fs-write', async (_event, filePath: string, content: string) => {
  return runtime?.writeFile(filePath, content)
})

ipcMain.handle('runtime:fs-mkdir', async (_event, dirPath: string) => {
  return runtime?.createDir(dirPath)
})

ipcMain.handle('runtime:fs-list', async (_event, dirPath: string) => {
  return runtime?.listDir(dirPath)
})

ipcMain.handle('runtime:fs-exists', async (_event, filePath: string) => {
  return runtime?.fileExists(filePath)
})

ipcMain.handle('runtime:exec', async (_event, cmd: string, cwd?: string) => {
  return runtime?.execCommand(cmd, cwd)
})

ipcMain.handle('runtime:exec-python', async (_event, script: string, cwd?: string) => {
  return runtime?.execPython(script, cwd)
})

ipcMain.handle('runtime:exec-node', async (_event, script: string, cwd?: string) => {
  return runtime?.execNode(script, cwd)
})

ipcMain.handle('runtime:terminal-open', (_event, cmd: string, cwd?: string) => {
  runtime?.openTerminalStream(cmd, cwd)
  return { started: true }
})

// Browser automation
ipcMain.handle('runtime:browser-open', async (_event, url: string) => {
  return runtime?.browserOpen(url)
})

ipcMain.handle('runtime:browser-navigate', async (_event, url: string) => {
  return runtime?.browserNavigate(url)
})

ipcMain.handle('runtime:browser-click', async (_event, selector: string) => {
  return runtime?.browserClick(selector)
})

ipcMain.handle('runtime:browser-type', async (_event, selector: string, text: string) => {
  return runtime?.browserType(selector, text)
})

ipcMain.handle('runtime:browser-screenshot', async () => {
  return runtime?.browserScreenshot()
})

ipcMain.handle('runtime:browser-get-text', async (_event, selector: string) => {
  return runtime?.browserGetText(selector)
})

ipcMain.handle('runtime:browser-close', async () => {
  return runtime?.browserClose()
})

// === APP LIFECYCLE ===

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', async () => {
  await runtime?.destroy()
})
