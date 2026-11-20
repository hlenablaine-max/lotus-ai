"use client";

// CRM do cliente: leads que chegaram, em que etapa estão, quantos fecharam e quanto isso faturou.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Loader2, Plus, Upload } from "lucide-react";
import { cn } from "@/lib/utils";

const STAGES = [
  { id: "NOVO", label: "Novo" },
  { id: "EM_CONTATO", label: "Em contato" },
  { id: "AGENDADO", label: "Agendado" },
  { id: "COMPARECEU", label: "Compareceu" },
  { id: "FECHADO", label: "Fechou" },
  { id: "PERDIDO", label: "Perdido" },
] as const;
const SOURCES: Array<[string, string]> = [
  ["META_ADS", "Anúncio (Facebook/Instagram)"],
  ["GOOGLE_ADS", "Anúncio (Google)"],
  ["SITE", "Site"],
  ["INSTAGRAM", "Instagram (orgânico)"],
  ["WHATSAPP", "WhatsApp direto"],
  ["INDICACAO", "Indicação"],
  ["REATIVACAO", "Reativação da base"],
  ["GOOGLE_MAPS", "Google Maps"],
  ["PACIENTE_BASE", "Paciente antigo que voltou"],
  ["OUTRO", "Outro"],
];
const SOURCE_LABEL = Object.fromEntries(SOURCES);

interface Lead {
  id: string;
  name: string;
  phone: string | null;
  source: string;
  interest: string | null;
  stage: string;
  value: number | null;
  createdAt: string;
  viaLotus: boolean;
}
interface Results {
  month: string;
  leads: number;
  leadsViaLotus: number;
  bySource: Array<{ source: string; label: string; leads: number; closed: number; revenue: number }>;
  funnel: Array<{ stage: string; label: string; count: number }>;
  rates: { contato: number | null; agendamento: number | null; comparecimento: number | null; fechamento: number | null; leadParaVenda: number | null };
  closed: number;
  revenueClosed: number;
  ticket: number | null;
  adSpend: number | null;
  cpl: number | null;
  cac: number | null;
  roas: number | null;
  patientBase: number | null;
  revenueTotal: number | null;
  waitingContact: number;
  slowContact: number;
  previous: { leads: number; closed: number; revenueClosed: number } | null;
}

const brl = (v: number | null | undefined) => (v === null || v === undefined ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }));
const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const field = "w-full px-3 py-2 text-sm rounded-lg bg-muted/40 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50";

// Planilha simples (CSV ou colada do Excel/Google): cabeçalho com nome, telefone, origem, etapa, valor, interesse, data
function parseSheet(text: string): Array<Record<string, string>> {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const sep = lines[0].includes("\t") ? "\t" : lines[0].split(";").length > lines[0].split(",").length ? ";" : ",";
  const norm = (h: string) => h.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const map: Record<string, string> = { nome: "name", name: "name", telefone: "phone", celular: "phone", whatsapp: "phone", phone: "phone", email: "email", "e-mail": "email", origem: "source", fonte: "source", canal: "source", etapa: "stage", status: "stage", situacao: "stage", valor: "value", "valor fechado": "value", interesse: "interest", tratamento: "interest", servico: "interest", data: "createdAt", campanha: "campaign", observacao: "notes", obs: "notes" };
  const headers = lines[0].split(sep).map((h) => map[norm(h)] ?? "");
  return lines.slice(1).map((line) => {
    const cells = line.split(sep);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      if (h) row[h] = (cells[i] ?? "").trim().replace(/^"|"$/g, "");
    });
    if (row.createdAt && /^\d{2}\/\d{2}\/\d{4}/.test(row.createdAt)) {
      const [d, m, y] = row.createdAt.slice(0, 10).split("/");
      row.createdAt = `${y}-${m}-${d}`;
    }
    return row;
  });
}

export function ClientCrm({ clientId, clientName }: { clientId: string; clientName: string }) {
  const [month, setMonth] = useState(thisMonth());
  const [results, setResults] = useState<Results | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", source: "META_ADS", interest: "", stage: "NOVO", value: "" });
  const [numbers, setNumbers] = useState({ patientBase: "", adSpend: "", revenue: "" });
  const [info, setInfo] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [r, l] = await Promise.all([fetch(`/api/clients/${clientId}/results?month=${month}`), fetch(`/api/clients/${clientId}/leads?month=${month}`)]);
      if (!r.ok || !l.ok) throw new Error(`erro ${r.status}/${l.status}`);
      const res = (await r.json()) as Results;
      setResults(res);
      setLeads(((await l.json()) as { leads: Lead[] }).leads);
      setNumbers({ patientBase: res.patientBase?.toString() ?? "", adSpend: res.adSpend?.toString() ?? "", revenue: res.revenueTotal?.toString() ?? "" });
    } catch (err) {
      setError(`Não foi possível carregar o CRM (${err instanceof Error ? err.message : String(err)}).`);
    } finally {
      setLoading(false);
    }
  }, [clientId, month]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const addLead = async () => {
    if (!form.name.trim() && !form.phone.trim()) return;
    const res = await fetch(`/api/clients/${clientId}/leads`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    if (!res.ok) return setError("Não foi possível salvar o lead.");
    setForm({ name: "", phone: "", source: form.source, interest: "", stage: "NOVO", value: "" });
    setShowAdd(false);
    void load();
  };

  const moveLead = async (lead: Lead, stage: string) => {
    let value: string | null = null;
    if (stage === "FECHADO") {
      value = window.prompt(`Quanto ${lead.name} fechou? (em R$, pode deixar em branco)`, lead.value?.toString() ?? "");
      if (value === null) return;
    }
    setLeads((all) => all.map((l) => (l.id === lead.id ? { ...l, stage } : l)));
    await fetch(`/api/leads/${lead.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stage, ...(value !== null ? { value } : {}) }) });
    void load();
  };

  const saveNumbers = async () => {
    const res = await fetch(`/api/clients/${clientId}/results`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ month, ...numbers }) });
    if (res.ok) {
      setResults(await res.json());
      setInfo("Números do mês salvos.");
    }
  };

  const importSheet = async (file: File) => {
    const rows = parseSheet(await file.text());
    if (!rows.length) return setError("A planilha precisa ter uma linha de cabeçalho (nome, telefone, origem, etapa, valor) e pelo menos um lead.");
    const res = await fetch(`/api/clients/${clientId}/leads`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ leads: rows }) });
    const data = (await res.json().catch(() => ({}))) as { created?: number; error?: string };
    if (!res.ok) return setError(data.error ?? "Não foi possível importar.");
    setInfo(`${data.created} leads importados.`);
    void load();
  };

  const byStage = useMemo(() => Object.fromEntries(STAGES.map((s) => [s.id, leads.filter((l) => l.stage === s.id)])), [leads]);
  const maxFunnel = Math.max(1, ...(results?.funnel.map((f) => f.count) ?? [1]));

  if (loading && !results) {
    return (
      <div className="p-8 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Carregando o CRM…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value || thisMonth())} className={cn(field, "w-auto")} />
        <button onClick={() => setShowAdd((v) => !v)} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/15 border border-primary/30 text-primary text-sm font-medium hover:bg-primary/25">
          <Plus className="w-4 h-4" /> Novo lead
        </button>
        <button onClick={() => fileRef.current?.click()} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/40 border border-border text-sm text-foreground hover:bg-muted">
          <Upload className="w-4 h-4" /> Importar planilha
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.txt,.tsv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importSheet(f);
            e.target.value = "";
          }}
        />
        <span className="text-xs text-muted-foreground">Planilha em CSV com colunas: nome, telefone, origem, etapa, valor, interesse, data.</span>
      </div>

      {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}
      {info && <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-300">{info}</div>}

      {showAdd && (
        <div className="rounded-xl border border-border bg-card p-4 grid grid-cols-1 md:grid-cols-6 gap-3">
          <input className={cn(field, "md:col-span-2")} placeholder="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className={field} placeholder="Telefone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <select className={field} value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
            {SOURCES.map(([id, label]) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </select>
          <input className={field} placeholder="Interesse (ex.: implante)" value={form.interest} onChange={(e) => setForm({ ...form, interest: e.target.value })} />
          <button onClick={() => void addLead()} className="rounded-lg bg-primary text-primary-foreground text-sm font-medium px-3 py-2">Salvar lead</button>
        </div>
      )}

      {results && (
        <>
          {results.slowContact > 0 && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              {results.slowContact} lead(s) esperando há mais de 2 horas sem ninguém responder. Cada hora de espera derruba a chance de agendar.
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
            {[
              { label: "Leads no mês", value: String(results.leads), sub: results.previous ? `mês anterior: ${results.previous.leads}` : `${results.leadsViaLotus} pela LOTUS` },
              { label: "Agendaram", value: String(results.funnel.find((f) => f.stage === "AGENDADO")?.count ?? 0), sub: results.rates.agendamento !== null ? `${results.rates.agendamento}% dos contatados` : "" },
              { label: "Fecharam", value: String(results.closed), sub: results.rates.leadParaVenda !== null ? `${results.rates.leadParaVenda}% dos leads` : "" },
              { label: "Faturamento dos leads", value: brl(results.revenueClosed), sub: results.ticket ? `ticket médio ${brl(results.ticket)}` : "" },
              { label: "Custo por lead", value: brl(results.cpl), sub: results.adSpend !== null ? `investido ${brl(results.adSpend)}` : "informe o investimento" },
              { label: "Custo por paciente novo", value: brl(results.cac), sub: "" },
              { label: "Retorno dos anúncios", value: results.roas !== null ? `${results.roas}x` : "—", sub: "faturado ÷ investido" },
            ].map((k) => (
              <div key={k.label} className="rounded-xl border border-border bg-card p-4">
                <div className="text-xl font-bold text-foreground">{k.value}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{k.label}</div>
                {k.sub && <div className="text-[11px] text-muted-foreground/70 mt-1">{k.sub}</div>}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4">Funil do mês</h3>
              <div className="space-y-2.5">
                {results.funnel.map((f) => (
                  <div key={f.stage}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-foreground">{f.label}</span>
                      <span className="text-muted-foreground">{f.count}</span>
                    </div>
                    <div className="h-2.5 rounded-full bg-muted/40 overflow-hidden">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${(f.count / maxFunnel) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground mt-4">
                Contato {results.rates.contato ?? "—"}% · agendamento {results.rates.agendamento ?? "—"}% · comparecimento {results.rates.comparecimento ?? "—"}% · fechamento {results.rates.fechamento ?? "—"}%
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4">De onde vieram</h3>
              {results.bySource.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum lead neste mês.</p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-muted-foreground text-left">
                      <th className="pb-2 font-medium">Origem</th>
                      <th className="pb-2 font-medium text-right">Leads</th>
                      <th className="pb-2 font-medium text-right">Fecharam</th>
                      <th className="pb-2 font-medium text-right">Faturou</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.bySource.map((s) => (
                      <tr key={s.source} className="border-t border-border/60">
                        <td className="py-2 text-foreground">{s.label}</td>
                        <td className="py-2 text-right">{s.leads}</td>
                        <td className="py-2 text-right">{s.closed}</td>
                        <td className="py-2 text-right">{brl(s.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="text-sm font-semibold text-foreground mb-1">Números do mês que só a clínica sabe</h3>
            <p className="text-xs text-muted-foreground mb-3">Com eles, a LOTUS calcula custo por lead, custo por paciente novo e retorno dos anúncios.</p>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <input className={field} placeholder="Pacientes na base" value={numbers.patientBase} onChange={(e) => setNumbers({ ...numbers, patientBase: e.target.value })} />
              <input className={field} placeholder="Investido em anúncios (R$)" value={numbers.adSpend} onChange={(e) => setNumbers({ ...numbers, adSpend: e.target.value })} />
              <input className={field} placeholder="Faturamento total do mês (R$)" value={numbers.revenue} onChange={(e) => setNumbers({ ...numbers, revenue: e.target.value })} />
              <button onClick={() => void saveNumbers()} className="rounded-lg bg-primary/15 border border-primary/30 text-primary text-sm font-medium px-3 py-2 hover:bg-primary/25">Salvar números</button>
            </div>
          </div>
        </>
      )}

      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Leads de {clientName} por etapa</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-3">
          {STAGES.map((s) => (
            <div key={s.id} className="rounded-xl border border-border bg-muted/10 p-3 min-h-[120px]">
              <div className="flex justify-between text-xs font-semibold text-foreground mb-2">
                <span>{s.label}</span>
                <span className="text-muted-foreground">{byStage[s.id]?.length ?? 0}</span>
              </div>
              <div className="space-y-2">
                {(byStage[s.id] ?? []).slice(0, 40).map((lead) => (
                  <div key={lead.id} className="rounded-lg border border-border bg-card p-2.5">
                    <div className="text-xs font-medium text-foreground truncate">{lead.name}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{SOURCE_LABEL[lead.source] ?? lead.source}{lead.interest ? `, ${lead.interest}` : ""}</div>
                    {lead.value ? <div className="text-[11px] text-emerald-400">{brl(lead.value)}</div> : null}
                    <select
                      value={lead.stage}
                      onChange={(e) => void moveLead(lead, e.target.value)}
                      className="mt-1.5 w-full text-[11px] rounded-md bg-muted/40 border border-border px-1.5 py-1 text-foreground"
                    >
                      {STAGES.map((o) => (
                        <option key={o.id} value={o.id}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
