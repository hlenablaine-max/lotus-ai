import { NextRequest, NextResponse } from 'next/server'
import { initializeProviders, registry } from '@lotus/ai-engine'

export const dynamic = 'force-dynamic'

const SYSTEM_PROMPT = `Você é o Sales Copilot da LOTUS AI — uma IA de vendas que ajuda o vendedor (Ícaro) em reuniões ao vivo.

Sua função: analisar o que o cliente acabou de dizer e fornecer a melhor resposta que Ícaro pode usar IMEDIATAMENTE.

REGRAS:
1. A sugestão deve ser uma frase ou duas, direta, natural, que Ícaro possa ler para o cliente.
2. Nunca diga "eu sugiro que você diga..." — escreva a resposta como se fosse Ícaro falando.
3. Identifique a tática correta: Rapport, Objeção, Fechamento, "Valor & ROI", Descoberta, ou Urgência.
4. Confidence: 0.0 a 1.0 — quão certo você está de que esta é a melhor resposta.
5. Nunca invente números, resultados de clientes ou garantias que não estejam no contexto.

Responda SEMPRE em JSON puro, sem markdown:
{
  "suggestion": "O texto que Ícaro deve falar para o cliente",
  "tactic": "Objeção",
  "confidence": 0.87
}`

export async function POST(req: NextRequest) {
  let clientSaid = ''
  let context: string | undefined
  try {
    const body = await req.json() as { clientSaid?: string; context?: string }
    clientSaid = body.clientSaid ?? ''
    context = body.context
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  if (!clientSaid.trim()) {
    return NextResponse.json({ error: 'clientSaid required' }, { status: 400 })
  }

  const userContent = context
    ? `Contexto da conversa até agora:\n${context}\n\nO cliente acabou de dizer:\n"${clientSaid}"`
    : `O cliente disse:\n"${clientSaid}"`

  try {
    initializeProviders()
    const result = await registry.getDefault().complete({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
      maxTokens: 300,
    })

    const raw = result.content.trim()
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('A IA não retornou uma sugestão em formato válido')
    const parsed = JSON.parse(jsonMatch[0]) as { suggestion?: string; tactic?: string; confidence?: number }
    if (!parsed.suggestion) throw new Error('A IA retornou uma sugestão vazia')

    return NextResponse.json({
      suggestion: parsed.suggestion,
      tactic: parsed.tactic ?? 'Descoberta',
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : null,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[API /copilot POST]', err)
    return NextResponse.json({ error: `Copilot indisponível: ${message}` }, { status: 502 })
  }
}
