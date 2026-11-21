"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { LiveChecks } from "@/components/governance/live-checks";
import {
  CheckCircle2, AlertTriangle, Clock, XCircle, Minus, Shield,
  ChevronDown, ChevronRight, Info,
} from "lucide-react";

// ============================================================
// TIPOS
// ============================================================
type AuditLevel = "A" | "B" | "C" | "D";
type AuditTag = "VERIFIED" | "IMPLEMENTED" | "PARTIAL" | "SIMULATED" | "MISSING" | "BLOCKED";

interface AuditItem {
  id: string;
  name: string;
  description: string;
  tag: AuditTag;
  level: AuditLevel;
  evidence?: string;
  impact: "critical" | "high" | "medium" | "low";
}

interface AuditDomain {
  id: string;
  name: string;
  description: string;
  items: AuditItem[];
}

// ============================================================
// DADOS DE AUDITORIA
// ============================================================
const AUDIT_DOMAINS: AuditDomain[] = [
  {
    id: "roteiro",
    name: "Roteiro: agência de ponta que faz a clínica faturar",
    description: "O que uma agência de primeiro nível entrega e o quanto a LOTUS já faz (revisado em 20/11/2026, à noite)",
    items: [
      { id: "rt-1", name: "CRM e funil de cada cliente", description: "Leads por origem e canal (WhatsApp e Instagram separados), contato, agendamento, comparecimento, fechamento, faturamento, LTV e retorno", tag: "VERIFIED", level: "A", evidence: "Aba 'CRM e resultados' em cada cliente; leads entram sozinhos pelas conversas, à mão ou por planilha. 37 testes automáticos passando (WhatsApp, CRM e pacientes)", impact: "critical" },
      { id: "rt-2", name: "Leads entrando sozinhos no CRM", description: "WhatsApp, Instagram, formulário do site e anúncios de cadastro da Meta caindo direto no CRM, com a origem certa", tag: "PARTIAL", level: "B", evidence: "WhatsApp (QR) e Instagram (ManyChat pelo recebedor na Vercel) viram lead sozinhos, com a origem lida pela saudação, código ou palavra-chave. Faltam o formulário do site e o cadastro da Meta (Lead Ads)", impact: "critical" },
      { id: "rt-3", name: "Atendimento por IA no WhatsApp e Instagram", description: "Responde em segundos, tira dúvida, agenda e passa para a recepção", tag: "VERIFIED", level: "A", evidence: "IA conversa sozinha (modo automático) ou deixa rascunho para a recepção aprovar; oferece horários livres, agenda e pausa quando um humano assume. Teste de ponta a ponta passando e conversa real com o Rick em 20/11/2026. Fica 24 h no ar só quando estiver na VPS (ver Infraestrutura)", impact: "critical" },
      { id: "rt-4", name: "Anúncios publicados e otimizados toda semana", description: "Subir campanhas, ler custo por lead e ajustar sozinho", tag: "MISSING", level: "D", evidence: "Campanhas saem prontas como plano; falta conectar a conta de anúncios da Meta/Google em Integrações", impact: "critical" },
      { id: "rt-5", name: "Lembrete de consulta e redução de faltas", description: "Confirmação no WhatsApp 1 dia antes e 2 horas antes", tag: "IMPLEMENTED", level: "B", evidence: "Lembrete no WhatsApp 1 dia e 2 horas antes da consulta marcada na conversa (Atendimento > Automações)", impact: "high" },
      { id: "rt-6", name: "Reativação da base de pacientes", description: "Campanhas para quem não volta há 6+ meses (manutenção, retorno, indicação)", tag: "IMPLEMENTED", level: "B", evidence: "Base antiga importada por planilha, LTV, retorno automático de quem sumiu e campanha de reativação com fila e escudo anti-ban", impact: "high" },
      { id: "rt-7", name: "Reputação no Google", description: "Pedido de avaliação automático depois da consulta e resposta às avaliações", tag: "PARTIAL", level: "B", evidence: "Pedido de avaliação no Google automático depois da consulta. Responder as avaliações depende de conectar o Perfil da Empresa no Google", impact: "high" },
      { id: "rt-8", name: "Relatório de resultados para o dono da clínica", description: "Leads, agendamentos, fechamentos, faturamento e próximos passos", tag: "IMPLEMENTED", level: "B", evidence: "Semanal automático no WhatsApp do dono + relatório do mês em PDF (CRM > Relatório do mês) com funil, origens, comparação com o mês anterior, saúde do atendimento e ajustes. Ainda não enviado a um dono real", impact: "high" },
      { id: "rt-9", name: "Otimização semanal do funil", description: "Toda semana a LOTUS lê o funil de cada clínica, aponta onde vaza e diz o que fazer", tag: "IMPLEMENTED", level: "B", evidence: "Toda segunda, a partir das 9h, chega um aviso por clínica ativa com os vazamentos e a correção (cartão 'Saúde do funil' no CRM). Testado com clínicas temporárias em 20/11/2026; ainda não rodou com clínica real porque nenhuma tem leads", impact: "high" },
      { id: "rt-10", name: "Prospecção da própria LOTUS", description: "Achar clínicas por cidade, analisar Google, site e Instagram, abordar e chegar no dono", tag: "IMPLEMENTED", level: "B", evidence: "Página Prospecção: busca no Google Maps, gargalos do site e do Instagram, mensagem pensada para a recepção, site grátis com a marca real, IA que conversa e segue com o contato do dono. Testado com o Rick; ainda não abordou clínica real", impact: "high" },
      { id: "rt-11", name: "Comparação entre clientes (benchmark)", description: "Taxas da clínica ao lado da média das clínicas do mesmo segmento", tag: "IMPLEMENTED", level: "B", evidence: "Cartão 'Saúde do funil' no CRM de cada cliente. A média só aparece com 2+ clínicas do segmento com dados (taxa só conta com 5+ pessoas); até lá compara com a meta da LOTUS, dita como meta", impact: "medium" },
      { id: "rt-12", name: "CRM da própria LOTUS (vendas e carteira)", description: "Quantas clínicas foram abordadas, responderam, marcaram call e fecharam; pacote, mensalidade e implantação de cada cliente", tag: "VERIFIED", level: "A", evidence: "Aba 'CRM e resultados' da LOTUS (interno). Fluxo completo testado em 20/11/2026: call marcada → fechou (pacote, R$/mês, implantação) → etapa da implantação → MRR", impact: "high" },
      { id: "rt-13", name: "SDR que chega no dono da clínica", description: "Quando a recepção passa o contato, a IA escreve para o dono: gargalos, dinheiro na mesa (estimativa), site grátis e convite para call", tag: "IMPLEMENTED", level: "B", evidence: "Texto gerado e conferido em 20/11/2026 (só oferece o site quando ele já está pronto). Ainda não mandou para um dono real", impact: "high" },
    ],
  },
  {
    id: "canais",
    name: "WhatsApp, Instagram e segurança das contas",
    description: "Como as conversas entram e saem sem risco de bloqueio nem vazamento",
    items: [
      { id: "ch-1", name: "WhatsApp da LOTUS e das clínicas (QR)", description: "Conexão pelo QR, ouvindo e enviando de dentro do app", tag: "VERIFIED", level: "A", evidence: "WhatsApp da LOTUS conectado; teste A (mensagem em 11 s) e teste B (prospecção com resposta da IA) com o Rick em 20/11/2026", impact: "critical" },
      { id: "ch-2", name: "Escudo anti-ban", description: "Fila, 'digitando…', intervalos, limites por hora e por dia, contatos novos limitados", tag: "IMPLEMENTED", level: "B", evidence: "6 testes passando. Reduz muito o risco, mas sem a API oficial da Meta sempre existe alguma chance de bloqueio", impact: "critical" },
      { id: "ch-3", name: "Instagram pelo ManyChat", description: "DMs entram no Atendimento e a resposta sai pelo ManyChat", tag: "VERIFIED", level: "A", evidence: "Recebedor público na Vercel com usuário de banco restrito (só grava eventos); DM virou conversa em 12 s no teste de 20/11/2026", impact: "high" },
      { id: "ch-4", name: "Privacidade do número da LOTUS", description: "O número pessoal do Ícaro não guarda nem manda para a IA conversas pessoais", tag: "VERIFIED", level: "A", evidence: "Só guarda conversas que a LOTUS começou ou de clínicas prospectadas; a IA lê só a conversa do assunto. Conversas pessoais antigas apagadas em 20/11/2026", impact: "critical" },
      { id: "ch-5", name: "Avisos no Windows", description: "Sininho e notificação do Windows quando alguém responde, agenda ou pede humano", tag: "IMPLEMENTED", level: "B", evidence: "Sininho no painel consulta a cada 20 s e mostra notificação do Windows", impact: "medium" },
    ],
  },
  {
    id: "infra",
    name: "Infraestrutura e conformidade",
    description: "O que precisa estar de pé para a agência atender clientes de verdade",
    items: [
      { id: "inf-1", name: "Rodar 24 h sem depender do PC", description: "WhatsApp, IA e automações num servidor que não desliga", tag: "PARTIAL", level: "C", evidence: "VPS contratada (20/11/2026). Falta instalar a chave de acesso e subir a LOTUS nela; hoje tudo para quando o PC desliga", impact: "critical" },
      { id: "inf-2", name: "LGPD e contrato com a clínica", description: "Termo de tratamento de dados, contrato e direitos do paciente", tag: "IMPLEMENTED", level: "B", evidence: "Contrato e termo LGPD preenchidos com os dados da clínica (aba Visão geral), com marcação de assinatura. Paciente: exportar tudo e apagar tudo a pedido (testado: apaga só a pessoa e deixa registro sem dado pessoal). \"Parar\" e \"sair\" cortam as mensagens automáticas. Os modelos precisam de revisão de um advogado", impact: "critical" },
      { id: "inf-3", name: "Agenda real da clínica", description: "IA marca olhando a agenda de verdade", tag: "PARTIAL", level: "B", evidence: "Pronto em Atendimento > Agenda da clínica: link secreto iCal (só leitura, testado com repetições e fuso) ou conexão Google com um clique da clínica (lê ocupados e marca a consulta). A conexão Google precisa da credencial OAuth da LOTUS em Integrações e ainda não foi testada com uma conta real", impact: "high" },
      { id: "inf-4", name: "Áudio no WhatsApp", description: "Entender áudios que o paciente manda", tag: "IMPLEMENTED", level: "B", evidence: "Áudios de até 3 min são transcritos no PC (faster-whisper, nada sai do computador) e a IA lê o texto. Transcrição testada em 20/11/2026 (1,2 s por áudio com o modelo carregado); ainda não recebeu um áudio real de paciente", impact: "high" },
      { id: "inf-5", name: "App desktop com cara de LOTUS", description: "Nome LOTUS, ícone roxo e atalhos na Área de Trabalho e no Menu Iniciar", tag: "IMPLEMENTED", level: "B", evidence: "Corrigido em 20/11/2026; o processo no Gerenciador de Tarefas ainda se chama electron.exe até a LOTUS virar app instalado", impact: "low" },
    ],
  },
  {
    id: "d360",
    name: "Diagnóstico 360 e entregas",
    description: "Do @ do Instagram ao Playbook, site publicado e pacote pronto",
    items: [
      { id: "d360-1", name: "Coleta real do negócio", description: "Instagram (posts fixados e antigos separados), site, anúncios, ficha do Google, CNPJ, pessoas ligadas", tag: "VERIFIED", level: "A", evidence: "Rodado de ponta a ponta em 19 e 20/11/2026 com Central do Sorriso, Odonto Marco e @marciolucas10. Ficha do Google, WhatsApp e CNPJ só contam quando são do próprio negócio", impact: "critical" },
      { id: "d360-2", name: "Análise de vídeos (Reels)", description: "Baixa, transcreve e avalia ganchos com o motivo", tag: "VERIFIED", level: "A", evidence: "Transcrição local (faster-whisper) com modelo escolhido pela memória livre; testado nos 3 perfis", impact: "high" },
      { id: "d360-3", name: "Teste de atendimento no WhatsApp", description: "Agente manda mensagem de paciente e mede a resposta", tag: "VERIFIED", level: "A", evidence: "Enviado pelo WhatsApp da LOTUS (QR que ouve, com escudo anti-ban), e a resposta da clínica é cronometrada pela conversa. Só roda em negócio de saúde e com número do próprio negócio (regra criada após o caso OULAB em 20/11/2026)", impact: "high" },
      { id: "d360-4", name: "Playbook de Faturamento", description: "Gargalos com problema, prova, custo, ação e estimativa de ganho", tag: "VERIFIED", level: "A", evidence: "Cartões legíveis em Diagnóstico; estimativas marcadas como estimativa. Adapta-se quando o perfil não é clínica", impact: "critical" },
      { id: "d360-5", name: "Site da proposta publicado na Vercel", description: "Logo, fotos e cores reais; revisão automática (nota mínima 8, até 3 tentativas)", tag: "VERIFIED", level: "A", evidence: "lotus-clinica-odontomarco.vercel.app e lotus-marciolucas10.vercel.app aprovados com 8,5. Nunca inventa telefone: sem WhatsApp próprio usa o direct do Instagram", impact: "critical" },
      { id: "d360-6", name: "Produção (copies, campanhas, criativos, calendário, CRM)", description: "Materiais prontos para usar, revisados antes de chegar ao dono", tag: "IMPLEMENTED", level: "B", evidence: "Gerados e exportados no pacote; ainda não sobem sozinhos para Meta Ads / Google Ads (falta conectar as contas de anúncio)", impact: "high" },
      { id: "d360-7", name: "Pacote de entrega", description: "Pasta com todos os documentos e o link do site", tag: "VERIFIED", level: "A", evidence: "Exportado em ~/LOTUS_Workspace/entregas/<perfil> ao fim da missão (23 arquivos no caso Odonto Marco)", impact: "medium" },
      { id: "d360-8", name: "Subir campanhas e medir resultado real", description: "Publicar anúncios e trazer CPL, leads e vendas de volta", tag: "MISSING", level: "D", evidence: "Depende de conectar Meta Ads, Google Ads e GA4 em Integrações; hoje as campanhas saem como plano", impact: "critical" },
    ],
  },
  {
    id: "hq",
    name: "HQ 3D Office",
    description: "Escritório virtual com agentes ao vivo",
    items: [
      { id: "hq-1", name: "Renderização 3D WebGL", description: "Three.js + React Three Fiber carregando escritório", tag: "VERIFIED", level: "A", evidence: "Renderiza em /headquarters com agentes animados", impact: "high" },
      { id: "hq-2", name: "Animações de agentes", description: "Walking, sitting, thinking, idle animations via useFrame", tag: "VERIFIED", level: "A", evidence: "Character3D usa lerp + leg/arm cycle confirmado", impact: "high" },
      { id: "hq-3", name: "Status dos avatares", description: "Mudança de estado dos agentes no escritório 3D", tag: "IMPLEMENTED", level: "B", evidence: "Status derivado das tarefas reais (em execução, na fila, aguardando aprovação) via /api/hq/agents a cada 5s. Conferido pela API em 19/11/2026; a cena 3D não foi inspecionada visualmente depois da mudança", impact: "critical" },
      { id: "hq-4", name: "Feed de atividade", description: "Eventos exibidos no painel do HQ", tag: "IMPLEMENTED", level: "B", evidence: "Feed lê o ActivityLog real (tarefas iniciadas/concluídas, aprovações, motores)", impact: "medium" },
      { id: "hq-5", name: "Chat com CEO (Luna)", description: "Interface de chat com Root Master integrada", tag: "IMPLEMENTED", level: "B", evidence: "CeoChat component em /headquarters", impact: "high" },
      { id: "hq-6", name: "DB polling de agentes reais", description: "Busca agentes do banco a cada 15s, merge por departamento", tag: "IMPLEMENTED", level: "B", evidence: "Todos os agentes do banco aparecem, cada um no seu departamento, incluindo a sala do BTO", impact: "medium" },
    ],
  },
  {
    id: "engines",
    name: "8 Motores Operacionais",
    description: "Pipeline da análise à receita atribuída — todos com API real",
    items: [
      { id: "eng-1", name: "Engine 1: Intelligence", description: "Coleta e análise de mercado, concorrentes, oportunidades", tag: "IMPLEMENTED", level: "B", evidence: "/api/engines/intelligence → IA real, retorna market/competitors/trends/opportunities JSON", impact: "high" },
      { id: "eng-2", name: "Engine 2: Investigation", description: "Auditoria digital com coleta real e SSE streaming", tag: "IMPLEMENTED", level: "B", evidence: "/api/investigation coleta site, Instagram, SimilarWeb e Meta Ads Library. WhatsApp é apenas detectado no site — automação não é testada", impact: "high" },
      { id: "eng-3", name: "Engine 3: Diagnóstico", description: "Score de oportunidade, achados críticos e projeção de ROI", tag: "IMPLEMENTED", level: "B", evidence: "/api/engines/diagnosis → IA real; projeções são estimativas da IA, não dados medidos", impact: "critical" },
      { id: "eng-4", name: "Engine 4: Strategy", description: "Plano de crescimento 90 dias com OKRs e canais", tag: "IMPLEMENTED", level: "B", evidence: "/api/engines/strategy → plano completo: público, posicionamento, canais, OKRs, quick wins", impact: "critical" },
      { id: "eng-5", name: "Engine 5: Solution Architecture", description: "Stack de soluções recomendada por cliente", tag: "IMPLEMENTED", level: "B", evidence: "/api/engines/solution-arch → componentes, tech stack, fases, automações, ROI esperado", impact: "high" },
      { id: "eng-6", name: "Engine 6: Build", description: "Geração real: landing page HTML, copy, automação WhatsApp", tag: "IMPLEMENTED", level: "B", evidence: "/api/engines/build: 4 tipos (landing_page|copy|whatsapp_automation|content_calendar)", impact: "critical" },
      { id: "eng-7", name: "Engine 7: Implementation", description: "Plano de implementação passo-a-passo, guias de setup", tag: "IMPLEMENTED", level: "B", evidence: "/api/engines/implementation → setup guides (Meta/GA/WhatsApp), cronograma semana a semana", impact: "critical" },
      { id: "eng-8", name: "Engine 8: Revenue Intelligence", description: "Projeções de receita, ROI, oportunidades, precificação", tag: "IMPLEMENTED", level: "B", evidence: "/api/engines/revenue → 3 cenários de projeção, benchmarks de mercado, KPIs, oportunidades", impact: "critical" },
      { id: "eng-9", name: "Fallback de demonstração", description: "Resposta de exemplo quando o provedor de IA está fora do ar", tag: "SIMULATED", level: "C", evidence: "Os 8 motores devolvem dados genéricos marcados _demo; a página /motors exibe o aviso \"Dados de demonstração\" e a execução fica registrada no ActivityLog", impact: "high" },
    ],
  },
  {
    id: "ai",
    name: "Inteligência Artificial",
    description: "Integração de modelos de IA na plataforma",
    items: [
      { id: "ai-1", name: "Drael v1 — API integrada", description: "Modelo principal para diagnóstico e chat", tag: "VERIFIED", level: "A", evidence: "drael-v1 via OpenAI-compatible endpoint, testado", impact: "critical" },
      { id: "ai-2", name: "Sales Copilot", description: "Sugestões em tempo real nas calls de venda", tag: "IMPLEMENTED", level: "B", evidence: "Ouve o som do PC (cliente na call do Meet/Zoom) e o microfone (você), transcreve aqui no PC, sugere a resposta, salva cada call com as sugestões e faz o resumo no final (dores, objeções, próximo passo, chance de fechar). Testado pelas rotas em 20/11/2026; falta usar numa call real", impact: "high" },
      { id: "ai-3", name: "Luna — Root Master operacional", description: "CEO de operações com ferramentas reais do banco", tag: "VERIFIED", level: "A", evidence: "Testado em 19/11/2026: chat com streaming e ferramentas visíveis; criou cliente, missão e tarefas encadeadas (dependsOn) que rodaram sozinhas; tela /root-master corrigida", impact: "critical" },
      { id: "ai-4", name: "Página /motors — execução real", description: "8 engines executando IA real via UI", tag: "IMPLEMENTED", level: "B", evidence: "Client selector (Prisma), formulários por engine, fetch real para /api/engines/*", impact: "critical" },
      { id: "ai-5", name: "Local Runtime (desktop app)", description: "Acesso a filesystem, terminal, browser", tag: "VERIFIED", level: "A", evidence: "O app desktop sobe o servidor local e dá ao chat acesso ao PC. Terminal, arquivos e automodificação testados em 19/11/2026; o navegador de pesquisa (Playwright) roda todos os diagnósticos desde 20/11/2026", impact: "critical" },
      { id: "ai-6", name: "Troca de provedor de IA", description: "Drael, ChatGPT (OpenAI) e Claude (Anthropic) no mesmo chat", tag: "PARTIAL", level: "C", evidence: "Troca pelo chat (/provider) ou em Configurações. Teste real em 20/11/2026: Drael e Claude (pela assinatura) respondendo; a chave do ChatGPT foi recusada pela OpenAI e precisa ser trocada. A verificação ao vivo agora testa cada IA de verdade", impact: "high" },
    ],
  },
  {
    id: "data",
    name: "Dados e Clientes",
    description: "CRM, histórico e pipeline de clientes",
    items: [
      { id: "data-1", name: "Banco de dados (Prisma + DB)", description: "Schema e ORM configurados", tag: "IMPLEMENTED", level: "B", evidence: "Prisma schema com Agent, Mission, Client, Task models", impact: "high" },
      { id: "data-2", name: "Equipe, login e permissões", description: "Cada pessoa com login próprio e papel", tag: "IMPLEMENTED", level: "B", evidence: "Página Equipe: dono adiciona pessoas como Administrador ou Só visualiza; senha só como hash; desativar corta o acesso na hora (testado). Administrador não mexe em equipe nem em chaves", impact: "high" },
      { id: "data-3", name: "CRM de clientes", description: "CRUD completo de empresas atendidas", tag: "IMPLEMENTED", level: "B", evidence: "/api/clients (Prisma) — /clients page com fetch real", impact: "high" },
      { id: "data-4", name: "Pipeline de missões", description: "Tracking de tarefas por cliente e agente", tag: "IMPLEMENTED", level: "B", evidence: "/api/missions (Prisma) com CRUD, status transitions, Root Master cria missões reais", impact: "medium" },
      { id: "data-5", name: "Histórico de diagnósticos", description: "Resultado de cada diagnóstico salvo por cliente", tag: "IMPLEMENTED", level: "B", evidence: "O Diagnóstico 360 fica salvo como missão + documentos do cliente. Os 8 motores (/motors) também salvam o resultado como documento do cliente e reabrem o último de cada motor", impact: "high" },
      { id: "data-6", name: "Memória empresarial", description: "Contexto persistente da empresa, departamento, agente e cliente", tag: "IMPLEMENTED", level: "B", evidence: "Página Memória: regras da LOTUS (recusas com motivo entram sozinhas), orientações por departamento e últimas entregas de cada agente; tudo entra no contexto antes de cada tarefa, junto com a memória do cliente", impact: "critical" },
      { id: "data-7", name: "Fluxo de aprovações", description: "Ações críticas param e aguardam decisão do proprietário", tag: "VERIFIED", level: "A", evidence: "Aprovação durável testada em 19/11/2026: o agente pede, a missão fica aguardando, o dono decide em /approvals ou no chat e o sistema executa o que foi aprovado (decisão dupla é bloqueada)", impact: "critical" },
    ],
  },
  {
    id: "ui",
    name: "Interface e Navegação",
    description: "UX da plataforma operacional",
    items: [
      { id: "ui-1", name: "Dashboard principal", description: "Overview de operações, métricas, agentes", tag: "IMPLEMENTED", level: "B", evidence: "/ redireciona para /ceo; indicadores reais do banco em /metrics", impact: "medium" },
      { id: "ui-2", name: "Sidebar de navegação", description: "Links para todos os módulos", tag: "VERIFIED", level: "A", evidence: "Todos os módulos incluídos, com Integrações (chaves, WhatsApp por QR Code, Vercel)", impact: "medium" },
      { id: "ui-3", name: "Página /motors", description: "8 Engines com execução real de IA", tag: "IMPLEMENTED", level: "B", evidence: "Reconstruída com client selector (Prisma), formulários, fetch real, output viewer, Run All", impact: "high" },
      { id: "ui-4", name: "Advisor estratégico", description: "Chat com IA focado em estratégia LOTUS", tag: "IMPLEMENTED", level: "B", evidence: "/advisor com identidade própria (LOTUS AI CEO), ferramentas de leitura do banco, catálogo de soluções e registro de assessment de preço", impact: "medium" },
      { id: "ui-5", name: "Workforce — agentes/departamentos", description: "Visualização da força de trabalho IA", tag: "IMPLEMENTED", level: "B", evidence: "/workforce lista os agentes cadastrados no banco, incluindo o BTO (9º departamento)", impact: "medium" },
      { id: "ui-6", name: "Design system dark mode", description: "Tema escuro consistente em toda a plataforma", tag: "VERIFIED", level: "A", evidence: "Variáveis CSS + tema escuro também nos controles nativos (listas de seleção não aparecem mais em branco, corrigido em 20/11/2026)", impact: "low" },
      { id: "ui-7", name: "Textos legíveis (sem markdown cru)", description: "Relatórios e respostas sem asteriscos e # soltos", tag: "VERIFIED", level: "A", evidence: "Relatórios renderizados como texto formatado em Missões, Diagnóstico e chat", impact: "medium" },
    ],
  },
];

// ============================================================
// CONFIGS
// ============================================================
const TAG_CONFIG: Record<AuditTag, { label: string; color: string; bg: string; icon: React.ElementType; score: number }> = {
  VERIFIED:    { label: "Verificado",   color: "text-emerald-400", bg: "bg-emerald-400/10 border-emerald-400/30", icon: CheckCircle2, score: 100 },
  IMPLEMENTED: { label: "Implementado", color: "text-blue-400",    bg: "bg-blue-400/10 border-blue-400/30",    icon: CheckCircle2, score: 80 },
  PARTIAL:     { label: "Parcial",      color: "text-amber-400",   bg: "bg-amber-400/10 border-amber-400/30",  icon: AlertTriangle, score: 50 },
  SIMULATED:   { label: "Simulado",     color: "text-violet-400",  bg: "bg-violet-400/10 border-violet-400/30", icon: Clock, score: 25 },
  MISSING:     { label: "Faltando",     color: "text-red-400",     bg: "bg-red-400/10 border-red-400/30",      icon: XCircle, score: 0 },
  BLOCKED:     { label: "Bloqueado",    color: "text-zinc-400",    bg: "bg-zinc-400/10 border-zinc-400/30",    icon: Minus, score: 0 },
};

const LEVEL_CONFIG: Record<AuditLevel, { label: string; color: string; desc: string }> = {
  A: { label: "A", color: "text-emerald-400 bg-emerald-400/15 border-emerald-400/30", desc: "Produção — testado e validado" },
  B: { label: "B", color: "text-blue-400 bg-blue-400/15 border-blue-400/30",    desc: "Implementado — funcional mas não auditado" },
  C: { label: "C", color: "text-amber-400 bg-amber-400/15 border-amber-400/30", desc: "Parcial — incompleto ou simulado" },
  D: { label: "D", color: "text-red-400 bg-red-400/15 border-red-400/30",       desc: "Inexistente — não implementado" },
};

const IMPACT_COLOR: Record<AuditItem["impact"], string> = {
  critical: "text-red-400",
  high: "text-orange-400",
  medium: "text-amber-400",
  low: "text-zinc-400",
};

function domainScore(domain: AuditDomain): number {
  const total = domain.items.reduce((sum, item) => sum + TAG_CONFIG[item.tag].score, 0);
  return Math.round(total / domain.items.length);
}

function overallScore(domains: AuditDomain[]): number {
  const scores = domains.map(domainScore);
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

export default function GovernancePage() {
  const [expandedDomain, setExpandedDomain] = useState<string | null>("roteiro");
  const [selectedTag, setSelectedTag] = useState<AuditTag | null>(null);

  const overall = overallScore(AUDIT_DOMAINS);
  const allItems = AUDIT_DOMAINS.flatMap(d => d.items);
  const tagCounts = (Object.keys(TAG_CONFIG) as AuditTag[]).reduce((acc, tag) => {
    acc[tag] = allItems.filter(i => i.tag === tag).length;
    return acc;
  }, {} as Record<AuditTag, number>);

  const scoreColor = overall >= 70 ? "#22c55e" : overall >= 50 ? "#f59e0b" : "#ef4444";

  return (
    <div className="p-6 h-full overflow-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Shield size={22} className="text-primary" />
              Governança & Auditoria
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Transparência total sobre o que é real, implementado, parcial ou simulado no sistema LOTUS.
            </p>
            <p className="text-muted-foreground/60 mt-1 text-[11px]">
              A verificação ao vivo é feita agora (as IAs são testadas de verdade a cada 10 minutos); a lista de funcionalidades abaixo foi revisada em 20/11/2026, à noite.
            </p>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Score geral</div>
            <div className="text-3xl font-bold" style={{ color: scoreColor }}>{overall}%</div>
            <div className="text-xs text-muted-foreground">maturidade operacional</div>
          </div>
        </div>
      </div>

      <LiveChecks />

      <h2 className="text-sm font-semibold text-foreground mb-3">Funcionalidades do sistema</h2>

      {/* Tag summary */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-6">
        {(Object.entries(TAG_CONFIG) as Array<[AuditTag, typeof TAG_CONFIG[AuditTag]]>).map(([tag, cfg]) => {
          const TagIcon = cfg.icon;
          return (
            <button
              key={tag}
              onClick={() => setSelectedTag(s => s === tag ? null : tag)}
              className={cn(
                "flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all text-center",
                selectedTag === tag ? cfg.bg + " scale-105" : "border-white/10 bg-white/3 hover:bg-white/6"
              )}
            >
              <TagIcon size={16} className={cfg.color} />
              <div className={cn("text-lg font-bold", cfg.color)}>{tagCounts[tag]}</div>
              <div className="text-[10px] text-muted-foreground">{cfg.label}</div>
            </button>
          );
        })}
      </div>

      {/* Governance levels legend */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {(Object.entries(LEVEL_CONFIG) as Array<[AuditLevel, typeof LEVEL_CONFIG[AuditLevel]]>).map(([level, cfg]) => (
          <div key={level} className={cn("flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs", cfg.color)}>
            <span className="font-bold">Nível {level}</span>
            <span className="text-muted-foreground">{cfg.desc}</span>
          </div>
        ))}
      </div>

      {/* Domain cards */}
      <div className="space-y-3">
        {AUDIT_DOMAINS.map(domain => {
          const score = domainScore(domain);
          const isExpanded = expandedDomain === domain.id;
          const scoreCol = score >= 70 ? "#22c55e" : score >= 40 ? "#f59e0b" : "#ef4444";
          const visibleItems = selectedTag
            ? domain.items.filter(i => i.tag === selectedTag)
            : domain.items;

          if (selectedTag && visibleItems.length === 0) return null;

          return (
            <div key={domain.id} className="rounded-xl border border-white/10 overflow-hidden bg-white/3">
              <button
                onClick={() => setExpandedDomain(isExpanded ? null : domain.id)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/4 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  {isExpanded ? <ChevronDown size={16} className="text-muted-foreground" /> : <ChevronRight size={16} className="text-muted-foreground" />}
                  <div>
                    <div className="text-sm font-semibold text-foreground">{domain.name}</div>
                    <div className="text-xs text-muted-foreground">{domain.description}</div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {/* Mini tag breakdown */}
                  <div className="hidden md:flex gap-1.5">
                    {domain.items.map(item => {
                      return (
                        <div
                          key={item.id}
                          className={cn("w-2 h-2 rounded-full", item.tag === "VERIFIED" ? "bg-emerald-400" : item.tag === "IMPLEMENTED" ? "bg-blue-400" : item.tag === "PARTIAL" ? "bg-amber-400" : item.tag === "SIMULATED" ? "bg-violet-400" : "bg-red-400")}
                          title={item.name}
                        />
                      );
                    })}
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold" style={{ color: scoreCol }}>{score}%</div>
                    <div className="text-[10px] text-muted-foreground">{domain.items.length} itens</div>
                  </div>
                </div>
              </button>

              {isExpanded && (
                <div className="border-t border-white/5 divide-y divide-white/5">
                  {visibleItems.map(item => {
                    const cfg = TAG_CONFIG[item.tag];
                    const lvlCfg = LEVEL_CONFIG[item.level];
                    const TagIcon = cfg.icon;
                    return (
                      <div key={item.id} className="flex items-start gap-4 px-5 py-3 hover:bg-white/3 transition-colors">
                        <TagIcon size={16} className={cn("flex-shrink-0 mt-0.5", cfg.color)} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-foreground">{item.name}</span>
                            <span className={cn("text-[10px] px-1.5 py-0.5 rounded border font-bold", lvlCfg.color)}>
                              {item.level}
                            </span>
                            <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full border", cfg.bg, cfg.color)}>
                              {cfg.label}
                            </span>
                            <span className={cn("text-[10px] font-medium", IMPACT_COLOR[item.impact])}>
                              {({ critical: "IMPACTO CRÍTICO", high: "IMPACTO ALTO", medium: "IMPACTO MÉDIO", low: "IMPACTO BAIXO" } as const)[item.impact]}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                          {item.evidence && (
                            <div className="flex items-start gap-1.5 mt-1.5">
                              <Info size={10} className="text-muted-foreground/50 flex-shrink-0 mt-0.5" />
                              <span className="text-[10px] text-muted-foreground/60 italic">{item.evidence}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer note */}
      <div className="mt-6 p-4 rounded-xl border border-amber-400/20 bg-amber-400/5">
        <div className="flex items-start gap-2">
          <AlertTriangle size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground">
            <span className="text-amber-400 font-semibold">Princípio de Governança LOTUS:</span>{" "}
            Nenhum resultado apresentado ao cliente deve ter origem em dado simulado ou não verificado sem identificação explícita.
            Itens com tag SIMULATED ou MISSING devem ser sinalizados antes de qualquer apresentação comercial.
          </p>
        </div>
      </div>
    </div>
  );
}
