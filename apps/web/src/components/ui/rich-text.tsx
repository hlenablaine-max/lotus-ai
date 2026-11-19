"use client";

// Mostra os textos dos agentes como documento legível (títulos, listas, tabelas, destaques),
// em vez de markdown cru com asteriscos e #. Código longo (ex.: HTML do site) fica recolhido.

import { useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

function CodeBlock({ language, code }: { language: string; code: string }) {
  const [open, setOpen] = useState(code.length < 600);
  return (
    <div className="my-4 rounded-xl border border-white/10 bg-black/40 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-2 text-[11px] uppercase tracking-wider text-white/50 hover:text-white/80"
      >
        <span>{language ? `Código ${language}` : "Código"} · {code.split("\n").length} linhas</span>
        <span>{open ? "recolher" : "mostrar"}</span>
      </button>
      {open && <pre className="px-4 pb-4 text-[11px] leading-relaxed text-white/70 overflow-auto max-h-[420px] whitespace-pre-wrap break-words">{code}</pre>}
    </div>
  );
}

const components: Components = {
  h1: ({ children }) => <h2 className="text-xl font-bold text-white mt-8 mb-3 first:mt-0">{children}</h2>,
  h2: ({ children }) => <h3 className="text-lg font-semibold text-white mt-7 mb-3 pb-2 border-b border-white/10 first:mt-0">{children}</h3>,
  h3: ({ children }) => <h4 className="text-base font-semibold text-white/95 mt-6 mb-2">{children}</h4>,
  h4: ({ children }) => <h5 className="text-sm font-semibold text-white/90 mt-5 mb-2 uppercase tracking-wide">{children}</h5>,
  p: ({ children }) => <p className="text-[15px] leading-7 text-white/80 my-3">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
  em: ({ children }) => <em className="text-white/90">{children}</em>,
  ul: ({ children }) => <ul className="my-3 space-y-2 pl-1">{children}</ul>,
  ol: ({ children }) => <ol className="my-3 space-y-2 pl-5 list-decimal marker:text-primary marker:font-semibold">{children}</ol>,
  li: ({ children, ...props }) => {
    // Itens de lista numerada usam o marcador do <ol>; os demais ganham um ponto colorido
    const ordered = (props as { ordered?: boolean }).ordered;
    return ordered ? (
      <li className="text-[15px] leading-7 text-white/80 pl-1">{children}</li>
    ) : (
      <li className="text-[15px] leading-7 text-white/80 flex gap-3">
        <span className="mt-[11px] h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0" />
        <span className="min-w-0">{children}</span>
      </li>
    );
  },
  blockquote: ({ children }) => (
    <div className="my-4 rounded-xl border-l-4 border-primary bg-primary/10 px-4 py-1 text-white/90">{children}</div>
  ),
  hr: () => <div className="my-6 h-px bg-white/10" />,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2 hover:opacity-80 break-all">
      {children}
    </a>
  ),
  table: ({ children }) => (
    <div className="my-4 overflow-x-auto rounded-xl border border-white/10">
      <table className="w-full text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-white/5">{children}</thead>,
  th: ({ children }) => <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-white/60">{children}</th>,
  td: ({ children }) => <td className="px-3 py-2 align-top text-white/80 border-t border-white/5">{children}</td>,
  code: ({ className, children }) => {
    const text = String(children ?? "");
    const language = /language-(\w+)/.exec(className ?? "")?.[1] ?? "";
    if (language || text.includes("\n")) return <CodeBlock language={language} code={text.replace(/\n$/, "")} />;
    return <code className="rounded bg-white/10 px-1.5 py-0.5 text-[13px] text-white/90">{text}</code>;
  },
  pre: ({ children }) => <>{children}</>,
};

export function RichText({ content, className }: { content: string; className?: string }) {
  // Textos antigos às vezes começam com "Relatório salvo com sucesso" ou vêm com \n literais
  const clean = content.replace(/\\n/g, "\n").trim();
  return (
    <div className={cn("max-w-none break-words", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {clean}
      </ReactMarkdown>
    </div>
  );
}
