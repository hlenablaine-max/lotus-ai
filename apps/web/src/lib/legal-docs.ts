// Modelos de documentos com a clínica, já preenchidos com os dados do CRM da LOTUS:
//  - Contrato de prestação de serviços de marketing e atendimento
//  - Termo de tratamento de dados pessoais (LGPD): a clínica é a controladora, a LOTUS é a operadora
// São modelos para revisar com um advogado antes de assinar; a página deixa isso explícito.
import { prisma } from "@/lib/prisma";

const brl = (v: number | null | undefined) => (v ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "R$ ________");
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const today = () => new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric", timeZone: "America/Sao_Paulo" });

function shell(title: string, body: string): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
body{font-family:Georgia,'Times New Roman',serif;max-width:780px;margin:32px auto;padding:0 24px;color:#111;line-height:1.55;font-size:14.5px}
h1{font-size:20px;text-align:center;margin-bottom:4px}h2{font-size:15px;margin-top:22px}
.sub{text-align:center;color:#555;font-size:12.5px;margin-bottom:24px}
.aviso{border:1px solid #c9a227;background:#fff8dc;padding:10px 14px;font-family:system-ui,sans-serif;font-size:12.5px;border-radius:6px}
.ass{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:56px}.ass div{border-top:1px solid #111;padding-top:6px;text-align:center;font-size:13px}
.blank{display:inline-block;min-width:180px;border-bottom:1px solid #111}
@media print{.aviso,.noprint{display:none}body{margin:0}}
</style></head><body>
<p class="aviso noprint">Modelo gerado pela LOTUS com os dados do CRM. <b>Revise com um advogado antes de assinar.</b> Para salvar em PDF: Ctrl+P → "Salvar como PDF". Campos com linha (____) precisam ser preenchidos.</p>
${body}</body></html>`;
}

export async function legalDocHtml(clientId: string, doc: "contrato" | "dpa"): Promise<string> {
  const c = await prisma.client.findUnique({ where: { id: clientId }, include: { contacts: { take: 1 } } });
  if (!c) throw new Error("Cliente não encontrado");
  const clinic = esc(c.name.split("|")[0].trim());
  const contact = c.contacts[0];
  const start = c.contractStart ? c.contractStart.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "____/____/______";
  const parties = `<p><b>CONTRATANTE:</b> ${clinic}, inscrita no CNPJ sob nº <span class="blank"></span>, com sede em <span class="blank"></span>, neste ato representada por ${contact?.name ? esc(contact.name) : '<span class="blank"></span>'}.</p>
<p><b>CONTRATADA:</b> LOTUS (agência de marketing e atendimento para clínicas), inscrita no CNPJ/CPF sob nº <span class="blank"></span>, representada por Ícaro <span class="blank"></span>.</p>`;

  if (doc === "contrato") {
    return shell(
      `Contrato — ${clinic}`,
      `<h1>CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE MARKETING E ATENDIMENTO</h1><p class="sub">${clinic} × LOTUS</p>
${parties}
<h2>1. Objeto</h2>
<p>A CONTRATADA prestará à CONTRATANTE os serviços do pacote <b>${esc(c.package ?? "________________")}</b>, que podem incluir: criação e manutenção de site, atendimento automatizado por inteligência artificial no WhatsApp e no Instagram, organização dos contatos e do funil de pacientes (CRM), lembretes de consulta, pedidos de avaliação, campanhas de reativação de pacientes, relatórios de resultado e, quando contratado, gestão de anúncios.</p>
<h2>2. Valores e pagamento</h2>
<p>Implantação: <b>${brl(c.setupFee)}</b>, paga no início. Mensalidade: <b>${brl(c.monthlyFee)}</b>, com vencimento todo dia <span class="blank" style="min-width:40px"></span> de cada mês. O investimento em anúncios (quando houver) é pago pela CONTRATANTE diretamente às plataformas e não está incluído na mensalidade.</p>
<h2>3. Prazo</h2>
<p>Início em ${start}, por prazo de <span class="blank" style="min-width:40px"></span> meses, renovado automaticamente por igual período se nenhuma das partes avisar o contrário com 30 dias de antecedência.</p>
<h2>4. Obrigações da CONTRATANTE</h2>
<p>Fornecer os acessos necessários (WhatsApp, Instagram, agenda, contas de anúncio), informar preços, procedimentos e horários corretos, responder com agilidade os pacientes que a IA encaminhar para a equipe e manter a base de pacientes com consentimento para contato.</p>
<h2>5. Obrigações da CONTRATADA</h2>
<p>Executar os serviços com diligência, manter os sistemas funcionando, apresentar relatórios de resultado, não prometer resultado clínico em nome da CONTRATANTE e respeitar as normas do conselho profissional da CONTRATANTE na comunicação.</p>
<h2>6. Resultados</h2>
<p>A CONTRATADA se compromete com a execução e o acompanhamento dos serviços, não com um número garantido de pacientes ou faturamento, que dependem também do atendimento, dos preços e da operação da CONTRATANTE.</p>
<h2>7. Dados pessoais</h2>
<p>O tratamento de dados de pacientes segue o Termo de Tratamento de Dados Pessoais (LGPD) assinado junto com este contrato, que faz parte dele.</p>
<h2>8. Cancelamento</h2>
<p>Qualquer parte pode cancelar com aviso de 30 dias. Valores já pagos de implantação não são devolvidos depois que o trabalho começou. No cancelamento, a CONTRATADA entrega os dados da CONTRATANTE em formato aberto e os apaga dos seus sistemas em até 30 dias.</p>
<h2>9. Foro</h2>
<p>Fica eleito o foro da comarca de <span class="blank"></span> para resolver qualquer questão deste contrato.</p>
<p style="margin-top:28px">Local e data: <span class="blank"></span>, ${today()}.</p>
<div class="ass"><div>${clinic}<br>CONTRATANTE</div><div>LOTUS<br>CONTRATADA</div></div>`
    );
  }

  return shell(
    `Termo LGPD — ${clinic}`,
    `<h1>TERMO DE TRATAMENTO DE DADOS PESSOAIS (LGPD)</h1><p class="sub">Lei nº 13.709/2018 — ${clinic} (controladora) × LOTUS (operadora)</p>
${parties}
<h2>1. Papéis</h2>
<p>A CONTRATANTE é a <b>controladora</b> dos dados pessoais dos seus pacientes e contatos. A CONTRATADA é a <b>operadora</b>: trata esses dados somente para prestar os serviços contratados e conforme as instruções da CONTRATANTE.</p>
<h2>2. Dados tratados e finalidade</h2>
<p>Nome, telefone, e-mail, data de nascimento, histórico de consultas e procedimentos informados pela clínica, valores gastos e as mensagens trocadas no WhatsApp e no Instagram. Finalidades: atendimento e agendamento, lembretes de consulta, pedidos de avaliação, campanhas de retorno e relatórios de resultado para a própria clínica.</p>
<h2>3. Base legal e consentimento</h2>
<p>A CONTRATANTE declara ter base legal para o tratamento (execução de contrato com o paciente, legítimo interesse ou consentimento, conforme o caso) e para o envio de mensagens de relacionamento. Dados sensíveis de saúde só serão tratados no mínimo necessário para o agendamento.</p>
<h2>4. Inteligência artificial</h2>
<p>As conversas podem ser lidas por modelos de inteligência artificial contratados pela CONTRATADA, apenas para escrever a resposta daquela conversa. A IA lê somente a conversa do assunto em andamento. Áudios recebidos são transcritos no computador da CONTRATADA, sem envio a terceiros.</p>
<h2>5. Segurança</h2>
<p>A CONTRATADA mantém acesso por senha, chaves de integração criptografadas, banco de dados com acesso restrito e registro das ações. Incidentes de segurança que envolvam dados pessoais serão comunicados à CONTRATANTE em até 48 horas da descoberta.</p>
<h2>6. Direitos dos titulares</h2>
<p>Pedidos de pacientes (acesso, correção, exclusão, oposição a mensagens) feitos à CONTRATANTE serão atendidos pela CONTRATADA em até 5 dias úteis. Quem responder "parar" ou "sair" às mensagens automáticas deixa de recebê-las automaticamente.</p>
<h2>7. Suboperadores</h2>
<p>A CONTRATADA usa os seguintes serviços para operar: banco de dados em nuvem (Neon), hospedagem de sites (Vercel), WhatsApp e Instagram (Meta e ManyChat), Google Agenda (quando conectada) e provedores de inteligência artificial. A CONTRATANTE autoriza esse uso.</p>
<h2>8. Retenção e término</h2>
<p>Os dados ficam guardados enquanto durar o contrato. Ao final, a CONTRATADA devolve os dados à CONTRATANTE (se pedido) e os apaga em até 30 dias, salvo obrigação legal de guarda.</p>
<p style="margin-top:28px">Local e data: <span class="blank"></span>, ${today()}.</p>
<div class="ass"><div>${clinic}<br>CONTROLADORA</div><div>LOTUS<br>OPERADORA</div></div>`
  );
}
