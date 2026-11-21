"use client";

// Contrato e LGPD da clínica: abre os modelos preenchidos (para imprimir/salvar em PDF) e marca quando foram assinados
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, FileText, Printer, ShieldCheck, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Doc = "contrato" | "dpa";
const LABEL: Record<Doc, string> = { contrato: "Contrato de prestação de serviços", dpa: "Termo de tratamento de dados (LGPD)" };

export function LegalCard({ clientId }: { clientId: string }) {
  const [signed, setSigned] = useState<{ contractSignedAt?: string | null; dpaSignedAt?: string | null }>({});
  const [open, setOpen] = useState<Doc | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    fetch(`/api/clients/${clientId}/legal`)
      .then((r) => r.json())
      .then(setSigned)
      .catch(() => undefined);
  }, [clientId]);

  const toggle = async (doc: Doc, value: boolean) => {
    const r = await fetch(`/api/clients/${clientId}/legal`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ doc, signed: value }) });
    if (r.ok) setSigned(await r.json());
  };

  const at = (doc: Doc) => (doc === "contrato" ? signed.contractSignedAt : signed.dpaSignedAt);

  return (
    <div className="p-5 rounded-xl bg-card border border-border">
      <h3 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-primary" /> Contrato e LGPD</h3>
      <p className="text-xs text-muted-foreground mb-4">Modelos já preenchidos com os dados desta clínica. Revise com um advogado antes de assinar.</p>
      <div className="space-y-3">
        {(["contrato", "dpa"] as Doc[]).map((doc) => (
          <div key={doc} className="flex flex-wrap items-center gap-3">
            <FileText className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-foreground flex-1 min-w-[180px]">{LABEL[doc]}</span>
            <button onClick={() => setOpen(doc)} className="text-xs px-2.5 py-1.5 rounded-lg border border-border hover:bg-muted">Abrir</button>
            <label className={cn("text-xs flex items-center gap-1.5 cursor-pointer", at(doc) ? "text-emerald-300" : "text-muted-foreground")}>
              <input type="checkbox" checked={!!at(doc)} onChange={(e) => void toggle(doc, e.target.checked)} />
              {at(doc) ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" /> assinado em {new Date(at(doc)!).toLocaleDateString("pt-BR")}
                </>
              ) : (
                "assinado"
              )}
            </label>
          </div>
        ))}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setOpen(null)}>
          <div className="w-full max-w-4xl h-[90vh] rounded-xl overflow-hidden bg-white flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-2 bg-zinc-900 text-white text-sm">
              <span>{LABEL[open]}</span>
              <div className="flex gap-2">
                <button onClick={() => frame.current?.contentWindow?.print()} className="flex items-center gap-1.5 px-3 py-1 rounded bg-primary text-primary-foreground text-xs"><Printer className="w-3.5 h-3.5" /> Imprimir / salvar PDF</button>
                <button onClick={() => setOpen(null)} className="p-1 rounded hover:bg-white/10"><X className="w-4 h-4" /></button>
              </div>
            </div>
            <iframe ref={frame} src={`/api/clients/${clientId}/legal?doc=${open}`} className="flex-1 w-full bg-white" title={LABEL[open]} />
          </div>
        </div>
      )}
    </div>
  );
}
