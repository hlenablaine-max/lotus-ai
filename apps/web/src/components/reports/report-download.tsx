"use client";

import { useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// Baixa o relatório do cliente em PDF (capa, resumo executivo, gargalos, site e todos os documentos).
export function ReportDownloadButton({
  missionId,
  internal = false,
  compact = false,
  className,
}: {
  missionId: string;
  internal?: boolean;
  compact?: boolean;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const download = async () => {
    setState("loading");
    setMessage(null);
    try {
      const res = await fetch(`/api/missions/${missionId}/report${internal ? "?interno=1" : ""}`);
      const type = res.headers.get("content-type") ?? "";
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? `erro ${res.status}`);
      }
      if (type.includes("text/html")) {
        // App desktop fechado: abre a versão para imprimir e salvar como PDF
        const w = window.open("", "_blank");
        if (w) {
          w.document.write(await res.text());
          w.document.close();
        }
        setState("idle");
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get("content-disposition") ?? "";
      const name = decodeURIComponent(disposition.match(/filename\*=UTF-8''([^;]+)/)?.[1] ?? "") || "Playbook LOTUS.pdf";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setState("idle");
    } catch (err) {
      setState("error");
      setMessage(err instanceof Error ? err.message : String(err));
    }
  };

  const label = internal ? "PDF interno" : "Baixar relatório em PDF";
  return (
    <div className={cn("inline-flex flex-col", className)}>
      <button
        type="button"
        onClick={() => void download()}
        disabled={state === "loading"}
        title={internal ? "Versão completa com roteiro de venda e auditorias (não enviar ao cliente)" : "Relatório bonito para enviar ao dono do negócio"}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg border text-xs font-medium transition-colors disabled:opacity-60",
          compact ? "px-2 py-1" : "px-3 py-1.5",
          internal
            ? "border-white/10 bg-white/5 text-muted-foreground hover:text-foreground hover:bg-white/10"
            : "border-primary/40 bg-primary/15 text-primary hover:bg-primary/25"
        )}
      >
        {state === "loading" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
        {state === "loading" ? "Gerando PDF…" : label}
      </button>
      {state === "error" && message && <span className="mt-1 text-[11px] text-red-400 max-w-[260px]">Não deu para gerar: {message}</span>}
    </div>
  );
}
