# LOTUS AI — Deploy Automatizado para Vercel + PostgreSQL
# Uso: ./deploy.ps1
# Requer: Node.js, pnpm, vercel CLI (ja instalado via npm)

$ErrorActionPreference = "Stop"
$WebDir = "$PSScriptRoot\apps\web"

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  LOTUS AI — Deploy Automatizado" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Verificar login
Write-Host "[1/6] Verificando autenticacao Vercel..." -ForegroundColor Yellow
$user = vercel whoami 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Nao autenticado. Execute: vercel login" -ForegroundColor Red
    Write-Host "  Depois rode este script novamente." -ForegroundColor Red
    exit 1
}
Write-Host "  Logado como: $user" -ForegroundColor Green

# 2. Configurar projeto Vercel
Write-Host ""
Write-Host "[2/6] Configurando projeto Vercel..." -ForegroundColor Yellow
Set-Location $WebDir
vercel link --yes 2>&1 | Select-Object -Last 3 | Write-Host
Write-Host "  Projeto vinculado." -ForegroundColor Green

# 3. Criar banco PostgreSQL via Vercel Storage (Neon)
Write-Host ""
Write-Host "[3/6] Verificando banco PostgreSQL..." -ForegroundColor Yellow
$storageList = vercel storage ls 2>&1
if ($storageList -notmatch "lotus") {
    Write-Host "  Criando banco 'lotus-db' (Neon PostgreSQL)..." -ForegroundColor Gray
    vercel storage create --type postgres --name lotus-db --yes 2>&1 | Select-Object -Last 5 | Write-Host
} else {
    Write-Host "  Banco ja existe." -ForegroundColor Green
}

# 4. Obter credenciais do banco
Write-Host ""
Write-Host "[4/6] Obtendo credenciais do banco..." -ForegroundColor Yellow
vercel env pull .env.production.local --yes 2>&1 | Select-Object -Last 3 | Write-Host

if (Test-Path ".env.production.local") {
    $envContent = Get-Content ".env.production.local" -Raw
    $envLocal = Get-Content ".env.local" -Raw

    # POSTGRES_PRISMA_URL = pooled (para DATABASE_URL)
    if ($envContent -match 'POSTGRES_PRISMA_URL="?([^"\r\n]+)"?') {
        $dbUrl = $Matches[1].Trim('"')
        if ($envLocal -match 'DATABASE_URL=') {
            $envLocal = $envLocal -replace 'DATABASE_URL="[^"]*"', "DATABASE_URL=`"$dbUrl`""
        } else {
            $envLocal += "`nDATABASE_URL=`"$dbUrl`""
        }
        Write-Host "  DATABASE_URL configurado." -ForegroundColor Green
    }

    # POSTGRES_URL_NON_POOLING = direct (para DATABASE_URL_DIRECT)
    if ($envContent -match 'POSTGRES_URL_NON_POOLING="?([^"\r\n]+)"?') {
        $directUrl = $Matches[1].Trim('"')
        if ($envLocal -match 'DATABASE_URL_DIRECT=') {
            $envLocal = $envLocal -replace 'DATABASE_URL_DIRECT="[^"]*"', "DATABASE_URL_DIRECT=`"$directUrl`""
        } else {
            $envLocal += "`nDATABASE_URL_DIRECT=`"$directUrl`""
        }
        Write-Host "  DATABASE_URL_DIRECT configurado." -ForegroundColor Green
    }

    Set-Content ".env.local" $envLocal -NoNewline -Encoding UTF8
    Remove-Item ".env.production.local" -Force
}

# 5. Rodar migracoes
Write-Host ""
Write-Host "[5/6] Rodando migracoes Prisma..." -ForegroundColor Yellow
pnpm prisma generate 2>&1 | Select-String "Generated|Error" | Write-Host
pnpm prisma migrate deploy 2>&1 | Write-Host
Write-Host "  Migracoes aplicadas." -ForegroundColor Green

# Configurar env vars no Vercel (NEXTAUTH_SECRET, etc)
Write-Host ""
Write-Host "  Configurando variaveis de ambiente no Vercel..." -ForegroundColor Gray
$envLocal2 = Get-Content ".env.local" -Raw

# NEXTAUTH_SECRET
if ($envLocal2 -match 'NEXTAUTH_SECRET="?([^"\r\n]+)"?') {
    $secret = $Matches[1].Trim('"')
    echo $secret | vercel env add NEXTAUTH_SECRET production 2>&1 | Out-Null
}

# DRAEL_API_KEY
if ($envLocal2 -match 'DRAEL_API_KEY="?([^"\r\n]+)"?') {
    $drael = $Matches[1].Trim('"')
    echo $drael | vercel env add DRAEL_API_KEY production 2>&1 | Out-Null
}

# 6. Deploy!
Write-Host ""
Write-Host "[6/6] Fazendo deploy para producao..." -ForegroundColor Yellow
Write-Host "  Isso pode demorar 2-4 minutos..." -ForegroundColor Gray
Write-Host ""

$deployOutput = vercel --prod --yes 2>&1
Write-Host $deployOutput

# Pegar a URL
$deployUrl = ($deployOutput | Select-String -Pattern "https://\S+\.vercel\.app").Matches | Select-Object -ExpandProperty Value -Last 1
if (-not $deployUrl) {
    $deployUrl = ($deployOutput | Select-String -Pattern "https://\S+").Matches | Select-Object -ExpandProperty Value -Last 1
}

# Atualizar NEXTAUTH_URL no Vercel com a URL real
if ($deployUrl) {
    echo $deployUrl | vercel env add NEXTAUTH_URL production 2>&1 | Out-Null
    # Re-deploy com a URL correta
    Write-Host ""
    Write-Host "  Atualizando NEXTAUTH_URL e re-deployando..." -ForegroundColor Gray
    $deployOutput2 = vercel --prod --yes 2>&1
    $finalUrl = ($deployOutput2 | Select-String -Pattern "https://\S+\.vercel\.app").Matches | Select-Object -ExpandProperty Value -Last 1
    if ($finalUrl) { $deployUrl = $finalUrl }
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "  DEPLOY CONCLUIDO!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  URL: $deployUrl" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Compartilhe esta URL com seu socio!" -ForegroundColor White
Write-Host ""

# Abrir no browser
if ($deployUrl) {
    Start-Process $deployUrl
}
