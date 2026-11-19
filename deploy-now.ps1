# LOTUS AI — Deploy Completo
# Roda TUDO após autenticação. Execute: .\deploy-now.ps1

$ErrorActionPreference = "Stop"
$env:PATH = "$env:APPDATA\npm;$env:USERPROFILE\go\bin;$env:PATH"
$WebDir = "$PSScriptRoot\apps\web"

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  LOTUS AI — Deploy Automatizado v2" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# PASSO 1: Verificar/fazer auth Neon
Write-Host ""
Write-Host "[1/5] Autenticando Neon..." -ForegroundColor Yellow
$neonCheck = neonctl me 2>&1
if ($neonCheck -match "not logged") {
    Write-Host "  Abrindo browser para autenticação Neon..." -ForegroundColor Gray
    neonctl auth
    Write-Host "  Neon autenticado!" -ForegroundColor Green
} else {
    Write-Host "  Neon: já autenticado como $neonCheck" -ForegroundColor Green
}

# PASSO 2: Obter connection strings do Neon
Write-Host ""
Write-Host "[2/5] Obtendo connection strings do PostgreSQL..." -ForegroundColor Yellow
$pooledUrl = neonctl connection-string --project-id young-sun-83565860 --pooled --output json 2>&1 | ConvertFrom-Json
$directUrl = neonctl connection-string --project-id young-sun-83565860 --output json 2>&1 | ConvertFrom-Json

if (-not $pooledUrl -or -not $directUrl) {
    Write-Host "  Erro ao obter connection strings. Verifique o projeto Neon." -ForegroundColor Red
    exit 1
}
Write-Host "  Connection strings obtidos!" -ForegroundColor Green

# PASSO 3: Atualizar .env.local com PostgreSQL URLs
Write-Host ""
Write-Host "[3/5] Configurando banco de dados local..." -ForegroundColor Yellow
$envPath = "$WebDir\.env.local"
$envContent = Get-Content $envPath -Raw

# Replace/add DATABASE_URL (pooled - for Next.js runtime)
if ($envContent -match 'DATABASE_URL=') {
    $envContent = $envContent -replace 'DATABASE_URL="[^"]*"', "DATABASE_URL=`"$pooledUrl`""
} else {
    $envContent = $envContent.TrimEnd() + "`nDATABASE_URL=`"$pooledUrl`""
}

# Replace/add DATABASE_URL_DIRECT (direct - for migrations)
if ($envContent -match 'DATABASE_URL_DIRECT=') {
    $envContent = $envContent -replace 'DATABASE_URL_DIRECT="[^"]*"', "DATABASE_URL_DIRECT=`"$directUrl`""
} else {
    $envContent = $envContent.TrimEnd() + "`nDATABASE_URL_DIRECT=`"$directUrl`""
}

Set-Content $envPath $envContent -Encoding UTF8 -NoNewline
Write-Host "  .env.local atualizado!" -ForegroundColor Green

# PASSO 4: Rodar migrações Prisma
Write-Host ""
Write-Host "[4/5] Rodando migrações Prisma..." -ForegroundColor Yellow
Set-Location $WebDir
$env:DATABASE_URL = $pooledUrl
$env:DATABASE_URL_DIRECT = $directUrl
pnpm prisma generate 2>&1 | Select-String "Generated|Error" | Write-Host

# Para banco novo sem migrations, usar db push
Write-Host "  Aplicando schema ao banco..." -ForegroundColor Gray
pnpm prisma db push --accept-data-loss 2>&1 | Select-Object -Last 5 | Write-Host
Write-Host "  Schema aplicado!" -ForegroundColor Green

# PASSO 5: Deploy para Vercel
Write-Host ""
Write-Host "[5/5] Autenticando Vercel e fazendo deploy..." -ForegroundColor Yellow

$vercelCheck = vercel whoami 2>&1
if ($vercelCheck -match "Logged out" -or $LASTEXITCODE -ne 0) {
    Write-Host "  Abrindo browser para autenticação Vercel..." -ForegroundColor Gray
    vercel login
    Write-Host "  Vercel autenticado!" -ForegroundColor Green
} else {
    Write-Host "  Vercel: logado como $vercelCheck" -ForegroundColor Green
}

# Vincular projeto (ou criar novo)
Write-Host "  Configurando projeto Vercel..." -ForegroundColor Gray
Set-Location $WebDir
vercel link --yes 2>&1 | Select-Object -Last 3 | Write-Host

# Adicionar env vars no Vercel
Write-Host "  Configurando variáveis de ambiente no Vercel..." -ForegroundColor Gray
$envLocal = Get-Content ".env.local" -Raw

# Enviar cada var para o Vercel
$vars = @(
    @{name="DATABASE_URL"; value=$pooledUrl},
    @{name="DATABASE_URL_DIRECT"; value=$directUrl},
    @{name="NEXTAUTH_SECRET"; value=($envLocal | Select-String 'NEXTAUTH_SECRET="([^"]*)"' | ForEach-Object {$_.Matches.Groups[1].Value})}
    @{name="DRAEL_API_KEY"; value=($envLocal | Select-String 'DRAEL_API_KEY="([^"]*)"' | ForEach-Object {$_.Matches.Groups[1].Value})}
    @{name="OWNER_EMAIL"; value=($envLocal | Select-String 'OWNER_EMAIL="([^"]*)"' | ForEach-Object {$_.Matches.Groups[1].Value})}
    @{name="OWNER_PASSWORD"; value=($envLocal | Select-String 'OWNER_PASSWORD="([^"]*)"' | ForEach-Object {$_.Matches.Groups[1].Value})}
    @{name="HQ_SSE_ENABLED"; value="true"}
)

foreach ($var in $vars) {
    if ($var.value) {
        $var.value | vercel env add $var.name production --yes 2>&1 | Out-Null
        $var.value | vercel env add $var.name preview --yes 2>&1 | Out-Null
    }
}

# Deploy para produção
Write-Host ""
Write-Host "  Fazendo deploy (pode demorar 2-4 minutos)..." -ForegroundColor Gray
$deployOutput = vercel --prod --yes 2>&1
Write-Host $deployOutput

# Capturar URL do deploy
$deployUrl = ($deployOutput | Select-String -Pattern "https://[\w-]+\.vercel\.app").Matches | Select-Object -ExpandProperty Value -Last 1
if (-not $deployUrl) {
    $deployUrl = ($deployOutput | Select-String -Pattern "https://[^\s]+").Matches | Select-Object -ExpandProperty Value -Last 1
}

# Atualizar NEXTAUTH_URL com a URL de produção
if ($deployUrl) {
    $deployUrl | vercel env add NEXTAUTH_URL production --yes 2>&1 | Out-Null

    # Atualizar .env.local
    $envContent2 = Get-Content ".env.local" -Raw
    $envContent2 = $envContent2 -replace 'NEXTAUTH_URL="[^"]*"', "NEXTAUTH_URL=`"$deployUrl`""
    $envContent2 = $envContent2 -replace 'NEXT_PUBLIC_APP_URL="[^"]*"', "NEXT_PUBLIC_APP_URL=`"$deployUrl`""
    Set-Content ".env.local" $envContent2 -Encoding UTF8 -NoNewline

    # Re-deploy com NEXTAUTH_URL correto
    Write-Host "  Re-deployando com NEXTAUTH_URL correto..." -ForegroundColor Gray
    $deployOutput2 = vercel --prod --yes 2>&1
    $finalUrl = ($deployOutput2 | Select-String -Pattern "https://[\w-]+\.vercel\.app").Matches | Select-Object -ExpandProperty Value -Last 1
    if ($finalUrl) { $deployUrl = $finalUrl }
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "  DEPLOY CONCLUÍDO!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  URL: $deployUrl" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Login: icarobrtv@gmail.com" -ForegroundColor White
Write-Host "  Senha: lotus2026" -ForegroundColor White
Write-Host ""
Write-Host "  Compartilhe com seu sócio!" -ForegroundColor White
Write-Host ""

if ($deployUrl) {
    Start-Process $deployUrl
}
