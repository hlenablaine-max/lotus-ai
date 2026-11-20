// Converte imagem para JPG leve (sites carregam rápido): redimensiona pela largura máxima e comprime.
import * as fs from 'fs'
import * as path from 'path'

export function toJpeg(input: string, output: string, maxWidth = 1800, quality = 82): { file: string; width: number; height: number; bytes: number } {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { nativeImage } = require('electron') as typeof import('electron')
  if (!input || !fs.existsSync(input)) throw new Error('Imagem de origem não encontrada.')
  let img = nativeImage.createFromPath(input)
  if (img.isEmpty()) throw new Error('Formato de imagem não suportado.')
  const size = img.getSize()
  if (size.width > maxWidth) img = img.resize({ width: maxWidth, quality: 'best' })
  const buf = img.toJPEG(quality)
  fs.mkdirSync(path.dirname(output), { recursive: true })
  fs.writeFileSync(output, buf)
  const out = img.getSize()
  return { file: output, width: out.width, height: out.height, bytes: buf.length }
}
