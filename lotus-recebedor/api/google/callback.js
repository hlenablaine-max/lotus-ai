// Volta do Google quando a clínica autoriza a agenda. Confere a assinatura do link (só a LOTUS gera links
// válidos), guarda o código na fila "inbound_events" e mostra uma página de confirmação. O app da LOTUS no PC
// troca o código pelo acesso à agenda (o segredo do Google nunca fica aqui).
import { neon } from '@neondatabase/serverless'
import crypto from 'node:crypto'

const sql = neon(process.env.DATABASE_URL)

function page(title, text, ok) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0d0a18;color:#eee;font-family:system-ui,sans-serif}
.c{max-width:420px;padding:32px;border-radius:18px;background:#17122a;border:1px solid #3b2a6b;text-align:center}
h1{font-size:20px;margin:12px 0 8px;color:${ok ? '#c4b5fd' : '#fca5a5'}}p{color:#bbb;line-height:1.5;font-size:15px}.i{font-size:40px}</style></head>
<body><div class="c"><div class="i">${ok ? '✅' : '⚠️'}</div><h1>${title}</h1><p>${text}</p></div></body></html>`
}

function validState(state) {
  const secret = process.env.LOTUS_RELAY_SECRET
  if (!secret || typeof state !== 'string') return false
  const [payload, sig] = state.split('.')
  if (!payload || !sig) return false
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url')
  if (expected.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return false
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'))
    return typeof data.e === 'number' && data.e > Date.now() ? data : false
  } catch {
    return false
  }
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  const state = String(req.query.state ?? '')
  const data = validState(state)
  if (!data) return res.status(400).send(page('Link inválido ou vencido', 'Peça um link novo para a equipe da LOTUS.', false))
  const code = req.query.code ? String(req.query.code).slice(0, 1000) : null
  const error = req.query.error ? String(req.query.error).slice(0, 100) : null
  try {
    const payload = JSON.stringify({ code, error, state })
    await sql`INSERT INTO inbound_events (id, source, token, payload) VALUES (${crypto.randomUUID()}, 'google_oauth', ${String(data.n ?? '').slice(0, 40)}, ${payload}::jsonb)`
  } catch (err) {
    console.error('google callback:', err instanceof Error ? err.message : err)
    return res.status(500).send(page('Não deu certo agora', 'Tente de novo em alguns minutos.', false))
  }
  if (error) return res.status(200).send(page('Agenda não conectada', 'Tudo bem, nada foi compartilhado. Se mudar de ideia, é só abrir o link de novo.', false))
  return res.status(200).send(page('Agenda conectada!', 'Pronto: a LOTUS vai marcar as consultas na sua Google Agenda sem chocar horário. Pode fechar esta página.', true))
}
