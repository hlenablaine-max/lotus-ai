# Como instalar o LOTUS no computador do sócio

Os dois computadores usam **o mesmo banco de dados**. Por isso vocês veem os mesmos clientes, missões, diagnósticos e aprovações. Cada um entra com o próprio e-mail e senha.

Tempo total: uns 30 minutos (a maior parte é download).

---

## Parte 1 — No SEU computador (5 minutos)

1. **Dar acesso ao código.** No GitHub, abra `github.com/pedido-atrasado/lotus-ai` → **Settings** → **Collaborators** → **Add people** → coloque o usuário do GitHub do sócio. Ele recebe um convite por e-mail e precisa aceitar.
   - Se o repositório for público, pule este passo.

2. **Mandar o arquivo de configuração.** O arquivo é `apps\web\.env.local` (dentro da pasta `lotus-ai`). Ele tem o endereço do banco e as chaves de IA, então:
   - Mande **por um canal privado** (WhatsApp direto ou pendrive). Nunca em grupo, e-mail aberto ou GitHub.
   - É ele que faz o PC do sócio enxergar os mesmos dados que o seu.

---

## Parte 2 — No computador do SÓCIO

### 1. Instalar os 3 programas básicos (uma vez só)

| Programa | Onde baixar | Atenção |
|---|---|---|
| **Node.js** (versão 22 ou mais nova) | nodejs.org → botão "LTS" | Next, Next, Concluir |
| **Git** | git-scm.com → Download for Windows | Pode aceitar tudo padrão |
| **Python** (3.11 ou mais novo) | python.org → Downloads | Na primeira tela, **marque "Add python.exe to PATH"** |

Depois de instalar os três, **reinicie o computador**.

### 2. Baixar o LOTUS

Abra o **PowerShell** (tecla Windows → digite "PowerShell" → Enter) e rode:

```powershell
cd $HOME\Documents
```

```powershell
git clone https://github.com/pedido-atrasado/lotus-ai.git
```

Se pedir login do GitHub, ele entra com a conta dele (a que você convidou).

### 3. Colocar o arquivo de configuração

1. Pegue o `.env.local` que você mandou e coloque em `Documentos\lotus-ai\apps\web\`.
2. Abra o arquivo no Bloco de notas e troque **só estas 3 linhas** pelos dados dele:

```
OWNER_EMAIL=email-do-socio@exemplo.com
OWNER_PASSWORD=uma-senha-forte-dele
OWNER_NAME=Nome do Sócio
```

3. Salve. **Não mexa** no `DATABASE_URL` nem nas chaves de IA: elas têm que ser iguais às suas.

> Atenção: o Bloco de notas às vezes salva como `.env.local.txt`. Em "Salvar como", escolha "Todos os arquivos" no tipo.

### 4. Instalar

Na pasta `Documentos\lotus-ai`, dê dois cliques em **`Instalar LOTUS.cmd`**. Ele:
- instala as dependências (demora uns minutos);
- prepara o banco;
- compila o aplicativo;
- instala a transcrição de vídeos (faster-whisper e ffmpeg).

Se aparecer **[AVISO]**, o LOTUS funciona mesmo assim. Só a parte indicada fica de fora (por exemplo, a fala dos Reels no diagnóstico).

### 5. Abrir

Dê dois cliques em **`Abrir LOTUS AI.cmd`**. Na primeira vez demora 1 a 2 minutos. Entre com o e-mail e a senha que ele colocou no passo 3.

Dica: clique com o botão direito em `Abrir LOTUS AI.cmd` → **Enviar para** → **Área de trabalho (criar atalho)**.

---

## Atualizar quando houver novidades

Quando você (ou o Claude) mandar melhorias para o GitHub, o sócio só roda dentro da pasta `lotus-ai`:

```powershell
cd $HOME\Documents\lotus-ai
```

```powershell
git pull
```

```powershell
pnpm install
```

Depois é só abrir o LOTUS de novo.

---

## Como funciona o trabalho em dupla

- **Mesmos dados:** um cliente cadastrado por você aparece para ele, e vice-versa.
- **Cada um roda seus diagnósticos:** o diagnóstico usa o navegador e a memória do computador de quem pediu. Se o seu PC for desligado no meio, o seu PC retoma quando for ligado de novo; o do sócio não mexe no trabalho do seu (só assume o que ficou parado por mais de 20 minutos).
- **Contas do navegador de pesquisa são por computador:** se o sócio quiser o diagnóstico com Instagram logado ou o teste de WhatsApp, ele conecta no computador dele (tela Diagnóstico → "conectar Instagram" / "conectar WhatsApp").
- **Pacote de entrega:** os arquivos ficam na pasta `LOTUS_Workspace\entregas` do computador que terminou o diagnóstico. No outro computador, abra o diagnóstico e clique em "Gravar tudo em uma pasta deste computador".
- **Configurações de IA** (provedor, modelo, chaves) ficam em cada computador, em `LOTUS_Workspace\settings.json`.

---

## Se der problema

| Sintoma | O que fazer |
|---|---|
| "node não é reconhecido" | Instale o Node.js e reinicie o PC |
| `Instalar LOTUS.cmd` diz que falta o `.env.local` | O arquivo está no lugar errado ou com nome `.env.local.txt` |
| A tela de login não aceita a senha | Confira `OWNER_EMAIL` e `OWNER_PASSWORD` no `.env.local` e abra o LOTUS de novo |
| Abre mas não mostra os clientes | O `DATABASE_URL` está diferente do seu |
| Diagnóstico sem a fala dos vídeos | Python não estava no PATH: reinstale marcando "Add python.exe to PATH" e rode o instalador de novo |
