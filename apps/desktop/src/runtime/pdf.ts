// Gera PDF a partir de um arquivo HTML usando o Chromium do próprio Electron (sem abrir outro navegador).
import * as fs from 'fs'
import * as path from 'path'

let queue: Promise<unknown> = Promise.resolve()

export async function htmlFileToPdf(htmlPath: string, outPath: string): Promise<{ path: string; bytes: number }> {
  if (!htmlPath || !fs.existsSync(htmlPath)) throw new Error('Arquivo HTML do relatório não encontrado.')
  if (!outPath.toLowerCase().endsWith('.pdf')) throw new Error('O destino precisa terminar em .pdf')
  // Um PDF por vez: cada janela escondida usa memória
  const job = queue.then(() => render(htmlPath, outPath))
  queue = job.catch(() => undefined)
  return job
}

async function render(htmlPath: string, outPath: string): Promise<{ path: string; bytes: number }> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { BrowserWindow } = require('electron') as typeof import('electron')
  const win = new BrowserWindow({
    show: false,
    // Largura de uma folha A4 a 96 dpi: o conteúdo não é encolhido na impressão
    width: 794,
    height: 1123,
    webPreferences: { javascript: false, offscreen: true, sandbox: true },
  })
  try {
    await win.loadFile(htmlPath)
    // Dá tempo para fontes e imagens remotas (logo, fotos) carregarem
    await new Promise((r) => setTimeout(r, 1500))
    const pdf = await win.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: { marginType: 'none' },
      preferCSSPageSize: true,
    })
    fs.mkdirSync(path.dirname(outPath), { recursive: true })
    fs.writeFileSync(outPath, pdf)
    return { path: outPath, bytes: pdf.length }
  } finally {
    win.destroy()
  }
}
