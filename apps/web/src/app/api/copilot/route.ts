import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const DRAEL_API_KEY = process.env.DRAEL_API_KEY || ''
const DRAEL_BASE_URL = process.env.DRAEL_BASE_URL || 'https://drael.sh/v1'

const SYSTEM_PROMPT = `Você é o Sales Copilot da LOTUS AI — uma IA de vendas que ajuda o vendedor (Ícaro) em reuniões ao vivo.

Sua função: analisar o que o cliente acabou de dizer e fornecer a melhor resposta que Ícaro pode usar IMEDIATAMENTE.

REGRAS:
1. A sugestão deve ser uma frase ou duas, direta, natural, que Ícaro possa ler para o cliente.
2. Nunca diga "eu sugiro que você diga..." — escreva a resposta como se fosse Ícaro falando.
3. Identifique a tática correta: Rapport, Objeção, Fechamento, "Valor & ROI", Descoberta, ou Urgência.
4. Confidence: 0.0 a 1.0 — quão certo você está de que esta é a melhor resposta.

Responda SEMPRE em JSON puro, sem markdown:
{
  "suggestion": "O texto que Ícaro deve falar para o cliente",
  "tactic": "Objeção",
  "confidence": 0.87
}`

export async function POST(req: NextRequest) {
  try {
    const { clientSaid, context } = await req.json() as { clientSaid: string; context?: string }

    if (!clientSaid?.trim()) {
      return NextResponse.json({ error: 'clientSaid required' }, { status: 400 })
    }

    const userContent = context
      ? `Contexto da conversa até agora:\n${context}\n\nO cliente acabou de dizer:\n"${clientSaid}"`
      : `O cliente disse:\n"${clientSaid}"`

    const res = await fetch(`${DRAEL_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DRAEL_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'drael-v1',
        max_tokens: 300,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userContent },
        ],
        stream: false,
      }),
    })

    if (!res.ok) throw new Error(`Drael API error: ${res.status}`)
    const data = await res.json() as { choices: { message: { content: string } }[] }
    const raw = data.choices[0]?.message?.content?.trim() ?? ''
    const clean = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    const parsed = JSON.parse(clean)

    return NextResponse.json(parsed)
  } catch (err) {
    console.error('[API /copilot POST]', err)
    return NextResponse.json(
      { suggestion: 'Entendo. Pode me contar mais sobre essa situação?', tactic: 'Descoberta', confidence: 0.5 },
    )
  }
}
