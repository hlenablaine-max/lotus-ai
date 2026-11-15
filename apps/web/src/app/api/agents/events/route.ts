import { getAgentStore } from '@/lib/agent-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const store = getAgentStore()

  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder()

      const send = (data: unknown) => {
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`))
        } catch {
          // stream already closed — ignore
        }
      }

      // Send initial full state
      send({ type: 'init', agents: store.getAll() })

      // Subscribe to store updates
      const unsub = store.subscribe((update) => send(update))

      // Heartbeat every 25s to keep connection alive through proxies
      const heartbeat = setInterval(() => {
        send({ type: 'heartbeat', ts: Date.now() })
      }, 25_000)

      req.signal.addEventListener('abort', () => {
        clearInterval(heartbeat)
        unsub()
        try {
          controller.close()
        } catch {
          // already closed
        }
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
