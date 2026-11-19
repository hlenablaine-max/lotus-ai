"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle, CheckCircle2, Clock, FileText, FolderDown, Hammer, Instagram, Loader2, MessageCircle, MonitorOff, Radar, ShieldAlert, XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { RichText } from "@/components/ui/rich-text";

interface Progress {
  mission: { id: string; title: string; status: string; client: { id: string; name: string; instagram: string | null } };
  hasProduction: boolean;
  exportDir: string | null;
  tasks: Array<{ id: string; title: string; phase: "diagnostico" | "producao"; status: string; agent: string; role: string; error: string | null }>;
  documents: Array<{ id: string; title: string; type: string; phase: "diagnostico" | "producao"; content: string }>;
  approvals: Array<{ id: string; title: string; status: string; description: string }>;
  report: { title: string; content: string } | null;
  done: boolean;
}

interface Accounts {
  desktop: boolean;
  instagram?: boolean;
  google?: boolean;
  visible?: boolean;
  error?: string;
}

interface RecentDiagnosis {
  id: string;
  title: string;
  status: string;
  createdAt: string;
}

const TASK_ICON: Record<string, React.ReactNode> = {
  COMPLETED: <CheckCircle2 className="w-4 h-4 text-emerald-400" />,
  IN_PROGRESS: <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />,
  FAILED: <XCircle className="w-4 h-4 text-red-400" />,
};

const TASK_LABEL: Record<string, string> = {
  COMPLETED: "concluído",
  IN_PROGRESS: "trabalhando",
  QUEUED: "na fila",
  PENDING: "na fila",
  WAITING_DEPENDENCY: "aguardando a equipe",
  FAILED: "falhou",
};

export function Diagnosis360() {
  const [instagram, setInstagram] = useState("");
  const [city, setCity] = useState("");
  const [testWhatsApp, setTestWhatsApp] = useState(false);
  const [produce, setProduce] = useState(true);
  const [actionMessage, setActionMessage] = useState("");
  const [acting, setActing] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [missionId, setMissionId] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [accounts, setAccounts] = useState<Accounts | null>(null);
  const [recent, setRecent] = useState<RecentDiagnosis[]>([]);
  const [openDoc, setOpenDoc] = useState<string | null>(null);
  const [accountMessage, setAccountMessage] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadAccounts = useCallback(async () => {
    try {
      const res = await fetch("/api/research/accounts");
      if (res.ok) setAccounts(await res.json());
    } catch {
      setAccounts(null);
    }
  }, []);

  const loadRecent = useCallback(async () => {
    try {
      const res = await fetch("/api/diagnosis-360");
      if (res.ok) setRecent((await res.json()).diagnoses ?? []);
    } catch {
      /* lista é opcional */
    }
  }, []);

  useEffect(() => {
    loadAccounts();
    loadRecent();
    const fromUrl = new URLSearchParams(window.location.search).get("missionId");
    if (fromUrl) setMissionId(fromUrl);
  }, [loadAccounts, loadRecent]);

  const refresh = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/diagnosis-360?missionId=${id}`);
      if (!res.ok) return;
      const data = (await res.json()) as Progress;
      setProgress(data);
      const failed = data.mission.status === "FAILED";
      if ((data.done || failed) && pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
        loadRecent();
      }
    } catch {
      /* tenta de novo no próximo ciclo */
    }
  }, [loadRecent]);

  useEffect(() => {
    if (!missionId) return;
    setProgress(null);
    refresh(missionId);
    pollRef.current = setInterval(() => refresh(missionId), 4000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [missionId, refresh]);

  const start = async () => {
    if (!instagram.trim() || starting) return;
    setStarting(true);
    setError("");
    try {
      const res = await fetch("/api/diagnosis-360", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instagram, city, testWhatsApp, produce }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Não foi possível iniciar o diagnóstico.");
      setMissionId(data.missionId);
      setInstagram("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setStarting(false);
    }
  };

  const account = async (action: "connect" | "close", service?: "instagram" | "whatsapp" | "google") => {
    setAccountMessage("");
    const res = await fetch("/api/research/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, service }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setAccountMessage(data.error ?? "Não foi possível abrir a janela.");
    else if (action === "connect") setAccountMessage(`Janela aberta: entre no ${service === "whatsapp" ? "WhatsApp (leia o QR code com o celular)" : service === "google" ? "Google (qualquer conta Gmail serve)" : "Instagram"} e depois clique em "Concluir conexão".`);
    else setAccountMessage("Sessão salva.");
    loadAccounts();
  };

  const decide = async (approvalId: string, action: "APPROVED" | "REJECTED") => {
    await fetch(`/api/approvals/${approvalId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (missionId) refresh(missionId);
  };

  // Produzir as soluções de um diagnóstico já feito, ou gravar o pacote de entrega em pasta
  const missionAction = async (action: "produce" | "export") => {
    if (!missionId || acting) return;
    setActing(true);
    setActionMessage("");
    try {
      const res = await fetch("/api/diagnosis-360", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, missionId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Não foi possível concluir.");
      setActionMessage(action === "produce" ? `Produção iniciada: ${data.created} entregas na fila da equipe.` : `${data.files} arquivos gravados em ${data.dir}`);
      if (action === "produce" && !pollRef.current) pollRef.current = setInterval(() => refresh(missionId), 4000);
      refresh(missionId);
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setActing(false);
    }
  };

  const completed = progress?.tasks.filter((t) => t.status === "COMPLETED").length ?? 0;
  const total = progress?.tasks.length ?? 0;
  const collecting = progress && total === 1 && progress.tasks[0].status === "IN_PROGRESS";
  const collectionFailed = progress?.mission.status === "FAILED" ? progress.tasks.find((t) => t.error)?.error : null;
  const pendingApprovals = progress?.approvals.filter((a) => a.status === "PENDING") ?? [];
  const otherDocs = progress?.documents.filter((d) => d.title !== progress.report?.title) ?? [];
  const phases = [
    { key: "diagnostico" as const, label: "Diagnóstico", docsLabel: "Análises da equipe" },
    { key: "producao" as const, label: "Produção das soluções", docsLabel: "Soluções produzidas (prontas para instalar no cliente)" },
  ];

  return (
    <div className="rounded-2xl border border-pink-500/20 bg-pink-500/5 p-6 space-y-5">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-pink-500/15 border border-pink-500/30 flex items-center justify-center flex-shrink-0">
          <Radar className="w-5 h-5 text-pink-400" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-bold text-white">Diagnóstico 360 — equipe completa</h2>
          <p className="text-sm text-white/50">
            Cole o Instagram do lead. O app lê o perfil, os posts e vídeos, o link da bio, os anúncios e o Google; nove agentes analisam, a equipe fecha o diagnóstico e depois produz as soluções: IA de atendimento, campanhas, copies, criativos, calendário, página e funil.
          </p>
        </div>
      </div>

      {accounts && !accounts.desktop && (
        <div className="flex items-center gap-2 text-amber-300 text-sm p-3 rounded-xl border border-amber-400/20 bg-amber-400/5">
          <MonitorOff size={16} /> O diagnóstico usa o navegador do aplicativo desktop. Abra o aplicativo LOTUS neste computador.
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-3">
        <div className="relative flex-1">
          <Instagram className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input
            value={instagram}
            onChange={(e) => setInstagram(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && start()}
            placeholder="instagram.com/clinica ou @clinica"
            className="w-full pl-11 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-pink-500"
          />
        </div>
        <input
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="Cidade (opcional)"
          className="lg:w-48 px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-pink-500"
        />
        <button
          onClick={start}
          disabled={starting || !instagram.trim() || accounts?.desktop === false}
          className="px-6 py-3 rounded-xl bg-pink-500 hover:bg-pink-400 disabled:opacity-40 text-white font-semibold text-sm flex items-center justify-center gap-2"
        >
          {starting ? <Loader2 size={16} className="animate-spin" /> : <Radar size={16} />}
          Diagnosticar
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-white/50">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={produce} onChange={(e) => setProduce(e.target.checked)} className="accent-pink-500" />
          Produzir as soluções depois do diagnóstico
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={testWhatsApp} onChange={(e) => setTestWhatsApp(e.target.checked)} className="accent-pink-500" />
          Testar o atendimento no WhatsApp do lead (envia uma mensagem de cliente interessado, sem pedir aprovação de novo)
        </label>
        {accounts?.desktop && (
          <span className="flex items-center gap-2 flex-wrap">
            Contas do navegador de pesquisa:
            <span className={accounts.instagram ? "text-emerald-400" : "text-white/40"}>Instagram {accounts.instagram ? "conectado" : "sem login (só perfis públicos)"}</span>
            <button onClick={() => account("connect", "instagram")} className="underline hover:text-white">conectar Instagram</button>
            <span className={accounts.google ? "text-emerald-400" : "text-white/40"}>Google {accounts.google ? "conectado" : "sem login (sem texto das avaliações)"}</span>
            <button onClick={() => account("connect", "google")} className="underline hover:text-white">conectar Google</button>
            <button onClick={() => account("connect", "whatsapp")} className="underline hover:text-white">conectar WhatsApp</button>
            {accounts.visible && <button onClick={() => account("close")} className="underline text-pink-300 hover:text-white">concluir conexão</button>}
          </span>
        )}
      </div>
      {accountMessage && <p className="text-xs text-pink-200">{accountMessage}</p>}

      {error && (
        <div className="flex items-center gap-2 text-red-400 text-sm p-3 rounded-xl border border-red-400/20 bg-red-400/5">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {progress && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h3 className="text-sm font-semibold text-white">{progress.mission.title}</h3>
              <p className="text-xs text-white/40">
                {collectionFailed
                  ? "Não foi possível concluir"
                  : collecting
                    ? "Coletando dados reais com o navegador do app (2 a 5 minutos)…"
                    : progress.done
                      ? progress.hasProduction ? "Diagnóstico e produção concluídos" : "Diagnóstico concluído"
                      : `Equipe trabalhando: ${completed} de ${total} etapas concluídas`}
              </p>
            </div>
            <div className="flex gap-3 text-xs">
              <Link href={`/missions?open=${progress.mission.id}`} className="text-pink-300 hover:underline">Abrir missão</Link>
              <Link href={`/clients/${progress.mission.client.id}`} className="text-pink-300 hover:underline">Abrir cliente</Link>
            </div>
          </div>

          {collectionFailed && (
            <div className="flex items-start gap-2 text-red-300 text-sm p-3 rounded-xl border border-red-400/20 bg-red-400/5">
              <AlertCircle size={16} className="mt-0.5 flex-shrink-0" /> {collectionFailed}
            </div>
          )}

          {total > 0 && (
            <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full bg-pink-500 transition-all duration-500" style={{ width: `${Math.round((completed / total) * 100)}%` }} />
            </div>
          )}

          {phases.map((phase) => {
            const phaseTasks = progress.tasks.filter((t) => t.phase === phase.key);
            if (phaseTasks.length === 0) return null;
            return (
              <div key={phase.key} className="space-y-2">
                <div className="text-xs font-semibold text-white/40 uppercase tracking-wider">
                  {phase.label} ({phaseTasks.filter((t) => t.status === "COMPLETED").length}/{phaseTasks.length})
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {phaseTasks.map((task) => (
                    <div key={task.id} className="flex items-start gap-2.5 p-3 rounded-xl border border-white/8 bg-white/3">
                      <div className="mt-0.5">{TASK_ICON[task.status] ?? <Clock className="w-4 h-4 text-white/30" />}</div>
                      <div className="min-w-0">
                        <div className="text-sm text-white/90 leading-snug">{task.title.replace(/^Produção: /, "")}</div>
                        <div className="text-[11px] text-white/40">
                          {task.agent} · {TASK_LABEL[task.status] ?? task.status.toLowerCase()}
                        </div>
                        {task.error && <div className="text-[11px] text-red-300 mt-1">{task.error.slice(0, 220)}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          <div className="flex flex-wrap items-center gap-2">
            {progress.report && !progress.hasProduction && (
              <button onClick={() => missionAction("produce")} disabled={acting} className="px-3 py-2 rounded-lg bg-pink-500/15 border border-pink-500/40 text-pink-200 text-xs font-medium flex items-center gap-1.5 disabled:opacity-40">
                <Hammer size={13} /> Produzir as soluções deste diagnóstico
              </button>
            )}
            {progress.documents.length > 1 && (
              <button onClick={() => missionAction("export")} disabled={acting} className="px-3 py-2 rounded-lg bg-white/5 border border-white/15 text-white/80 text-xs font-medium flex items-center gap-1.5 disabled:opacity-40">
                <FolderDown size={13} /> Gravar tudo em uma pasta deste computador
              </button>
            )}
            {(actionMessage || progress.exportDir) && <span className="text-xs text-white/50 break-all">{actionMessage || `Pacote gravado em ${progress.exportDir}`}</span>}
          </div>

          {pendingApprovals.map((approval) => (
            <div key={approval.id} className="p-4 rounded-xl border border-amber-400/30 bg-amber-400/5 space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-200">
                <ShieldAlert size={15} /> {approval.title}
              </div>
              <p className="text-xs text-white/60 whitespace-pre-wrap">{approval.description}</p>
              <div className="flex gap-2">
                <button onClick={() => decide(approval.id, "APPROVED")} className="px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-medium flex items-center gap-1.5">
                  <MessageCircle size={12} /> Aprovar e enviar
                </button>
                <button onClick={() => decide(approval.id, "REJECTED")} className="px-3 py-1.5 rounded-lg bg-red-500/15 border border-red-500/30 text-red-400 text-xs font-medium">
                  Não testar
                </button>
              </div>
            </div>
          ))}

          {progress.report && (
            <div className="rounded-xl border border-emerald-400/20 bg-black/30 p-5">
              <div className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-3">Relatório final</div>
              <div className="text-white/85">
                <RichText content={progress.report.content} />
              </div>
            </div>
          )}

          {phases.slice().reverse().map((phase) => {
            const phaseDocs = otherDocs.filter((d) => d.phase === phase.key);
            if (phaseDocs.length === 0) return null;
            return (
            <div key={phase.key} className="space-y-2">
              <div className={cn("text-xs font-semibold uppercase tracking-wider", phase.key === "producao" ? "text-pink-300" : "text-white/40")}>{phase.docsLabel} ({phaseDocs.length})</div>
              {phaseDocs.map((doc) => (
                <div key={doc.id} className="rounded-xl border border-white/8 bg-white/3 overflow-hidden">
                  <button onClick={() => setOpenDoc(openDoc === doc.id ? null : doc.id)} className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-white/5">
                    <FileText className="w-4 h-4 text-pink-400 flex-shrink-0" />
                    <span className="text-sm text-white/85 flex-1 truncate">{doc.title}</span>
                    <span className="text-[10px] text-white/30">{doc.type}</span>
                  </button>
                  {openDoc === doc.id && (
                    <div className="px-4 pb-4 text-white/80 border-t border-white/8 pt-3">
                      {doc.type === "RESEARCH_REPORT" ? (
                        <pre className="text-[11px] whitespace-pre-wrap break-words text-white/60">{doc.content}</pre>
                      ) : (
                        <RichText content={doc.content} />
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
            );
          })}
        </div>
      )}

      {recent.length > 0 && (
        <div className="pt-2 border-t border-white/8">
          <div className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">Diagnósticos recentes</div>
          <div className="flex flex-wrap gap-2">
            {recent.map((item) => (
              <button
                key={item.id}
                onClick={() => setMissionId(item.id)}
                className={cn(
                  "px-3 py-1.5 rounded-lg border text-xs transition-colors",
                  missionId === item.id ? "border-pink-500/50 bg-pink-500/15 text-white" : "border-white/10 text-white/60 hover:text-white hover:border-white/25"
                )}
              >
                {item.title.replace("Diagnóstico 360 — ", "")}
                <span className="ml-2 text-white/30">{new Date(item.createdAt).toLocaleDateString("pt-BR")}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
