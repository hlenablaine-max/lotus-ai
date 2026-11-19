@echo off
rem Prepara o LOTUS AI em um computador novo (ex.: o do socio).
rem Antes: instale Node.js 22+ (nodejs.org), Git e copie o arquivo apps\web\.env.local do computador principal.
cd /d "%~dp0"

where node >nul 2>nul || (echo [ERRO] Node.js nao encontrado. Instale em https://nodejs.org e rode de novo. & pause & exit /b 1)
where pnpm >nul 2>nul || (echo Instalando o pnpm... & call npm install -g pnpm)

if not exist "apps\web\.env.local" (
  echo [ERRO] Falta o arquivo apps\web\.env.local.
  echo Copie o apps\web\.env.example para apps\web\.env.local e preencha,
  echo usando o MESMO DATABASE_URL do computador principal e o SEU email e senha em OWNER_EMAIL / OWNER_PASSWORD.
  pause
  exit /b 1
)

echo Instalando dependencias (pode levar alguns minutos)...
call pnpm install || (echo [ERRO] Falha no pnpm install. & pause & exit /b 1)
call pnpm --filter @lotus/web exec prisma generate || (echo [ERRO] Falha ao preparar o banco. & pause & exit /b 1)

echo.
echo Pronto. Para abrir o LOTUS, de dois cliques em "Abrir LOTUS AI.cmd".
pause
