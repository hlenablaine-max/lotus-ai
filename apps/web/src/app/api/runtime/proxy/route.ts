// Proxies calls from the browser/agents to the LOTUS desktop RuntimeHttpServer
// The RuntimeHttpServer runs on a random port in ~/LOTUS_Workspace/.runtime-port

import { NextRequest } from "next/server";
import { createRuntimeClient } from "@/lib/runtime-client";

export const runtime = "nodejs";

export async function GET() {
  const client = createRuntimeClient();
  const available = await client.available();
  return Response.json({ available });
}

export async function POST(request: NextRequest) {
  const { endpoint, data } = await request.json() as {
    endpoint: string;
    data?: Record<string, unknown>;
  };

  if (!endpoint) {
    return Response.json({ error: "endpoint is required" }, { status: 400 });
  }

  const client = createRuntimeClient();
  const available = await client.available();

  if (!available) {
    return Response.json(
      { error: "LOTUS desktop app não está rodando. Abra o aplicativo LOTUS para usar esta funcionalidade." },
      { status: 503 }
    );
  }

  try {
    const result = await client.call(endpoint, data);
    return Response.json(result);
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
