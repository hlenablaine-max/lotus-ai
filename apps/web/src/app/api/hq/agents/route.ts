import { NextResponse } from "next/server";
import { getLiveAgents, getActivityFeed } from "@/lib/agent-live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [agents, feed] = await Promise.all([getLiveAgents(), getActivityFeed(25)]);
    return NextResponse.json({ agents, feed, ts: Date.now() });
  } catch (err) {
    console.error("[api/hq/agents]", err);
    return NextResponse.json({ error: "Falha ao consultar agentes" }, { status: 503 });
  }
}
