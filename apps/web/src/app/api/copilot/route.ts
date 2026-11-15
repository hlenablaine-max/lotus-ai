import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export const dynamic = 'force-dynamic'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

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

    const message = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userContent }],
    })

    const raw = (message.content[0] as { type: string; text: string }).text.trim()
    // Strip markdown code blocks if present
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
