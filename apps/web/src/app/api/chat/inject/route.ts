import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, source = "injection" } = body as { message?: string; source?: string };

    if (!message || typeof message !== "string" || !message.trim()) {
      return Response.json({ error: "message is required" }, { status: 400 });
    }

    const saved = await prisma.chatMessage.create({
      data: {
        role: "USER",
        content: message.trim(),
        metadata: { source },
      },
    });

    return Response.json({ success: true, messageId: saved.id });
  } catch (err) {
    console.error("[chat/inject] error:", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
