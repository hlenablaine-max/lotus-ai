// Transcrição local de áudio (faster-whisper), usada nos áudios do WhatsApp e no microfone do Sales Copilot.
// Um processo Python fica com o modelo carregado enquanto há uso e se desliga sozinho depois de 3 minutos
// parado, para devolver a memória (o PC tem pouca RAM). Nada sai do computador.
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { spawn, ChildProcessWithoutNullStreams } from 'child_process'
import { WORKSPACE_DIR } from './paths'

const TOOLS_DIR = path.join(WORKSPACE_DIR, '.tools')
const TMP_DIR = path.join(WORKSPACE_DIR, 'audio-tmp')
const IDLE_MS = 3 * 60_000

const WORKER = `import sys, json
from faster_whisper import WhisperModel
sys.stdout.reconfigure(encoding="utf-8")
names = sys.argv[1].split(",")
threads = int(sys.argv[2])
model = None
used = None
for name in names:
    try:
        model = WhisperModel(name, device="cpu", compute_type="int8", cpu_threads=threads)
        used = name
        break
    except Exception as error:
        last = error
if model is None:
    print(json.dumps({"fatal": str(last)}), flush=True)
    sys.exit(1)
print(json.dumps({"ready": used}), flush=True)
for line in sys.stdin:
    try:
        job = json.loads(line)
        segments, info = model.transcribe(job["file"], language="pt", vad_filter=True)
        text = " ".join(s.text.strip() for s in segments)
        print(json.dumps({"id": job["id"], "text": text, "duration": info.duration, "model": used}, ensure_ascii=False), flush=True)
    except Exception as error:
        print(json.dumps({"id": job.get("id"), "error": str(error)}), flush=True)
`

type Pending = { resolve: (v: { text: string; model: string }) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }

export class Transcriber {
  private proc: ChildProcessWithoutNullStreams | null = null
  private ready: Promise<string> | null = null
  private pending = new Map<string, Pending>()
  private buffer = ''
  private idleTimer: NodeJS.Timeout | null = null
  private seq = 0
  private chain: Promise<unknown> = Promise.resolve()

  constructor(private log: (level: 'info' | 'warn' | 'error' | 'success', message: string) => void) {
    fs.mkdirSync(TMP_DIR, { recursive: true })
  }

  private start(): Promise<string> {
    if (this.ready) return this.ready
    fs.mkdirSync(TOOLS_DIR, { recursive: true })
    const script = path.join(TOOLS_DIR, 'transcribe-worker.py')
    fs.writeFileSync(script, WORKER, 'utf-8')
    const freeGb = os.freemem() / 1024 ** 3
    // small ~1 GB, base ~400 MB, tiny ~200 MB: o melhor que cabe agora
    const models = freeGb >= 2.5 ? 'small,base,tiny' : freeGb >= 0.8 ? 'base,tiny' : 'tiny'
    const threads = Math.max(1, Math.min(4, Math.floor(os.cpus().length / 2)))
    const proc = spawn('python', [script, models, String(threads)], { env: { ...process.env, PYTHONIOENCODING: 'utf-8' }, windowsHide: true })
    this.proc = proc
    this.buffer = ''
    this.ready = new Promise<string>((resolve, reject) => {
      const onLine = (line: string) => {
        let msg: { ready?: string; fatal?: string; id?: string; text?: string; model?: string; error?: string }
        try {
          msg = JSON.parse(line)
        } catch {
          return
        }
        if (msg.ready) {
          this.log('info', `Transcrição local pronta (modelo ${msg.ready})`)
          return resolve(msg.ready)
        }
        if (msg.fatal) return reject(new Error(`A transcrição local não abriu: ${msg.fatal}`))
        const p = msg.id ? this.pending.get(msg.id) : undefined
        if (!p) return
        clearTimeout(p.timer)
        this.pending.delete(msg.id!)
        if (msg.error) p.reject(new Error(msg.error))
        else p.resolve({ text: (msg.text ?? '').trim(), model: msg.model ?? '' })
      }
      proc.stdout.on('data', (chunk: Buffer) => {
        this.buffer += chunk.toString('utf-8')
        let i: number
        while ((i = this.buffer.indexOf('\n')) >= 0) {
          const line = this.buffer.slice(0, i).trim()
          this.buffer = this.buffer.slice(i + 1)
          if (line) onLine(line)
        }
      })
      proc.stderr.on('data', () => {
        /* avisos do Python (download do modelo etc.) */
      })
      proc.on('error', (err) => reject(new Error(`Python não encontrado para a transcrição: ${err.message}`)))
      proc.on('exit', () => {
        this.proc = null
        this.ready = null
        for (const [, p] of this.pending) {
          clearTimeout(p.timer)
          p.reject(new Error('A transcrição foi interrompida.'))
        }
        this.pending.clear()
        reject(new Error('A transcrição local fechou antes de ficar pronta.'))
      })
    })
    this.ready.catch(() => {
      this.ready = null
    })
    return this.ready
  }

  private touch(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = setTimeout(() => this.stop(), IDLE_MS)
  }

  stop(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = null
    this.proc?.kill()
    this.proc = null
    this.ready = null
  }

  // Transcreve um arquivo de áudio (ogg, webm, mp3, wav…). Um por vez, na ordem de chegada.
  transcribeFile(file: string, timeoutMs = 120_000): Promise<{ text: string; model: string }> {
    const run = async () => {
      await this.start()
      this.touch()
      const id = String(++this.seq)
      return new Promise<{ text: string; model: string }>((resolve, reject) => {
        const timer = setTimeout(() => {
          this.pending.delete(id)
          reject(new Error('A transcrição demorou demais.'))
        }, timeoutMs)
        this.pending.set(id, { resolve, reject, timer })
        this.proc!.stdin.write(JSON.stringify({ id, file }) + '\n')
      }).finally(() => this.touch())
    }
    const next = this.chain.then(run, run)
    this.chain = next.catch(() => undefined)
    return next
  }

  // Transcreve bytes de áudio (vindos do WhatsApp ou do microfone); o arquivo temporário é apagado depois
  async transcribeBuffer(data: Buffer, ext = 'ogg', timeoutMs?: number): Promise<{ text: string; model: string }> {
    const file = path.join(TMP_DIR, `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext.replace(/[^a-z0-9]/gi, '') || 'ogg'}`)
    fs.writeFileSync(file, data)
    try {
      return await this.transcribeFile(file, timeoutMs)
    } finally {
      fs.rmSync(file, { force: true })
    }
  }
}
