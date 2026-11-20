"use client";

// CRM de todos os clientes: quantos leads chegaram, quantos fecharam e quanto faturaram no mês.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Loader2, TrendingUp } from "lucide-react";
import { ClientAvatar } from "@/components/ui/client-avatar";

interface Row {
  client: { id: string; name: string; status: string };
  results: {
    leads: number;
    closed: number;
    revenueClosed: number;
    cpl: number | null;
    roas: number | null;
    slowContact: number;
    rates: { leadParaVenda: number | null; agendamento: number | null };
    previous: { leads: number; closed: number; revenueClosed: number } | null;
  };
}

const brl = (v: number | null | undefined) => (v === null || v === undefined ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }));
const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export default function CrmPage() {
  const [month, setMonth] = useState(thisMonth());
  const [data, setData] = useState<{ totals: { leads: number; closed: number; revenue: number; slow: number }; rows: Row[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/crm/overview?month=${month}`);
      if (!res.ok) throw new Error(`erro ${res.status}`);
      setData(await res.json());
    } catch (err) {
      setError(`Não foi possível carregar (${err instanceof Error ? err.message : String(err)}).`);
    }
  }, [month]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="p-6 h-full overflow-auto space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-primary" /> CRM e resultados
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Quantos leads cada cliente recebeu, quantos fecharam e quanto isso faturou. É a prova de que a LOTUS faz a clínica crescer.</p>
        </div>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value || thisMonth())} className="px-3 py-2 text-sm rounded-lg bg-muted/40 border border-border text-foreground" />
      </div>

      {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}
      {!data && !error && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Leads no mês (todos os clientes)", value: String(data.totals.leads) },
              { label: "Fecharam", value: String(data.totals.closed) },
              { label: "Faturamento gerado", value: brl(data.totals.revenue) },
              { label: "Leads esperando resposta há +2 h", value: String(data.totals.slow), alert: data.totals.slow > 0 },
            ].map((k) => (
              <div key={k.label} className="rounded-xl border border-border bg-card p-4">
                <div className={k.alert ? "text-2xl font-bold text-amber-400" : "text-2xl font-bold text-foreground"}>{k.value}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{k.label}</div>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Cliente</th>
                  <th className="text-right px-4 py-3 font-medium">Leads</th>
                  <th className="text-right px-4 py-3 font-medium">Agendamento</th>
                  <th className="text-right px-4 py-3 font-medium">Fecharam</th>
                  <th className="text-right px-4 py-3 font-medium">Faturou</th>
                  <th className="text-right px-4 py-3 font-medium">Custo por lead</th>
                  <th className="text-right px-4 py-3 font-medium">Retorno</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.client.id} className="border-t border-border/60 hover:bg-muted/20">
                    <td className="px-4 py-3">
                      <Link href={`/clients/${r.client.id}?aba=crm`} className="flex items-center gap-3 text-foreground hover:text-primary">
                        <ClientAvatar clientId={r.client.id} name={r.client.name} size={32} className="rounded-lg" />
                        <span className="font-medium">{r.client.name}</span>
                        {r.results.slowContact > 0 && (
                          <span className="flex items-center gap-1 text-[11px] text-amber-400">
                            <AlertTriangle className="w-3 h-3" /> {r.results.slowContact} sem resposta
                          </span>
                        )}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {r.results.leads}
                      {r.results.previous && <span className="block text-[11px] text-muted-foreground">antes {r.results.previous.leads}</span>}
                    </td>
                    <td className="px-4 py-3 text-right">{r.results.rates.agendamento !== null ? `${r.results.rates.agendamento}%` : "—"}</td>
                    <td className="px-4 py-3 text-right">{r.results.closed}</td>
                    <td className="px-4 py-3 text-right">{brl(r.results.revenueClosed)}</td>
                    <td className="px-4 py-3 text-right">{brl(r.results.cpl)}</td>
                    <td className="px-4 py-3 text-right">{r.results.roas !== null ? `${r.results.roas}x` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.rows.length === 0 && <p className="p-6 text-sm text-muted-foreground">Nenhum cliente cadastrado.</p>}
          </div>
          <p className="text-xs text-muted-foreground">
            Clique num cliente para lançar leads, mudar etapas, importar planilha e informar os números do mês.
          </p>
        </>
      )}
    </div>
  );
}
