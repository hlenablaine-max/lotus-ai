import { contextBridge, ipcRenderer } from 'electron'

// A interface NÃO recebe poderes de execução diretos: comandos e arquivos passam sempre pelo
// backend autenticado do LOTUS (que fala com o runtime local por token). Aqui ficam só
// informações de status, logs e o desfazer de alterações.
contextBridge.exposeInMainWorld('lotusRuntime', {
  getDeviceInfo: () => ipcRenderer.invoke('runtime:device-info'),
  getStatus: () => ipcRenderer.invoke('runtime:status'),
  listBackups: () => ipcRenderer.invoke('runtime:backups'),
  restoreBackup: (id?: string) => ipcRenderer.invoke('runtime:restore-backup', id),

  openTerminal: (cmd: string, cwd?: string) => ipcRenderer.invoke('runtime:terminal-open', cmd, cwd),
  onTerminalOutput: (callback: (data: string) => void) => {
    const listener = (_: unknown, data: string) => callback(data)
    ipcRenderer.on('terminal:output', listener)
    return () => ipcRenderer.removeListener('terminal:output', listener)
  },

  onLog: (callback: (log: RuntimeLog) => void) => {
    const listener = (_: unknown, log: RuntimeLog) => callback(log)
    ipcRenderer.on('runtime:log', listener)
    return () => ipcRenderer.removeListener('runtime:log', listener)
  },
})

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
