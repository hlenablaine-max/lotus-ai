import { contextBridge, ipcRenderer } from 'electron'

// API exposta ao renderer (Next.js) via window.lotusRuntime
contextBridge.exposeInMainWorld('lotusRuntime', {
  // Info do dispositivo
  getDeviceInfo: () => ipcRenderer.invoke('runtime:device-info'),

  // Filesystem
  readFile: (path: string) => ipcRenderer.invoke('runtime:fs-read', path),
  writeFile: (path: string, content: string) => ipcRenderer.invoke('runtime:fs-write', path, content),
  createDir: (path: string) => ipcRenderer.invoke('runtime:fs-mkdir', path),
  listDir: (path: string) => ipcRenderer.invoke('runtime:fs-list', path),
  fileExists: (path: string) => ipcRenderer.invoke('runtime:fs-exists', path),

  // Execução de comandos
  execCommand: (cmd: string, cwd?: string) => ipcRenderer.invoke('runtime:exec', cmd, cwd),
  execPython: (script: string, cwd?: string) => ipcRenderer.invoke('runtime:exec-python', script, cwd),
  execNode: (script: string, cwd?: string) => ipcRenderer.invoke('runtime:exec-node', script, cwd),

  // Terminal (stream de output)
  openTerminal: (cmd: string, cwd?: string) => ipcRenderer.invoke('runtime:terminal-open', cmd, cwd),
  onTerminalOutput: (callback: (data: string) => void) => {
    ipcRenderer.on('terminal:output', (_, data) => callback(data))
    return () => ipcRenderer.removeAllListeners('terminal:output')
  },

  // Browser automation (Playwright)
  browserOpen: (url: string) => ipcRenderer.invoke('runtime:browser-open', url),
  browserNavigate: (url: string) => ipcRenderer.invoke('runtime:browser-navigate', url),
  browserClick: (selector: string) => ipcRenderer.invoke('runtime:browser-click', selector),
  browserType: (selector: string, text: string) => ipcRenderer.invoke('runtime:browser-type', selector, text),
  browserScreenshot: () => ipcRenderer.invoke('runtime:browser-screenshot'),
  browserGetText: (selector: string) => ipcRenderer.invoke('runtime:browser-get-text', selector),
  browserClose: () => ipcRenderer.invoke('runtime:browser-close'),

  // Logs
  onLog: (callback: (log: RuntimeLog) => void) => {
    ipcRenderer.on('runtime:log', (_, log) => callback(log))
    return () => ipcRenderer.removeAllListeners('runtime:log')
  },

  // Status do runtime
  getStatus: () => ipcRenderer.invoke('runtime:status'),

  // Porta e token do servidor HTTP local (para agentes server-side do Next.js)
  getRuntimeServerPort: () => ipcRenderer.invoke('runtime:server-port'),
})

// Versão do app
contextBridge.exposeInMainWorld('lotusApp', {
  version: process.env.npm_package_version || '1.0.0',
  platform: process.platform,
  isDesktop: true,
})

interface RuntimeLog {
  level: 'info' | 'warn' | 'error' | 'success'
  message: string
  timestamp: string
  source?: string
}
