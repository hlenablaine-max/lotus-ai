import * as fs from "fs";
import { NextRequest } from "next/server";
import { requireOwner } from "@/lib/require-owner";
import { renderMissionReportPdf } from "@/lib/report-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// GET /api/missions/:id/report?interno=1 → PDF do relatório do cliente (versão interna inclui roteiro de venda e auditorias)
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;
  const { id } = await params;
  const internal = request.nextUrl.searchParams.get("interno") === "1";
  try {
    const result = await renderMissionReportPdf(id, { internal });
    if ("error" in result) {
      // Sem o app desktop: devolve a versão para imprimir (o navegador salva como PDF)
      if (result.html) {
        const printable = result.html.replace("</body>", "<script>window.onload=()=>setTimeout(()=>window.print(),800)</script></body>");
        return new Response(printable, { headers: { "Content-Type": "text/html; charset=utf-8" } });
      }
      return Response.json({ error: result.error }, { status: 404 });
    }
    const pdf = fs.readFileSync(result.pdfPath);
    const ascii = result.fileBase.normalize("NFD").replace(/[^\x20-\x7e]/g, "");
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${ascii}.pdf"; filename*=UTF-8''${encodeURIComponent(result.fileBase)}.pdf`,
        "Content-Length": String(pdf.length),
      },
    });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
