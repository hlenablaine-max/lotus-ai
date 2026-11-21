"use client";

// Equipe: quem mais entra na LOTUS e o que cada um pode fazer. Só o dono vê esta página.
import { useCallback, useEffect, useState } from "react";
import { KeyRound, Loader2, UserPlus, Users } from "lucide-react";
import { cn } from "@/lib/utils";

interface Member {
  id: string;
  name: string | null;
  email: string;
  role: "OWNER" | "ADMIN" | "VIEWER";
  active: boolean;
  lastLoginAt: string | null;
  envOwner: boolean;
  hasPassword: boolean;
}
const ROLE: Record<Member["role"], { label: string; desc: string }> = {
  OWNER: { label: "Dono", desc: "Tudo, inclusive equipe e chaves" },
  ADMIN: { label: "Administrador", desc: "Usa tudo, menos equipe e chaves de integração" },
  VIEWER: { label: "Só visualiza", desc: "Vê tudo, não envia, não aprova, não altera" },
};
const input = "w-full rounded-lg bg-muted/40 border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50";

export default function TeamPage() {
  const [team, setTeam] = useState<Member[]>([]);
  const [form, setForm] = useState({ name: "", email: "", role: "VIEWER" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [secret, setSecret] = useState<{ who: string; pwd: string } | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/team").catch(() => null);
    if (r?.ok) setTeam(((await r.json()) as { team: Member[] }).team);
    else if (r) setError(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "Sem acesso");
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const add = async () => {
    setBusy(true);
    setError("");
    const r = await fetch("/api/team", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const d = (await r.json().catch(() => ({}))) as { error?: string; tempPassword?: string };
    setBusy(false);
    if (!r.ok || !d.tempPassword) return setError(d.error ?? "Não foi possível adicionar");
    setSecret({ who: form.email, pwd: d.tempPassword });
    setForm({ name: "", email: "", role: "VIEWER" });
    void load();
  };

  const patch = async (m: Member, body: Record<string, unknown>) => {
    setError("");
    const r = await fetch(`/api/team/${m.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = (await r.json().catch(() => ({}))) as { error?: string; tempPassword?: string };
    if (!r.ok) setError(d.error ?? "Não foi possível alterar");
    if (d.tempPassword) setSecret({ who: m.email, pwd: d.tempPassword });
    void load();
  };

  return (
    <div className="p-6 max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Users className="w-6 h-6 text-primary" /> Equipe</h1>
        <p className="text-sm text-muted-foreground mt-1">Cada pessoa entra com o próprio e-mail e senha. Desativar corta o acesso na hora.</p>
      </div>

      {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}
      {secret && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100 space-y-1">
          <div className="flex items-center gap-2 font-medium"><KeyRound className="w-4 h-4" /> Senha provisória de {secret.who}</div>
          <div className="font-mono text-base tracking-wider select-all">{secret.pwd}</div>
          <div className="text-xs text-amber-200/80">Aparece só agora. Passe para a pessoa por um canal privado. Ela entra com o e-mail e essa senha.</div>
          <button onClick={() => setSecret(null)} className="text-xs underline">Já anotei, esconder</button>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><UserPlus className="w-4 h-4" /> Adicionar pessoa</h3>
        <div className="grid md:grid-cols-4 gap-2">
          <input className={input} placeholder="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className={cn(input, "md:col-span-2")} placeholder="e-mail" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <select className={input} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="VIEWER">{ROLE.VIEWER.label}</option>
            <option value="ADMIN">{ROLE.ADMIN.label}</option>
          </select>
        </div>
        <div className="flex items-center gap-3">
          <button disabled={busy || !form.email.includes("@")} onClick={() => void add()} className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />} Adicionar
          </button>
          <span className="text-xs text-muted-foreground">{ROLE[form.role as Member["role"]].desc}</span>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground border-b border-border">
              <th className="px-4 py-2 font-medium">Pessoa</th>
              <th className="px-4 py-2 font-medium">Papel</th>
              <th className="px-4 py-2 font-medium">Último acesso</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {team.map((m) => (
              <tr key={m.id} className={cn("border-t border-border/60", !m.active && "opacity-50")}>
                <td className="px-4 py-2">
                  <div className="text-foreground">{m.name ?? m.email}</div>
                  <div className="text-xs text-muted-foreground">{m.email}</div>
                </td>
                <td className="px-4 py-2">
                  {m.envOwner || m.role === "OWNER" ? (
                    <span className="text-xs text-primary">{ROLE.OWNER.label}</span>
                  ) : (
                    <select value={m.role} onChange={(e) => void patch(m, { role: e.target.value })} className="text-xs rounded-md bg-muted/40 border border-border px-1.5 py-1">
                      <option value="ADMIN">{ROLE.ADMIN.label}</option>
                      <option value="VIEWER">{ROLE.VIEWER.label}</option>
                    </select>
                  )}
                </td>
                <td className="px-4 py-2 text-xs text-muted-foreground">{m.lastLoginAt ? new Date(m.lastLoginAt).toLocaleString("pt-BR") : "nunca"}</td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  {!m.envOwner && m.role !== "OWNER" && (
                    <>
                      <button onClick={() => void patch(m, { resetPassword: true })} className="text-xs text-muted-foreground hover:text-foreground">nova senha</button>
                      <button onClick={() => void patch(m, { active: !m.active })} className={cn("ml-3 text-xs", m.active ? "text-muted-foreground hover:text-red-300" : "text-emerald-300")}>
                        {m.active ? "desativar" : "reativar"}
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {team.length === 0 && !error && <p className="text-xs text-muted-foreground p-4">Carregando…</p>}
      </div>
    </div>
  );
}
