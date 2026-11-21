// Relatório mensal de resultados para o dono da clínica (página pronta para imprimir/salvar em PDF):
// leads por origem e canal, funil, faturamento, comparação com o mês anterior, saúde do funil e próximos passos.
// Só números do CRM; o que não foi informado aparece como "não informado".
import { prisma } from "@/lib/prisma";
import { clientResults, monthRange } from "@/lib/crm";
import { funnelHealth, LOTUS_GOALS, RATE_LABEL, type RateKey } from "@/lib/funnel-health";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const brl = (v: number | null | undefined) => (v === null || v === undefined ? "não informado" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const pct = (v: number | null) => (v === null ? "—" : `${v}%`);
function delta(now: number, before: number | undefined): string {
  if (before === undefined || before === 0) return "";
  const d = Math.round(((now - before) / before) * 100);
  return ` <span class="${d >= 0 ? "up" : "down"}">${d >= 0 ? "▲" : "▼"} ${Math.abs(d)}%</span>`;
}

export async function monthlyReportHtml(clientId: string, month?: string): Promise<string> {
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { name: true } });
  if (!client) throw new Error("Cliente não encontrado");
  const r = await clientResults(clientId, month);
  const { start } = monthRange(r.month);
  const h = await funnelHealth(clientId, 30);
  const name = esc(client.name.split("|")[0].trim());
  const monthLabel = start.toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
  const maxFunnel = Math.max(1, ...r.funnel.map((f) => f.count));

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório ${esc(monthLabel)} — ${name}</title>
<style>
*{box-sizing:border-box}body{font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:820px;margin:28px auto;padding:0 24px;color:#1b1530}
h1{font-size:22px;margin:0}h2{font-size:15px;margin:26px 0 10px;color:#4c2f9e;border-bottom:2px solid #ece6ff;padding-bottom:4px}
.top{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #7c3aed;padding-bottom:12px}
.brand{font-weight:800;letter-spacing:.18em;color:#7c3aed}.muted{color:#6b6585;font-size:12.5px}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.kpi{border:1px solid #e6e0f5;border-radius:10px;padding:10px}
.kpi b{display:block;font-size:20px;margin-top:2px}.up{color:#059669;font-size:12px}.down{color:#dc2626;font-size:12px}
table{width:100%;border-collapse:collapse;font-size:13px}td,th{padding:6px 4px;border-bottom:1px solid #f0ecfa;text-align:left}th{color:#6b6585;font-weight:600}
.bar{height:16px;background:#7c3aed;border-radius:4px}.leak{border-left:3px solid #f59e0b;padding:4px 10px;margin:6px 0;font-size:13px}
.noprint{background:#fff8dc;border:1px solid #e5c75c;padding:8px 12px;border-radius:6px;font-size:12px}
@media print{.noprint{display:none}body{margin:0}}
</style></head><body>
<p class="noprint">Para salvar em PDF: Ctrl+P → "Salvar como PDF".</p>
<div class="top"><div><div class="brand">LOTUS</div><h1>Relatório de resultados — ${name}</h1></div><div class="muted">${esc(monthLabel)}</div></div>

<h2>Resumo do mês</h2>
<div class="kpis">
<div class="kpi"><span class="muted">Contatos novos</span><b>${r.leads}${delta(r.leads, r.previous?.leads)}</b></div>
<div class="kpi"><span class="muted">Viraram pacientes</span><b>${r.closed}${delta(r.closed, r.previous?.closed)}</b></div>
<div class="kpi"><span class="muted">Faturamento desses pacientes</span><b>${brl(r.revenueClosed)}${delta(r.revenueClosed, r.previous?.revenueClosed)}</b></div>
<div class="kpi"><span class="muted">Ticket médio</span><b>${brl(r.ticket)}</b></div>
</div>
<p class="muted">${r.previous ? `Mês anterior: ${r.previous.leads} contatos, ${r.previous.closed} pacientes, ${brl(r.previous.revenueClosed)}.` : "Primeiro mês com dados na LOTUS."} Investimento em anúncios: ${brl(r.adSpend)}${r.cpl !== null ? ` · custo por contato ${brl(r.cpl)}` : ""}${r.roas !== null ? ` · retorno ${r.roas}x` : ""}.</p>

<h2>Funil: do contato ao paciente</h2>
<table>${r.funnel.map((f) => `<tr><td style="width:160px">${esc(f.label)}</td><td><div class="bar" style="width:${Math.max(2, Math.round((f.count / maxFunnel) * 100))}%"></div></td><td style="width:50px;text-align:right"><b>${f.count}</b></td></tr>`).join("")}</table>

<h2>De onde vieram</h2>
<table><tr><th>Origem</th><th>Contatos</th><th>Pacientes</th><th>Faturamento</th></tr>
${r.bySource.length ? r.bySource.map((s) => `<tr><td>${esc(s.label)}</td><td>${s.leads}</td><td>${s.closed}</td><td>${brl(s.revenue)}</td></tr>`).join("") : `<tr><td colspan="4" class="muted">Nenhum contato registrado no mês.</td></tr>`}
</table>
<p class="muted">Por canal: ${r.byChannel.map((c) => `${c.label} ${c.leads} contatos / ${c.closed} pacientes`).join(" · ")}.</p>

<h2>Saúde do atendimento (últimos 30 dias)</h2>
<table><tr><th>Etapa</th><th>Clínica</th>${h.benchmark ? `<th>Média de ${h.benchmark.clinics} clínicas</th>` : ""}<th>Meta LOTUS</th></tr>
${(["contato", "agendamento", "comparecimento", "fechamento", "leadParaVenda"] as RateKey[]).map((k) => `<tr><td>${RATE_LABEL[k]}</td><td><b>${pct(h.mine[k])}</b></td>${h.benchmark ? `<td>${pct(h.benchmark.rates[k])}</td>` : ""}<td>${LOTUS_GOALS[k]}%</td></tr>`).join("")}
</table>

<h2>O que vamos ajustar</h2>
${h.leaks.length ? h.leaks.map((l) => `<div class="leak"><b>${esc(l.title)}.</b> ${esc(l.fix)}</div>`).join("") : `<p>Funil saudável: seguimos com o plano atual e testando novas campanhas.</p>`}
${r.slowContact ? `<p class="leak">${r.slowContact} contato(s) esperando resposta há mais de 2 horas no fim do mês.</p>` : ""}

<p class="muted" style="margin-top:28px">Metas da LOTUS são referências internas (o que uma clínica bem atendida costuma alcançar), não dados medidos. Números tirados do CRM da LOTUS em ${new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}.</p>
</body></html>`;
}
