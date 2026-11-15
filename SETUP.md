# LOTUS AI — Setup Rápido

## 1. Banco de dados (Neon — recomendado, gratuito)

1. Acesse https://neon.tech e crie uma conta
2. Crie um novo projeto chamado `lotus-ai`
3. Copie a connection string (formato: `postgresql://...`)
4. Edite `apps/web/.env.local` e substitua `DATABASE_URL`

## 2. API Key da Anthropic

1. Acesse https://console.anthropic.com
2. Crie uma API key
3. Edite `apps/web/.env.local` e substitua `ANTHROPIC_API_KEY`

## 3. NEXTAUTH_SECRET

```bash
# Gerar um secret seguro (rodar no terminal):
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Cole o resultado em `NEXTAUTH_SECRET` no `.env.local`.

## 4. Inicializar o banco

```bash
cd C:\Users\Icaro\Documents\lotus-ai
pnpm db:push
```

## 5. Rodar o app

```bash
pnpm dev
```

Acesse: http://localhost:3000
