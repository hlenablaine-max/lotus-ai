# LOTUS AI Enterprise — Status de Implementação

## Versão: 2.2.0
## Data: 2026-11-19 (auditoria completa + reestruturação do aplicativo desktop)

Este arquivo é o retrato honesto do sistema depois da auditoria: o que funciona (e como foi testado),
o que foi corrigido e o que ainda falta. O ponto de restauração anterior à auditoria é o commit
`2702be9` na branch `audit/desktop-cli-agent`.

---

## Como iniciar o sistema

O produto é o **aplicativo desktop**. Ele sobe o servidor do LOTUS neste computador e é o que dá
à IA acesso ao PC.

```powershell
pnpm app
```

(ou dois cliques em `Abrir LOTUS AI.cmd` na raiz do projeto)

1. O app abre, inicia o servidor local (`127.0.0.1:3000`) e carrega a interface.
2. Faça login com `OWNER_EMAIL` / `OWNER_PASSWORD` de `apps/web/.env.local`.
3. Abra **Root Master** ou **CEO Chat** e converse. Digite `/help` para ver os comandos.

Se algo quebrar depois de uma automodificação: menu **LOTUS → Desfazer última alteração de código
feita pela IA** (tecla Alt mostra o menu). O log do servidor fica em `~/LOTUS_Workspace/logs/server.log`.

---

## Arquitetura depois da auditoria

```
Aplicativo desktop (Electron)
 ├─ sobe o servidor Next.js a partir do código-fonte (hot reload)
 ├─ runtime local 127.0.0.1 + token: comandos, arquivos, navegador, backups
 └─ janela com a interface

Servidor (apps/web)                          Motor de IA (packages/ai-engine)
 ├─ chat do Root Master (modo CLI)            ├─ provedores: Drael · ChatGPT · Claude
 ├─ orquestração de tarefas (DAG, retry)      ├─ executor de agentes (ferramentas, memória)
 ├─ aprovações duráveis                       └─ configurações em ~/LOTUS_Workspace/settings.json
 └─ banco PostgreSQL (Neon) via Prisma
```

Por que mudou: antes o app carregava o site da Vercel. Os agentes rodavam na nuvem e não tinham
como alcançar o computador do dono — por isso "o site não controla o PC". Agora tudo roda local.

---

## Funcionalidades implementadas (com evidência de teste em 19/11/2026)

| Área | Estado | Evidência |
|---|---|---|
| Login e proteção das rotas | ✅ | Sem cookie → 401; cookie falso → 401; sessão real → 200 |
| Chat do Root Master em modo CLI | ✅ | Streaming, cada ferramenta aparece na conversa, botão de parar, `/help /status /provider /model /mode /clear` |
| Controle do PC pelo chat | ✅ | `Get-Date` executado no PowerShell após confirmação; listou pasta e leu arquivo do projeto |
| Confirmação antes de alterar o PC | ✅ | Pedido aparece no chat e em Aprovações; aprovar executa, negar bloqueia; modo autônomo opcional |
| Automodificação | ✅ | Pedido "troque o rosa por azul": o chat leu `globals.css`, editou 5 variáveis, validou os tipos e relatou; depois desfez com `undo_changes` |
| Backups e desfazer | ✅ | Toda escrita/edição gera backup em `~/LOTUS_Workspace/.backups`; restauração testada |
| Missões com tarefas encadeadas (DAG) | ✅ | Tarefa 2 (`dependsOn` tarefa 1) esperou e iniciou sozinha 4 s após a tarefa 1 terminar; missão concluiu sozinha |
| Entregáveis (Documents) | ✅ | Cada agente salvou seu documento; a tarefa seguinte usou o documento anterior como contexto |
| Memória por cliente | ✅ parcial | Cada tarefa concluída grava um resumo; tarefas seguintes do mesmo cliente recebem no prompt |
| Aprovações de agentes | ✅ | Agente pediu aprovação para enviar WhatsApp e seguiu o trabalho; ao aprovar, o sistema executou (registrou "envio manual" por falta de integração); segunda decisão → 409 |
| Portal do cliente | ✅ | Link assinado por cliente; sem token → 401; cookie de um cliente não abre outro nem as APIs internas |
| HQ 3D com dados reais | ✅ (API) | 22 agentes reais, status derivado das tarefas, feed do ActivityLog, sala do BTO. **A cena 3D não foi inspecionada visualmente após a mudança** |
| Advisor (LOTUS AI CEO) | ✅ | Pergunta "qual cliente tem mais risco de churn?" respondida com dados reais do banco e encaminhando a execução ao Root Master. Registro de assessment não exercitado |
| 18 telas do menu | ✅ | Todas respondem 200 sem erro de servidor; zero erros de TypeScript |
| Audit trail | ✅ | TASK_CREATED / STARTED / COMPLETED / FAILED, APPROVAL_*, LOCAL_TOOL, ENGINE_* |
| **Diagnóstico 360** (a partir do Instagram do lead) | ✅ | Testado em uma clínica real: o navegador do app leu perfil, 9 posts, 3 Reels (fala transcrita no próprio PC), link da bio, site, Biblioteca de Anúncios da Meta (achou 5 anúncios ativos do negócio) e Google Maps; 9 agentes analisaram e a equipe fechou o diagnóstico consolidado com notas, gargalos e plano |
| **Produção das soluções** | ✅ | No mesmo teste, 8 agentes produziram: IA de atendimento no WhatsApp (prompt, fluxo, respostas, follow-ups, objeções), campanhas da Meta com públicos e verba, copies de 10 anúncios, criativos e roteiros de vídeo, perfil novo + calendário de 30 dias, funil no CRM, página de agendamento em HTML e o pacote de entrega. 20 de 20 etapas, zero falhas, PC sem travar (memória livre mínima 0,5 GB) |
| **Site da clínica publicado e revisado** | ✅ | Central do Sorriso: o agente de web construiu com logo, fotos e cores reais (rosé #c96b65, vinho, creme); o sistema publicou em lotus-centraldosorrisofsa.vercel.app e tirou prints; a revisora deu nota e mandou refazer quando a foto do topo era clínica; tentativa 2 aprovada (8,5). Carrega em 0,7 s, zero imagens quebradas. Números do site ("1776 pacientes em 2026", "10 anos") vieram da fala transcrita de um Reel |
| **Diagnóstico completo de ponta a ponta (pedido pela própria LOTUS)** | ✅ | Odonto Marco, pedido pelo chat do Root Master: 24 de 24 etapas, zero falhas, ~1h30. Achou dono (@odonto_marco, 45 mil seguidores), CNPJ e sócios pela web, 9 anúncios ativos, Playbook com 7 gargalos e conta de ganho, 8 produções, site aprovado de primeira (8,5) em lotus-clinica-odontomarco.vercel.app e pacote de 23 arquivos gravado sozinho. Bugs achados e corrigidos no caminho: emoji cortado derrubava a gravação; posts fixados distorciam frequência (0,3 → 5,6/semana) e engajamento (17% → 0,39%); número de avaliações de site terceiro usado como se fosse do Google |
| Investigação funda | ✅ (Google depende de login) | Marca, ficha do Google, dono, CNPJ e vídeos funcionando. Texto e número de avaliações do Google só com a conta Google conectada |
| Painel legível | ✅ | Textos dos agentes formatados (sem asteriscos e #) em Missões, Diagnóstico, Advisor, chat e portal; regra de escrita simples para todos os agentes |
| Pacote de entrega em pasta | ✅ | Ao terminar, tudo é gravado em `~/LOTUS_Workspace/entregas/<perfil>/` (um `.md` por peça e a página em `.html`) |
| Retomada automática | ✅ | App fechado no meio de um diagnóstico; ao reabrir, o log mostrou `trabalho retomado: { requeued: 2, started: 6 }` e a equipe seguiu sem ninguém clicar em nada |
| App continua trabalhando com a janela fechada | ⚠️ não conferido na tela | Fechar a janela esconde o app (ícone perto do relógio); só "Sair" encerra. Código compilado, comportamento visual não inspecionado |
| Acesso do sócio | ⚠️ não testado | Login do sócio por `PARTNER_EMAIL`/`PARTNER_PASSWORD` e `Instalar LOTUS.cmd` prontos; nunca rodados em um segundo computador |

---

## O que foi encontrado e corrigido

**Segurança**
- O middleware aceitava **qualquer** cookie chamado `authjs.session-token` como login. Agora valida a assinatura.
- `/api/engines/*` era público (qualquer pessoa podia gastar os créditos de IA). Fechado.
- Existia um proxy que deixava a página chamar qualquer função do runtime local (incluindo executar comandos). Removido; a interface também não tem mais acesso direto a comandos — tudo passa pelo backend autenticado.
- O servidor de desenvolvimento escutava em toda a rede (`0.0.0.0`). Agora só em `127.0.0.1`.
- A chave da Drael estava em texto puro no `LOTUS_SPEC_MAE.md`. Removida do arquivo — **mas continua no histórico do git: gere uma chave nova.**

**Quebrado**
- Tela **Root Master**: o chat nunca funcionou (formato de requisição errado), criar missão falhava (sem cliente) e os botões de status usavam um método que a API não tinha. Refeita.
- Portal do cliente dava erro 500 (consultava um campo inexistente no banco).
- "Aprovações → Todas" mostrava só as aprovadas.
- Links para `/missions/<id>` davam 404.
- O Root Master, ao cadastrar um cliente, **reaproveitava outro cliente** se os nomes tivessem uma palavra em comum ("Clínica A" virava "Clínica B"). Corrigido para comparar o nome inteiro.
- Prioridade `CRITICAL` derrubava a criação de missões (não existe no banco).
- O histórico do chat carregava as 50 mensagens **mais antigas**; conversas longas paravam de aparecer.
- O motor "build" nunca ia para o git (a pasta `build/` estava ignorada).
- 48 erros de TypeScript escondidos por `ignoreBuildErrors`. Zerados, e o build voltou a falhar em erro de tipo.

**Simulado apresentado como real**
- HQ 3D: agentes fixos, status sorteado a cada 3 s e feed de frases prontas. Agora só dados do banco.
- Diagnóstico: fingia enviar WhatsApp ao prospect, esperava 30 s e afirmava "sem resposta automática". Removido.
- Prompts de landing page pediam "números fictícios" de prova social. Agora usam marcadores para dados reais.
- Sales Copilot devolvia uma sugestão enlatada quando a IA falhava. Agora mostra o erro.

**Pipeline autônomo**
- Dependências entre tarefas existiam no banco mas nada as disparava. Implementado (com retry automático de falhas).
- Aprovação travava o agente por 5 minutos e depois era esquecida. Agora é durável.
- Agentes podiam mandar WhatsApp e rodar comandos locais sem aprovação. Bloqueado.
- 3 agentes estavam presos em "EXECUTING" sem tarefa. Status passou a ser derivado das tarefas reais.

---

## Diagnóstico 360 + Produção (como funciona)

1. Você cola o Instagram do lead em **Diagnóstico** (ou manda no chat do Root Master).
2. **Coleta** (2 a 10 min): o navegador do app lê os dados públicos. Nada é estimado.
3. **Diagnóstico** (9 análises + consolidado + roteiro da reunião): perfil, copy, vídeos, tráfego pago, site, reputação local, funil, operação e regras de publicidade em saúde.
4. **Produção** (8 entregas): IA de atendimento no WhatsApp (prompt, fluxo, respostas e follow-ups), campanhas de tráfego prontas para subir, copies dos anúncios, criativos e roteiros de vídeo, perfil novo + calendário de 30 dias, página de agendamento em HTML, funil no CRM e o pacote de entrega com o plano de instalação.
5. O que só o cliente sabe aparece como `[PREENCHER COM O CLIENTE: ...]`. Depoimentos, preços e registros profissionais nunca são inventados.

**O que a produção NÃO faz sozinha (ainda):** não publica anúncios (precisa do acesso à conta de anúncios do cliente), não liga a IA no número de WhatsApp do cliente (precisa de uma plataforma de atendimento e do número dele) e não coloca a página no ar. Ela entrega tudo pronto; a instalação é manual.

**Memória do computador:** este PC tem 7,6 GB e trabalha no limite. A coleta agora fecha o navegador antes de transcrever os vídeos e escolhe o modelo de transcrição pela memória livre; no máximo 2 agentes pensam ao mesmo tempo. Mesmo assim, feche programas pesados antes de um diagnóstico.

---

## O que está pendente (lista honesta)

| Item | Situação |
|---|---|
| Teste de atendimento no WhatsApp do lead | Pronto, com QR code dentro do app (Integrações). Falta conectar o WhatsApp para rodar de verdade |
| Instagram com login | Não testado. Sem login o app lê só o que é público (sem contagem de visualizações, destaques limitados) |
| Instalar a IA de atendimento no WhatsApp do cliente | Não existe integração; a IA é entregue como prompt + fluxo para colar em uma plataforma |
| Entrega salva sem o agente pedir | Corrigido: o agente da página escreveu a entrega como resposta e não chamou `save_document`; a página sumiu do pacote. Agora o sistema salva a resposta final quando o agente esquece |
| Página cortada no meio | Corrigido: o limite de resposta da IA era 4 mil tokens e o HTML não terminava. Subiu para 16 mil, e o agente é instruído a fazer um HTML enxuto |
| Tela do Diagnóstico | API e página respondem certo; **a tela não foi inspecionada visualmente** depois de ganhar a fase de produção |
| ChatGPT (OpenAI) | Implementado. A variável `OPENAI_API_KEY` deste computador é **inválida** (a API respondeu 401); cole uma chave válida em Configurações |
| Claude (Anthropic) | Implementado, nunca testado (sem chave) |
| Controle do navegador (Playwright) pelo chat | Código pronto, não testado nesta auditoria |
| Controle de mouse/teclado e leitura de tela | Não existe. Hoje o controle do PC é terminal + arquivos + navegador |
| Integração WhatsApp | Não há tela para configurar; mensagens aprovadas ficam como "envio manual" |
| Publicação real de campanhas (Meta/Google/TikTok) | Não existe; agentes entregam o pacote pronto |
| Live Sales Copilot | Sugestões funcionam; calls e sugestões não são salvas (`sales_calls` vazia) |
| Client Value Assessment | Ferramenta e exibição no cliente prontas; nenhum assessment gerado ainda |
| Memória GLOBAL / AGENT / DEPARTMENT | Só a memória por cliente está ligada |
| Contratação dinâmica de agentes (CREATE_AGENT) | Não implementada |
| Multiusuário / RBAC | Só o login do proprietário |
| Produção na Vercel | Continua funcionando como painel, **sem** acesso ao PC e sem troca de provedor pela interface |
| Aplicativo empacotado (.exe) | O app roda a partir do código-fonte (necessário para a automodificação); instalador não foi gerado |
| Clientes duplicados no CRM | "Bella Pele Estética" e "Clínica Estética Bella Pele" são o mesmo cliente — unificar é decisão do dono |
| Testes automatizados | Pasta `tests/` vazia |
| Código morto | `components/hq/lotus-hq.tsx` (HQ 2D antigo), `lib/agent-store.ts`, `/api/diagnosis` |

---

## Métricas de cobertura (critérios de aceitação da spec, Parte XXIV)

| # | Critério | Estado |
|---|---|---|
| 1 | Root Master → especialista com outputs reais | ✅ testado |
| 2 | Memória funcional entre tarefas do mesmo cliente | ✅ testado (escopo cliente) |
| 3 | Aprovação funcional de ponta a ponta | ✅ testado |
| 4 | HQ sincronizado com a execução | ✅ pela API · visual não conferido |
| 5 | Missão de copy gera Document real | ✅ testado |
| 6 | Histórico do chat persiste | ✅ |
| 7 | Isolamento entre clientes | ✅ memória e documentos por cliente/missão; portal isolado |
| 8 | Audit trail de toda ação de agente | ✅ |
| 9 | BTO faz diagnóstico real | ⚠️ agentes e catálogo ligados; não exercitado |
| 10 | Root Master consulta o catálogo | ✅ ferramenta `get_solutions` · não exercitado em missão real |
| 11 | Assessment de pricing | ⚠️ pronto, não exercitado |
| 12 | Sales Copilot com transcrição + memória comercial | ❌ só sugestões ao vivo |
| 13 | Dr. Paulo/Henrique com CFM/CFO/CFF | não auditado (prompt do agente no banco) |

**8 de 13 verificados por teste, 3 prontos sem exercício real, 1 ausente, 1 não auditado.**
