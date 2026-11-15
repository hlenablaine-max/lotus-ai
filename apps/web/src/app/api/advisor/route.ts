import { NextRequest } from "next/server";
import { streamRootMaster } from "@lotus/ai-engine";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { message, history = [], system } = body;

  if (!message) {
    return Response.json({ error: "message required" }, { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const gen = streamRootMaster(message, {
          conversationHistory: history,
          overrideSystem: system,
        });

        for await (const chunk of gen) {
          const data = `data: ${JSON.stringify({ delta: chunk.delta })}\n\n`;
          controller.enqueue(encoder.encode(data));
        }

        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } catch {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: "\n\n[Erro ao processar]" })}\n\n`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
