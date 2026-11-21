"use client";

// Base de pacientes da clínica e o LTV: quanto cada paciente vale, quem volta, quem sumiu e quanto dinheiro está parado.
import { useCallback, useEffect, useRef, useState } from "react";
import { Crown, Loader2, Megaphone, Search, Upload, UserPlus, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, Kpi, Notice, brl, btnGhost, btnPrimary, btnSoft, field, fmtDate, formatPhone, parseSheet } from "@/components/whatsapp/ui";

interface PatientRow {
  id: string;
  name: string;
  phone: string | null;
  totalSpent: number;
  visits: number;
  lastVisitAt: string | null;
  lastProcedure: string | null;
  origin: string;
  optOut: boolean;
  referralCode: string | null;
}
interface Stats {
  total: number;
  buyers: number;
  repeatBuyers: number;
  repeatRate: number | null;
  revenue: number;
  ltv: number | null;
  ticket: number | null;
  avgVisits: number | null;
  active: number;
  inactive: number;
  inactiveReachable: number;
  reactivationPotential: number | null;
  base: { patients: number; revenue: number; ltv: number | null };
  lotus: { patients: number; revenue: number; ltv: number | null };
  top: Array<{ id: string; name: string; totalSpent: number; visits: number; lastVisitAt: string | null; origin: string }>;
  topReferrers: Array<{ id: string; name: string; count: number }>;
}

const COLUMNS: Record<string, string> = {
  nome: "name", paciente: "name", cliente: "name", name: "name", "nome completo": "name",
  telefone: "phone", celular: "phone", whatsapp: "phone", fone: "phone", phone: "phone", contato: "phone",
  email: "email", "e-mail": "email",
  nascimento: "birthDate", "data de nascimento": "birthDate", aniversario: "birthDate",
  "primeira consulta": "firstVisitAt", "primeira visita": "firstVisitAt", "cliente desde": "firstVisitAt", cadastro: "firstVisitAt",
  "ultima consulta": "lastVisitAt", "ultima visita": "lastVisitAt", "ultimo atendimento": "lastVisitAt", "ultima compra": "lastVisitAt",
  "total gasto": "totalSpent", total: "totalSpent", "valor total": "totalSpent", gasto: "totalSpent", faturamento: "totalSpent", ltv: "totalSpent",
  consultas: "visits", visitas: "visits", atendimentos: "visits", compras: "visits", "qtd consultas": "visits",
  procedimento: "lastProcedure", tratamento: "lastProcedure", "ultimo procedimento": "lastProcedure", servico: "lastProcedure",
  observacao: "notes", observacoes: "notes", obs: "notes",
};

const FILTERS = [
  { id: "todos", label: "Todos" },
  { id: "ativos", label: "Ativos (6 meses)" },
  { id: "inativos", label: "Sumidos" },
  { id: "recompra", label: "Voltaram e compraram de novo" },
  { id: "lotus", label: "Chegaram pela LOTUS" },
];

export function Patients({ clientId, clientName }: { clientId: string; clientName: string }) {
  const [rows, setRows] = useState<PatientRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState("todos");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ kind: "ok" | "error" | "warn"; text: string } | null>(null);
  const [importing, setImporting] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", lastVisitAt: "", totalSpent: "", visits: "" });
  const [camp, setCamp] = useState<{ open: boolean; months: number; limit: number; text: string; reachable: number | null; sending: boolean }>({
    open: false,
    months: 6,
    limit: 200,
    text: `Oi, {primeiro_nome}! Aqui é da ${clientName}. Sentimos sua falta! Este mês separamos horários especiais para quem já é nosso paciente. Quer que eu reserve um para você?`,
    reachable: null,
    sending: false,
  });
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const sp = new URLSearchParams({ filtro: filter, pagina: String(page) });
    if (q.trim()) sp.set("q", q.trim());
    const res = await fetch(`/api/clients/${clientId}/patients?${sp}`).catch(() => null);
    if (res?.ok) {
      const data = (await res.json()) as { patients: PatientRow[]; count: number; stats: Stats };
      setRows(data.patients);
      setCount(data.count);
      setStats(data.stats);
    }
    setLoading(false);
  }, [clientId, filter, page, q]);

  useEffect(() => {
    const t = setTimeout(() => void load(), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  // LGPD: a pessoa pediu para apagar os dados dela
  const erase = async (patientId: string, name: string) => {
    const typed = window.prompt(`Apagar TODOS os dados de ${name} nesta clínica (cadastro, compras, conversas, leads e mensagens agendadas)? Não dá para desfazer.\n\nDigite APAGAR para confirmar:`, "");
    if (typed !== "APAGAR") return;
    const r = await fetch(`/api/clients/${clientId}/patients/${patientId}/lgpd`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmar: "APAGAR" }) });
    const d = (await r.json().catch(() => ({}))) as { error?: string; apagado?: Record<string, number> };
    setMsg(r.ok ? { kind: "ok", text: `Dados de ${name} apagados (${d.apagado?.conversas ?? 0} conversa(s), ${d.apagado?.leads ?? 0} lead(s)). Ficou só o registro de que o pedido foi atendido, sem dados pessoais.` } : { kind: "error", text: d.error ?? "Não foi possível apagar." });
    void load();
  };

  const importFile = async (file: File) => {
    setImporting(true);
    setMsg(null);
    const parsed = parseSheet(await file.text(), COLUMNS).filter((r) => r.name);
    if (parsed.length === 0) {
      setImporting(false);
      return setMsg({ kind: "error", text: "Não achei pacientes. A planilha precisa de uma primeira linha com os nomes das colunas (pelo menos 'nome' e 'telefone'). Salve como CSV no Excel ou Google Planilhas." });
    }
    let created = 0;
    let skipped = 0;
    for (let i = 0; i < parsed.length; i += 2000) {
      const res = await fetch(`/api/clients/${clientId}/patients`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ patients: parsed.slice(i, i + 2000) }) });
      const data = (await res.json().catch(() => ({}))) as { created?: number; skipped?: number; error?: string };
      if (!res.ok) {
        setImporting(false);
        return setMsg({ kind: "error", text: data.error ?? "Não foi possível importar." });
      }
      created += data.created ?? 0;
      skipped += data.skipped ?? 0;
    }
    setImporting(false);
    setMsg({ kind: "ok", text: `${created} pacientes importados${skipped ? ` (${skipped} já estavam na base ou repetidos)` : ""}. A partir de agora, quando um deles chamar no WhatsApp, a LOTUS reconhece.` });
    void load();
  };

  const addOne = async () => {
    if (!form.name.trim()) return;
    const res = await fetch(`/api/clients/${clientId}/patients`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ patient: form }) });
    const data = (await res.json().catch(() => ({}))) as { created?: number };
    setMsg(data.created ? { kind: "ok", text: "Paciente adicionado." } : { kind: "warn", text: "Esse telefone já está na base." });
    setForm({ name: "", phone: "", lastVisitAt: "", totalSpent: "", visits: "" });
    setShowAdd(false);
    void load();
  };

  const previewCampaign = async (months = camp.months, limit = camp.limit) => {
    const res = await fetch(`/api/clients/${clientId}/patients/campaign`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ months, limit, preview: true }) });
    const data = (await res.json().catch(() => ({}))) as { reachable?: number };
    setCamp((c) => ({ ...c, reachable: data.reachable ?? 0 }));
  };

  const launchCampaign = async () => {
    const n = Math.min(camp.limit, camp.reachable ?? 0);
    if (n === 0) return;
    if (!window.confirm(`Mandar esta mensagem para ${n} pacientes pelo WhatsApp da ${clientName}?\n\nEla sai aos poucos (no horário e no limite por hora das Automações) e dá para cancelar a fila a qualquer momento.`)) return;
    setCamp((c) => ({ ...c, sending: true }));
    const res = await fetch(`/api/clients/${clientId}/patients/campaign`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ months: camp.months, limit: camp.limit, text: camp.text }) });
    const data = (await res.json().catch(() => ({}))) as { queued?: number; error?: string };
    setCamp((c) => ({ ...c, sending: false, open: !res.ok }));
    setMsg(res.ok ? { kind: "ok", text: `Campanha criada: ${data.queued} mensagens na fila. Quem responder entra como lead de "Reativação da base". Acompanhe em Atendimento > Automações.` } : { kind: "error", text: data.error ?? "Não foi possível criar a campanha." });
  };

  if (loading && !stats) {
    return (
      <div className="p-8 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Carregando pacientes…
      </div>
    );
  }

  const empty = stats?.total === 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => fileRef.current?.click()} disabled={importing} className={btnPrimary}>
          {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Importar base de pacientes
        </button>
        <button onClick={() => setShowAdd((v) => !v)} className={btnGhost}>
          <UserPlus className="w-4 h-4" /> Adicionar um
        </button>
        <button
          onClick={() => {
            setCamp((c) => ({ ...c, open: !c.open }));
            void previewCampaign();
          }}
          disabled={empty}
          className={btnSoft}
        >
          <Megaphone className="w-4 h-4" /> Campanha de reativação
        </button>
        <input ref={fileRef} type="file" accept=".csv,.txt,.tsv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); e.target.value = ""; }} />
        <span className="text-[11px] text-muted-foreground">CSV com colunas como: nome, telefone, nascimento, última consulta, total gasto, consultas, procedimento</span>
      </div>

      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}

      {showAdd && (
        <Card className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
            <input className={cn(field, "md:col-span-2")} placeholder="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input className={field} placeholder="Telefone com DDD" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <input className={field} placeholder="Última visita (dd/mm/aaaa)" value={form.lastVisitAt} onChange={(e) => setForm({ ...form, lastVisitAt: e.target.value })} />
            <input className={field} placeholder="Total gasto (R$)" value={form.totalSpent} onChange={(e) => setForm({ ...form, totalSpent: e.target.value })} />
            <button onClick={() => void addOne()} className={btnPrimary}>Salvar</button>
          </div>
        </Card>
      )}

      {camp.open && (
        <Card title="Campanha de reativação" subtitle="Convida quem sumiu a voltar. Sai pelo WhatsApp da clínica, aos poucos, começando por quem mais gastou.">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-4">
            <div className="space-y-2">
              <textarea className={cn(field, "text-sm resize-none")} rows={4} value={camp.text} onChange={(e) => setCamp({ ...camp, text: e.target.value })} />
              <p className="text-[10px] text-muted-foreground">{"{primeiro_nome}"} vira o nome de cada paciente. Mensagem curta, pessoal e com uma pergunta responde melhor.</p>
            </div>
            <div className="space-y-3">
              <label className="block text-xs text-muted-foreground">
                Sem visita há mais de
                <select className={cn(field, "mt-1")} value={camp.months} onChange={(e) => { const m = Number(e.target.value); setCamp({ ...camp, months: m }); void previewCampaign(m, camp.limit); }}>
                  {[3, 6, 9, 12, 18, 24].map((m) => (
                    <option key={m} value={m}>{m} meses</option>
                  ))}
                </select>
              </label>
              <label className="block text-xs text-muted-foreground">
                Mandar para no máximo
                <input type="number" className={cn(field, "mt-1")} value={camp.limit} min={1} max={2000} onChange={(e) => setCamp({ ...camp, limit: Math.max(1, Math.min(2000, Number(e.target.value) || 1)) })} />
              </label>
              <div className="rounded-lg bg-muted/30 border border-border p-3 text-xs">
                <div className="text-2xl font-bold text-foreground">{camp.reachable === null ? "…" : Math.min(camp.reachable, camp.limit)}</div>
                <div className="text-muted-foreground">pacientes vão receber{camp.reachable !== null && camp.reachable > camp.limit ? ` (de ${camp.reachable} sumidos com telefone)` : ""}</div>
              </div>
              <button onClick={() => void launchCampaign()} disabled={camp.sending || !camp.reachable} className={cn(btnPrimary, "w-full")}>
                {camp.sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Megaphone className="w-4 h-4" />} Criar campanha
              </button>
            </div>
          </div>
        </Card>
      )}

      {empty ? (
        <Card className="text-center py-12">
          <Users className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
          <h3 className="text-base font-semibold text-foreground">A base de pacientes de {clientName} ainda está vazia</h3>
          <p className="text-sm text-muted-foreground max-w-lg mx-auto mt-1">
            Importe a planilha de pacientes que a clínica já tem (do sistema, da agenda ou do Excel). Com ela a LOTUS calcula o LTV, reconhece quem volta a chamar e descobre quanto dinheiro está parado em quem sumiu. Quem fechar pela LOTUS entra aqui sozinho.
          </p>
        </Card>
      ) : (
        stats && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
              <Kpi label="Pacientes na base" value={stats.total.toLocaleString("pt-BR")} sub={`${stats.active} ativos · ${stats.inactive} sumidos`} />
              <Kpi label="LTV médio" value={brl(stats.ltv)} sub="quanto cada paciente gasta na vida" tone="good" />
              <Kpi label="Ticket médio" value={brl(stats.ticket)} sub={stats.avgVisits ? `${String(stats.avgVisits).replace(".", ",")} visitas por paciente` : ""} />
              <Kpi label="Voltaram e compraram de novo" value={stats.repeatRate !== null ? `${String(stats.repeatRate).replace(".", ",")}%` : "—"} sub={`${stats.repeatBuyers} pacientes`} />
              <Kpi label="Faturamento da base" value={brl(stats.revenue)} sub="soma do que todos já gastaram" />
              <Kpi label="Sumidos com telefone" value={stats.inactiveReachable.toLocaleString("pt-BR")} sub="dá para chamar no WhatsApp" tone={stats.inactiveReachable ? "warn" : undefined} />
              <Kpi label="Dinheiro parado" value={brl(stats.reactivationPotential)} sub="se 1 em cada 10 sumidos voltar" tone="warn" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Card title="Base antiga x pacientes da LOTUS">
                <div className="space-y-3 text-xs">
                  {[
                    { label: "Já eram da clínica", d: stats.base, cls: "bg-sky-400" },
                    { label: "Chegaram pela LOTUS", d: stats.lotus, cls: "bg-primary" },
                  ].map((r) => (
                    <div key={r.label}>
                      <div className="flex justify-between mb-1">
                        <span className="text-foreground">{r.label}</span>
                        <span className="text-muted-foreground">{r.d.patients} · {brl(r.d.revenue)}</span>
                      </div>
                      <div className="h-2.5 rounded-full bg-muted/40 overflow-hidden">
                        <div className={cn("h-full rounded-full", r.cls)} style={{ width: `${stats.total ? (r.d.patients / stats.total) * 100 : 0}%` }} />
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">LTV {brl(r.d.ltv)}</div>
                    </div>
                  ))}
                </div>
              </Card>
              <Card title="Quem mais gastou" subtitle="Os 10 pacientes mais valiosos">
                <div className="space-y-1.5">
                  {stats.top.map((p, i) => (
                    <div key={p.id} className="flex items-center gap-2 text-xs">
                      <span className={cn("w-5 text-center", i < 3 ? "text-amber-300" : "text-muted-foreground")}>{i < 3 ? <Crown className="w-3.5 h-3.5 inline" /> : i + 1}</span>
                      <span className="text-foreground truncate flex-1">{p.name}</span>
                      <span className="text-muted-foreground">{p.visits}x</span>
                      <span className="text-emerald-300 w-20 text-right">{brl(p.totalSpent)}</span>
                    </div>
                  ))}
                </div>
              </Card>
              <Card title="Quem mais indica" subtitle="Pacientes cujos links de indicação trouxeram gente">
                {stats.topReferrers.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Ninguém indicou ainda. Ligue a automação de Indicação em Atendimento &gt; Automações: cada paciente recebe um link pessoal.</p>
                ) : (
                  <div className="space-y-1.5">
                    {stats.topReferrers.map((r) => (
                      <div key={r.id} className="flex justify-between text-xs">
                        <span className="text-foreground">{r.name}</span>
                        <span className="text-teal-300">{r.count} indicação(ões)</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>

            <Card>
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <div className="relative flex-1 min-w-[220px]">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input className={cn(field, "pl-9")} placeholder="Buscar paciente" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
                </div>
                {FILTERS.map((f) => (
                  <button key={f.id} onClick={() => { setFilter(f.id); setPage(0); }} className={cn("px-2.5 py-1.5 rounded-lg text-xs border", filter === f.id ? "bg-primary/15 border-primary/40 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>
                    {f.label}
                  </button>
                ))}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-muted-foreground text-left">
                      <th className="pb-2 font-medium">Paciente</th>
                      <th className="pb-2 font-medium">Telefone</th>
                      <th className="pb-2 font-medium text-right">Gastou (LTV)</th>
                      <th className="pb-2 font-medium text-right">Visitas</th>
                      <th className="pb-2 font-medium">Última visita</th>
                      <th className="pb-2 font-medium">Procedimento</th>
                      <th className="pb-2 font-medium">Origem</th>
                      <th className="pb-2 font-medium text-right" title="Direitos do paciente (LGPD)">LGPD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((p) => {
                      const stale = !p.lastVisitAt || Date.now() - new Date(p.lastVisitAt).getTime() > 182 * 86_400_000;
                      return (
                        <tr key={p.id} className="border-t border-border/60">
                          <td className="py-2 text-foreground">
                            {p.name}
                            {p.optOut && <span className="ml-2 text-[10px] text-red-300">não quer mensagens</span>}
                          </td>
                          <td className="py-2 text-muted-foreground">{formatPhone(p.phone)}</td>
                          <td className="py-2 text-right text-emerald-300">{brl(p.totalSpent)}</td>
                          <td className="py-2 text-right">{p.visits}{p.visits >= 2 && <span className="ml-1 text-[10px] text-sky-300">voltou</span>}</td>
                          <td className={cn("py-2", stale ? "text-amber-300" : "text-muted-foreground")}>{p.lastVisitAt ? fmtDate(p.lastVisitAt) : "—"}</td>
                          <td className="py-2 text-muted-foreground truncate max-w-[160px]">{p.lastProcedure ?? "—"}</td>
                          <td className="py-2">{p.origin === "lotus" ? <span className="text-primary">LOTUS</span> : <span className="text-muted-foreground">base</span>}</td>
                          <td className="py-2 text-right whitespace-nowrap">
                            <a href={`/api/clients/${clientId}/patients/${p.id}/lgpd`} className="text-[10px] text-muted-foreground hover:text-foreground" title="Baixar tudo o que a LOTUS guarda sobre esta pessoa">exportar</a>
                            <button onClick={() => void erase(p.id, p.name)} className="ml-2 text-[10px] text-muted-foreground hover:text-red-300" title="Apagar todos os dados desta pessoa (pedido do paciente)">apagar</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {rows.length === 0 && <p className="text-xs text-muted-foreground py-4">Nenhum paciente com esse filtro.</p>}
              </div>
              {count > 50 && (
                <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
                  <span>{page * 50 + 1}–{Math.min(count, (page + 1) * 50)} de {count.toLocaleString("pt-BR")}</span>
                  <div className="flex gap-2">
                    <button disabled={page === 0} onClick={() => setPage((p) => p - 1)} className={cn(btnGhost, "px-2.5 py-1 text-xs")}>Anterior</button>
                    <button disabled={(page + 1) * 50 >= count} onClick={() => setPage((p) => p + 1)} className={cn(btnGhost, "px-2.5 py-1 text-xs")}>Próxima</button>
                  </div>
                </div>
              )}
            </Card>
          </>
        )
      )}
    </div>
  );
}
