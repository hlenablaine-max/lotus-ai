// Recebedor público das DMs do Instagram (ManyChat). Roda na Vercel 24 h por dia.
// Só faz duas coisas, com um usuário de banco que não pode fazer mais nada:
// 1) confere se o token do endereço é de um cliente conectado; 2) guarda a mensagem na fila "inbound_events".
// O app da LOTUS (no PC) lê essa fila a cada poucos segundos e transforma em conversa, lead e resposta da IA.
import { neon } from '@neondatabase/serverless'
import crypto from 'node:crypto'

const sql = neon(process.env.DATABASE_URL)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' })
  const token = String(req.query.t ?? '')
  if (token.length < 16 || token.length > 80) return res.status(401).json({ error: 'Não autorizado' })
  try {
    const found = await sql`SELECT 1 FROM manychat_accounts WHERE "inboundToken" = ${token} AND status = 'conectado' LIMIT 1`
    if (!found.length) return res.status(401).json({ error: 'Não autorizado' })
    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const payload = JSON.stringify(body).slice(0, 20000)
    await sql`INSERT INTO inbound_events (id, source, token, payload) VALUES (${crypto.randomUUID()}, 'manychat', ${token}, ${payload}::jsonb)`
    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('recebedor:', err instanceof Error ? err.message : err)
    return res.status(500).json({ error: 'Falha ao guardar' })
  }
}
